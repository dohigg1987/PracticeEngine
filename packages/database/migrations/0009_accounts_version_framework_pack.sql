BEGIN;

ALTER TABLE accounts_version
  ADD COLUMN framework_pack_version_no integer NOT NULL DEFAULT 1
  CHECK(framework_pack_version_no > 0);

ALTER TABLE accounts_version
  ADD CONSTRAINT accounts_version_framework_pack_fk
  FOREIGN KEY(framework_pack_id,framework_pack_version_no)
  REFERENCES reporting_framework_pack(pack_code,version_no);

INSERT INTO schema_migration(version,description)
VALUES('0009','pin accounts versions to immutable reporting framework pack versions')
ON CONFLICT(version) DO NOTHING;

COMMIT;
