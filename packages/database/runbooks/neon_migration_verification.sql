-- Deterministic repository migration verification for a disposable Neon branch.
-- The caller must enforce the non-production target guard before executing this script.
BEGIN;

DO $migration_check$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(expected.version, ',' ORDER BY expected.version)
  INTO missing
  FROM (SELECT '0029' version UNION ALL SELECT '0030' UNION ALL SELECT '0031') expected
  LEFT JOIN schema_migration actual USING(version)
  WHERE actual.version IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'required migrations are missing: %', missing;
  END IF;
END
$migration_check$;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(required.name, ',' ORDER BY required.name)
  INTO missing
  FROM (VALUES
    ('actor_has_permission'),('tenant_actor_is_active'),('tenant_feature_decision'),
    ('tenant_feature_is_enabled'),('work_item_ledgerly_update_allowed')
  ) required(name)
  WHERE to_regprocedure(required.name || CASE required.name
    WHEN 'actor_has_permission' THEN '(text)'
    WHEN 'tenant_actor_is_active' THEN '(uuid)'
    WHEN 'tenant_feature_decision' THEN '(text)'
    WHEN 'tenant_feature_is_enabled' THEN '(uuid,text)'
    ELSE '(uuid,uuid,text,uuid)' END) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'required stored functions are missing: %', missing; END IF;
END $$;

DO $security_check$
DECLARE
  failure text;
BEGIN
  SELECT string_agg(required.table_name, ',' ORDER BY required.table_name)
  INTO failure
  FROM (VALUES
    ('platform_user'),('tenant_role'),('tenant_role_permission'),('tenant_member_role'),('team'),('team_member'),
    ('tenant_entitlement'),('tenant_entitlement_override'),('tenant_setting'),('contact'),('client_contact_relationship'),
    ('practice_service'),('client_service'),('practice_engagement'),('practice_engagement_service'),
    ('work_template'),('work_template_task'),('work_item'),('practice_task'),('work_item_ledgerly_link')
  ) required(table_name)
  LEFT JOIN pg_class c ON c.relname=required.table_name
  LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR n.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity;
  IF failure IS NOT NULL THEN RAISE EXCEPTION 'forced-RLS inventory failed: %', failure; END IF;

  IF has_table_privilege('accounts_app','audit_event','DELETE')
    OR has_table_privilege('accounts_app','work_item','DELETE')
    OR has_table_privilege('accounts_app','tenant_entitlement_override','INSERT') THEN
    RAISE EXCEPTION 'least-privilege runtime grants failed';
  END IF;
END
$security_check$;

ROLLBACK;
