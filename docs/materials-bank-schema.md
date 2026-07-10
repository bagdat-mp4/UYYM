# UYYM Materials Bank Database Foundation

This document describes the backend foundation introduced by
`backend/migrations/006_materials_bank_foundation.sql`. The migration is for
manual review and execution in Supabase. No Materials Bank frontend is included.

## Existing Schema Audit

The repository migrations and read-only live public API shape were inspected.
The existing `public.materials` table has these columns:

| Column | Type | Existing meaning |
| --- | --- | --- |
| `id` | bigint | Generated material identity |
| `uploader_id` | uuid | Uploading profile |
| `university_id` | integer | Related university |
| `professor_id` | bigint | Optional professor reference |
| `title` | text | Material title |
| `course_name` | text | Subject or course name |
| `file_url` | text | Legacy file location |
| `created_at` | timestamptz | Creation time |

The legacy table lacks description, immutable file metadata, a constrained
material category, and moderation state. It therefore cannot safely support the
requested browse, upload, moderation, or private-file lifecycle as-is.

The repository contains no executable Materials Bank RLS or Storage policy SQL.
Migration 002 documents only the private `verifications` bucket at a summary
level and says its exact applied SQL is missing. A read-only anonymous Storage
API check did not discover `materials` and returned `Bucket not found`. Because
private bucket metadata can be hidden from anonymous callers, that response does
not prove absence. Migration 006 handles both cases safely: it creates the bucket
when absent and validates, without changing, an existing bucket. The anonymous
client receives PostgreSQL permission denied for `materials`, but cannot inspect
the live authenticated policy catalog. Migration 006 therefore stops if unknown
`public.materials` policies or obviously broad, unscoped Storage policies exist.
It never drops those policies.

## Schema Decision

The existing table is retained and upgraded. Because no Materials frontend or
repository query uses `file_url`, the migration renames it to `file_path` while
the table is empty. A relative path is required for a private bucket; storing a
public or signed URL would couple database rows to temporary credentials.

If legacy rows exist, the migration stops before any structural change. Their
URLs and files must be reviewed and migrated deliberately rather than copied
into the private path model automatically.

### Enums

`material_type` accepts exactly:

- `notes`
- `exam`
- `assignment`
- `presentation`
- `book`
- `other`

`material_moderation_status` accepts exactly:

- `pending`
- `approved`
- `rejected`

A three-state enum is used because the original table has neither `is_approved`
nor a status column. A boolean would merge pending and rejected materials into
one ambiguous state. The enum remains small and does not add a separate review
table, rejection reason, moderator identity, or audit log.

### Upgraded materials Table

| Column | Type | Rules |
| --- | --- | --- |
| `id` | bigint generated | Existing primary key |
| `uploader_id` | uuid | Required profile reference; immutable |
| `university_id` | integer | Required university reference |
| `professor_id` | bigint | Optional professor reference |
| `title` | text | Trimmed, 3-180 characters |
| `description` | text | Optional, trimmed, 1-2000 characters when present |
| `course_name` | text | Required, trimmed, 2-120 characters |
| `file_path` | text | Required private Storage path; immutable and unique |
| `file_name` | text | Required safe ASCII filename; immutable |
| `mime_type` | text | Required allowed MIME type; immutable |
| `file_size` | bigint | Required byte size from 1 through 26,214,400; immutable |
| `material_type` | `material_type` | Required constrained category |
| `status` | `material_moderation_status` | Required, defaults to `pending` |
| `created_at` | timestamptz | Required, defaults to `now()`; immutable |

Existing or newly added foreign keys use safe deletion behavior:

- Uploader profile deletion is restricted while a material remains.
- University deletion is restricted while a material remains.
- Professor association is optional, but deleting a referenced professor is
  restricted so attribution cannot disappear from existing materials.
- Any cascade-delete foreign key on these ownership columns causes the
  migration to stop for review.

## Private Storage Model

The `materials` bucket is private. Private storage is required because pending
and rejected educational files must not be publicly addressable, and access to
approved files must still require an authenticated UYYM account.

The bucket configuration is exact:

- `public = false`
- Maximum object size: 25 MiB (`26,214,400` bytes)
- Allowed MIME types:
  - PDF
  - DOC and DOCX
  - PPT and PPTX
  - XLS and XLSX
  - plain text
  - PNG, JPEG, and WebP

Executable files, scripts, HTML, SVG, archives, and unknown MIME types are not
allowed. The database also requires the filename extension and MIME type to be
a valid pair.

### Path Convention

Every object path must use:

```text
{uploader_uuid}/{upload_uuid}/{safe_file_name}
```

Example shape:

```text
00000000-0000-4000-8000-000000000000/11111111-1111-4111-8111-111111111111/calculus-midterm.pdf
```

The first segment must equal `auth.uid()`. The second segment is a fresh UUID
generated for this upload. The final segment must equal `file_name` and contain
only ASCII letters, digits, dots, underscores, and hyphens. This rejects URL
schemes, path traversal, nested arbitrary folders, and cross-user paths.

## RLS Model

No Materials Bank privileges are granted to `anon`. Authenticated clients have
table privileges, with every row operation constrained by RLS.

### public.materials Policies

| Policy | Operation | Rule |
| --- | --- | --- |
| `materials_authenticated_read` | SELECT | Approved rows are readable by authenticated users. Uploaders may read all their own states. Platform admins may read all rows. |
| `materials_verified_insert` | INSERT | `uploader_id = auth.uid()`, current profile is verified, and status is exactly `pending`. |
| `materials_uploader_update_pending` | UPDATE | A verified uploader may update only their own pending row and must keep it pending. |
| `materials_uploader_delete_pending` | DELETE | An uploader may delete only their own pending row. |
| `materials_admin_update` | UPDATE | A platform admin may moderate any row. The trigger permits status changes only. |
| `materials_admin_delete` | DELETE | A platform admin may delete any row. |

The update trigger keeps `id`, uploader, file path, filename, MIME type, size,
and creation time immutable. A pending uploader may edit educational metadata.
An admin moderation update may change only `status`, preventing an admin client
from silently replacing attribution or file metadata.

### storage.objects Policies

| Policy | Operation | Rule |
| --- | --- | --- |
| `materials_storage_insert` | INSERT | Verified user, exact own-folder path, and matching own pending `materials` row required. |
| `materials_storage_read` | SELECT | Approved object, uploader-owned object, or platform-admin access. This enables authorized signed URL creation. |
| `materials_storage_delete` | DELETE | Uploader may delete a matching own pending object or an orphan under their own UUID folder; platform admin may delete any object in the bucket. Approved and rejected objects remain protected while their row exists. |

No Storage UPDATE policy exists. Files cannot be overwritten after upload. A
replacement must use a new pending material row and a new upload UUID.

## Helper Functions and Trigger

Two profile helpers avoid profile-RLS interference:

- `material_current_user_is_verified()`
- `material_current_user_is_platform_admin()`

Both are `SECURITY DEFINER`, use the fixed search path
`pg_catalog, public`, schema-qualify profile access, revoke execution from
`PUBLIC`, and grant execution only to `authenticated`.

`enforce_material_update()` is a regular trigger function with the same fixed
search path. `enforce_material_update_trigger` runs before every material update
to enforce immutable file identity and the uploader/admin update boundaries.

## Upload Lifecycle

A future frontend should use this order:

1. Require an authenticated, verified profile.
2. Validate the local file against the extension, MIME, and 25 MiB limits.
3. Sanitize the filename and generate a fresh upload UUID.
4. Build `file_path` from the authenticated user ID, upload UUID, and filename.
5. Insert a complete `pending` materials row with `uploader_id = auth.uid()`.
6. Upload to the private `materials` bucket at exactly that `file_path`, without
   `upsert`.
7. If upload fails, delete the still-pending database row.
8. Show pending rows only to their uploader and platform admins.

The database row must exist first because the Storage INSERT policy requires a
matching pending row. A failed second step can leave a harmless pending row but
cannot expose a file.

## Moderation and Download Lifecycle

1. An admin loads pending rows and previews the private object with a short-lived
   signed URL.
2. The admin verifies that the object exists and the content matches its stated
   type before setting status to `approved` or `rejected`.
3. Approved rows and objects become readable to authenticated users.
4. Rejected rows and objects remain visible only to the uploader and admins.
5. Downloads use a short-lived signed URL generated from `file_path`; URLs are
   never stored in `materials`.
6. For deletion, remove the Storage object first and then delete the database
   row. Admin Storage DELETE remains available for orphan cleanup.

## Future Frontend Contract

A future `/materials` frontend can safely implement:

- Approved-material browsing and filtering by university, course, professor,
  and material type.
- Verified-student upload using the two-phase lifecycle above.
- Uploader views for pending, approved, and rejected rows.
- Pending metadata editing and pending upload deletion.
- Admin status moderation and object cleanup.
- Private preview/download through short-lived signed URLs, preferably no more
  than five minutes.

The frontend must not:

- Store a public URL or signed URL in `file_path`.
- Upload before inserting the matching pending row.
- Use another profile ID as `uploader_id`.
- Use Storage `upsert` or overwrite an existing object.
- Treat a filename extension or browser-supplied MIME type as content scanning.
- Delete a database row before deleting its object.
- Use a service-role key in browser code.

## Security Limitations

- PostgreSQL and bucket MIME constraints cannot inspect file magic bytes or scan
  for malware. Admin review is still required before approval. Production-scale
  hardening should add server-side content sniffing and malware scanning.
- `file_size` is client metadata. The bucket enforces the real object size limit,
  but the database cannot prove the metadata equals the stored byte count.
- Database and Storage mutations are separate API operations and are not
  transactional together. The documented order minimizes inaccessible orphan
  files, and admins can delete bucket orphans.
- A signed URL already issued can remain valid until its short expiry even if a
  material is rejected immediately afterward.
- The minimal moderation enum has no rejection reason, moderator identity, or
  audit history. Those should be added only with a real moderation product flow.
- Migration 006 intentionally aborts when legacy rows, unknown Materials RLS
  policies, incompatible foreign keys, a mismatched bucket, or obviously broad
  Storage policies require manual review. It never deletes data or policies.

No seed materials, fake counts, frontend routes, likes, comments, ratings,
folders, version history, OCR, AI summaries, plagiarism checks, or paid-content
features are created.
