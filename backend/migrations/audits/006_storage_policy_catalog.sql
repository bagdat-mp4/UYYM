-- Read-only catalog snapshot for migration 006.
--
-- Run this against the exact target project before migration 006 and whenever
-- Storage policies or role membership change. Review every row, then compare
-- the two JSON values with the exact allowlist in migration 006.
--
-- This file performs no writes and leaves no transaction open.

BEGIN TRANSACTION READ ONLY;

-- Match migration 006's fixed deparse context without persisting a setting.
SET LOCAL search_path = pg_catalog, public;

-- 1. Human-readable canonical storage.objects policy catalog.
WITH policy_catalog AS (
  SELECT
    p.polname::text AS policy_name,
    CASE p.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE p.polcmd::text
    END AS command,
    CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS mode,
    ARRAY(
      SELECT assigned_role.role_name
      FROM (
        SELECT CASE
          WHEN assigned.role_oid = 0 THEN 'public'
          ELSE coalesce(
            r.rolname::text,
            format('<missing-role:%s>', assigned.role_oid)
          )
        END AS role_name
        FROM unnest(p.polroles) AS assigned(role_oid)
        LEFT JOIN pg_roles AS r ON r.oid = assigned.role_oid
      ) AS assigned_role
      ORDER BY assigned_role.role_name
    ) AS roles,
    pg_get_expr(p.polqual, p.polrelid, false) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid, false) AS with_check_expression,
    p.polname = ANY (ARRAY[
      'materials_storage_insert',
      'materials_storage_read',
      'materials_storage_delete'
    ]) AS migration_owned
  FROM pg_policy AS p
  WHERE p.polrelid = 'storage.objects'::regclass
)
SELECT
  policy_name,
  command,
  mode,
  roles,
  using_expression,
  with_check_expression,
  migration_owned
FROM policy_catalog
ORDER BY policy_name;

-- 2. Authenticated role membership and effective inheritance closure.
WITH RECURSIVE membership_closure AS (
  SELECT
    r.oid,
    r.rolname,
    r.rolinherit,
    r.rolsuper,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls
  FROM pg_roles AS r
  WHERE r.rolname = 'authenticated'

  UNION

  SELECT
    parent.oid,
    parent.rolname,
    parent.rolinherit,
    parent.rolsuper,
    parent.rolcreaterole,
    parent.rolcreatedb,
    parent.rolcanlogin,
    parent.rolreplication,
    parent.rolbypassrls
  FROM membership_closure AS member_role
  JOIN pg_auth_members AS membership ON membership.member = member_role.oid
  JOIN pg_roles AS parent ON parent.oid = membership.roleid
),
inherited_closure AS (
  SELECT r.oid, r.rolname, r.rolinherit
  FROM pg_roles AS r
  WHERE r.rolname = 'authenticated'

  UNION

  SELECT parent.oid, parent.rolname, parent.rolinherit
  FROM inherited_closure AS member_role
  JOIN pg_auth_members AS membership ON membership.member = member_role.oid
  JOIN pg_roles AS parent ON parent.oid = membership.roleid
  WHERE member_role.rolinherit
    AND coalesce(
      (to_jsonb(membership) ->> 'inherit_option')::boolean,
      true
    )
)
SELECT
  member_role.rolname::text AS role_name,
  EXISTS (
    SELECT 1
    FROM inherited_closure AS inherited_role
    WHERE inherited_role.oid = member_role.oid
  ) AS inherited_by_authenticated,
  member_role.rolinherit,
  member_role.rolsuper,
  member_role.rolcreaterole,
  member_role.rolcreatedb,
  member_role.rolcanlogin,
  member_role.rolreplication,
  member_role.rolbypassrls
FROM membership_closure AS member_role
ORDER BY member_role.rolname;

-- 3. Machine-ready exact allowlist values. Copy these JSON values only after
-- manually reviewing the human-readable rows above and the membership graph.
WITH RECURSIVE policy_catalog AS (
  SELECT
    p.polname::text AS policy_name,
    CASE p.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE p.polcmd::text
    END AS command,
    CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS mode,
    ARRAY(
      SELECT assigned_role.role_name
      FROM (
        SELECT CASE
          WHEN assigned.role_oid = 0 THEN 'public'
          ELSE coalesce(
            r.rolname::text,
            format('<missing-role:%s>', assigned.role_oid)
          )
        END AS role_name
        FROM unnest(p.polroles) AS assigned(role_oid)
        LEFT JOIN pg_roles AS r ON r.oid = assigned.role_oid
      ) AS assigned_role
      ORDER BY assigned_role.role_name
    ) AS roles,
    pg_get_expr(p.polqual, p.polrelid, false) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid, false) AS with_check_expression
  FROM pg_policy AS p
  WHERE p.polrelid = 'storage.objects'::regclass
    AND p.polname <> ALL (ARRAY[
      'materials_storage_insert',
      'materials_storage_read',
      'materials_storage_delete'
    ])
),
membership_closure AS (
  SELECT
    r.oid,
    r.rolname,
    r.rolinherit,
    r.rolsuper,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls
  FROM pg_roles AS r
  WHERE r.rolname = 'authenticated'

  UNION

  SELECT
    parent.oid,
    parent.rolname,
    parent.rolinherit,
    parent.rolsuper,
    parent.rolcreaterole,
    parent.rolcreatedb,
    parent.rolcanlogin,
    parent.rolreplication,
    parent.rolbypassrls
  FROM membership_closure AS member_role
  JOIN pg_auth_members AS membership ON membership.member = member_role.oid
  JOIN pg_roles AS parent ON parent.oid = membership.roleid
),
inherited_closure AS (
  SELECT r.oid, r.rolname, r.rolinherit
  FROM pg_roles AS r
  WHERE r.rolname = 'authenticated'

  UNION

  SELECT parent.oid, parent.rolname, parent.rolinherit
  FROM inherited_closure AS member_role
  JOIN pg_auth_members AS membership ON membership.member = member_role.oid
  JOIN pg_roles AS parent ON parent.oid = membership.roleid
  WHERE member_role.rolinherit
    AND coalesce(
      (to_jsonb(membership) ->> 'inherit_option')::boolean,
      true
    )
),
role_rows AS (
  SELECT
    member_role.oid,
    member_role.rolname::text AS role_name,
    EXISTS (
      SELECT 1
      FROM inherited_closure AS inherited_role
      WHERE inherited_role.oid = member_role.oid
    ) AS inherited_by_authenticated,
    member_role.rolinherit,
    member_role.rolsuper,
    member_role.rolcreaterole,
    member_role.rolcreatedb,
    member_role.rolcanlogin,
    member_role.rolreplication,
    member_role.rolbypassrls
  FROM membership_closure AS member_role
),
edge_rows AS (
  SELECT
    member_role.rolname::text AS member_role,
    granted_role.rolname::text AS granted_role,
    grantor.rolname::text AS grantor_role,
    membership.admin_option,
    to_jsonb(membership) ->> 'inherit_option' AS inherit_option,
    to_jsonb(membership) ->> 'set_option' AS set_option
  FROM pg_auth_members AS membership
  JOIN membership_closure AS member_role ON member_role.oid = membership.member
  JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
  LEFT JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
)
SELECT
  coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'policy_name', policy_name,
          'command', command,
          'mode', mode,
          'roles', to_jsonb(roles),
          'using_expression', using_expression,
          'with_check_expression', with_check_expression
        )
        ORDER BY policy_name
      )
      FROM policy_catalog
    ),
    '[]'::jsonb
  ) AS expected_external_storage_policies,
  jsonb_build_object(
    'authenticated_role_exists', EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
    ),
    'implicit_public', true,
    'roles', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'role_name', role_name,
            'inherited_by_authenticated', inherited_by_authenticated,
            'rolinherit', rolinherit,
            'rolsuper', rolsuper,
            'rolcreaterole', rolcreaterole,
            'rolcreatedb', rolcreatedb,
            'rolcanlogin', rolcanlogin,
            'rolreplication', rolreplication,
            'rolbypassrls', rolbypassrls
          )
          ORDER BY role_name
        )
        FROM role_rows
      ),
      '[]'::jsonb
    ),
    'edges', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'member_role', member_role,
            'granted_role', granted_role,
            'grantor_role', grantor_role,
            'admin_option', admin_option,
            'inherit_option', inherit_option,
            'set_option', set_option
          )
          ORDER BY member_role, granted_role, grantor_role
        )
        FROM edge_rows
      ),
      '[]'::jsonb
    )
  ) AS expected_authenticated_role_snapshot;

ROLLBACK;
