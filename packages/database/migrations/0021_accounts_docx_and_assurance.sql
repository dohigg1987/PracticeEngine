ALTER TABLE accounts_version
  ADD COLUMN docx_storage_key text,
  ADD COLUMN docx_content_hash text,
  ADD CONSTRAINT accounts_version_docx_storage_key_not_blank_ck CHECK(docx_storage_key IS NULL OR btrim(docx_storage_key)<>''),
  ADD CONSTRAINT accounts_version_docx_content_hash_not_blank_ck CHECK(docx_content_hash IS NULL OR btrim(docx_content_hash)<>''),
  ADD CONSTRAINT accounts_version_docx_pair_ck CHECK((docx_storage_key IS NULL)=(docx_content_hash IS NULL));

ALTER TABLE engagement
  ADD COLUMN assurance_regime text NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK(assurance_regime IN ('NOT_ASSESSED','NO_EXTERNAL_SCRUTINY','INDEPENDENT_EXAMINATION','STATUTORY_AUDIT'));

CREATE TABLE assurance_report(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  regime text NOT NULL CHECK(regime IN ('INDEPENDENT_EXAMINATION','STATUTORY_AUDIT')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SIGNED','SUPERSEDED')),
  practitioner_name text NOT NULL CHECK(btrim(practitioner_name)<>''),
  firm_name text,
  professional_qualification text,
  report_text text NOT NULL CHECK(btrim(report_text)<>''),
  report_outcome text NOT NULL CHECK(report_outcome IN ('UNMODIFIED','MODIFIED','MATTER_REPORTED')),
  signed_at timestamptz,
  content_hash text NOT NULL CHECK(btrim(content_hash)<>''),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK((status='SIGNED')=(signed_at IS NOT NULL))
);
ALTER TABLE assurance_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_report FORCE ROW LEVEL SECURITY;
CREATE POLICY assurance_report_actor ON assurance_report TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),''));
CREATE POLICY assurance_report_owner ON assurance_report TO neondb_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON assurance_report TO accounts_app;
GRANT UPDATE(assurance_regime) ON engagement TO accounts_app;
GRANT UPDATE(docx_storage_key,docx_content_hash) ON accounts_version TO accounts_app;

INSERT INTO schema_migration(version,description) VALUES('0021','DOCX accounts artefacts and assurance regime');
