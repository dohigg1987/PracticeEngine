-- Run only on a disposable branch. The function derives actor identity from
-- app.actor_id and must be called with no app.tenant_id setting.

BEGIN;
SELECT set_config('app.actor_id','verification-auth-subject',true);
SELECT * FROM create_authenticated_workspace('Verification Workspace');
SELECT * FROM create_authenticated_workspace('  verification   workspace  ');

SELECT wo.actor_id,wo.requested_name,wo.normalized_name,wo.tenant_id,wo.created_at,
  t.name,tm.role_code
FROM workspace_onboarding wo
JOIN tenant t ON t.id=wo.tenant_id
JOIN tenant_member tm ON tm.tenant_id=wo.tenant_id AND tm.actor_id=wo.actor_id
WHERE wo.actor_id='verification-auth-subject';
ROLLBACK;

-- Expected first call created=true and retry created=false with one tenant.
-- Run each invalid case in its own transaction and expect SQLSTATE 23514.
-- Missing blank or oversized actor fails onboarding_actor_id_valid_ck
-- Selected tenant context fails onboarding_tenant_context_absent_ck
-- Missing blank or oversized name fails onboarding_workspace_name_valid_ck

SELECT
  has_function_privilege('accounts_app','create_authenticated_workspace(text)','EXECUTE') AS runtime_can_onboard,
  has_table_privilege('accounts_app','workspace_onboarding','SELECT') AS runtime_can_read_audit,
  has_table_privilege('accounts_app','workspace_onboarding','INSERT') AS runtime_can_write_audit;

SELECT c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c
WHERE c.oid='workspace_onboarding'::regclass;
