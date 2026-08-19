SELECT version,description,applied_at
FROM schema_migration
WHERE version='0012';

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='filing_attempt'
  AND column_name IN ('response_storage_key','response_content_hash')
ORDER BY ordinal_position;

SELECT conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='filing_attempt'::regclass
  AND conname IN (
    'filing_attempt_payload_storage_key_not_blank_ck',
    'filing_attempt_response_storage_key_not_blank_ck',
    'filing_attempt_response_content_hash_not_blank_ck',
    'filing_attempt_response_evidence_coherence_ck'
  )
ORDER BY conname;

SELECT
  has_column_privilege('accounts_app','filing_attempt','response_storage_key','UPDATE') AS can_update_response_key,
  has_column_privilege('accounts_app','filing_attempt','response_content_hash','UPDATE') AS can_update_response_hash,
  has_column_privilege('accounts_app','filing_attempt','payload_hash','UPDATE') AS can_update_payload_hash;

-- Expected behaviour on a disposable filing attempt
-- setting response_storage_key and response_content_hash together succeeds
-- setting only one fails filing_attempt_response_evidence_coherence_ck
-- setting either value to blank fails its not-blank check
-- accounts_app cannot update the immutable generated payload_hash
