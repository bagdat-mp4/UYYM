-- Migration 004: Verified connections and private message security
--
-- This migration is intentionally not executed by the application. Run it with
-- a database-owner role after reviewing any preflight error it reports.
--
-- Existing live schema used by this migration:
--   connections(requester_id uuid, addressee_id uuid,
--               status connection_status, created_at timestamptz)
--   messages(id bigint, sender_id uuid, recipient_id uuid, content text,
--            created_at timestamptz, read_at timestamptz)

BEGIN;

-- Stop before adding constraints if existing data contains a self-connection.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.connections
    WHERE requester_id = addressee_id
  ) THEN
    RAISE EXCEPTION
      'connections contains self-connections; review those rows before rerunning migration 004';
  END IF;
END;
$$;

-- Stop rather than deleting data if the same unordered student pair appears
-- more than once. The owner can review and resolve those rows explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.connections
    GROUP BY
      LEAST(requester_id, addressee_id),
      GREATEST(requester_id, addressee_id)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'connections contains duplicate or reverse-duplicate pairs; review them before rerunning migration 004';
  END IF;
END;
$$;

-- A student cannot connect to themselves.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.connections'::regclass
      AND conname = 'connections_not_self'
  ) THEN
    ALTER TABLE public.connections
      ADD CONSTRAINT connections_not_self
      CHECK (requester_id <> addressee_id);
  END IF;
END;
$$;

-- Treat requester/addressee as an unordered pair so a reverse request cannot
-- create a second connection row.
CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_student_pair_idx
  ON public.connections (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  );

-- Keep the identities and creation time immutable. The only supported update
-- is an addressee accepting a pending connection.
CREATE OR REPLACE FUNCTION public.enforce_connection_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
    OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'connection participants and creation time cannot be changed';
  END IF;

  IF OLD.status <> 'pending'::public.connection_status
    OR NEW.status <> 'accepted'::public.connection_status THEN
    RAISE EXCEPTION 'only pending connections can be accepted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_connection_update_trigger
  ON public.connections;

CREATE TRIGGER enforce_connection_update_trigger
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_connection_update();

-- Security-definer helpers prevent profiles/connections RLS recursion while
-- keeping each check tied to auth.uid() or explicit profile IDs.
CREATE OR REPLACE FUNCTION public.are_verified_students(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_user_a IS NOT NULL
    AND p_user_b IS NOT NULL
    AND p_user_a <> p_user_b
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_user_a
        AND is_verified = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_user_b
        AND is_verified = true
    );
$$;

CREATE OR REPLACE FUNCTION public.has_verified_connection(p_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.are_verified_students(auth.uid(), p_other_user_id)
    AND EXISTS (
      SELECT 1
      FROM public.connections
      WHERE status = 'accepted'::public.connection_status
        AND (
          (requester_id = auth.uid() AND addressee_id = p_other_user_id)
          OR
          (requester_id = p_other_user_id AND addressee_id = auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.are_verified_students(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_verified_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_verified_students(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_verified_connection(uuid) TO authenticated;

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Table privileges are still constrained by the policies below. No privileges
-- are granted to anon, and messages cannot be updated or deleted directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;

-- Permissive participant policies provide the normal access path.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_participant_select'
  ) THEN
    CREATE POLICY "connections_participant_select"
      ON public.connections
      FOR SELECT
      TO authenticated
      USING (auth.uid() IN (requester_id, addressee_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_requester_insert'
  ) THEN
    CREATE POLICY "connections_requester_insert"
      ON public.connections
      FOR INSERT
      TO authenticated
      WITH CHECK (requester_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_addressee_accept'
  ) THEN
    CREATE POLICY "connections_addressee_accept"
      ON public.connections
      FOR UPDATE
      TO authenticated
      USING (addressee_id = auth.uid())
      WITH CHECK (addressee_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_addressee_reject'
  ) THEN
    CREATE POLICY "connections_addressee_reject"
      ON public.connections
      FOR DELETE
      TO authenticated
      USING (addressee_id = auth.uid());
  END IF;
END;
$$;

-- Restrictive policies are intentionally additive. They remain an AND guard
-- even if the project already has a broader permissive policy with another name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_verified_participant_guard'
  ) THEN
    CREATE POLICY "connections_verified_participant_guard"
      ON public.connections
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() IN (requester_id, addressee_id)
        AND public.are_verified_students(requester_id, addressee_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_verified_request_guard'
  ) THEN
    CREATE POLICY "connections_verified_request_guard"
      ON public.connections
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        requester_id = auth.uid()
        AND status = 'pending'::public.connection_status
        AND public.are_verified_students(requester_id, addressee_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_accept_guard'
  ) THEN
    CREATE POLICY "connections_accept_guard"
      ON public.connections
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (
        addressee_id = auth.uid()
        AND status = 'pending'::public.connection_status
      )
      WITH CHECK (
        addressee_id = auth.uid()
        AND status = 'accepted'::public.connection_status
        AND public.are_verified_students(requester_id, addressee_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connections'
      AND policyname = 'connections_reject_guard'
  ) THEN
    CREATE POLICY "connections_reject_guard"
      ON public.connections
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (
        addressee_id = auth.uid()
        AND status = 'pending'::public.connection_status
      );
  END IF;
END;
$$;

-- Message access is limited to row participants who still have an accepted,
-- verified connection. There is no open authenticated-user message policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_participant_select'
  ) THEN
    CREATE POLICY "messages_participant_select"
      ON public.messages
      FOR SELECT
      TO authenticated
      USING (auth.uid() IN (sender_id, recipient_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_sender_insert'
  ) THEN
    CREATE POLICY "messages_sender_insert"
      ON public.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (sender_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_verified_connection_select_guard'
  ) THEN
    CREATE POLICY "messages_verified_connection_select_guard"
      ON public.messages
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        (sender_id = auth.uid() AND public.has_verified_connection(recipient_id))
        OR
        (recipient_id = auth.uid() AND public.has_verified_connection(sender_id))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_verified_connection_insert_guard'
  ) THEN
    CREATE POLICY "messages_verified_connection_insert_guard"
      ON public.messages
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid()
        AND public.has_verified_connection(recipient_id)
        AND char_length(btrim(content)) BETWEEN 1 AND 2000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_no_direct_update_guard'
  ) THEN
    CREATE POLICY "messages_no_direct_update_guard"
      ON public.messages
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_no_delete_guard'
  ) THEN
    CREATE POLICY "messages_no_delete_guard"
      ON public.messages
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END;
$$;

-- Read receipts are updated only through this narrow function. It cannot alter
-- message participants, content, or timestamps other than read_at.
CREATE OR REPLACE FUNCTION public.mark_connection_messages_read(
  p_sender_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.has_verified_connection(p_sender_id) THEN
    RAISE EXCEPTION 'accepted verified connection required';
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE sender_id = p_sender_id
    AND recipient_id = auth.uid()
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_connection_messages_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_connection_messages_read(uuid) TO authenticated;

-- Publish message changes for Supabase Realtime without adding the table twice.
-- Realtime still applies the authenticated subscriber's SELECT policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END;
$$;

COMMIT;
