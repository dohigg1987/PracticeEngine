BEGIN;

GRANT INSERT ON organisation TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0013','allow tenant-authorised organisation creation')
ON CONFLICT(version) DO NOTHING;

COMMIT;
