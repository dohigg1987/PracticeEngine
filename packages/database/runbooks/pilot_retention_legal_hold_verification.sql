SELECT version,description,applied_at
FROM schema_migration
WHERE version='0017';

SELECT policy_code,version_no,data_class,clock_basis,retention_period,
  disposition,authority_reference,effective_from,effective_to
FROM retention_policy
ORDER BY policy_code,version_no;

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c
WHERE c.oid IN (
  'retention_policy'::regclass,'retention_scope'::regclass,
  'legal_hold'::regclass,'legal_hold_release'::regclass,
  'retention_purge_candidate'::regclass,
  'retention_candidate_decision'::regclass
)
ORDER BY c.relname;

SELECT tablename,policyname,cmd,roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'retention_policy','retention_scope','legal_hold','legal_hold_release',
    'retention_purge_candidate','retention_candidate_decision'
  )
ORDER BY tablename,policyname;

SELECT table_name,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='accounts_app'
  AND table_name IN (
    'retention_policy','retention_scope','legal_hold','legal_hold_release',
    'retention_purge_candidate','retention_candidate_decision',
    'retention_purge_ready_inventory'
  )
ORDER BY table_name,privilege_type;

SELECT p.proname,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('retention_scope_is_eligible','retention_candidate_is_approvable')
ORDER BY p.proname;

SELECT rulename,tablename
FROM pg_rules
WHERE schemaname='public'
  AND tablename IN (
    'retention_policy','retention_scope','legal_hold','legal_hold_release',
    'retention_purge_candidate','retention_candidate_decision'
  )
ORDER BY tablename,rulename;

SELECT count(*) AS ready_candidate_count
FROM retention_purge_ready_inventory;

-- On a disposable branch create a tenant and engagement as the owner, then
-- insert an already-due retention_scope. Confirm a candidate can be recorded,
-- an active tenant-wide or engagement hold rejects candidate insertion and
-- approval, releasing the hold re-enables eligibility, a later hold removes an
-- approved candidate from the live ready view, and UPDATE or DELETE attempts
-- against every evidence table affect zero rows. Roll back all fixture DML.
