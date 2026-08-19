BEGIN;

CREATE TABLE working_paper_work_area(
  work_area_code text PRIMARY KEY CHECK(work_area_code IN ('ACCEPTANCE','PLANNING','RECORDS','INCOME','EXPENDITURE','ASSETS','LIABILITIES','FUNDS','REPORTING','COMPLETION')),
  title text NOT NULL CHECK(btrim(title)<>''),
  sequence_no integer NOT NULL UNIQUE CHECK(sequence_no>0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  provenance_label text NOT NULL DEFAULT 'REPOSITORY_BASELINE_NOT_CERTIFIED' CHECK(btrim(provenance_label)<>''),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO working_paper_work_area(work_area_code,title,sequence_no) VALUES
('ACCEPTANCE','Acceptance and continuance',10),
('PLANNING','Planning',20),
('RECORDS','Accounting records and controls',30),
('INCOME','Income',40),
('EXPENDITURE','Expenditure',50),
('ASSETS','Assets',60),
('LIABILITIES','Liabilities',70),
('FUNDS','Funds',80),
('REPORTING','Financial statements and reporting',90),
('COMPLETION','Completion',100);

CREATE TABLE working_paper_theme(
  theme_code text PRIMARY KEY CHECK(theme_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  title text NOT NULL CHECK(btrim(title)<>''),
  description text NOT NULL DEFAULT '' CHECK(description='' OR btrim(description)<>''),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  provenance_label text NOT NULL DEFAULT 'REPOSITORY_BASELINE_NOT_CERTIFIED' CHECK(btrim(provenance_label)<>''),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO working_paper_theme(theme_code,title,description) VALUES
('ACCOUNTING_ESTIMATES','Accounting estimates','Judgements, assumptions, source data, sensitivities and management bias'),
('COMPLETENESS','Completeness','Completeness of records, populations, liabilities and disclosures'),
('FRAUD','Fraud','Fraud risk factors, responses and conclusions'),
('GOING_CONCERN','Going concern','Assessment period, forecasts, sensitivities and financing'),
('INTERNAL_CONTROLS','Internal controls','Design, implementation and operation of relevant controls'),
('LAWS_AND_REGULATIONS','Laws and regulations','Compliance and non-compliance considerations'),
('RELATED_PARTIES','Related parties','Identification, transactions, balances and disclosures'),
('SUBSEQUENT_EVENTS','Subsequent events','Events through approval and their accounting or disclosure effect'),
('VALUATION','Valuation','Measurement, impairment, recoverability and allocation'),
('FINANCIAL_STATEMENT_DISCLOSURE','Financial statement disclosure','Presentation, classification and disclosure support');

ALTER TABLE working_paper_template
  DROP CONSTRAINT working_paper_template_category_code_sequence_no_template_c_key;

ALTER TABLE working_paper_template
  ADD COLUMN content_hash text,
  ADD COLUMN source_reference text,
  ADD COLUMN governance_status text NOT NULL DEFAULT 'BASELINE' CHECK(governance_status IN ('BASELINE','DRAFT','APPROVED','RETIRED')),
  ADD COLUMN reviewed_by text,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN approved_by text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_evidence jsonb,
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to date,
  ADD COLUMN supersedes_version integer;

UPDATE working_paper_template
SET source_reference='repository:packages/database/migrations/0020_working_paper_library.sql#'||template_code||'-v'||version::text,
    content_hash=encode(digest(jsonb_build_object(
      'templateCode',template_code,
      'version',version,
      'categoryCode',category_code,
      'sequenceNo',sequence_no,
      'title',title,
      'objective',objective,
      'guidance',guidance,
      'defaultContent',default_content,
      'legalForms',to_jsonb(legal_forms),
      'frameworkCodes',to_jsonb(framework_codes),
      'sectorCodes',to_jsonb(sector_codes),
      'requiredByDefault',required_by_default,
      'provenanceLabel',provenance_label
    )::text::bytea,'sha256'),'hex');

ALTER TABLE working_paper_template
  ALTER COLUMN content_hash SET NOT NULL,
  ALTER COLUMN source_reference SET NOT NULL,
  ADD CONSTRAINT working_paper_template_content_hash_ck CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT working_paper_template_source_reference_ck CHECK(btrim(source_reference)<>''),
  ADD CONSTRAINT working_paper_template_review_pair_ck CHECK((reviewed_by IS NULL)=(reviewed_at IS NULL)),
  ADD CONSTRAINT working_paper_template_approval_pair_ck CHECK((approved_by IS NULL)=(approved_at IS NULL) AND (approved_by IS NULL)=(approval_evidence IS NULL)),
  ADD CONSTRAINT working_paper_template_approval_evidence_ck CHECK(approval_evidence IS NULL OR jsonb_typeof(approval_evidence)='object'),
  ADD CONSTRAINT working_paper_template_governance_ck CHECK(
    (governance_status='BASELINE' AND reviewed_by IS NULL AND approved_by IS NULL AND provenance_label='REPOSITORY_BASELINE_NOT_CERTIFIED')
    OR (governance_status='DRAFT' AND approved_by IS NULL)
    OR (governance_status='APPROVED' AND reviewed_by IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>reviewed_by AND effective_from IS NOT NULL)
    OR (governance_status='RETIRED' AND reviewed_by IS NOT NULL AND approved_by IS NOT NULL)
  ),
  ADD CONSTRAINT working_paper_template_effective_period_ck CHECK(effective_to IS NULL OR (effective_from IS NOT NULL AND effective_to>=effective_from)),
  ADD CONSTRAINT working_paper_template_supersedes_ck CHECK(supersedes_version IS NULL OR (supersedes_version>0 AND supersedes_version<version)),
  ADD CONSTRAINT working_paper_template_supersedes_fk FOREIGN KEY(template_code,supersedes_version) REFERENCES working_paper_template(template_code,version),
  ADD CONSTRAINT working_paper_template_work_area_fk FOREIGN KEY(category_code) REFERENCES working_paper_work_area(work_area_code),
  ADD CONSTRAINT working_paper_template_category_sequence_version_uq UNIQUE(category_code,sequence_no,template_code,version);

ALTER TABLE custom_working_paper_template
  ADD CONSTRAINT custom_working_paper_template_work_area_fk FOREIGN KEY(category_code) REFERENCES working_paper_work_area(work_area_code);

ALTER TABLE working_paper
  ADD CONSTRAINT working_paper_work_area_fk FOREIGN KEY(category_code) REFERENCES working_paper_work_area(work_area_code),
  ADD CONSTRAINT working_paper_tenant_engagement_id_uq UNIQUE(tenant_id,engagement_id,id);

ALTER TABLE working_paper_version
  ADD CONSTRAINT working_paper_version_tenant_paper_version_uq UNIQUE(tenant_id,working_paper_id,version);

CREATE TABLE working_paper_template_theme(
  template_code text NOT NULL,
  template_version integer NOT NULL,
  theme_code text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(template_code,template_version,theme_code),
  FOREIGN KEY(template_code,template_version) REFERENCES working_paper_template(template_code,version),
  FOREIGN KEY(theme_code) REFERENCES working_paper_theme(theme_code)
);

CREATE UNIQUE INDEX working_paper_template_theme_primary_uq
ON working_paper_template_theme(template_code,template_version)
WHERE is_primary;

CREATE TABLE engagement_risk(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  risk_code text NOT NULL CHECK(risk_code ~ '^[A-Z][A-Z0-9_.-]{1,79}$'),
  title text NOT NULL CHECK(btrim(title)<>''),
  description text NOT NULL DEFAULT '' CHECK(description='' OR btrim(description)<>''),
  risk_level text NOT NULL CHECK(risk_level IN ('LOW','MEDIUM','HIGH','SIGNIFICANT')),
  response text NOT NULL DEFAULT '' CHECK(response='' OR btrim(response)<>''),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','MITIGATED','ACCEPTED','CLOSED')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,engagement_id,id),
  UNIQUE(tenant_id,engagement_id,risk_code),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK(updated_at>=created_at)
);

CREATE TABLE working_paper_report_line_link(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  report_line_id uuid NOT NULL REFERENCES canonical_report_line(id),
  link_purpose text NOT NULL DEFAULT 'SUPPORTING' CHECK(link_purpose IN ('PRIMARY','SUPPORTING','DISCLOSURE')),
  supersedes_link_id uuid,
  supersession_reason text,
  supersedes_link_purpose text GENERATED ALWAYS AS (CASE WHEN supersedes_link_id IS NULL THEN NULL ELSE link_purpose END) STORED,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,working_paper_id,report_line_id),
  UNIQUE(tenant_id,working_paper_id,id,link_purpose),
  UNIQUE(supersedes_link_id),
  FOREIGN KEY(tenant_id,engagement_id,working_paper_id) REFERENCES working_paper(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,working_paper_id,supersedes_link_id,supersedes_link_purpose) REFERENCES working_paper_report_line_link(tenant_id,working_paper_id,id,link_purpose),
  CHECK((supersedes_link_id IS NULL AND supersession_reason IS NULL) OR (supersedes_link_id IS NOT NULL AND btrim(coalesce(supersession_reason,''))<>'' AND char_length(supersession_reason)<=2000))
);

CREATE UNIQUE INDEX working_paper_report_line_primary_root_uq
ON working_paper_report_line_link(tenant_id,working_paper_id)
WHERE link_purpose='PRIMARY' AND supersedes_link_id IS NULL;

INSERT INTO working_paper_report_line_link(tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,created_by,created_at)
SELECT tenant_id,engagement_id,id,report_line_id,'PRIMARY','MIGRATION_0026',created_at
FROM working_paper
WHERE report_line_id IS NOT NULL;

COMMENT ON COLUMN working_paper.report_line_id IS 'Deprecated read compatibility only. working_paper_report_line_link is authoritative after the paired API migration.';

CREATE TABLE working_paper_assertion_link(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  assertion_code text NOT NULL CHECK(assertion_code IN ('EXISTENCE','OCCURRENCE','RIGHTS_AND_OBLIGATIONS','COMPLETENESS','ACCURACY','VALUATION','ALLOCATION','CUTOFF','CLASSIFICATION','PRESENTATION','DISCLOSURE')),
  supersedes_link_id uuid,
  supersession_reason text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,working_paper_id,assertion_code),
  UNIQUE(tenant_id,working_paper_id,id),
  UNIQUE(supersedes_link_id),
  FOREIGN KEY(tenant_id,engagement_id,working_paper_id) REFERENCES working_paper(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,working_paper_id,supersedes_link_id) REFERENCES working_paper_assertion_link(tenant_id,working_paper_id,id),
  CHECK((supersedes_link_id IS NULL AND supersession_reason IS NULL) OR (supersedes_link_id IS NOT NULL AND btrim(coalesce(supersession_reason,''))<>'' AND char_length(supersession_reason)<=2000))
);

CREATE TABLE working_paper_risk_link(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  supersedes_link_id uuid,
  supersession_reason text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,working_paper_id,risk_id),
  UNIQUE(tenant_id,working_paper_id,id),
  UNIQUE(supersedes_link_id),
  FOREIGN KEY(tenant_id,engagement_id,working_paper_id) REFERENCES working_paper(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,engagement_id,risk_id) REFERENCES engagement_risk(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,working_paper_id,supersedes_link_id) REFERENCES working_paper_risk_link(tenant_id,working_paper_id,id),
  CHECK((supersedes_link_id IS NULL AND supersession_reason IS NULL) OR (supersedes_link_id IS NOT NULL AND btrim(coalesce(supersession_reason,''))<>'' AND char_length(supersession_reason)<=2000))
);

CREATE TABLE working_paper_theme_link(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  theme_code text NOT NULL REFERENCES working_paper_theme(theme_code),
  is_primary boolean NOT NULL DEFAULT false,
  supersedes_link_id uuid,
  supersession_reason text,
  supersedes_is_primary boolean GENERATED ALWAYS AS (CASE WHEN supersedes_link_id IS NULL THEN NULL ELSE is_primary END) STORED,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,working_paper_id,theme_code),
  UNIQUE(tenant_id,working_paper_id,id,is_primary),
  UNIQUE(supersedes_link_id),
  FOREIGN KEY(tenant_id,engagement_id,working_paper_id) REFERENCES working_paper(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,working_paper_id,supersedes_link_id,supersedes_is_primary) REFERENCES working_paper_theme_link(tenant_id,working_paper_id,id,is_primary),
  CHECK((supersedes_link_id IS NULL AND supersession_reason IS NULL) OR (supersedes_link_id IS NOT NULL AND btrim(coalesce(supersession_reason,''))<>'' AND char_length(supersession_reason)<=2000))
);

CREATE UNIQUE INDEX working_paper_theme_primary_root_uq
ON working_paper_theme_link(tenant_id,working_paper_id)
WHERE is_primary AND supersedes_link_id IS NULL;

CREATE TABLE working_paper_attachment(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  working_paper_version integer NOT NULL CHECK(working_paper_version>0),
  storage_key text NOT NULL CHECK(btrim(storage_key)<>''),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  filename text NOT NULL CHECK(btrim(filename)<>''),
  media_type text NOT NULL CHECK(btrim(media_type)<>''),
  byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=10485760),
  evidence_type text NOT NULL CHECK(evidence_type IN ('SOURCE_DOCUMENT','CALCULATION','CONFIRMATION','CORRESPONDENCE','REPORT','OTHER')),
  description text NOT NULL DEFAULT '' CHECK(description='' OR btrim(description)<>''),
  uploaded_by text NOT NULL CHECK(btrim(uploaded_by)<>''),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,storage_key),
  UNIQUE(tenant_id,working_paper_id,working_paper_version,content_hash),
  FOREIGN KEY(tenant_id,engagement_id,working_paper_id) REFERENCES working_paper(tenant_id,engagement_id,id),
  FOREIGN KEY(tenant_id,working_paper_id,working_paper_version) REFERENCES working_paper_version(tenant_id,working_paper_id,version)
);

CREATE INDEX engagement_risk_lookup_idx ON engagement_risk(tenant_id,engagement_id,status,risk_level);
CREATE INDEX working_paper_report_line_lookup_idx ON working_paper_report_line_link(tenant_id,engagement_id,report_line_id);
CREATE INDEX working_paper_risk_lookup_idx ON working_paper_risk_link(tenant_id,engagement_id,risk_id);
CREATE INDEX working_paper_attachment_lookup_idx ON working_paper_attachment(tenant_id,engagement_id,working_paper_id,working_paper_version,uploaded_at);

ALTER TABLE working_paper_work_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_work_area FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_theme FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_template_theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_template_theme FORCE ROW LEVEL SECURITY;
ALTER TABLE engagement_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_risk FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_report_line_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_report_line_link FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_assertion_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_assertion_link FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_risk_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_risk_link FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_theme_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_theme_link FORCE ROW LEVEL SECURITY;
ALTER TABLE working_paper_attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_attachment FORCE ROW LEVEL SECURITY;

CREATE POLICY working_paper_work_area_read ON working_paper_work_area FOR SELECT TO accounts_app
USING(EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_work_area_owner ON working_paper_work_area TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_theme_read ON working_paper_theme FOR SELECT TO accounts_app
USING(EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_theme_owner ON working_paper_theme TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_template_theme_read ON working_paper_template_theme FOR SELECT TO accounts_app
USING(EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_template_theme_owner ON working_paper_template_theme TO neondb_owner USING(true) WITH CHECK(true);

CREATE POLICY engagement_risk_select ON engagement_risk FOR SELECT TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=engagement_risk.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
;
CREATE POLICY engagement_risk_insert ON engagement_risk FOR INSERT TO accounts_app
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=engagement_risk.tenant_id AND tm.actor_id=created_by));
CREATE POLICY engagement_risk_update ON engagement_risk FOR UPDATE TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=engagement_risk.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND updated_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=engagement_risk.tenant_id AND tm.actor_id=updated_by));
CREATE POLICY engagement_risk_owner ON engagement_risk TO neondb_owner USING(true) WITH CHECK(true);

CREATE POLICY working_paper_report_line_link_actor ON working_paper_report_line_link TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_report_line_link.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_report_line_link.tenant_id AND tm.actor_id=created_by));
CREATE POLICY working_paper_report_line_link_owner ON working_paper_report_line_link TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_assertion_link_actor ON working_paper_assertion_link TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_assertion_link.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_assertion_link.tenant_id AND tm.actor_id=created_by));
CREATE POLICY working_paper_assertion_link_owner ON working_paper_assertion_link TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_risk_link_actor ON working_paper_risk_link TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_risk_link.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_risk_link.tenant_id AND tm.actor_id=created_by));
CREATE POLICY working_paper_risk_link_owner ON working_paper_risk_link TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_theme_link_actor ON working_paper_theme_link TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_theme_link.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_theme_link.tenant_id AND tm.actor_id=created_by));
CREATE POLICY working_paper_theme_link_owner ON working_paper_theme_link TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY working_paper_attachment_select ON working_paper_attachment FOR SELECT TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_attachment.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_attachment_insert ON working_paper_attachment FOR INSERT TO accounts_app
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND uploaded_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=working_paper_attachment.tenant_id AND tm.actor_id=uploaded_by));
CREATE POLICY working_paper_attachment_owner ON working_paper_attachment TO neondb_owner USING(true) WITH CHECK(true);

CREATE RULE working_paper_report_line_link_no_update AS ON UPDATE TO working_paper_report_line_link DO INSTEAD NOTHING;
CREATE RULE working_paper_report_line_link_no_delete AS ON DELETE TO working_paper_report_line_link DO INSTEAD NOTHING;
CREATE RULE working_paper_assertion_link_no_update AS ON UPDATE TO working_paper_assertion_link DO INSTEAD NOTHING;
CREATE RULE working_paper_assertion_link_no_delete AS ON DELETE TO working_paper_assertion_link DO INSTEAD NOTHING;
CREATE RULE working_paper_risk_link_no_update AS ON UPDATE TO working_paper_risk_link DO INSTEAD NOTHING;
CREATE RULE working_paper_risk_link_no_delete AS ON DELETE TO working_paper_risk_link DO INSTEAD NOTHING;
CREATE RULE working_paper_theme_link_no_update AS ON UPDATE TO working_paper_theme_link DO INSTEAD NOTHING;
CREATE RULE working_paper_theme_link_no_delete AS ON DELETE TO working_paper_theme_link DO INSTEAD NOTHING;
CREATE RULE working_paper_attachment_no_update AS ON UPDATE TO working_paper_attachment DO INSTEAD NOTHING;
CREATE RULE working_paper_attachment_no_delete AS ON DELETE TO working_paper_attachment DO INSTEAD NOTHING;

REVOKE ALL ON working_paper_work_area,working_paper_theme,working_paper_template_theme,engagement_risk,working_paper_report_line_link,working_paper_assertion_link,working_paper_risk_link,working_paper_theme_link,working_paper_attachment FROM PUBLIC,accounts_app;
GRANT SELECT ON working_paper_work_area,working_paper_theme,working_paper_template_theme,engagement_risk,working_paper_report_line_link,working_paper_assertion_link,working_paper_risk_link,working_paper_theme_link,working_paper_attachment TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,risk_code,title,description,risk_level,response,status,created_by,updated_by) ON engagement_risk TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,supersedes_link_id,supersession_reason,created_by) ON working_paper_report_line_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,assertion_code,supersedes_link_id,supersession_reason,created_by) ON working_paper_assertion_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,risk_id,supersedes_link_id,supersession_reason,created_by) ON working_paper_risk_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,theme_code,is_primary,supersedes_link_id,supersession_reason,created_by) ON working_paper_theme_link TO accounts_app;
GRANT INSERT(id,tenant_id,engagement_id,working_paper_id,working_paper_version,storage_key,content_hash,filename,media_type,byte_size,evidence_type,description,uploaded_by) ON working_paper_attachment TO accounts_app;
GRANT UPDATE(title,description,risk_level,response,status,updated_by,updated_at) ON engagement_risk TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0026','governed working paper themes risks assertions report line links and immutable attachments')
ON CONFLICT(version) DO NOTHING;

COMMIT;
