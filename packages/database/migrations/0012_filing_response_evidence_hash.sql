BEGIN;

ALTER TABLE filing_attempt
  ADD COLUMN response_content_hash text,
  ADD CONSTRAINT filing_attempt_payload_storage_key_not_blank_ck
    CHECK(btrim(payload_storage_key) <> ''),
  ADD CONSTRAINT filing_attempt_response_storage_key_not_blank_ck
    CHECK(response_storage_key IS NULL OR btrim(response_storage_key) <> ''),
  ADD CONSTRAINT filing_attempt_response_content_hash_not_blank_ck
    CHECK(response_content_hash IS NULL OR btrim(response_content_hash) <> ''),
  ADD CONSTRAINT filing_attempt_response_evidence_coherence_ck
    CHECK((response_storage_key IS NULL) = (response_content_hash IS NULL));

GRANT UPDATE(response_storage_key,response_content_hash) ON filing_attempt TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0012','persist regulator response evidence hash metadata')
ON CONFLICT(version) DO NOTHING;

COMMIT;
