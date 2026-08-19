-- Accounts workflow migration verification.
-- Run catalog checks as neondb_owner and behavioral checks as accounts_app on
-- an isolated branch with app.tenant_id and app.actor_id set transaction-locally.

WITH required_tables(table_name) AS (VALUES
  ('journal'),('journal_line'),('reconciliation'),('working_paper'),
  ('working_paper_version'),('workflow_task'),('review_point'),('disclosure'),
  ('disclosure_version'),('accounts_version'),('signoff'),('filing_attempt')
), state AS (
  SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
)
SELECT
  count(*) FILTER(WHERE state.relname IS NULL) AS missing_count,
  count(*) FILTER(WHERE NOT coalesce(state.relrowsecurity,false)
                    OR NOT coalesce(state.relforcerowsecurity,false)) AS rls_failure_count
FROM required_tables LEFT JOIN state ON state.relname=required_tables.table_name;

SELECT tablename,policyname,cmd,roles,qual IS NOT NULL AS has_using,
       with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN (
  'journal','journal_line','reconciliation','working_paper',
  'working_paper_version','workflow_task','review_point','disclosure',
  'disclosure_version','accounts_version','signoff','filing_attempt'
)
ORDER BY tablename,policyname;

SELECT table_name,string_agg(privilege_type,',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee='accounts_app' AND table_schema='public' AND table_name IN (
  'journal','journal_line','reconciliation','working_paper',
  'working_paper_version','workflow_task','review_point','disclosure',
  'disclosure_version','accounts_version','signoff','filing_attempt'
)
GROUP BY table_name ORDER BY table_name;

SELECT
  count(*) FILTER(WHERE cmd='DELETE') AS runtime_delete_policy_count,
  count(*) FILTER(WHERE tablename IN ('working_paper_version','disclosure_version')
                    AND cmd IN ('UPDATE','DELETE','ALL')) AS mutable_version_policy_count
FROM pg_policies
WHERE schemaname='public' AND roles=ARRAY['accounts_app']::name[];

SELECT conrelid::regclass AS table_name,conname,convalidated
FROM pg_constraint
WHERE conname IN (
  'trial_balance_tenant_engagement_id_uq',
  'journal_posting_balanced_ck'
)
ORDER BY table_name::text,conname;
