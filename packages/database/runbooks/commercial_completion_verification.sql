-- Catalog verification for migration 0018. Run as neondb_owner.
SELECT version,description FROM schema_migration WHERE version='0018';

SELECT count(*) AS commercial_tables,
  count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
  count(*) FILTER (WHERE c.relforcerowsecurity) AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (
  'client_contact','client_portal_identity','client_engagement_access','client_portal_invitation',
  'client_document_request','client_document_response','client_document_review','connector_definition',
  'integration_connection','integration_sync_run','integration_sync_item','integration_sync_error',
  'notification','outbox_delivery_attempt','tenant_lifecycle_state','tenant_lifecycle_event',
  'tenant_export_request','accounts_version_comparative'
);

SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
FROM pg_roles WHERE rolname IN ('accounts_app','accounts_publisher');

SELECT
  has_column_privilege('accounts_app','integration_connection','credential_reference','SELECT') AS runtime_can_read_credential_reference,
  has_column_privilege('accounts_app','integration_connection','credential_reference','INSERT') AS runtime_can_write_credential_reference,
  has_table_privilege('accounts_app','client_document_response','INSERT') AS runtime_can_insert_response_directly,
  has_table_privilege('accounts_app','tenant_export_request','UPDATE') AS runtime_can_complete_export,
  has_table_privilege('accounts_publisher','outbox_event','UPDATE') AS publisher_can_update_outbox_directly,
  has_function_privilege('accounts_publisher','claim_outbox_events(text,integer)','EXECUTE') AS publisher_can_claim,
  has_function_privilege('accounts_app','record_client_document_response(uuid,uuid,text,text,text,text,bigint,jsonb)','EXECUTE') AS client_can_record_response;

-- Expected results are 18 tables with enabled and forced RLS, a NOLOGIN
-- accounts_publisher without elevated attributes, all direct privilege probes
-- false, and both narrow function probes true.

-- Behavioral sign-off on a disposable branch must cover actor-only invitation
-- acceptance and replay, client access discovery, sequential response versions,
-- approved terminal behavior, cross-tenant denial, exact lifecycle adjacency,
-- connector secret-key rejection, request-only exports, publisher claim and
-- delivered/retry/dead-letter evidence, and pinned comparative hashes.
