-- Migration 003: Admin professor rating moderation RLS policies
-- Date: 2026-07-07
--
-- Purpose:
--   Allow verified admin users to moderate pending professor_ratings rows.
--   This migration is additive: it does not remove or weaken existing student
--   policies, and it does not grant professor_ratings access to all users.
--
-- Why the helper exists:
--   Admin policies need to check public.profiles.is_admin for auth.uid().
--   A SECURITY DEFINER helper prevents that check from being blocked by RLS on
--   public.profiles while keeping the actual admin test narrow and explicit:
--
--     EXISTS (
--       SELECT 1
--       FROM public.profiles
--       WHERE profiles.id = auth.uid()
--         AND profiles.is_admin = true
--     )

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

ALTER TABLE public.professor_ratings ENABLE ROW LEVEL SECURITY;

-- Admins must be able to read pending professor ratings for the moderation tab.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'professor_ratings'
      AND policyname = 'admin_select_professor_ratings'
  ) THEN
    CREATE POLICY "admin_select_professor_ratings"
      ON public.professor_ratings
      FOR SELECT
      TO authenticated
      USING (public.is_current_user_admin());
  END IF;
END;
$$;

-- Admins must be able to approve a rating by updating is_approved to true.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'professor_ratings'
      AND policyname = 'admin_update_professor_ratings'
  ) THEN
    CREATE POLICY "admin_update_professor_ratings"
      ON public.professor_ratings
      FOR UPDATE
      TO authenticated
      USING (public.is_current_user_admin())
      WITH CHECK (public.is_current_user_admin());
  END IF;
END;
$$;

-- Admins must be able to reject a rating in the current MVP by deleting it.
-- No rejection status column exists, so this policy supports the existing
-- delete-based Reject action without inventing schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'professor_ratings'
      AND policyname = 'admin_delete_professor_ratings'
  ) THEN
    CREATE POLICY "admin_delete_professor_ratings"
      ON public.professor_ratings
      FOR DELETE
      TO authenticated
      USING (public.is_current_user_admin());
  END IF;
END;
$$;

-- Optional inspection query for Supabase SQL Editor:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('professor_ratings', 'profiles', 'professors', 'universities')
-- ORDER BY tablename, policyname;
