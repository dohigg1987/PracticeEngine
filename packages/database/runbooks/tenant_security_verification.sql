-- Authenticated tenant context and RLS verification.
-- Run the catalog section as the migration owner. Run the behavioral sections
-- through an accounts_app connection and never use the owner because it has the
-- Neon BYPASSRLS attribute for migrations and administration.

-- 1. Catalog coverage. missing_count and incorrectly_configured_count must be 0.
WITH required_tables(table_name) AS (VALUES
  ('tenant'),('tenant_member'),('organisation'),
  ('engagement'),('engagement_member'),('import_batch'),('import_row'),
  ('import_snapshot'),('source_account'),('account_mapping'),('trial_balance'),
  ('trial_balance_line'),('audit_event'),('outbox_event'),
  ('canonical_account'),('canonical_report_line'),
  ('platform_user'),('permission_definition'),('tenant_role'),
  ('tenant_role_permission'),('tenant_member_role'),('team'),('team_member'),
  ('contact'),('relationship_type_definition'),('client_contact_relationship'),
  ('address'),('client_address'),('product_definition'),('module_definition'),
  ('feature_definition'),('tenant_entitlement'),('tenant_entitlement_override'),
  ('tenant_setting'),('practice_service'),('client_service'),
  ('practice_engagement'),('practice_engagement_service'),('work_template'),
  ('work_template_task'),('work_item'),('practice_task'),
  ('work_item_ledgerly_link')
), state AS (
  SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
)
SELECT
  count(*) FILTER(WHERE state.relname IS NULL) AS missing_count,
  count(*) FILTER(WHERE NOT coalesce(state.relrowsecurity,false)
                    OR NOT coalesce(state.relforcerowsecurity,false)) AS incorrectly_configured_count
FROM required_tables LEFT JOIN state ON state.relname=required_tables.table_name;

-- 2. Policy inventory. Every runtime policy must be scoped to accounts_app;
-- owner policies are administrative recovery paths only.
SELECT tablename,policyname,cmd,roles,qual IS NOT NULL AS has_using,
       with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename,policyname;

-- 3. Deny-by-default behavioral check (connect as accounts_app).
BEGIN;
SET LOCAL app.tenant_id = '';
SET LOCAL app.actor_id = '';
SELECT
  (SELECT count(*) FROM tenant) AS visible_tenants,
  (SELECT count(*) FROM organisation) AS visible_organisations,
  (SELECT count(*) FROM canonical_account) AS visible_canonical_accounts;
ROLLBACK;
-- Expected: all three counts are 0.

-- 4. Membership discovery check with actor-only context (connect as
-- accounts_app). Replace the placeholder with a real verified JWT subject.
-- BEGIN
-- SET LOCAL app.actor_id = '<verified-jwt-sub>'
-- SELECT tm.tenant_id,t.name,tm.role_code
-- FROM tenant_member tm JOIN tenant t ON t.id=tm.tenant_id
-- ORDER BY tm.tenant_id
-- ROLLBACK
-- Expected: only memberships belonging to that JWT subject are returned.

-- 5. Authorized behavioral check (connect as accounts_app). Replace both
-- placeholders with one real mapped tenant/member pair before uncommenting.
-- BEGIN
-- SET LOCAL app.tenant_id = '<tenant-uuid>'
-- SET LOCAL app.actor_id = '<application-actor-id>'
-- SELECT current_setting('app.tenant_id',true) AS tenant_context,
--        current_setting('app.actor_id',true) AS actor_context,
--        (SELECT count(*) FROM tenant_member) AS own_membership_rows,
--        (SELECT count(*) FROM canonical_account) AS canonical_rows
-- ROLLBACK
-- Expected: own_membership_rows=1 and canonical_rows>0.

-- 6. Cross-tenant check: keep actor_id from tenant A but set tenant_id to tenant
-- B. Tenant-owned and canonical queries must return 0 rows.

-- 7. PM-001 authorization and entitlement decisions (authorized context).
-- SELECT actor_has_permission('clients.view') AS can_view_clients;
-- SELECT * FROM tenant_feature_decision('ledgerly.enabled');
-- Expected: a boolean permission decision and one transitional/override-backed
-- Ledgerly decision for existing tenants.

-- 8. PM-002 decisions and RLS behavior are exercised end-to-end by
-- practice_management_disposable_verification.sql on a disposable Neon branch.
-- The expected migration head is 0031 and accounts_app must have no DELETE
-- privilege on any Practice Management table.
