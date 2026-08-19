BEGIN;

ALTER TABLE accounts_version
  ADD COLUMN html_content_hash text,
  ADD CONSTRAINT accounts_version_html_storage_key_not_blank_ck
    CHECK(html_storage_key IS NULL OR btrim(html_storage_key) <> ''),
  ADD CONSTRAINT accounts_version_html_content_hash_not_blank_ck
    CHECK(html_content_hash IS NULL OR btrim(html_content_hash) <> ''),
  ADD CONSTRAINT accounts_version_html_artifact_coherence_ck
    CHECK((html_storage_key IS NULL) = (html_content_hash IS NULL));

GRANT UPDATE(html_storage_key,html_content_hash) ON accounts_version TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0011','persist immutable HTML artifact hash metadata')
ON CONFLICT(version) DO NOTHING;

COMMIT;
