-- Migration 005: UYYM communities database foundation
--
-- This migration creates new community tables only. It does not alter the
-- existing posts table or execute any seed inserts.
--
-- Creation policy for the first beta:
--   Only verified platform admins may create communities. This keeps taxonomy,
--   naming, and moderation controlled until a review workflow exists.

BEGIN;

-- Preflight: stop before structural changes if the base schema does not match
-- the live schema this migration was designed against.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
    OR to_regclass('public.universities') IS NULL
    OR to_regclass('public.posts') IS NULL THEN
    RAISE EXCEPTION
      'migration 005 requires public.profiles, public.universities, and public.posts';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
      AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_verified'
      AND data_type = 'boolean'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_admin'
      AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION
      'migration 005 requires profiles.id uuid, profiles.is_verified boolean, and profiles.is_admin boolean';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'universities'
      AND column_name = 'id'
      AND data_type = 'integer'
  ) THEN
    RAISE EXCEPTION 'migration 005 requires universities.id integer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'id'
      AND data_type = 'bigint'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'author_id'
      AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'content'
      AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION
      'migration 005 expects posts(id bigint, author_id uuid, content text, created_at timestamptz)';
  END IF;
END;
$$;

-- Community types are explicit so arbitrary categories cannot be inserted.
DO $$
DECLARE
  existing_labels text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'community_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'community_type'
        AND t.typtype = 'e'
    ) THEN
      RAISE EXCEPTION 'public.community_type exists but is not an enum';
    END IF;

    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO existing_labels
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    JOIN pg_enum AS e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'community_type';

    IF existing_labels IS DISTINCT FROM ARRAY['university', 'major', 'interest', 'city']::text[] THEN
      RAISE EXCEPTION 'public.community_type has unexpected labels: %', existing_labels;
    END IF;
  ELSE
    CREATE TYPE public.community_type AS ENUM (
      'university',
      'major',
      'interest',
      'city'
    );
  END IF;
END;
$$;

-- Ownership remains singular; admins and members are assignable community roles.
DO $$
DECLARE
  existing_labels text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'community_role'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'community_role'
        AND t.typtype = 'e'
    ) THEN
      RAISE EXCEPTION 'public.community_role exists but is not an enum';
    END IF;

    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO existing_labels
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    JOIN pg_enum AS e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'community_role';

    IF existing_labels IS DISTINCT FROM ARRAY['owner', 'admin', 'member']::text[] THEN
      RAISE EXCEPTION 'public.community_role has unexpected labels: %', existing_labels;
    END IF;
  ELSE
    CREATE TYPE public.community_role AS ENUM (
      'owner',
      'admin',
      'member'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.communities (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  type public.community_type NOT NULL,
  university_id integer,
  created_by uuid NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT communities_slug_unique UNIQUE (slug),
  CONSTRAINT communities_name_length CHECK (
    name = btrim(name)
    AND char_length(name) BETWEEN 3 AND 120
  ),
  CONSTRAINT communities_slug_format CHECK (
    slug = lower(btrim(slug))
    AND char_length(slug) BETWEEN 3 AND 80
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT communities_description_length CHECK (
    description IS NULL
    OR (
      description = btrim(description)
      AND char_length(description) BETWEEN 1 AND 1000
    )
  ),
  CONSTRAINT communities_type_scope CHECK (
    (type IN ('university', 'major') AND university_id IS NOT NULL)
    OR
    (type IN ('interest', 'city') AND university_id IS NULL)
  ),
  CONSTRAINT communities_university_fkey
    FOREIGN KEY (university_id)
    REFERENCES public.universities(id)
    ON DELETE RESTRICT,
  CONSTRAINT communities_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id bigint NOT NULL,
  user_id uuid NOT NULL,
  role public.community_role NOT NULL DEFAULT 'member',
  joined_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT community_members_pkey PRIMARY KEY (community_id, user_id),
  CONSTRAINT community_members_community_fkey
    FOREIGN KEY (community_id)
    REFERENCES public.communities(id)
    ON DELETE CASCADE,
  CONSTRAINT community_members_user_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  community_id bigint NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT community_posts_content_length CHECK (
    char_length(btrim(content)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT community_posts_community_fkey
    FOREIGN KEY (community_id)
    REFERENCES public.communities(id)
    ON DELETE CASCADE,
  CONSTRAINT community_posts_author_fkey
    FOREIGN KEY (author_id)
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT
);

-- One owner row per community; the creator trigger creates that row.
CREATE UNIQUE INDEX IF NOT EXISTS community_members_one_owner_idx
  ON public.community_members (community_id)
  WHERE role = 'owner'::public.community_role;

CREATE INDEX IF NOT EXISTS communities_public_type_idx
  ON public.communities (is_public, type);

CREATE INDEX IF NOT EXISTS communities_university_idx
  ON public.communities (university_id)
  WHERE university_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_members_user_idx
  ON public.community_members (user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_community_created_idx
  ON public.community_posts (community_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_author_idx
  ON public.community_posts (author_id, created_at DESC);

-- Helpers use SECURITY DEFINER only where profile/member RLS recursion would
-- otherwise make policy checks unreliable.
CREATE OR REPLACE FUNCTION public.community_current_user_is_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_verified = true
    );
$$;

CREATE OR REPLACE FUNCTION public.community_current_user_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    );
$$;

CREATE OR REPLACE FUNCTION public.community_has_role(
  p_community_id bigint,
  p_roles public.community_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_community_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.community_members AS cm
      WHERE cm.community_id = p_community_id
        AND cm.user_id = auth.uid()
        AND cm.role = ANY (p_roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.community_can_read(p_community_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.communities AS c
        WHERE c.id = p_community_id
          AND c.is_public = true
      )
      OR public.community_has_role(
        p_community_id,
        ARRAY['owner', 'admin', 'member']::public.community_role[]
      )
      OR public.community_current_user_is_platform_admin()
    );
$$;

REVOKE ALL ON FUNCTION public.community_current_user_is_verified() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_current_user_is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_has_role(bigint, public.community_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_can_read(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.community_current_user_is_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_current_user_is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_has_role(bigint, public.community_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_can_read(bigint) TO authenticated;

-- Community identity and creator metadata are immutable after creation.
CREATE OR REPLACE FUNCTION public.enforce_community_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community identity, creator, and creation time cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

-- The creator is verified again inside the trigger, then becomes the sole owner.
CREATE OR REPLACE FUNCTION public.create_community_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = NEW.created_by
      AND p.is_verified = true
  ) THEN
    RAISE EXCEPTION 'community creator must be a verified student';
  END IF;

  INSERT INTO public.community_members (
    community_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    NEW.id,
    NEW.created_by,
    'owner'::public.community_role,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

-- Membership identity is immutable, and the single owner role cannot be
-- assigned, transferred, or demoted through direct row updates.
CREATE OR REPLACE FUNCTION public.enforce_community_member_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'membership identity and join time cannot be changed';
  END IF;

  IF OLD.role = 'owner'::public.community_role
    OR NEW.role = 'owner'::public.community_role THEN
    RAISE EXCEPTION 'community ownership cannot be changed directly';
  END IF;

  RETURN NEW;
END;
$$;

-- Authors may edit content only; community, author, and creation time stay fixed.
CREATE OR REPLACE FUNCTION public.enforce_community_post_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.community_id IS DISTINCT FROM OLD.community_id
    OR NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community post identity, author, and creation time cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger creation is guarded instead of dropping existing trigger objects.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.communities'::regclass
      AND tgname = 'enforce_community_update_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER enforce_community_update_trigger
      BEFORE UPDATE ON public.communities
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_community_update();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.communities'::regclass
      AND tgname = 'create_community_owner_membership_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER create_community_owner_membership_trigger
      AFTER INSERT ON public.communities
      FOR EACH ROW
      EXECUTE FUNCTION public.create_community_owner_membership();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.community_members'::regclass
      AND tgname = 'enforce_community_member_update_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER enforce_community_member_update_trigger
      BEFORE UPDATE ON public.community_members
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_community_member_update();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.community_posts'::regclass
      AND tgname = 'enforce_community_post_update_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER enforce_community_post_update_trigger
      BEFORE UPDATE ON public.community_posts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_community_post_update();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_community_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_community_owner_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_community_member_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_community_post_update() FROM PUBLIC;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Grants expose only these new tables to authenticated users; RLS below remains
-- the authority for every row operation. No privileges are granted to anon.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;

-- Grant only the identity sequences owned by the two new identity columns.
DO $$
DECLARE
  sequence_name text;
BEGIN
  sequence_name := pg_get_serial_sequence('public.communities', 'id');
  IF sequence_name IS NOT NULL THEN
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
      sequence_name
    );
  END IF;

  sequence_name := pg_get_serial_sequence('public.community_posts', 'id');
  IF sequence_name IS NOT NULL THEN
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
      sequence_name
    );
  END IF;
END;
$$;

-- Community metadata policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'communities_authenticated_read'
  ) THEN
    CREATE POLICY "communities_authenticated_read"
      ON public.communities
      FOR SELECT
      TO authenticated
      USING (public.community_can_read(id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'communities_admin_create'
  ) THEN
    CREATE POLICY "communities_admin_create"
      ON public.communities
      FOR INSERT
      TO authenticated
      WITH CHECK (
        created_by = auth.uid()
        AND public.community_current_user_is_verified()
        AND public.community_current_user_is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'communities_manager_update'
  ) THEN
    CREATE POLICY "communities_manager_update"
      ON public.communities
      FOR UPDATE
      TO authenticated
      USING (
        public.community_has_role(
          id,
          ARRAY['owner', 'admin']::public.community_role[]
        )
        OR public.community_current_user_is_platform_admin()
      )
      WITH CHECK (
        public.community_has_role(
          id,
          ARRAY['owner', 'admin']::public.community_role[]
        )
        OR public.community_current_user_is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'communities_manager_delete'
  ) THEN
    CREATE POLICY "communities_manager_delete"
      ON public.communities
      FOR DELETE
      TO authenticated
      USING (
        public.community_has_role(
          id,
          ARRAY['owner', 'admin']::public.community_role[]
        )
        OR public.community_current_user_is_platform_admin()
      );
  END IF;
END;
$$;

-- Membership policies. Public visibility does not expose membership lists;
-- users must be members (or platform admins) to read them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_members'
      AND policyname = 'community_members_member_read'
  ) THEN
    CREATE POLICY "community_members_member_read"
      ON public.community_members
      FOR SELECT
      TO authenticated
      USING (
        public.community_has_role(
          community_id,
          ARRAY['owner', 'admin', 'member']::public.community_role[]
        )
        OR public.community_current_user_is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_members'
      AND policyname = 'community_members_verified_join_public'
  ) THEN
    CREATE POLICY "community_members_verified_join_public"
      ON public.community_members
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND role = 'member'::public.community_role
        AND public.community_current_user_is_verified()
        AND EXISTS (
          SELECT 1
          FROM public.communities AS c
          WHERE c.id = community_id
            AND c.is_public = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_members'
      AND policyname = 'community_members_owner_manage_roles'
  ) THEN
    CREATE POLICY "community_members_owner_manage_roles"
      ON public.community_members
      FOR UPDATE
      TO authenticated
      USING (
        user_id <> auth.uid()
        AND role <> 'owner'::public.community_role
        AND public.community_has_role(
          community_id,
          ARRAY['owner']::public.community_role[]
        )
      )
      WITH CHECK (
        user_id <> auth.uid()
        AND role = ANY (
          ARRAY['admin', 'member']::public.community_role[]
        )
        AND public.community_has_role(
          community_id,
          ARRAY['owner']::public.community_role[]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_members'
      AND policyname = 'community_members_leave_or_remove'
  ) THEN
    CREATE POLICY "community_members_leave_or_remove"
      ON public.community_members
      FOR DELETE
      TO authenticated
      USING (
        (
          user_id = auth.uid()
          AND role <> 'owner'::public.community_role
        )
        OR
        (
          user_id <> auth.uid()
          AND role <> 'owner'::public.community_role
          AND (
            public.community_has_role(
              community_id,
              ARRAY['owner', 'admin']::public.community_role[]
            )
            OR public.community_current_user_is_platform_admin()
          )
        )
      );
  END IF;
END;
$$;

-- Community post policies. Posts stay isolated from the existing global feed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'community_posts_community_read'
  ) THEN
    CREATE POLICY "community_posts_community_read"
      ON public.community_posts
      FOR SELECT
      TO authenticated
      USING (public.community_can_read(community_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'community_posts_member_create'
  ) THEN
    CREATE POLICY "community_posts_member_create"
      ON public.community_posts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        author_id = auth.uid()
        AND public.community_current_user_is_verified()
        AND public.community_has_role(
          community_id,
          ARRAY['owner', 'admin', 'member']::public.community_role[]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'community_posts_author_update'
  ) THEN
    CREATE POLICY "community_posts_author_update"
      ON public.community_posts
      FOR UPDATE
      TO authenticated
      USING (
        author_id = auth.uid()
        AND public.community_has_role(
          community_id,
          ARRAY['owner', 'admin', 'member']::public.community_role[]
        )
      )
      WITH CHECK (
        author_id = auth.uid()
        AND public.community_current_user_is_verified()
        AND public.community_has_role(
          community_id,
          ARRAY['owner', 'admin', 'member']::public.community_role[]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'community_posts_author_or_manager_delete'
  ) THEN
    CREATE POLICY "community_posts_author_or_manager_delete"
      ON public.community_posts
      FOR DELETE
      TO authenticated
      USING (
        (
          author_id = auth.uid()
          AND public.community_has_role(
            community_id,
            ARRAY['owner', 'admin', 'member']::public.community_role[]
          )
        )
        OR public.community_has_role(
          community_id,
          ARRAY['owner', 'admin']::public.community_role[]
        )
        OR public.community_current_user_is_platform_admin()
      );
  END IF;
END;
$$;

-- No seed rows are inserted. Optional manual examples are intentionally
-- commented and require a real verified platform-admin profile UUID.
--
-- INSERT INTO public.communities (
--   name, slug, description, type, university_id, created_by, is_public
-- )
-- SELECT
--   'KBTU Community',
--   'kbtu-community',
--   NULL,
--   'university'::public.community_type,
--   u.id,
--   '<verified-admin-profile-uuid>'::uuid,
--   true
-- FROM public.universities AS u
-- WHERE u.short_name = 'KBTU'
-- ON CONFLICT (slug) DO NOTHING;
--
-- INSERT INTO public.communities (
--   name, slug, description, type, university_id, created_by, is_public
-- )
-- SELECT
--   'KBTU Computer Science',
--   'kbtu-computer-science',
--   NULL,
--   'major'::public.community_type,
--   u.id,
--   '<verified-admin-profile-uuid>'::uuid,
--   true
-- FROM public.universities AS u
-- WHERE u.short_name = 'KBTU'
-- ON CONFLICT (slug) DO NOTHING;

COMMIT;
