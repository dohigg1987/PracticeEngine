SELECT version,description,applied_at
FROM schema_migration
WHERE version='0016';

SELECT pack_code,version_no,certification_status,lifecycle_status,
  source_checksum,reviewed_by,reviewed_at,review_evidence_id,
  review_evidence_type,review_evidence_decision,
  approved_by,approved_at,approval_evidence_id,
  approval_evidence_type,approval_evidence_decision
FROM reporting_framework_pack
ORDER BY pack_code,version_no;

SELECT
  count(*) AS pack_count,
  count(*) FILTER (
    WHERE certification_status='BASELINE_NOT_CERTIFIED'
      AND lifecycle_status='BASELINE'
      AND source_checksum IS NULL
      AND reviewed_at IS NULL
      AND review_evidence_id IS NULL
      AND approved_at IS NULL
      AND approval_evidence_id IS NULL
  ) AS honest_baseline_count,
  count(*) FILTER (WHERE certification_status='REGULATOR_CERTIFIED') AS certified_count
FROM reporting_framework_pack;

SELECT table_name,column_name,is_nullable,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND (
    table_name IN ('reporting_framework_pack_review','taxonomy_release','taxonomy_release_review')
    OR (table_name='taxonomy_concept_mapping' AND column_name='taxonomy_release_id')
  )
ORDER BY table_name,ordinal_position;

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c
WHERE c.oid IN (
  'reporting_framework_pack_review'::regclass,
  'taxonomy_release'::regclass,
  'taxonomy_release_review'::regclass
)
ORDER BY c.relname;

SELECT tablename,policyname,cmd,roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'reporting_framework_pack_review','taxonomy_release','taxonomy_release_review'
  )
ORDER BY tablename,policyname;

SELECT
  has_table_privilege('accounts_app','reporting_framework_pack_review','SELECT') AS can_read_pack_reviews,
  has_table_privilege('accounts_app','reporting_framework_pack_review','INSERT') AS can_write_pack_reviews,
  has_table_privilege('accounts_app','taxonomy_release','SELECT') AS can_read_taxonomy_releases,
  has_table_privilege('accounts_app','taxonomy_release','INSERT') AS can_import_taxonomy,
  has_table_privilege('accounts_app','taxonomy_release_review','SELECT') AS can_read_taxonomy_reviews,
  has_table_privilege('accounts_app','taxonomy_release_review','INSERT') AS can_write_taxonomy_reviews;

SELECT rulename,tablename,definition
FROM pg_rules
WHERE schemaname='public'
  AND rulename IN (
    'reporting_framework_pack_review_no_update',
    'reporting_framework_pack_review_no_delete',
    'taxonomy_release_no_update',
    'taxonomy_release_no_delete',
    'taxonomy_release_review_no_update',
    'taxonomy_release_review_no_delete'
  )
ORDER BY tablename,rulename;

-- On a disposable branch verify that current repository packs remain baseline
-- and not certified, accounts_app reads only with selected tenant membership,
-- runtime writes are denied, taxonomy content and review evidence are append
-- only, mappings require a governed release with the same version code, and a
-- certified pack cannot be stored without published lifecycle and evidence.
