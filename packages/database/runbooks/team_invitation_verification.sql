-- Run on a disposable branch with test tenants and actors only.

SELECT version,description,applied_at
FROM schema_migration
WHERE version='0014';

SELECT c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c
WHERE c.oid='tenant_invitation'::regclass;

SELECT policyname,cmd,roles
FROM pg_policies
WHERE schemaname='public' AND tablename='tenant_invitation'
ORDER BY policyname;

SELECT
  has_function_privilege('accounts_app','accept_authenticated_invitation(text)','EXECUTE') AS runtime_can_accept,
  has_table_privilege('accounts_app','tenant_invitation','DELETE') AS runtime_can_delete,
  has_column_privilege('accounts_app','tenant_invitation','token_hash','SELECT') AS runtime_can_read_hash,
  has_column_privilege('accounts_app','tenant_invitation','token_hash','INSERT') AS runtime_can_insert_hash,
  has_column_privilege('accounts_app','tenant_invitation','accepted_by','UPDATE') AS runtime_can_set_acceptance,
  has_column_privilege('accounts_app','tenant_invitation','revoked_at','UPDATE') AS runtime_can_revoke;

SELECT p.oid::regprocedure::text AS signature,pg_get_function_result(p.oid) AS result,
  p.prosecdef,p.proconfig
FROM pg_proc p
WHERE p.oid IN (
  'accept_authenticated_invitation(text)'::regprocedure,
  'tenant_actor_is_administrator(uuid)'::regprocedure
)
ORDER BY p.oid::regprocedure::text;

-- Acceptance validation failures use SQLSTATE 23514 with one of these names
-- invitation_actor_id_valid_ck
-- invitation_token_hash_valid_ck
-- invitation_tenant_context_absent_ck

-- Acceptance returns no rows for unknown expired revoked or other-actor-used
-- tokens and for an existing membership whose role differs from the invite.
-- A first success returns accepted=true. A sequential same-actor replay returns
-- accepted=false and the same invitation tenant and membership role.
