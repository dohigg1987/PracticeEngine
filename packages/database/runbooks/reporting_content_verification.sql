-- Run as neondb_owner after 0008. Runtime RLS checks that need accounts_app
-- should be executed in a disposable transaction with a real test membership.

SELECT version,description,applied_at
FROM schema_migration
WHERE version='0008';

SELECT pack_code,version_no,framework_code,sector_code,effective_from,effective_to,
  certification_status,provenance_label
FROM reporting_framework_pack
ORDER BY pack_code,version_no;

SELECT
  (SELECT count(*) FROM reporting_framework_pack) AS pack_count,
  (SELECT count(*) FROM statement_definition) AS statement_count,
  (SELECT count(*) FROM statement_definition_line) AS statement_line_count,
  (SELECT count(*) FROM disclosure_rule) AS disclosure_rule_count,
  (SELECT count(*) FROM taxonomy_concept_mapping) AS taxonomy_mapping_count;

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'reporting_framework_pack','statement_definition','statement_definition_line',
    'disclosure_rule','taxonomy_concept_mapping'
  )
ORDER BY c.relname;

SELECT table_name,string_agg(privilege_type,',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND grantee='accounts_app'
  AND table_name IN (
    'reporting_framework_pack','statement_definition','statement_definition_line',
    'disclosure_rule','taxonomy_concept_mapping'
  )
GROUP BY table_name
ORDER BY table_name;

SELECT
  has_function_privilege('accounts_app','admin_provision_workspace(uuid,text,text)','EXECUTE') AS runtime_can_provision,
  has_function_privilege('neondb_owner','admin_provision_workspace(uuid,text,text)','EXECUTE') AS owner_can_provision;

SELECT conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='accounts_version'::regclass
  AND conname='accounts_version_framework_pack_fk';

-- Expected runtime behaviour
-- no settings means every reporting content SELECT returns zero rows
-- actor only means every reporting content SELECT returns zero rows
-- a selected tenant plus an actor membership exposes all global pack rows
-- a selected tenant plus a nonmember actor exposes zero rows
-- INSERT UPDATE and DELETE by accounts_app fail for all reporting content tables
-- accounts_app cannot execute admin_provision_workspace
