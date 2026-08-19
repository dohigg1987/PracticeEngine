SELECT version,description
FROM schema_migration
WHERE version='0026';

WITH expected(table_name) AS (VALUES
  ('working_paper_work_area'),
  ('working_paper_theme'),
  ('working_paper_template_theme'),
  ('engagement_risk'),
  ('working_paper_report_line_link'),
  ('working_paper_assertion_link'),
  ('working_paper_risk_link'),
  ('working_paper_theme_link'),
  ('working_paper_attachment')
)
SELECT e.table_name,
       c.oid IS NOT NULL AS exists,
       coalesce(c.relrowsecurity,false) AS rls_enabled,
       coalesce(c.relforcerowsecurity,false) AS rls_forced
FROM expected e
LEFT JOIN pg_class c ON c.relname=e.table_name
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
ORDER BY e.table_name;

SELECT tablename,policyname,cmd,roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'working_paper_work_area','working_paper_theme','working_paper_template_theme',
    'engagement_risk','working_paper_report_line_link','working_paper_assertion_link',
    'working_paper_risk_link','working_paper_theme_link','working_paper_attachment'
  )
ORDER BY tablename,policyname;

SELECT table_name,privilege_type
FROM information_schema.role_table_grants
WHERE grantee='accounts_app'
  AND table_schema='public'
  AND table_name IN (
    'working_paper_work_area','working_paper_theme','working_paper_template_theme',
    'engagement_risk','working_paper_report_line_link','working_paper_assertion_link',
    'working_paper_risk_link','working_paper_theme_link','working_paper_attachment'
  )
ORDER BY table_name,privilege_type;

SELECT table_name,column_name,privilege_type
FROM information_schema.role_column_grants
WHERE grantee='accounts_app'
  AND table_schema='public'
  AND table_name IN (
    'engagement_risk','working_paper_report_line_link','working_paper_assertion_link',
    'working_paper_risk_link','working_paper_theme_link','working_paper_attachment'
  )
  AND privilege_type IN ('INSERT','UPDATE')
ORDER BY table_name,privilege_type,column_name;

SELECT
  count(*) AS template_count,
  count(*) FILTER(WHERE content_hash ~ '^[0-9a-f]{64}$') AS hashed_template_count,
  count(*) FILTER(WHERE governance_status='BASELINE' AND provenance_label='REPOSITORY_BASELINE_NOT_CERTIFIED') AS honest_baseline_count,
  count(*) FILTER(WHERE source_reference IS NULL OR btrim(source_reference)='') AS missing_source_reference_count
FROM working_paper_template;

SELECT
  (SELECT count(*) FROM working_paper_work_area) AS work_area_count,
  (SELECT count(*) FROM working_paper_theme) AS theme_count;

SELECT count(*) AS missing_legacy_report_line_backfill_count
FROM working_paper wp
WHERE wp.report_line_id IS NOT NULL
  AND NOT EXISTS(
    SELECT 1
    FROM working_paper_report_line_link link
    WHERE link.tenant_id=wp.tenant_id
      AND link.engagement_id=wp.engagement_id
      AND link.working_paper_id=wp.id
      AND link.report_line_id=wp.report_line_id
  );

SELECT count(*) AS cross_engagement_risk_link_count
FROM working_paper_risk_link link
JOIN working_paper wp
  ON wp.tenant_id=link.tenant_id
 AND wp.id=link.working_paper_id
JOIN engagement_risk risk
  ON risk.tenant_id=link.tenant_id
 AND risk.id=link.risk_id
WHERE wp.engagement_id<>link.engagement_id
   OR risk.engagement_id<>link.engagement_id;

WITH current_report_line AS (
  SELECT link.*
  FROM working_paper_report_line_link link
  WHERE NOT EXISTS(
    SELECT 1 FROM working_paper_report_line_link successor
    WHERE successor.supersedes_link_id=link.id
  )
)
SELECT count(*) AS papers_with_multiple_current_primary_report_lines
FROM (
  SELECT tenant_id,working_paper_id
  FROM current_report_line
  WHERE link_purpose='PRIMARY'
  GROUP BY tenant_id,working_paper_id
  HAVING count(*)>1
) invalid;

WITH current_theme AS (
  SELECT link.*
  FROM working_paper_theme_link link
  WHERE NOT EXISTS(
    SELECT 1 FROM working_paper_theme_link successor
    WHERE successor.supersedes_link_id=link.id
  )
)
SELECT count(*) AS papers_with_multiple_current_primary_themes
FROM (
  SELECT tenant_id,working_paper_id
  FROM current_theme
  WHERE is_primary
  GROUP BY tenant_id,working_paper_id
  HAVING count(*)>1
) invalid;

SELECT count(*) AS invalid_report_line_supersession_semantics
FROM working_paper_report_line_link successor
JOIN working_paper_report_line_link predecessor ON predecessor.id=successor.supersedes_link_id
WHERE predecessor.tenant_id<>successor.tenant_id
   OR predecessor.working_paper_id<>successor.working_paper_id
   OR predecessor.link_purpose<>successor.link_purpose
   OR btrim(coalesce(successor.supersession_reason,''))='';

SELECT count(*) AS invalid_theme_supersession_semantics
FROM working_paper_theme_link successor
JOIN working_paper_theme_link predecessor ON predecessor.id=successor.supersedes_link_id
WHERE predecessor.tenant_id<>successor.tenant_id
   OR predecessor.working_paper_id<>successor.working_paper_id
   OR predecessor.is_primary<>successor.is_primary
   OR btrim(coalesce(successor.supersession_reason,''))='';

SELECT count(*) AS invalid_assertion_supersession_semantics
FROM working_paper_assertion_link successor
JOIN working_paper_assertion_link predecessor ON predecessor.id=successor.supersedes_link_id
WHERE predecessor.tenant_id<>successor.tenant_id
   OR predecessor.working_paper_id<>successor.working_paper_id
   OR btrim(coalesce(successor.supersession_reason,''))='';

SELECT count(*) AS invalid_risk_supersession_semantics
FROM working_paper_risk_link successor
JOIN working_paper_risk_link predecessor ON predecessor.id=successor.supersedes_link_id
WHERE predecessor.tenant_id<>successor.tenant_id
   OR predecessor.working_paper_id<>successor.working_paper_id
   OR btrim(coalesce(successor.supersession_reason,''))='';

WITH edges(link_type,predecessor_id) AS (
  SELECT 'REPORT_LINE',supersedes_link_id FROM working_paper_report_line_link WHERE supersedes_link_id IS NOT NULL
  UNION ALL
  SELECT 'ASSERTION',supersedes_link_id FROM working_paper_assertion_link WHERE supersedes_link_id IS NOT NULL
  UNION ALL
  SELECT 'RISK',supersedes_link_id FROM working_paper_risk_link WHERE supersedes_link_id IS NOT NULL
  UNION ALL
  SELECT 'THEME',supersedes_link_id FROM working_paper_theme_link WHERE supersedes_link_id IS NOT NULL
)
SELECT link_type,count(*) AS forked_predecessor_count
FROM (
  SELECT link_type,predecessor_id
  FROM edges
  GROUP BY link_type,predecessor_id
  HAVING count(*)>1
) forks
GROUP BY link_type
ORDER BY link_type;

WITH chain_counts(link_type,root_count,current_count) AS (
  SELECT 'REPORT_LINE',
         count(*) FILTER(WHERE supersedes_link_id IS NULL),
         count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM working_paper_report_line_link successor WHERE successor.supersedes_link_id=working_paper_report_line_link.id))
  FROM working_paper_report_line_link
  UNION ALL
  SELECT 'ASSERTION',
         count(*) FILTER(WHERE supersedes_link_id IS NULL),
         count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM working_paper_assertion_link successor WHERE successor.supersedes_link_id=working_paper_assertion_link.id))
  FROM working_paper_assertion_link
  UNION ALL
  SELECT 'RISK',
         count(*) FILTER(WHERE supersedes_link_id IS NULL),
         count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM working_paper_risk_link successor WHERE successor.supersedes_link_id=working_paper_risk_link.id))
  FROM working_paper_risk_link
  UNION ALL
  SELECT 'THEME',
         count(*) FILTER(WHERE supersedes_link_id IS NULL),
         count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM working_paper_theme_link successor WHERE successor.supersedes_link_id=working_paper_theme_link.id))
  FROM working_paper_theme_link
)
SELECT link_type,root_count,current_count,root_count=current_count AS linear_chain_integrity
FROM chain_counts
ORDER BY link_type;

SELECT count(*) AS incoherent_attachment_count
FROM working_paper_attachment attachment
LEFT JOIN working_paper wp
  ON wp.tenant_id=attachment.tenant_id
 AND wp.engagement_id=attachment.engagement_id
 AND wp.id=attachment.working_paper_id
LEFT JOIN working_paper_version version
  ON version.tenant_id=attachment.tenant_id
 AND version.working_paper_id=attachment.working_paper_id
 AND version.version=attachment.working_paper_version
WHERE wp.id IS NULL
   OR version.id IS NULL
   OR attachment.content_hash !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(to_jsonb(attachment))<>'object';

SELECT rulename,tablename
FROM pg_rules
WHERE schemaname='public'
  AND tablename IN (
    'working_paper_report_line_link','working_paper_assertion_link',
    'working_paper_risk_link','working_paper_theme_link','working_paper_attachment'
  )
ORDER BY tablename,rulename;

-- Staging sign-off requires accounts_app transactions with app.tenant_id and
-- app.actor_id set locally. Verify same-tenant inserts, zero-context denial,
-- cross-tenant and cross-engagement FK denial, invalid SHA-256 and oversize
-- attachment denial, duplicate attachment replay denial, and zero-row UPDATE
-- and DELETE attempts against every immutable link and attachment table.
-- Lock the working_paper row before inserting a successor. Verify each current
-- link as a row for which no successor references its id, then insert exactly
-- one same-paper successor with a bounded nonblank supersession reason.
