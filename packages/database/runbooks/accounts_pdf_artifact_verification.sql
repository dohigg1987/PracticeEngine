SELECT version,description,applied_at
FROM schema_migration
WHERE version='0015';

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='accounts_version'
  AND column_name IN ('pdf_storage_key','pdf_content_hash')
ORDER BY column_name;

SELECT conname,pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='accounts_version'::regclass
  AND conname IN (
    'accounts_version_pdf_storage_key_not_blank_ck',
    'accounts_version_pdf_content_hash_not_blank_ck',
    'accounts_version_pdf_artifact_coherence_ck'
  )
ORDER BY conname;

SELECT
  has_column_privilege('accounts_app','accounts_version','pdf_storage_key','UPDATE') AS can_update_pdf_key,
  has_column_privilege('accounts_app','accounts_version','pdf_content_hash','UPDATE') AS can_update_pdf_hash,
  has_column_privilege('accounts_app','accounts_version','content_hash','UPDATE') AS can_update_accounts_hash;

-- Verify on a disposable branch inside a transaction that is rolled back
-- setting both PDF fields succeeds
-- setting only one fails accounts_version_pdf_artifact_coherence_ck
-- blank PDF fields fail the corresponding nonblank constraint
-- accounts_app cannot update the immutable accounts content_hash
