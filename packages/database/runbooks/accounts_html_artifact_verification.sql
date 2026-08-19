SELECT version,description,applied_at
FROM schema_migration
WHERE version='0011';

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='accounts_version'
  AND column_name IN ('html_storage_key','html_content_hash')
ORDER BY ordinal_position;

SELECT conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='accounts_version'::regclass
  AND conname IN (
    'accounts_version_html_storage_key_not_blank_ck',
    'accounts_version_html_content_hash_not_blank_ck',
    'accounts_version_html_artifact_coherence_ck'
  )
ORDER BY conname;

SELECT
  has_column_privilege('accounts_app','accounts_version','html_storage_key','UPDATE') AS can_update_html_key,
  has_column_privilege('accounts_app','accounts_version','html_content_hash','UPDATE') AS can_update_html_hash,
  has_column_privilege('accounts_app','accounts_version','content_hash','UPDATE') AS can_update_accounts_hash;

-- Expected update behaviour on a disposable accounts version
-- setting both html_storage_key and html_content_hash succeeds
-- setting only one fails accounts_version_html_artifact_coherence_ck
-- setting either value to blank fails its not-blank check
-- accounts_app cannot update the immutable accounts content_hash
