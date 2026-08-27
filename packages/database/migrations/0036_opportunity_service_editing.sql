BEGIN;

-- Opportunity edits replace proposed-service associations through the
-- tenant-qualified, permission-checked CRM command. Existing forced RLS on
-- opportunity_service remains the database tenant boundary.
GRANT DELETE ON opportunity_service TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0036','Opportunity proposed service editing')
ON CONFLICT(version) DO NOTHING;

COMMIT;
