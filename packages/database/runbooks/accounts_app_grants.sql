-- accounts_app runtime grants for database neondb.
--
-- Password-free and safe to rerun. The LOGIN role must already exist and its
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
-- PostgreSQL default privileges are scoped to the role executing these lines
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
  audit_event,
  journal,
  journal_line,
  reconciliation,
  working_paper,
  working_paper_version,
  workflow_task,
  review_point,
  disclosure,
  disclosure_version,
  accounts_version,
  signoff,
  filing_attempt,
  reporting_framework_pack,
  statement_definition,
  statement_definition_line,
  disclosure_rule,
  taxonomy_concept_mapping,
  client_contact,
  client_portal_identity,
  client_engagement_access,
  client_document_request,
  client_document_response,
  client_document_review,
  connector_definition,
  integration_sync_run,
  integration_sync_item,
  integration_sync_error,
  notification,
  tenant_lifecycle_state,
  tenant_lifecycle_event,
  tenant_export_request,
  accounts_version_comparative,
  organisation_permanent_profile,
  organisation_officer,
  organisation_professional_adviser,
  working_paper_template,
  tenant_working_paper_override,
  organisation_working_paper_override,
  custom_working_paper_template,
  working_paper_work_area,
  working_paper_theme,
  working_paper_template_theme,
  engagement_risk,
  working_paper_report_line_link,
  working_paper_assertion_link,
  working_paper_risk_link,
  working_paper_theme_link,
  working_paper_attachment
TO accounts_app;

GRANT UPDATE(legal_form) ON organisation TO accounts_app;

GRANT SELECT ON TABLE
  reporting_framework_pack_review,
  taxonomy_release,
  taxonomy_release_review
TO accounts_app;

GRANT INSERT ON TABLE
  organisation,
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
  outbox_event,
  journal,
  journal_line,
  reconciliation,
  working_paper,
  working_paper_version,
  workflow_task,
  review_point,
  disclosure,
  disclosure_version,
  accounts_version,
  signoff,
  filing_attempt,
  client_contact,
  client_engagement_access,
  client_document_request,
  client_document_review,
  integration_sync_run,
  integration_sync_item,
  integration_sync_error,
  notification,
  tenant_export_request,
  accounts_version_comparative
TO accounts_app;

GRANT INSERT ON TABLE
  tenant_working_paper_override,
  organisation_working_paper_override,
  custom_working_paper_template
TO accounts_app;

GRANT INSERT(id,tenant_id,engagement_id,risk_code,title,description,risk_level,response,status,created_by,updated_by)
  ON engagement_risk TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,supersedes_link_id,supersession_reason,created_by)
  ON working_paper_report_line_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,assertion_code,supersedes_link_id,supersession_reason,created_by)
  ON working_paper_assertion_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,risk_id,supersedes_link_id,supersession_reason,created_by)
  ON working_paper_risk_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,theme_code,is_primary,supersedes_link_id,supersession_reason,created_by)
  ON working_paper_theme_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,working_paper_version,storage_key,content_hash,filename,media_type,byte_size,evidence_type,description,uploaded_by)
  ON working_paper_attachment TO accounts_app;

GRANT INSERT(tenant_id,organisation_id,trading_name,company_registration_number,charity_registration_number,registered_office_line1,registered_office_line2,registered_office_locality,registered_office_region,registered_office_postal_code,registered_office_country_code,accounting_reference_month,accounting_reference_day,principal_activity,website,telephone,notes,created_by,updated_by)
  ON organisation_permanent_profile TO accounts_app;
GRANT UPDATE(trading_name,company_registration_number,charity_registration_number,registered_office_line1,registered_office_line2,registered_office_locality,registered_office_region,registered_office_postal_code,registered_office_country_code,accounting_reference_month,accounting_reference_day,principal_activity,website,telephone,notes,officer_name_style,updated_by,updated_at)
  ON organisation_permanent_profile TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,officer_type,display_name,title,given_names,middle_names,family_name,suffix_honours,appointed_on,resigned_on,occupation,nationality,country_of_residence,service_address_line1,service_address_line2,service_address_locality,service_address_region,service_address_postal_code,service_address_country_code,email,telephone,created_by,updated_by)
  ON organisation_officer TO accounts_app;
GRANT UPDATE(officer_type,display_name,title,given_names,middle_names,family_name,suffix_honours,appointed_on,resigned_on,occupation,nationality,country_of_residence,service_address_line1,service_address_line2,service_address_locality,service_address_region,service_address_postal_code,service_address_country_code,email,telephone,updated_by,updated_at)
  ON organisation_officer TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,adviser_type,firm_name,contact_name,contact_qualifications,professional_body,report_style,address_line1,address_line2,address_locality,address_region,address_postal_code,address_country_code,email,telephone,reference,status,active_from,active_to,created_by,updated_by)
  ON organisation_professional_adviser TO accounts_app;
GRANT UPDATE(adviser_type,firm_name,contact_name,contact_qualifications,professional_body,report_style,address_line1,address_line2,address_locality,address_region,address_postal_code,address_country_code,email,telephone,reference,status,active_from,active_to,updated_by,updated_at)
  ON organisation_professional_adviser TO accounts_app;

-- tenant and engagement UPDATE are required by SELECT ... FOR UPDATE. The API
-- also updates source_account through its upsert and remaps trial_balance_line.
GRANT UPDATE ON TABLE
  engagement,
  source_account,
  trial_balance_line,
  journal,
  reconciliation,
  workflow_task,
  review_point,
  disclosure
TO accounts_app;

GRANT UPDATE(status,current_version,prepared_by,reviewed_by,updated_at,applicability,not_applicable_reason,not_applicable_by,not_applicable_at)
  ON working_paper TO accounts_app;
GRANT UPDATE(disposition,code_override,title_override,objective_override,guidance_override,default_content_override,required_override,reason,updated_by,updated_at)
  ON tenant_working_paper_override,organisation_working_paper_override TO accounts_app;
GRANT UPDATE(code,category_code,sequence_no,title,objective,guidance,default_content,legal_forms,framework_codes,sector_codes,required_by_default,enabled,updated_by,updated_at)
  ON custom_working_paper_template TO accounts_app;
GRANT UPDATE(title,description,risk_level,response,status,updated_by,updated_at)
  ON engagement_risk TO accounts_app;

GRANT UPDATE(name) ON tenant TO accounts_app;

GRANT UPDATE(line_no,canonical_account_id,debit,credit,dimensions,narrative)
  ON journal_line TO accounts_app;
GRANT UPDATE(status,html_storage_key,html_content_hash,ixbrl_storage_key,frozen_at)
  ON accounts_version TO accounts_app;
GRANT UPDATE(pdf_storage_key,pdf_content_hash)
  ON accounts_version TO accounts_app;
GRANT UPDATE(invalidated_at,invalidation_reason)
  ON signoff TO accounts_app;
GRANT UPDATE(status,response_storage_key,response_content_hash,regulator_reference,submitted_by,submitted_at,responded_at)
  ON filing_attempt TO accounts_app;

GRANT UPDATE(display_name,email_normalized,status,updated_at)
  ON client_contact TO accounts_app;
GRANT UPDATE(access_role,status,updated_at,revoked_by,revoked_at)
  ON client_engagement_access TO accounts_app;
GRANT UPDATE(title,description,status,due_at,updated_at)
  ON client_document_request TO accounts_app;
GRANT SELECT(id,tenant_id,client_engagement_access_id,created_by,created_at,expires_at,accepted_by,accepted_at,revoked_by,revoked_at)
  ON client_portal_invitation TO accounts_app;
GRANT INSERT(id,tenant_id,client_engagement_access_id,token_hash,created_by,expires_at)
  ON client_portal_invitation TO accounts_app;
GRANT UPDATE(revoked_by,revoked_at)
  ON client_portal_invitation TO accounts_app;
GRANT SELECT(id,tenant_id,organisation_id,connector_code,display_name,status,configuration,created_by,created_at,updated_at)
  ON integration_connection TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,connector_code,display_name,status,configuration,created_by)
  ON integration_connection TO accounts_app;
GRANT UPDATE(display_name,status,configuration,updated_at)
  ON integration_connection TO accounts_app;
GRANT UPDATE(status,cursor_before,cursor_after,started_at,completed_at,item_count,error_count)
  ON integration_sync_run TO accounts_app;
GRANT UPDATE(read_status,read_by,read_at)
  ON notification TO accounts_app;

GRANT SELECT(id,tenant_id,role_code,created_by,created_at,expires_at,accepted_by,accepted_at,revoked_by,revoked_at)
  ON tenant_invitation TO accounts_app;
GRANT INSERT(id,tenant_id,token_hash,role_code,created_by,expires_at)
  ON tenant_invitation TO accounts_app;
GRANT UPDATE(revoked_by,revoked_at)
  ON tenant_invitation TO accounts_app;
GRANT EXECUTE ON FUNCTION tenant_actor_is_administrator(uuid)
  TO accounts_app;
GRANT EXECUTE ON FUNCTION accept_authenticated_invitation(text)
  TO accounts_app;
GRANT EXECUTE ON FUNCTION manage_workspace_member(uuid,text,text)
  TO accounts_app;
GRANT EXECUTE ON FUNCTION
  client_actor_has_engagement_access(uuid,uuid),
  accept_client_portal_invitation(text),
  list_authenticated_client_access(),
  client_response_version_is_allowed(uuid,integer),
  client_review_is_independent(uuid,text),
  record_client_document_response(uuid,uuid,text,text,text,text,bigint,jsonb),
  transition_tenant_lifecycle(uuid,text,text),
  accounts_comparative_is_valid(uuid,uuid,uuid)
TO accounts_app;
GRANT EXECUTE ON FUNCTION organisation_actor_can_manage(uuid,uuid)
  TO accounts_app;

COMMIT;

-- Verification: every row should show only the expected privileges.
-- SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'accounts_app' AND table_schema = 'public'
-- GROUP BY table_name ORDER BY table_name
--
-- SELECT
--   has_database_privilege('accounts_app','neondb','CONNECT') AS can_connect,
--   has_schema_privilege('accounts_app','public','USAGE') AS can_use_public,
--   has_schema_privilege('accounts_app','public','CREATE') AS can_create_public
