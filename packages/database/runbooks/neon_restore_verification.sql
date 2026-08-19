-- Read-only verification for a Neon point-in-time or snapshot preview branch.
-- Run as a migration/audit role against the preview database, never as a step
-- that writes to or finalizes a production restore.

BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version') AS postgres_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       statement_timestamp() AS verified_at;

SELECT count(*) AS migration_count,
       min(version) AS first_migration,
       max(version) AS migration_head,
       string_agg(version,',' ORDER BY version) AS migration_versions
FROM schema_migration;

WITH expected(version) AS (
  SELECT '0001' || '' WHERE false
  UNION ALL
  SELECT lpad(generate_series(1,17)::text,4,'0')
)
SELECT count(*) AS missing_migration_count,
       string_agg(expected.version,',' ORDER BY expected.version)
         FILTER (WHERE actual.version IS NULL) AS missing_migrations
FROM expected
LEFT JOIN schema_migration actual USING (version)
WHERE actual.version IS NULL;

SELECT count(*) FILTER (WHERE relrowsecurity) AS rls_enabled_tables,
       count(*) FILTER (WHERE relforcerowsecurity) AS force_rls_tables,
       count(*) FILTER (WHERE relrowsecurity AND NOT relforcerowsecurity)
         AS enabled_but_not_forced_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';

SELECT count(*) AS reporting_pack_count,
       count(*) FILTER (WHERE lifecycle_status='BASELINE'
                          AND certification_status='BASELINE_NOT_CERTIFIED')
         AS honest_baseline_count,
       count(*) FILTER (WHERE certification_status='REGULATOR_CERTIFIED')
         AS certified_pack_count
FROM reporting_framework_pack;

SELECT (SELECT count(*) FROM tenant) AS tenant_count,
       (SELECT count(*) FROM tenant_member) AS membership_count,
       (SELECT count(*) FROM organisation) AS organisation_count,
       (SELECT count(*) FROM engagement) AS engagement_count,
       (SELECT count(*) FROM accounts_version) AS accounts_version_count,
       (SELECT count(*) FROM filing_attempt) AS filing_attempt_count,
       (SELECT count(*) FROM audit_event) AS audit_event_count,
       (SELECT count(*) FROM outbox_event) AS outbox_event_count;

SELECT count(*) AS orphan_membership_count
FROM tenant_member tm
LEFT JOIN tenant t ON t.id=tm.tenant_id
WHERE t.id IS NULL;

SELECT count(*) AS orphan_engagement_count
FROM engagement e
LEFT JOIN tenant t ON t.id=e.tenant_id
LEFT JOIN organisation o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
WHERE t.id IS NULL OR o.id IS NULL;

SELECT count(*) AS incoherent_accounts_artifact_count
FROM accounts_version
WHERE (html_storage_key IS NULL) <> (html_content_hash IS NULL)
   OR (pdf_storage_key IS NULL) <> (pdf_content_hash IS NULL);

SELECT count(*) AS incoherent_filing_evidence_count
FROM filing_attempt
WHERE (response_storage_key IS NULL) <> (response_content_hash IS NULL);

SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

COMMIT;
