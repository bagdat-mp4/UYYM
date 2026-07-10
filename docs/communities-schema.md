# UYYM Communities Database Foundation

This document describes the database foundation introduced by
`backend/migrations/005_communities_foundation.sql`. The migration is designed
for Supabase/PostgreSQL and is not executed by the application.

## Existing Schema Audit

The repository migrations and live public API shape were inspected before this
design was chosen.

- `profiles` uses UUID profile IDs and includes `university_id`, `major`,
  `is_verified`, and `is_admin`.
- `universities.id` is an integer.
- `posts` contains `id bigint`, `author_id uuid`, `content text`, and
  `created_at timestamptz`.
- `posts` has no `community_id` column.
- `connections` is independent from communities and remains unchanged.
- No `communities`, `community_members`, `community_posts`, `groups`, or
  `group_members` table existed when this migration was designed.

## Post Model Decision

Community posts use a separate `community_posts` table. The existing global
feed currently loads every row from `posts` without a community filter. Adding
a nullable `community_id` to `posts` would therefore make community posts appear
in the global feed unless frontend behavior and existing post policies changed.
Both changes are outside this task and would create avoidable access-control
coupling.

The separate table provides these properties:

- Global feed behavior and existing `posts` RLS remain unchanged.
- Community post reads and writes have independent membership-aware RLS.
- Private community posts cannot leak through a global-post policy.
- A future read-only view or API query can combine global and selected public
  community posts without changing storage ownership.

No automatic cross-posting or duplication exists in this foundation.

## Schema

### Enums

`community_type` accepts exactly:

- `university`
- `major`
- `interest`
- `city`

`community_role` accepts exactly:

- `owner`
- `admin`
- `member`

### communities

| Column | Type | Rules |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `name` | text | Required, trimmed, 3-120 characters |
| `slug` | text | Required, unique, lowercase ASCII slug, 3-80 characters |
| `description` | text | Optional, trimmed, 1-1000 characters when present |
| `type` | `community_type` | Required |
| `university_id` | integer | Required for university/major types; forbidden for interest/city types |
| `created_by` | uuid | Required profile reference |
| `is_public` | boolean | Required, defaults to `true` |
| `created_at` | timestamptz | Required, defaults to `now()` |

`university_id` uses `ON DELETE RESTRICT`. `created_by` also uses
`ON DELETE RESTRICT`, preserving the community's creator record while the
community exists.

### community_members

| Column | Type | Rules |
| --- | --- | --- |
| `community_id` | bigint | Community reference |
| `user_id` | uuid | Profile reference |
| `role` | `community_role` | Required, defaults to `member` |
| `joined_at` | timestamptz | Required, defaults to `now()` |

The `(community_id, user_id)` primary key prevents duplicate membership. A
partial unique index permits at most one `owner` row per community.

Memberships use `ON DELETE CASCADE` for both community and profile deletion.
This prevents orphan membership rows.

### community_posts

| Column | Type | Rules |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `community_id` | bigint | Required community reference |
| `author_id` | uuid | Required profile reference |
| `content` | text | Required, 1-2000 trimmed characters |
| `created_at` | timestamptz | Required, defaults to `now()` |

Deleting a community cascades to its community posts. Deleting an author
profile is restricted while authored community posts remain, preserving post
attribution.

## Creation Policy

Community creation is platform-admin-only for the first beta. A creator must
have both:

- `profiles.is_verified = true`
- `profiles.is_admin = true`

This is safer than unrestricted verified-student creation while UYYM has no
community review queue, naming dispute workflow, report system, or ownership
transfer flow. The policy can be widened later with a dedicated approval model.

An `AFTER INSERT` trigger verifies the creator again and creates the sole owner
membership. Authenticated clients cannot insert `owner` or `admin` memberships
directly.

## RLS Model

No privileges are granted to `anon`. The migration grants table operations to
`authenticated`, then limits every row operation through RLS.

### communities policies

| Policy | Operation | Rule |
| --- | --- | --- |
| `communities_authenticated_read` | SELECT | Public communities are readable by authenticated users. Private communities require membership; platform admins may also read. |
| `communities_admin_create` | INSERT | Creator equals `auth.uid()` and current profile is both verified and platform admin. |
| `communities_manager_update` | UPDATE | Community owner/admin or platform admin only. Identity, creator, and creation time are immutable. |
| `communities_manager_delete` | DELETE | Community owner/admin or platform admin only. |

### community_members policies

| Policy | Operation | Rule |
| --- | --- | --- |
| `community_members_member_read` | SELECT | Membership lists are visible only to community members and platform admins. Public visibility alone does not expose the member list. |
| `community_members_verified_join_public` | INSERT | Verified user may insert only their own `member` row for a public community. |
| `community_members_owner_manage_roles` | UPDATE | Owner may promote or demote another non-owner between `member` and `admin`. Users cannot change their own role or create an owner role. |
| `community_members_leave_or_remove` | DELETE | Non-owner users may leave; community owner/admin or platform admin may remove non-owner members. |

The owner membership cannot be directly changed or deleted by authenticated
clients. Ownership transfer is intentionally deferred until it can be handled
atomically by a dedicated function.

### community_posts policies

| Policy | Operation | Rule |
| --- | --- | --- |
| `community_posts_community_read` | SELECT | Authenticated users may read posts in public communities; private posts require membership. Platform admins may read for moderation. |
| `community_posts_member_create` | INSERT | Current user is verified, is a member, and `author_id = auth.uid()`. |
| `community_posts_author_update` | UPDATE | Verified author remains a member. Only content can change. |
| `community_posts_author_or_manager_delete` | DELETE | Member author, community owner/admin, or platform admin. |

Non-members cannot insert or update community posts. A former member cannot edit
their old posts. Managers can delete posts for basic moderation but cannot edit
another student's content.

## Helper Functions

The following helpers are `SECURITY DEFINER` because profile or membership RLS
would otherwise recurse or hide the rows needed for policy decisions:

- `community_current_user_is_verified()`
- `community_current_user_is_platform_admin()`
- `community_has_role(community_id, roles)`
- `community_can_read(community_id)`

Each function has the fixed search path `pg_catalog, public`, references
security-sensitive relations with explicit schema qualification, revokes
execution from `PUBLIC`, and grants execution only to `authenticated`.

Trigger functions enforce immutable identity fields and safe owner creation:

- `enforce_community_update()`
- `create_community_owner_membership()`
- `enforce_community_member_update()`
- `enforce_community_post_update()`

## Community Lifecycle

1. A verified platform admin creates a community and supplies a unique slug.
2. The creator-owner trigger inserts the creator's `owner` membership.
3. Authenticated users can browse public community metadata and posts.
4. A verified student joins a public community by inserting their own member row.
5. Members publish posts with their authenticated profile ID.
6. The owner can promote members to community admin. Owners/admins can remove
   non-owner members and moderate posts.
7. A member or admin may leave by deleting their own membership. The owner
   cannot leave until a future ownership-transfer workflow exists.
8. An owner/admin or platform admin may delete the community. Foreign-key
   cascades then remove its memberships and community posts atomically.

Private community invitations are not part of this foundation. A private
community initially contains only its creator unless a database owner performs
a controlled membership insert or a future invitation migration adds a safe
workflow.

## Future Frontend Contract

A future communities frontend can safely implement:

- Public community discovery by type, university, or slug.
- Private community visibility for current members.
- Verified-student join and member/admin leave actions.
- Member lists for current members.
- Member-only post creation.
- Author content editing and deletion.
- Owner/admin metadata management and post moderation.
- Owner-only promotion or demotion between member and admin.

The frontend must not:

- Let users choose `owner` or `admin` during join.
- Treat public visibility as permission to post.
- Insert a community with another user's `created_by` value.
- Reuse the global `posts` insert flow for community posts.
- Assume a private invitation or ownership-transfer API exists.
- Display deletion as harmless: deleting a community cascades to its membership
  and community-post rows.

## Operational Notes And Limitations

- The migration performs no seed inserts and deletes no existing data.
- It includes preflight checks for the required base tables and column types.
- Enum labels, tables, indexes, functions, triggers, grants, and policies are
  guarded or replaceable so a successful migration can be run again.
- A pre-existing object with the same name but an incompatible definition causes
  the transaction to fail rather than silently modifying existing data.
- There is no ownership transfer, invitation, ban, report, audit log, soft
  deletion, post media, or community-specific moderation log yet.
- Slugs are deliberately lowercase ASCII; a future UI should transliterate or
  propose a slug while preserving Kazakh/Russian display names in `name`.

## Optional Manual Examples

The migration contains commented examples for `KBTU Community` and
`KBTU Computer Science`. They require a real verified platform-admin profile
UUID and are never executed automatically.
