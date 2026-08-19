BEGIN;

ALTER TABLE accounts_version
  ADD COLUMN pdf_content_hash text,
  ADD CONSTRAINT accounts_version_pdf_storage_key_not_blank_ck
    CHECK(pdf_storage_key IS NULL OR btrim(pdf_storage_key) <> ''),
  ADD CONSTRAINT accounts_version_pdf_content_hash_not_blank_ck
    CHECK(pdf_content_hash IS NULL OR btrim(pdf_content_hash) <> ''),
  ADD CONSTRAINT accounts_version_pdf_artifact_coherence_ck
    CHECK((pdf_storage_key IS NULL) = (pdf_content_hash IS NULL));

REVOKE UPDATE(pdf_storage_key) ON accounts_version FROM accounts_app;
GRANT UPDATE(pdf_storage_key,pdf_content_hash) ON accounts_version TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0015','persist coherent PDF artefact storage key and content hash')
ON CONFLICT(version) DO NOTHING;

COMMIT;
