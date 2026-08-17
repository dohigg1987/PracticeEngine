BEGIN;

-- now() is fixed at transaction start. The API records occurred_at immediately
-- before the audit INSERT, so long transactions need a wall-clock default here.
ALTER TABLE audit_event
  ALTER COLUMN recorded_at_utc SET DEFAULT clock_timestamp();

-- These relationships are mandatory in the current domain model. All canonical
-- seed rows have report_line_id, and every API-created snapshot has a batch.
ALTER TABLE canonical_account
  ALTER COLUMN report_line_id SET NOT NULL;

ALTER TABLE import_snapshot
  ALTER COLUMN import_batch_id SET NOT NULL;

INSERT INTO schema_migration(version,description)
VALUES('0005','audit wall-clock timestamp and mandatory relationship hardening')
ON CONFLICT(version) DO NOTHING;

COMMIT;
