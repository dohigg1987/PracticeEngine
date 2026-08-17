-- accounts_app runtime grants for database neondb.
--
-- Password-free and safe to rerun. The LOGIN role must already exist; its
-- password is managed outside SQL (currently by Neon/Cloudflare Hyperdrive).
-- Run as the database/schema owner after all migrations. This intentionally
-- removes broad current and default privileges before applying the minimum
-- privileges used by apps/api/src/index.ts.

BEGIN;

REVOKE ALL PRIVILEGES ON DATABASE neondb FROM accounts_app;
GRANT CONNECT ON DATABASE neondb TO accounts_app;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM accounts_app;
GRANT USAGE ON SCHEMA public TO accounts_app;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM accounts_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM accounts_app;

-- Remove broad future-object grants created by prior runs under this owner.
-- PostgreSQL default privileges are scoped to the role executing these lines;
-- run this as the same role that owns and applies future migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM accounts_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM accounts_app;

GRANT SELECT ON TABLE
  tenant,
  organisation,
  tenant_member,
  engagement,
  engagement_member,
  import_batch,
  source_account,
  import_snapshot,
  trial_balance,
  account_mapping,
  trial_balance_line,
  canonical_account,
  canonical_report_line,
  audit_event
TO accounts_app;

GRANT INSERT ON TABLE
  engagement,
  engagement_member,
  import_batch,
  import_row,
  source_account,
  import_snapshot,
  trial_balance,
  trial_balance_line,
  account_mapping,
  audit_event,
  outbox_event
TO accounts_app;

-- tenant and engagement UPDATE are required by SELECT ... FOR UPDATE. The API
-- also updates source_account through its upsert and remaps trial_balance_line.
GRANT UPDATE ON TABLE
  tenant,
  engagement,
  source_account,
  trial_balance_line
TO accounts_app;

COMMIT;

-- Verification: every row should show only the expected privileges.
-- SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'accounts_app' AND table_schema = 'public'
-- GROUP BY table_name ORDER BY table_name;
--
-- SELECT
--   has_database_privilege('accounts_app','neondb','CONNECT') AS can_connect,
--   has_schema_privilege('accounts_app','public','USAGE') AS can_use_public,
--   has_schema_privilege('accounts_app','public','CREATE') AS can_create_public;
