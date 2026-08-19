-- Run catalog checks as neondb_owner after migration 0019.
SELECT version,description FROM schema_migration WHERE version='0019';

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'organisation_permanent_profile','organisation_officer','organisation_professional_adviser'
) ORDER BY c.relname;

SELECT tablename,policyname,roles,cmd
FROM pg_policies WHERE schemaname='public' AND tablename IN (
  'organisation_permanent_profile','organisation_officer','organisation_professional_adviser'
) ORDER BY tablename,policyname;

SELECT
  has_table_privilege('accounts_app','organisation_permanent_profile','SELECT') AS can_read_profile,
  has_table_privilege('accounts_app','organisation_officer','DELETE') AS can_delete_officer,
  has_table_privilege('accounts_app','organisation_professional_adviser','DELETE') AS can_delete_adviser,
  has_column_privilege('accounts_app','organisation_officer','organisation_id','UPDATE') AS can_move_officer,
  has_column_privilege('accounts_app','organisation_officer','resigned_on','UPDATE') AS can_end_officer,
  has_column_privilege('accounts_app','organisation_professional_adviser','active_to','UPDATE') AS can_end_adviser,
  has_function_privilege('accounts_app','organisation_actor_can_manage(uuid,uuid)','EXECUTE') AS can_check_management;

-- On a disposable branch, verify OWNER and ADMIN plus an engagement PARTNER or
-- MANAGER can insert and update. MEMBER and engagement PREPARER cannot mutate.
-- Ordinary tenant MEMBER and engagement PREPARER roles cannot read or mutate.
-- Verify cross-tenant reads and writes return zero rows or fail RLS, DELETE is denied,
-- invalid address/date/status coherence fails, and created identity is immutable.
