-- Migration 006: UYYM Materials Bank foundation
--
-- This migration upgrades the existing, unused public.materials table and
-- creates a private Supabase Storage bucket. It does not upload files, seed
-- materials, or execute from the application.

BEGIN;

-- Preflight the live base schema before making structural changes.
DO $$
DECLARE
  unexpected_policies text[];
  conflicting_storage_policies text[] := ARRAY[]::text[];
  owned_storage_policies constant text[] := ARRAY[
    'materials_storage_read',
    'materials_storage_insert',
    'materials_storage_delete'
  ]::text[];
  storage_policy record;
  read_expression text;
  write_expression text;
  read_has_mandatory_bucket_prefix boolean;
  write_has_mandatory_bucket_prefix boolean;
  upgrade_required boolean;
BEGIN
  IF to_regclass('public.materials') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.universities') IS NULL
    OR to_regclass('public.professors') IS NULL THEN
    RAISE EXCEPTION
      'migration 006 requires public.materials, public.profiles, public.universities, and public.professors';
  END IF;

  IF to_regclass('storage.buckets') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR to_regprocedure('storage.foldername(text)') IS NULL THEN
    RAISE EXCEPTION
      'migration 006 requires Supabase Storage tables and storage.foldername(text)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'file_size_limit'
      AND data_type = 'bigint'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'allowed_mime_types'
      AND data_type = 'ARRAY'
  ) THEN
    RAISE EXCEPTION
      'migration 006 requires Storage bucket file_size_limit bigint and allowed_mime_types array support';
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
      'migration 006 requires profiles.id uuid, profiles.is_verified boolean, and profiles.is_admin boolean';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'universities'
      AND column_name = 'id'
      AND data_type = 'integer'
  ) THEN
    RAISE EXCEPTION 'migration 006 requires universities.id integer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professors'
      AND column_name = 'id'
      AND data_type = 'bigint'
  ) THEN
    RAISE EXCEPTION 'migration 006 requires professors.id bigint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'id'
      AND data_type = 'bigint'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'uploader_id'
      AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'university_id'
      AND data_type = 'integer'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'professor_id'
      AND data_type = 'bigint'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'title'
      AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'course_name'
      AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION
      'migration 006 expects materials(id bigint, uploader_id uuid, university_id integer, professor_id bigint, title text, course_name text, created_at timestamptz)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'p'
      AND conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.materials'::regclass
            AND attname = 'id'
            AND NOT attisdropped
        )
      ]::smallint[]
  ) OR pg_get_serial_sequence('public.materials', 'id') IS NULL THEN
    RAISE EXCEPTION
      'migration 006 requires materials.id to be a generated bigint primary key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name IN ('file_url', 'file_path')
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION
      'migration 006 requires the legacy materials.file_url text column or the upgraded materials.file_path text column';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_url'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_path'
  ) THEN
    RAISE EXCEPTION
      'materials has both file_url and file_path; review the duplicate path columns before migration 006';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.materials'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%file_url%'
  ) THEN
    RAISE EXCEPTION
      'materials.file_url has a legacy CHECK constraint; review it before migration 006 renames the column';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'materials'
        AND column_name = 'file_url'
    )
    OR EXISTS (
      SELECT required.name
      FROM unnest(ARRAY[
        'description',
        'file_name',
        'mime_type',
        'file_size',
        'material_type',
        'status'
      ]) AS required(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'materials'
          AND c.column_name = required.name
      )
    )
  INTO upgrade_required;

  -- Legacy URLs cannot be trusted as private bucket paths. Stop instead of
  -- rewriting or deleting existing rows automatically.
  IF upgrade_required AND EXISTS (SELECT 1 FROM public.materials LIMIT 1) THEN
    RAISE EXCEPTION
      'materials contains legacy rows; audit and migrate file_url values before running migration 006';
  END IF;

  -- Permissive PostgreSQL policies combine with OR. Unknown legacy policies
  -- must be reviewed rather than silently coexisting with the new model.
  SELECT array_agg(policyname ORDER BY policyname)
  INTO unexpected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'materials'
    AND policyname <> ALL (ARRAY[
      'materials_authenticated_read',
      'materials_verified_insert',
      'materials_uploader_update_pending',
      'materials_uploader_delete_pending',
      'materials_admin_update',
      'materials_admin_delete'
    ]);

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'review existing public.materials policies before migration 006: %',
      unexpected_policies;
  END IF;

  -- Inspect every public/anon/authenticated storage.objects policy. The three
  -- migration-owned names are enumerated too, but are safe to ignore here
  -- because they are dropped and recreated exactly later in this transaction.
  --
  -- Arbitrary SQL policy semantics cannot be proven through catalog text. This
  -- defensive check rejects explicit materials access, missing bucket scopes,
  -- self-comparisons, IS NOT NULL scopes, bare TRUE grants, and expressions
  -- that do not contain a recognizable literal bucket restriction. A manual
  -- pg_policies review is still required before execution.
  FOR storage_policy IN
    SELECT policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
    ORDER BY policyname
  LOOP
    IF storage_policy.policyname = ANY (owned_storage_policies) THEN
      CONTINUE;
    END IF;

    IF storage_policy.cmd IN ('ALL', 'SELECT', 'DELETE', 'UPDATE') THEN
      read_expression := lower(coalesce(storage_policy.qual, ''));
      read_has_mandatory_bucket_prefix :=
        read_expression ~ '^[[:space:](]*bucket_id[[:space:]]*=[[:space:]]*''[^'']+''(::[a-z0-9_.]+)?[[:space:])]*and([[:space:](]|$)'
        OR read_expression ~ '^[[:space:](]*''[^'']+''(::[a-z0-9_.]+)?[[:space:]]*=[[:space:]]*bucket_id[[:space:])]*and([[:space:](]|$)'
        OR read_expression ~ '^[[:space:](]*bucket_id[[:space:]]+in[[:space:]]*\([^)]*\)[[:space:])]*and([[:space:](]|$)'
        OR read_expression ~ '^[[:space:](]*bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\([^)]*\)[[:space:])]*and([[:space:](]|$)';

      IF read_expression = ''
        OR position('bucket_id' IN read_expression) = 0
        OR read_expression ~ 'bucket_id[[:space:]]+is[[:space:]]+not[[:space:]]+null'
        OR read_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*bucket_id'
        OR read_expression ~ '^[[:space:]()]*true[[:space:]()]*$'
        OR read_expression ~ '(^|[[:space:](])or[[:space:](]+true([[:space:])]|$)'
        OR (
          read_expression ~ '(^|[[:space:](])or([[:space:])]|$)'
          AND NOT read_has_mandatory_bucket_prefix
        )
        OR read_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*''materials'''
        OR read_expression ~ '''materials''([^a-z0-9_]|$).*=[[:space:]]*bucket_id'
        OR read_expression ~ 'bucket_id[[:space:]]+in[[:space:]]*\([^)]*''materials'''
        OR (
          read_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\('
          AND position('''materials''' IN read_expression) > 0
        )
        OR NOT (
          read_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*''[^'']+'''
          OR read_expression ~ '''[^'']+''([^a-z0-9_]|$).*=[[:space:]]*bucket_id'
          OR read_expression ~ 'bucket_id[[:space:]]+in[[:space:]]*\('
          OR read_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\('
          OR read_expression ~ 'bucket_id[[:space:]]*(<>|!=)[[:space:]]*''materials'''
        ) THEN
        conflicting_storage_policies := array_append(
          conflicting_storage_policies,
          format('%s [%s USING]', storage_policy.policyname, storage_policy.cmd)
        );
      END IF;
    END IF;

    IF storage_policy.cmd IN ('ALL', 'INSERT', 'UPDATE') THEN
      -- PostgreSQL uses USING as the default WITH CHECK for ALL/UPDATE policies.
      write_expression := lower(coalesce(
        storage_policy.with_check,
        storage_policy.qual,
        ''
      ));
      write_has_mandatory_bucket_prefix :=
        write_expression ~ '^[[:space:](]*bucket_id[[:space:]]*=[[:space:]]*''[^'']+''(::[a-z0-9_.]+)?[[:space:])]*and([[:space:](]|$)'
        OR write_expression ~ '^[[:space:](]*''[^'']+''(::[a-z0-9_.]+)?[[:space:]]*=[[:space:]]*bucket_id[[:space:])]*and([[:space:](]|$)'
        OR write_expression ~ '^[[:space:](]*bucket_id[[:space:]]+in[[:space:]]*\([^)]*\)[[:space:])]*and([[:space:](]|$)'
        OR write_expression ~ '^[[:space:](]*bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\([^)]*\)[[:space:])]*and([[:space:](]|$)';

      IF write_expression = ''
        OR position('bucket_id' IN write_expression) = 0
        OR write_expression ~ 'bucket_id[[:space:]]+is[[:space:]]+not[[:space:]]+null'
        OR write_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*bucket_id'
        OR write_expression ~ '^[[:space:]()]*true[[:space:]()]*$'
        OR write_expression ~ '(^|[[:space:](])or[[:space:](]+true([[:space:])]|$)'
        OR (
          write_expression ~ '(^|[[:space:](])or([[:space:])]|$)'
          AND NOT write_has_mandatory_bucket_prefix
        )
        OR write_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*''materials'''
        OR write_expression ~ '''materials''([^a-z0-9_]|$).*=[[:space:]]*bucket_id'
        OR write_expression ~ 'bucket_id[[:space:]]+in[[:space:]]*\([^)]*''materials'''
        OR (
          write_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\('
          AND position('''materials''' IN write_expression) > 0
        )
        OR NOT (
          write_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*''[^'']+'''
          OR write_expression ~ '''[^'']+''([^a-z0-9_]|$).*=[[:space:]]*bucket_id'
          OR write_expression ~ 'bucket_id[[:space:]]+in[[:space:]]*\('
          OR write_expression ~ 'bucket_id[[:space:]]*=[[:space:]]*any[[:space:]]*\('
          OR write_expression ~ 'bucket_id[[:space:]]*(<>|!=)[[:space:]]*''materials'''
        ) THEN
        conflicting_storage_policies := array_append(
          conflicting_storage_policies,
          format('%s [%s WITH CHECK]', storage_policy.policyname, storage_policy.cmd)
        );
      END IF;
    END IF;
  END LOOP;

  IF cardinality(conflicting_storage_policies) > 0 THEN
    RAISE EXCEPTION
      'review conflicting or broad storage.objects policies before migration 006: %',
      conflicting_storage_policies;
  END IF;
END;
$$;

-- Material categories and moderation states are constrained enums.
DO $$
DECLARE
  existing_labels text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'material_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'material_type'
        AND t.typtype = 'e'
    ) THEN
      RAISE EXCEPTION 'public.material_type exists but is not an enum';
    END IF;

    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO existing_labels
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    JOIN pg_enum AS e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'material_type';

    IF existing_labels IS DISTINCT FROM
      ARRAY['notes', 'exam', 'assignment', 'presentation', 'book', 'other']::text[] THEN
      RAISE EXCEPTION 'public.material_type has unexpected labels: %', existing_labels;
    END IF;
  ELSE
    CREATE TYPE public.material_type AS ENUM (
      'notes',
      'exam',
      'assignment',
      'presentation',
      'book',
      'other'
    );
  END IF;
END;
$$;

DO $$
DECLARE
  existing_labels text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'material_moderation_status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'material_moderation_status'
        AND t.typtype = 'e'
    ) THEN
      RAISE EXCEPTION
        'public.material_moderation_status exists but is not an enum';
    END IF;

    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO existing_labels
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    JOIN pg_enum AS e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'material_moderation_status';

    IF existing_labels IS DISTINCT FROM
      ARRAY['pending', 'approved', 'rejected']::text[] THEN
      RAISE EXCEPTION
        'public.material_moderation_status has unexpected labels: %',
        existing_labels;
    END IF;
  ELSE
    CREATE TYPE public.material_moderation_status AS ENUM (
      'pending',
      'approved',
      'rejected'
    );
  END IF;
END;
$$;

-- The old table is unused. Rename its ambiguous URL column only while empty so
-- future clients store a relative private Storage path, never a public URL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_path'
  ) THEN
    ALTER TABLE public.materials RENAME COLUMN file_url TO file_path;
  END IF;
END;
$$;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS material_type public.material_type,
  ADD COLUMN IF NOT EXISTS status public.material_moderation_status
    DEFAULT 'pending'::public.material_moderation_status;

-- New rows require complete educational and file metadata. Professor remains
-- optional; a material must always belong to a university and course.
ALTER TABLE public.materials
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN course_name SET NOT NULL,
  ALTER COLUMN file_path SET NOT NULL,
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN mime_type SET NOT NULL,
  ALTER COLUMN file_size SET NOT NULL,
  ALTER COLUMN material_type SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending'::public.material_moderation_status,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN university_id SET NOT NULL,
  ALTER COLUMN uploader_id SET NOT NULL,
  ALTER COLUMN professor_id DROP NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

-- Verify partially applied schemas before constraints and policies are added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'description'
      AND data_type = 'text'
      AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_path'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_name'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'mime_type'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'file_size'
      AND data_type = 'bigint'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'material_type'
      AND udt_schema = 'public'
      AND udt_name = 'material_type'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'status'
      AND udt_schema = 'public'
      AND udt_name = 'material_moderation_status'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION
      'materials has incompatible upgraded columns; review the partial schema before migration 006';
  END IF;
END;
$$;

-- Text, path, size, and MIME constraints keep client metadata bounded and
-- reject URL paths, traversal, executable formats, HTML, and SVG.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_title_length'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_title_length CHECK (
        title = btrim(title)
        AND char_length(title) BETWEEN 3 AND 180
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_description_length'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_description_length CHECK (
        description IS NULL
        OR (
          description = btrim(description)
          AND char_length(description) BETWEEN 1 AND 2000
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_course_name_length'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_course_name_length CHECK (
        course_name = btrim(course_name)
        AND char_length(course_name) BETWEEN 2 AND 120
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_file_path_scope'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_file_path_scope CHECK (
        file_path = btrim(file_path)
        AND cardinality(string_to_array(file_path, '/')) = 3
        AND split_part(file_path, '/', 1) = uploader_id::text
        AND split_part(file_path, '/', 2) ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND split_part(file_path, '/', 3) = file_name
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_file_name_safe'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_file_name_safe CHECK (
        file_name = btrim(file_name)
        AND char_length(file_name) BETWEEN 3 AND 180
        AND file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_file_size_limit'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_file_size_limit CHECK (
        file_size BETWEEN 1 AND 26214400
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND conname = 'materials_file_type_pair'
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_file_type_pair CHECK (
        (file_name ~* '\.pdf$' AND mime_type = 'application/pdf')
        OR (file_name ~* '\.doc$' AND mime_type = 'application/msword')
        OR (
          file_name ~* '\.docx$'
          AND mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        OR (file_name ~* '\.ppt$' AND mime_type = 'application/vnd.ms-powerpoint')
        OR (
          file_name ~* '\.pptx$'
          AND mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )
        OR (file_name ~* '\.xls$' AND mime_type = 'application/vnd.ms-excel')
        OR (
          file_name ~* '\.xlsx$'
          AND mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        OR (file_name ~* '\.txt$' AND mime_type = 'text/plain')
        OR (file_name ~* '\.png$' AND mime_type = 'image/png')
        OR (file_name ~* '\.(jpg|jpeg)$' AND mime_type = 'image/jpeg')
        OR (file_name ~* '\.webp$' AND mime_type = 'image/webp')
      );
  END IF;
END;
$$;

-- Existing foreign keys are accepted only when they point at the expected
-- parent and do not cascade-delete educational materials.
DO $$
DECLARE
  uploader_attnum smallint;
  university_attnum smallint;
  professor_attnum smallint;
  profile_id_attnum smallint;
  university_id_attnum smallint;
  professor_id_attnum smallint;
BEGIN
  SELECT attnum INTO uploader_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.materials'::regclass
    AND attname = 'uploader_id'
    AND NOT attisdropped;

  SELECT attnum INTO university_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.materials'::regclass
    AND attname = 'university_id'
    AND NOT attisdropped;

  SELECT attnum INTO professor_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.materials'::regclass
    AND attname = 'professor_id'
    AND NOT attisdropped;

  SELECT attnum INTO profile_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  SELECT attnum INTO university_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.universities'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  SELECT attnum INTO professor_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.professors'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey @> ARRAY[uploader_attnum]
      AND (
        confrelid <> 'public.profiles'::regclass
        OR confkey <> ARRAY[profile_id_attnum]
        OR confdeltype NOT IN ('a', 'r')
      )
  ) THEN
    RAISE EXCEPTION
      'materials.uploader_id has an incompatible foreign key or ON DELETE action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[uploader_attnum]
      AND confrelid = 'public.profiles'::regclass
      AND confkey = ARRAY[profile_id_attnum]
      AND confdeltype IN ('a', 'r')
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_uploader_profile_fkey
      FOREIGN KEY (uploader_id)
      REFERENCES public.profiles(id)
      ON DELETE RESTRICT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey @> ARRAY[university_attnum]
      AND (
        confrelid <> 'public.universities'::regclass
        OR confkey <> ARRAY[university_id_attnum]
        OR confdeltype NOT IN ('a', 'r')
      )
  ) THEN
    RAISE EXCEPTION
      'materials.university_id has an incompatible foreign key or ON DELETE action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[university_attnum]
      AND confrelid = 'public.universities'::regclass
      AND confkey = ARRAY[university_id_attnum]
      AND confdeltype IN ('a', 'r')
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_university_fkey
      FOREIGN KEY (university_id)
      REFERENCES public.universities(id)
      ON DELETE RESTRICT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey @> ARRAY[professor_attnum]
      AND (
        confrelid <> 'public.professors'::regclass
        OR confkey <> ARRAY[professor_id_attnum]
        OR confdeltype NOT IN ('a', 'r')
      )
  ) THEN
    RAISE EXCEPTION
      'materials.professor_id has an incompatible foreign key or ON DELETE action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[professor_attnum]
      AND confrelid = 'public.professors'::regclass
      AND confkey = ARRAY[professor_id_attnum]
      AND confdeltype IN ('a', 'r')
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_professor_fkey
      FOREIGN KEY (professor_id)
      REFERENCES public.professors(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS materials_file_path_unique_idx
  ON public.materials (file_path);

CREATE INDEX IF NOT EXISTS materials_approved_created_idx
  ON public.materials (created_at DESC)
  WHERE status = 'approved'::public.material_moderation_status;

CREATE INDEX IF NOT EXISTS materials_uploader_status_idx
  ON public.materials (uploader_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS materials_university_course_idx
  ON public.materials (university_id, course_name, created_at DESC)
  WHERE status = 'approved'::public.material_moderation_status;

CREATE INDEX IF NOT EXISTS materials_professor_idx
  ON public.materials (professor_id, created_at DESC)
  WHERE professor_id IS NOT NULL
    AND status = 'approved'::public.material_moderation_status;

-- Profile lookups are SECURITY DEFINER because profiles RLS may hide the
-- current user's verification or admin flags from a policy evaluation.
CREATE OR REPLACE FUNCTION public.material_current_user_is_verified()
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

CREATE OR REPLACE FUNCTION public.material_current_user_is_platform_admin()
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

REVOKE ALL ON FUNCTION public.material_current_user_is_verified() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.material_current_user_is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.material_current_user_is_verified() FROM anon;
REVOKE ALL ON FUNCTION public.material_current_user_is_platform_admin() FROM anon;
REVOKE ALL ON FUNCTION public.material_current_user_is_verified() FROM authenticated;
REVOKE ALL ON FUNCTION public.material_current_user_is_platform_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.material_current_user_is_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.material_current_user_is_platform_admin() TO authenticated;

-- File identity and metadata are immutable after insert. A pending uploader may
-- edit educational metadata. Platform admins may change moderation status only.
CREATE OR REPLACE FUNCTION public.enforce_material_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.uploader_id IS DISTINCT FROM OLD.uploader_id
    OR NEW.file_path IS DISTINCT FROM OLD.file_path
    OR NEW.file_name IS DISTINCT FROM OLD.file_name
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.file_size IS DISTINCT FROM OLD.file_size
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'material identity, uploader, file metadata, and creation time cannot be changed';
  END IF;

  IF OLD.uploader_id = auth.uid()
    AND OLD.status = 'pending'::public.material_moderation_status
    AND NEW.status = 'pending'::public.material_moderation_status THEN
    RETURN NEW;
  END IF;

  IF public.material_current_user_is_platform_admin() THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.course_name IS DISTINCT FROM OLD.course_name
      OR NEW.university_id IS DISTINCT FROM OLD.university_id
      OR NEW.professor_id IS DISTINCT FROM OLD.professor_id
      OR NEW.material_type IS DISTINCT FROM OLD.material_type THEN
      RAISE EXCEPTION 'material moderation may change status only';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'only the pending uploader may edit metadata; only a platform admin may moderate';
END;
$$;

DROP TRIGGER IF EXISTS enforce_material_update_trigger
  ON public.materials;

CREATE TRIGGER enforce_material_update_trigger
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_material_update();

REVOKE ALL ON FUNCTION public.enforce_material_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_material_update() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_material_update() FROM authenticated;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Authenticated clients receive table privileges, then RLS restricts every row.
-- Anon receives no Materials Bank table access.
REVOKE ALL ON TABLE public.materials FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;

DO $$
DECLARE
  sequence_name text;
BEGIN
  sequence_name := pg_get_serial_sequence('public.materials', 'id');
  IF sequence_name IS NOT NULL THEN
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
      sequence_name
    );
  END IF;
END;
$$;

-- Migration-owned policies are replaced deterministically so a stale or
-- compromised same-named definition cannot survive a rerun.
DROP POLICY IF EXISTS "materials_authenticated_read" ON public.materials;
DROP POLICY IF EXISTS "materials_verified_insert" ON public.materials;
DROP POLICY IF EXISTS "materials_uploader_update_pending" ON public.materials;
DROP POLICY IF EXISTS "materials_uploader_delete_pending" ON public.materials;
DROP POLICY IF EXISTS "materials_admin_update" ON public.materials;
DROP POLICY IF EXISTS "materials_admin_delete" ON public.materials;

-- Approved rows are browsable by authenticated users. Uploaders can see all of
-- their own moderation states, and platform admins can review every row.
CREATE POLICY "materials_authenticated_read"
  ON public.materials
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'::public.material_moderation_status
    OR uploader_id = auth.uid()
    OR public.material_current_user_is_platform_admin()
  );

CREATE POLICY "materials_verified_insert"
  ON public.materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND status = 'pending'::public.material_moderation_status
    AND public.material_current_user_is_verified()
  );

CREATE POLICY "materials_uploader_update_pending"
  ON public.materials
  FOR UPDATE
  TO authenticated
  USING (
    uploader_id = auth.uid()
    AND status = 'pending'::public.material_moderation_status
  )
  WITH CHECK (
    uploader_id = auth.uid()
    AND status = 'pending'::public.material_moderation_status
    AND public.material_current_user_is_verified()
  );

CREATE POLICY "materials_uploader_delete_pending"
  ON public.materials
  FOR DELETE
  TO authenticated
  USING (
    uploader_id = auth.uid()
    AND status = 'pending'::public.material_moderation_status
  );

CREATE POLICY "materials_admin_update"
  ON public.materials
  FOR UPDATE
  TO authenticated
  USING (public.material_current_user_is_platform_admin())
  WITH CHECK (public.material_current_user_is_platform_admin());

CREATE POLICY "materials_admin_delete"
  ON public.materials
  FOR DELETE
  TO authenticated
  USING (public.material_current_user_is_platform_admin());

-- Create an exact private bucket. If a bucket with this ID already exists but
-- has different security limits, stop instead of silently changing it.
DO $$
DECLARE
  expected_mime_types text[] := ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[];
  existing_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO existing_bucket
  FROM storage.buckets
  WHERE id = 'materials';

  IF FOUND THEN
    IF existing_bucket.name IS DISTINCT FROM 'materials'
      OR existing_bucket.public IS DISTINCT FROM false
      OR existing_bucket.file_size_limit IS DISTINCT FROM 26214400
      OR existing_bucket.allowed_mime_types IS NULL
      OR cardinality(existing_bucket.allowed_mime_types) <> cardinality(expected_mime_types)
      OR NOT existing_bucket.allowed_mime_types @> expected_mime_types
      OR NOT expected_mime_types @> existing_bucket.allowed_mime_types THEN
      RAISE EXCEPTION
        'existing materials bucket does not match the required private 25 MB MIME-restricted configuration';
    END IF;
  ELSE
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) VALUES (
      'materials',
      'materials',
      false,
      26214400,
      expected_mime_types
    );
  END IF;
END;
$$;

-- Upload requires a verified student, a path under auth.uid(), and an existing
-- pending materials row whose file_path exactly matches the object name.
-- The installed client sends an HTTP Content-Type, but does not establish a
-- stable contract for a metadata JSON MIME key during INSERT policy evaluation.
-- Do not add a fragile metadata lookup here. The bucket whitelist, database
-- extension/MIME constraint, client validation, and moderation remain required.

-- Replace only the three migration-owned Storage policies. No unrelated
-- storage.objects policy is removed or changed.
DROP POLICY IF EXISTS "materials_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_read" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_delete" ON storage.objects;

CREATE POLICY "materials_storage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materials'
    AND auth.uid() IS NOT NULL
    AND cardinality(storage.foldername(name)) = 2
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.material_current_user_is_verified()
    AND EXISTS (
      SELECT 1
      FROM public.materials AS m
      WHERE m.file_path = storage.objects.name
        AND m.uploader_id = auth.uid()
        AND m.status = 'pending'::public.material_moderation_status
    )
  );

-- Every signed-URL read, including an admin read, requires a matching material
-- row. Approved objects are available to authenticated users; uploaders and
-- platform admins may preview non-approved files.
CREATE POLICY "materials_storage_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.materials AS m
      WHERE m.file_path = storage.objects.name
        AND (
          m.status = 'approved'::public.material_moderation_status
          OR m.uploader_id = auth.uid()
          OR public.material_current_user_is_platform_admin()
        )
    )
  );

-- Uploaders may remove their own pending object or an orphan in their own
-- folder. Admin DELETE remains bucket-wide for intentional orphan cleanup.
CREATE POLICY "materials_storage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND (
      public.material_current_user_is_platform_admin()
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
          EXISTS (
            SELECT 1
            FROM public.materials AS m
            WHERE m.file_path = storage.objects.name
              AND m.uploader_id = auth.uid()
              AND m.status = 'pending'::public.material_moderation_status
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.materials AS m
            WHERE m.file_path = storage.objects.name
          )
        )
      )
    )
  );

-- No UPDATE policy is created for storage.objects. Clients must not overwrite
-- a file after upload; a replacement is a new pending material with a new path.

COMMIT;
