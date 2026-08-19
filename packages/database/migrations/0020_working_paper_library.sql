BEGIN;

CREATE TABLE working_paper_template(
  template_code text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  category_code text NOT NULL CHECK(category_code IN ('ACCEPTANCE','PLANNING','RECORDS','INCOME','EXPENDITURE','ASSETS','LIABILITIES','FUNDS','REPORTING','COMPLETION')),
  sequence_no integer NOT NULL CHECK(sequence_no>0),
  title text NOT NULL CHECK(btrim(title)<>''),
  objective text NOT NULL CHECK(btrim(objective)<>''),
  guidance text NOT NULL DEFAULT '' CHECK(guidance='' OR btrim(guidance)<>''),
  default_content jsonb NOT NULL DEFAULT '{"procedures":[],"findings":"","conclusion":""}'::jsonb CHECK(jsonb_typeof(default_content)='object'),
  legal_forms text[] NOT NULL DEFAULT ARRAY[]::text[],
  framework_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  sector_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  required_by_default boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  provenance_label text NOT NULL DEFAULT 'REPOSITORY_BASELINE_NOT_CERTIFIED' CHECK(btrim(provenance_label)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(template_code,version),
  UNIQUE(category_code,sequence_no,template_code),
  CHECK(template_code ~ '^[A-Z][A-Z0-9_.-]{1,79}$')
);

CREATE TABLE tenant_working_paper_override(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_code text NOT NULL,
  template_version integer NOT NULL,
  disposition text NOT NULL DEFAULT 'INCLUDE' CHECK(disposition IN ('INCLUDE','EXCLUDE')),
  code_override text,
  title_override text,
  objective_override text,
  guidance_override text,
  default_content_override jsonb,
  required_override boolean,
  reason text NOT NULL CHECK(btrim(reason)<>''),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,template_code,template_version),
  FOREIGN KEY(tenant_id) REFERENCES tenant(id),
  FOREIGN KEY(template_code,template_version) REFERENCES working_paper_template(template_code,version),
  CHECK(code_override IS NULL OR code_override ~ '^[A-Z][A-Z0-9_.-]{1,79}$'),
  CHECK(title_override IS NULL OR btrim(title_override)<>''),
  CHECK(objective_override IS NULL OR btrim(objective_override)<>''),
  CHECK(guidance_override IS NULL OR btrim(guidance_override)<>''),
  CHECK(default_content_override IS NULL OR jsonb_typeof(default_content_override)='object'),
  CHECK(updated_at>=created_at)
);

CREATE TABLE organisation_working_paper_override(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  template_code text NOT NULL,
  template_version integer NOT NULL,
  disposition text NOT NULL DEFAULT 'INCLUDE' CHECK(disposition IN ('INCLUDE','EXCLUDE')),
  code_override text,
  title_override text,
  objective_override text,
  guidance_override text,
  default_content_override jsonb,
  required_override boolean,
  reason text NOT NULL CHECK(btrim(reason)<>''),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,organisation_id,template_code,template_version),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(template_code,template_version) REFERENCES working_paper_template(template_code,version),
  CHECK(code_override IS NULL OR code_override ~ '^[A-Z][A-Z0-9_.-]{1,79}$'),
  CHECK(title_override IS NULL OR btrim(title_override)<>''),
  CHECK(objective_override IS NULL OR btrim(objective_override)<>''),
  CHECK(guidance_override IS NULL OR btrim(guidance_override)<>''),
  CHECK(default_content_override IS NULL OR jsonb_typeof(default_content_override)='object'),
  CHECK(updated_at>=created_at)
);

CREATE TABLE custom_working_paper_template(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid,
  code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_.-]{1,79}$'),
  category_code text NOT NULL CHECK(category_code IN ('ACCEPTANCE','PLANNING','RECORDS','INCOME','EXPENDITURE','ASSETS','LIABILITIES','FUNDS','REPORTING','COMPLETION')),
  sequence_no integer NOT NULL CHECK(sequence_no>0),
  title text NOT NULL CHECK(btrim(title)<>''),
  objective text NOT NULL CHECK(btrim(objective)<>''),
  guidance text NOT NULL DEFAULT '' CHECK(guidance='' OR btrim(guidance)<>''),
  default_content jsonb NOT NULL DEFAULT '{"procedures":[],"findings":"","conclusion":""}'::jsonb CHECK(jsonb_typeof(default_content)='object'),
  legal_forms text[] NOT NULL DEFAULT ARRAY[]::text[],
  framework_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  sector_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  required_by_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,organisation_id,code),
  FOREIGN KEY(tenant_id) REFERENCES tenant(id),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  CHECK(updated_at>=created_at)
);

ALTER TABLE working_paper ADD COLUMN template_code text;
ALTER TABLE working_paper ADD COLUMN template_version integer;
ALTER TABLE working_paper ADD COLUMN template_scope text NOT NULL DEFAULT 'ENGAGEMENT' CHECK(template_scope IN ('STANDARD','PRACTICE','CLIENT','ENGAGEMENT'));
ALTER TABLE working_paper ADD COLUMN category_code text NOT NULL DEFAULT 'REPORTING' CHECK(category_code IN ('ACCEPTANCE','PLANNING','RECORDS','INCOME','EXPENDITURE','ASSETS','LIABILITIES','FUNDS','REPORTING','COMPLETION'));
ALTER TABLE working_paper ADD COLUMN objective text;
ALTER TABLE working_paper ADD COLUMN applicability text NOT NULL DEFAULT 'APPLICABLE' CHECK(applicability IN ('APPLICABLE','NOT_APPLICABLE'));
ALTER TABLE working_paper ADD COLUMN not_applicable_reason text;
ALTER TABLE working_paper ADD COLUMN not_applicable_by text;
ALTER TABLE working_paper ADD COLUMN not_applicable_at timestamptz;
ALTER TABLE working_paper ADD CONSTRAINT working_paper_template_fk FOREIGN KEY(template_code,template_version) REFERENCES working_paper_template(template_code,version);
ALTER TABLE working_paper ADD CONSTRAINT working_paper_template_pair_ck CHECK((template_code IS NULL)=(template_version IS NULL));
ALTER TABLE working_paper ADD CONSTRAINT working_paper_template_scope_ck CHECK((template_scope='STANDARD' AND template_code IS NOT NULL) OR (template_scope<>'STANDARD'));
ALTER TABLE working_paper ADD CONSTRAINT working_paper_applicability_ck CHECK(
  (applicability='APPLICABLE' AND not_applicable_reason IS NULL AND not_applicable_by IS NULL AND not_applicable_at IS NULL)
  OR (applicability='NOT_APPLICABLE' AND btrim(coalesce(not_applicable_reason,''))<>'' AND btrim(coalesce(not_applicable_by,''))<>'' AND not_applicable_at IS NOT NULL)
);

CREATE UNIQUE INDEX working_paper_deployed_template_uq ON working_paper(engagement_id,template_code,template_version) WHERE template_code IS NOT NULL;
CREATE INDEX tenant_working_paper_override_lookup_idx ON tenant_working_paper_override(tenant_id,template_code,template_version);
CREATE INDEX organisation_working_paper_override_lookup_idx ON organisation_working_paper_override(tenant_id,organisation_id,template_code,template_version);
CREATE INDEX custom_working_paper_template_lookup_idx ON custom_working_paper_template(tenant_id,organisation_id,category_code,sequence_no) WHERE enabled;

ALTER TABLE working_paper_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_template FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_working_paper_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_working_paper_override FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_working_paper_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_working_paper_override FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_working_paper_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_working_paper_template FORCE ROW LEVEL SECURITY;

CREATE POLICY working_paper_template_read ON working_paper_template FOR SELECT TO accounts_app
USING(EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_template_owner ON working_paper_template TO neondb_owner USING(true) WITH CHECK(true);

CREATE POLICY tenant_wp_override_read ON tenant_working_paper_override FOR SELECT TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=tenant_working_paper_override.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY tenant_wp_override_insert ON tenant_working_paper_override FOR INSERT TO accounts_app
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=tenant_working_paper_override.tenant_id AND tm.actor_id=created_by AND tm.role_code IN ('OWNER','ADMIN')));
CREATE POLICY tenant_wp_override_update ON tenant_working_paper_override FOR UPDATE TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=tenant_working_paper_override.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'') AND tm.role_code IN ('OWNER','ADMIN')))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND updated_by=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY tenant_wp_override_owner ON tenant_working_paper_override TO neondb_owner USING(true) WITH CHECK(true);

CREATE POLICY organisation_wp_override_read ON organisation_working_paper_override FOR SELECT TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id));
CREATE POLICY organisation_wp_override_insert ON organisation_working_paper_override FOR INSERT TO accounts_app
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by);
CREATE POLICY organisation_wp_override_update ON organisation_working_paper_override FOR UPDATE TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id))
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND updated_by=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY organisation_wp_override_owner ON organisation_working_paper_override TO neondb_owner USING(true) WITH CHECK(true);

CREATE POLICY custom_wp_template_read ON custom_working_paper_template FOR SELECT TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (organisation_id IS NULL AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=custom_working_paper_template.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')) OR organisation_id IS NOT NULL AND organisation_actor_can_manage(tenant_id,organisation_id)));
CREATE POLICY custom_wp_template_insert ON custom_working_paper_template FOR INSERT TO accounts_app
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by AND (organisation_id IS NULL AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=custom_working_paper_template.tenant_id AND tm.actor_id=created_by AND tm.role_code IN ('OWNER','ADMIN')) OR organisation_id IS NOT NULL AND organisation_actor_can_manage(tenant_id,organisation_id)));
CREATE POLICY custom_wp_template_update ON custom_working_paper_template FOR UPDATE TO accounts_app
USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (organisation_id IS NULL AND EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=custom_working_paper_template.tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'') AND tm.role_code IN ('OWNER','ADMIN')) OR organisation_id IS NOT NULL AND organisation_actor_can_manage(tenant_id,organisation_id)))
WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND updated_by=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY custom_wp_template_owner ON custom_working_paper_template TO neondb_owner USING(true) WITH CHECK(true);

CREATE RULE tenant_working_paper_override_no_delete AS ON DELETE TO tenant_working_paper_override DO INSTEAD NOTHING;
CREATE RULE organisation_working_paper_override_no_delete AS ON DELETE TO organisation_working_paper_override DO INSTEAD NOTHING;
CREATE RULE custom_working_paper_template_no_delete AS ON DELETE TO custom_working_paper_template DO INSTEAD NOTHING;

REVOKE ALL ON working_paper_template,tenant_working_paper_override,organisation_working_paper_override,custom_working_paper_template FROM PUBLIC,accounts_app;
GRANT SELECT ON working_paper_template,tenant_working_paper_override,organisation_working_paper_override,custom_working_paper_template TO accounts_app;
GRANT INSERT ON tenant_working_paper_override,organisation_working_paper_override,custom_working_paper_template TO accounts_app;
GRANT UPDATE(disposition,code_override,title_override,objective_override,guidance_override,default_content_override,required_override,reason,updated_by,updated_at) ON tenant_working_paper_override,organisation_working_paper_override TO accounts_app;
GRANT UPDATE(code,category_code,sequence_no,title,objective,guidance,default_content,legal_forms,framework_codes,sector_codes,required_by_default,enabled,updated_by,updated_at) ON custom_working_paper_template TO accounts_app;
REVOKE UPDATE ON working_paper FROM accounts_app;
GRANT UPDATE(status,current_version,prepared_by,reviewed_by,updated_at,applicability,not_applicable_reason,not_applicable_by,not_applicable_at) ON working_paper TO accounts_app;

INSERT INTO working_paper_template(template_code,category_code,sequence_no,title,objective,sector_codes,required_by_default) VALUES
('A01','ACCEPTANCE',10,'Engagement acceptance and continuance','Document client acceptance, continuance, conflicts, competence, resources and engagement terms.',ARRAY[]::text[],true),
('A02','ACCEPTANCE',20,'Ethics and independence','Record ethical threats, safeguards, independence considerations and partner conclusions.',ARRAY[]::text[],true),
('A03','ACCEPTANCE',30,'Engagement letter and scope','Confirm the reporting framework, responsibilities, deliverables, timetable and agreed scope.',ARRAY[]::text[],true),
('B01','PLANNING',40,'Understanding the entity','Document activities, ownership, governance, financing, systems and the operating environment.',ARRAY[]::text[],true),
('B02','PLANNING',50,'Risk assessment and response','Identify material risks and link them to planned procedures and responsible team members.',ARRAY[]::text[],true),
('B03','PLANNING',60,'Materiality and trivial threshold','Set and justify overall, performance and clearly trivial thresholds and record revisions.',ARRAY[]::text[],true),
('B04','PLANNING',70,'Accounts production plan','Plan information requirements, timetable, responsibilities, review points and dependencies.',ARRAY[]::text[],true),
('C01','RECORDS',80,'Trial balance control','Agree the imported trial balance to the client records and investigate all differences.',ARRAY[]::text[],true),
('C02','RECORDS',90,'Opening balances and comparatives','Agree opening balances to approved prior-period accounts and explain restatements or reclassifications.',ARRAY[]::text[],true),
('C03','RECORDS',100,'Journal review','Document recurring and non-recurring journals, authorisation, rationale and supporting evidence.',ARRAY[]::text[],true),
('C04','RECORDS',110,'Accounting estimates','Identify material estimates, assumptions, source data, sensitivity and management bias indicators.',ARRAY[]::text[],true),
('D01','INCOME',120,'Revenue and income','Reconcile material income streams and document recognition, cut-off, completeness and classification.',ARRAY[]::text[],true),
('D02','INCOME',130,'Other income','Analyse grants, investment income, gains and other material or unusual income streams.',ARRAY[]::text[],false),
('E01','EXPENDITURE',140,'Operating expenditure','Analyse material expenditure, accruals, cut-off, classification and supporting evidence.',ARRAY[]::text[],true),
('E02','EXPENDITURE',150,'Payroll and people costs','Reconcile payroll reports to the ledger and test gross-to-net, tax, pensions and year-end liabilities.',ARRAY[]::text[],true),
('E03','EXPENDITURE',160,'Taxation','Document current and deferred tax positions, returns, provisions and disclosure conclusions.',ARRAY[]::text[],false),
('F01','ASSETS',170,'Bank and cash','Reconcile every material bank and cash balance to independent evidence and investigate reconciling items.',ARRAY[]::text[],true),
('F02','ASSETS',180,'Trade and other debtors','Analyse balances, recoverability, cut-off, prepayments and expected credit loss considerations.',ARRAY[]::text[],true),
('F03','ASSETS',190,'Tangible and intangible fixed assets','Reconcile registers, additions, disposals, depreciation, impairment and ownership evidence.',ARRAY[]::text[],false),
('F04','ASSETS',200,'Investments','Agree holdings and valuation evidence and document classification, income and impairment.',ARRAY[]::text[],false),
('G01','LIABILITIES',210,'Creditors and accruals','Reconcile supplier and control accounts and document completeness, cut-off and classification.',ARRAY[]::text[],true),
('G02','LIABILITIES',220,'Borrowings and finance','Agree facilities and balances, recalculate finance costs and document covenants and classification.',ARRAY[]::text[],false),
('G03','LIABILITIES',230,'Provisions and contingencies','Assess present obligations, measurement, uncertainties, contingent items and disclosures.',ARRAY[]::text[],false),
('H01','FUNDS',240,'Fund accounting and reconciliation','Reconcile unrestricted, designated, restricted and endowment funds and investigate all movements.',ARRAY['CHARITIES_SORP_2026'],true),
('H02','FUNDS',250,'Restricted funds','Document restrictions, expenditure against purpose, transfers, deficit funds and disclosure wording.',ARRAY['CHARITIES_SORP_2026'],true),
('H03','FUNDS',260,'Reserves policy','Reconcile free reserves and assess the trustees’ policy, targets, risks and reporting consistency.',ARRAY['CHARITIES_SORP_2026'],true),
('H04','FUNDS',270,'Support cost allocation','Document allocation bases, governance costs and consistency with activities and SORP disclosures.',ARRAY['CHARITIES_SORP_2026'],true),
('H05','INCOME',280,'Donations, legacies and grants','Document entitlement, probability, measurement, restrictions, performance conditions and cut-off.',ARRAY['CHARITIES_SORP_2026'],true),
('H06','EXPENDITURE',290,'Charitable activities and grants payable','Reconcile activity costs and grants, allocation methods, commitments and disclosure classifications.',ARRAY['CHARITIES_SORP_2026'],true),
('H07','REPORTING',300,'Trustees, related parties and benefits','Document trustees, remuneration, expenses, benefits, related parties and required disclosures.',ARRAY['CHARITIES_SORP_2026'],true),
('H08','REPORTING',310,'Public benefit and activities report','Corroborate public benefit, objectives, activities, achievements and performance reporting.',ARRAY['CHARITIES_SORP_2026'],true),
('H09','REPORTING',320,'Fundraising and safeguarding disclosures','Assess fundraising practices, complaints, vulnerable persons and related statutory narrative.',ARRAY['CHARITIES_SORP_2026'],false),
('I01','REPORTING',330,'Accounting policies','Review material policy choices, judgements, estimates and consistency with the applicable framework.',ARRAY[]::text[],true),
('I02','REPORTING',340,'Statutory disclosure checklist','Complete and cross-reference the applicable company, charity and accounting disclosure requirements.',ARRAY[]::text[],true),
('I03','REPORTING',350,'Trustees’ or directors’ report','Review the statutory narrative for completeness, consistency and evidence support.',ARRAY[]::text[],true),
('J01','COMPLETION',360,'Going concern','Evaluate the assessment period, forecasts, sensitivities, financing and related disclosures.',ARRAY[]::text[],true),
('J02','COMPLETION',370,'Subsequent events','Record enquiries and evidence through the approval date and conclude on adjusting and disclosing events.',ARRAY[]::text[],true),
('J03','COMPLETION',380,'Related parties and laws','Complete related-party, fraud, laws, regulations and non-compliance considerations.',ARRAY[]::text[],true),
('J04','COMPLETION',390,'Final analytical review','Compare final accounts to expectations and prior periods and investigate significant movements.',ARRAY[]::text[],true),
('J05','COMPLETION',400,'Management representations','Prepare representations specific to the engagement and resolve exceptions before approval.',ARRAY[]::text[],true),
('J06','COMPLETION',410,'Completion and review clearance','Confirm all work, review points, disclosures, sign-offs and finalisation conditions are complete.',ARRAY[]::text[],true);

INSERT INTO schema_migration(version,description)
VALUES('0020','working paper library practice and client customisation and engagement deployment')
ON CONFLICT(version) DO NOTHING;

COMMIT;
