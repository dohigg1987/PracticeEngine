BEGIN;

CREATE TABLE reporting_framework_pack(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_code text NOT NULL CHECK(btrim(pack_code) <> ''),
  version_no integer NOT NULL CHECK(version_no > 0),
  title text NOT NULL CHECK(btrim(title) <> ''),
  framework_code text NOT NULL CHECK(framework_code IN ('FRS_101','FRS_102','FRS_102_1A','FRS_105')),
  sector_code text NOT NULL CHECK(sector_code IN ('NONE','CHARITIES_SORP_2026','ACADEMIES_2026','LLP_SORP_2026')),
  effective_from date NOT NULL,
  effective_to date,
  certification_status text NOT NULL DEFAULT 'BASELINE_NOT_CERTIFIED'
    CHECK(certification_status IN ('BASELINE_NOT_CERTIFIED','REGULATOR_CERTIFIED')),
  provenance_label text NOT NULL CHECK(btrim(provenance_label) <> ''),
  source_reference jsonb NOT NULL CHECK(jsonb_typeof(source_reference)='object'),
  supersedes_pack_id uuid REFERENCES reporting_framework_pack(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pack_code,version_no),
  CHECK(effective_to IS NULL OR effective_to >= effective_from),
  CHECK(supersedes_pack_id IS NULL OR supersedes_pack_id <> id)
);

CREATE TABLE statement_definition(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES reporting_framework_pack(id),
  statement_code text NOT NULL CHECK(btrim(statement_code) <> ''),
  caption text NOT NULL CHECK(btrim(caption) <> ''),
  display_order integer NOT NULL CHECK(display_order > 0),
  provenance_label text NOT NULL CHECK(btrim(provenance_label) <> ''),
  source_reference jsonb NOT NULL CHECK(jsonb_typeof(source_reference)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(framework_pack_id,statement_code),
  UNIQUE(framework_pack_id,display_order)
);

CREATE TABLE statement_definition_line(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_definition_id uuid NOT NULL REFERENCES statement_definition(id),
  line_code text NOT NULL CHECK(btrim(line_code) <> ''),
  caption text NOT NULL CHECK(btrim(caption) <> ''),
  display_order integer NOT NULL CHECK(display_order > 0),
  canonical_codes text[] NOT NULL CHECK(cardinality(canonical_codes) > 0),
  provenance_label text NOT NULL CHECK(btrim(provenance_label) <> ''),
  source_reference jsonb NOT NULL CHECK(jsonb_typeof(source_reference)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(statement_definition_id,line_code),
  UNIQUE(statement_definition_id,display_order),
  CHECK(array_position(canonical_codes,NULL) IS NULL)
);

CREATE TABLE disclosure_rule(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES reporting_framework_pack(id),
  disclosure_code text NOT NULL CHECK(btrim(disclosure_code) <> ''),
  requirement_level text NOT NULL CHECK(requirement_level IN ('REQUIRED','RECOMMENDED','CONDITIONAL','PROHIBITED')),
  applicability jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(applicability)='object'),
  effective_from date NOT NULL,
  effective_to date,
  provenance_label text NOT NULL CHECK(btrim(provenance_label) <> ''),
  source_reference jsonb NOT NULL CHECK(jsonb_typeof(source_reference)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(framework_pack_id,disclosure_code),
  CHECK(effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE taxonomy_concept_mapping(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES reporting_framework_pack(id),
  source_kind text NOT NULL CHECK(source_kind IN ('STATEMENT_LINE','DISCLOSURE_RULE','CANONICAL_ACCOUNT')),
  source_code text NOT NULL CHECK(btrim(source_code) <> ''),
  taxonomy_version text NOT NULL CHECK(btrim(taxonomy_version) <> ''),
  concept_qname text NOT NULL CHECK(btrim(concept_qname) <> '' AND strpos(concept_qname,':') > 1),
  mapping_role text NOT NULL DEFAULT 'PRIMARY' CHECK(mapping_role IN ('PRIMARY','ALTERNATIVE','SUPPLEMENTARY')),
  effective_from date NOT NULL,
  effective_to date,
  provenance_label text NOT NULL CHECK(btrim(provenance_label) <> ''),
  source_reference jsonb NOT NULL CHECK(jsonb_typeof(source_reference)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(framework_pack_id,source_kind,source_code,taxonomy_version,concept_qname,mapping_role),
  CHECK(effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX reporting_framework_pack_lookup_idx
  ON reporting_framework_pack(framework_code,sector_code,effective_from,effective_to);
CREATE INDEX disclosure_rule_pack_idx ON disclosure_rule(framework_pack_id,disclosure_code);
CREATE INDEX taxonomy_concept_mapping_lookup_idx
  ON taxonomy_concept_mapping(framework_pack_id,source_kind,source_code,taxonomy_version);

INSERT INTO reporting_framework_pack(
  pack_code,version_no,title,framework_code,sector_code,effective_from,effective_to,
  certification_status,provenance_label,source_reference
)
VALUES
  ('FRS102-2026',1,'FRS 102 baseline 2026','FRS_102','NONE','2026-01-01',NULL,
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"FRS102-2026"}'::jsonb),
  ('FRS102-1A-2026',1,'FRS 102 Section 1A baseline 2026','FRS_102_1A','NONE','2026-01-01',NULL,
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"FRS102-1A-2026"}'::jsonb),
  ('FRS105-2026',1,'FRS 105 baseline 2026','FRS_105','NONE','2026-01-01',NULL,
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"FRS105-2026"}'::jsonb),
  ('CHARITIES-SORP-2026',1,'Charities SORP baseline 2026','FRS_102','CHARITIES_SORP_2026','2026-01-01',NULL,
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"CHARITIES-SORP-2026"}'::jsonb),
  ('ACADEMIES-2025-26',1,'Academies baseline 2025 to 2026','FRS_102','ACADEMIES_2026','2025-09-01','2026-08-31',
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"ACADEMIES-2025-26"}'::jsonb),
  ('LLP-SORP-2026',1,'LLP SORP baseline 2026','FRS_102','LLP_SORP_2026','2026-01-01',NULL,
   'BASELINE_NOT_CERTIFIED','REPOSITORY_BASELINE',
   '{"repository_path":"packages/reporting/src/packs.ts","export":"baselineFrameworkPacks","pack_id":"LLP-SORP-2026"}'::jsonb);

INSERT INTO statement_definition(
  framework_pack_id,statement_code,caption,display_order,provenance_label,source_reference
)
SELECT p.id,v.statement_code,v.caption,v.display_order,'REPOSITORY_BASELINE',
  jsonb_build_object('repository_path','packages/reporting/src/packs.ts','pack_id',v.pack_code,'statement_code',v.statement_code)
FROM (VALUES
  ('FRS102-2026','PROFIT_AND_LOSS','Profit and loss account',10),
  ('FRS102-2026','BALANCE_SHEET','Balance sheet',20),
  ('FRS102-1A-2026','PROFIT_AND_LOSS','Profit and loss account',10),
  ('FRS102-1A-2026','BALANCE_SHEET','Balance sheet',20),
  ('FRS105-2026','PROFIT_AND_LOSS','Profit and loss account',10),
  ('FRS105-2026','BALANCE_SHEET','Balance sheet',20),
  ('CHARITIES-SORP-2026','SOFA','Statement of financial activities',10),
  ('CHARITIES-SORP-2026','BALANCE_SHEET','Balance sheet',20),
  ('ACADEMIES-2025-26','SOFA','Statement of financial activities',10),
  ('ACADEMIES-2025-26','BALANCE_SHEET','Balance sheet',20),
  ('LLP-SORP-2026','PROFIT_AND_LOSS','Profit and loss account',10),
  ('LLP-SORP-2026','BALANCE_SHEET','Balance sheet',20)
) AS v(pack_code,statement_code,caption,display_order)
JOIN reporting_framework_pack p ON p.pack_code=v.pack_code AND p.version_no=1;

INSERT INTO statement_definition_line(
  statement_definition_id,line_code,caption,display_order,canonical_codes,
  provenance_label,source_reference
)
SELECT s.id,v.line_code,v.caption,v.display_order,v.canonical_codes,'REPOSITORY_BASELINE',
  jsonb_build_object('repository_path','packages/reporting/src/packs.ts','pack_id',v.pack_code,'statement_code',v.statement_code,'line_code',v.line_code)
FROM (VALUES
  ('FRS102-2026','PROFIT_AND_LOSS','PL.REVENUE','Turnover',10,ARRAY['REV.TRADING']),
  ('FRS102-2026','PROFIT_AND_LOSS','PL.COST_OF_SALES','Cost of sales',20,ARRAY['EXP.DIRECT']),
  ('FRS102-2026','PROFIT_AND_LOSS','PL.ADMIN','Administrative expenses',30,ARRAY['EXP.ADMIN','EXP.STAFF','EXP.DEPRECIATION']),
  ('FRS102-2026','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('FRS102-2026','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('FRS102-2026','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('FRS102-2026','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER']),
  ('FRS102-1A-2026','PROFIT_AND_LOSS','PL.REVENUE','Turnover',10,ARRAY['REV.TRADING']),
  ('FRS102-1A-2026','PROFIT_AND_LOSS','PL.COST_OF_SALES','Cost of sales',20,ARRAY['EXP.DIRECT']),
  ('FRS102-1A-2026','PROFIT_AND_LOSS','PL.ADMIN','Administrative expenses',30,ARRAY['EXP.ADMIN','EXP.STAFF','EXP.DEPRECIATION']),
  ('FRS102-1A-2026','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('FRS102-1A-2026','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('FRS102-1A-2026','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('FRS102-1A-2026','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER']),
  ('FRS105-2026','PROFIT_AND_LOSS','PL.REVENUE','Turnover',10,ARRAY['REV.TRADING']),
  ('FRS105-2026','PROFIT_AND_LOSS','PL.COST_OF_SALES','Cost of sales',20,ARRAY['EXP.DIRECT']),
  ('FRS105-2026','PROFIT_AND_LOSS','PL.ADMIN','Administrative expenses',30,ARRAY['EXP.ADMIN','EXP.STAFF','EXP.DEPRECIATION']),
  ('FRS105-2026','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('FRS105-2026','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('FRS105-2026','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('FRS105-2026','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER']),
  ('CHARITIES-SORP-2026','SOFA','SOFA.DONATIONS','Donations and legacies',10,ARRAY['REV.DONATIONS']),
  ('CHARITIES-SORP-2026','SOFA','SOFA.CHARITABLE_INCOME','Income from charitable activities',20,ARRAY['REV.TRADING']),
  ('CHARITIES-SORP-2026','SOFA','SOFA.CHARITABLE_EXPENDITURE','Expenditure on charitable activities',30,ARRAY['EXP.DIRECT','EXP.STAFF']),
  ('CHARITIES-SORP-2026','SOFA','SOFA.SUPPORT_COSTS','Support costs',40,ARRAY['EXP.ADMIN','EXP.DEPRECIATION']),
  ('CHARITIES-SORP-2026','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('CHARITIES-SORP-2026','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('CHARITIES-SORP-2026','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('CHARITIES-SORP-2026','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER']),
  ('ACADEMIES-2025-26','SOFA','SOFA.DONATIONS','Donations and legacies',10,ARRAY['REV.DONATIONS']),
  ('ACADEMIES-2025-26','SOFA','SOFA.CHARITABLE_INCOME','Income from charitable activities',20,ARRAY['REV.TRADING']),
  ('ACADEMIES-2025-26','SOFA','SOFA.CHARITABLE_EXPENDITURE','Expenditure on charitable activities',30,ARRAY['EXP.DIRECT','EXP.STAFF']),
  ('ACADEMIES-2025-26','SOFA','SOFA.SUPPORT_COSTS','Support costs',40,ARRAY['EXP.ADMIN','EXP.DEPRECIATION']),
  ('ACADEMIES-2025-26','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('ACADEMIES-2025-26','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('ACADEMIES-2025-26','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('ACADEMIES-2025-26','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER']),
  ('LLP-SORP-2026','PROFIT_AND_LOSS','PL.REVENUE','Turnover',10,ARRAY['REV.TRADING']),
  ('LLP-SORP-2026','PROFIT_AND_LOSS','PL.COST_OF_SALES','Cost of sales',20,ARRAY['EXP.DIRECT']),
  ('LLP-SORP-2026','PROFIT_AND_LOSS','PL.ADMIN','Administrative expenses',30,ARRAY['EXP.ADMIN','EXP.STAFF','EXP.DEPRECIATION']),
  ('LLP-SORP-2026','BALANCE_SHEET','BS.FIXED_ASSETS','Tangible fixed assets',10,ARRAY['ASSET.FIXED.TANGIBLE']),
  ('LLP-SORP-2026','BALANCE_SHEET','BS.RECEIVABLES','Debtors',20,ARRAY['ASSET.RECEIVABLES.TRADE','ASSET.RECEIVABLES.OTHER']),
  ('LLP-SORP-2026','BALANCE_SHEET','BS.CASH','Cash at bank and in hand',30,ARRAY['ASSET.CASH']),
  ('LLP-SORP-2026','BALANCE_SHEET','BS.PAYABLES','Creditors',40,ARRAY['LIABILITY.PAYABLES.TRADE','LIABILITY.PAYABLES.OTHER'])
) AS v(pack_code,statement_code,line_code,caption,display_order,canonical_codes)
JOIN reporting_framework_pack p ON p.pack_code=v.pack_code AND p.version_no=1
JOIN statement_definition s ON s.framework_pack_id=p.id AND s.statement_code=v.statement_code;

INSERT INTO disclosure_rule(
  framework_pack_id,disclosure_code,requirement_level,applicability,effective_from,effective_to,
  provenance_label,source_reference
)
SELECT p.id,v.disclosure_code,'REQUIRED','{}'::jsonb,p.effective_from,p.effective_to,
  'REPOSITORY_BASELINE',
  jsonb_build_object('repository_path','packages/reporting/src/packs.ts','pack_id',v.pack_code,'required_disclosure',v.disclosure_code)
FROM (VALUES
  ('FRS102-2026','ACCOUNTING_POLICIES'),('FRS102-2026','TURNOVER'),('FRS102-2026','EMPLOYEES'),
  ('FRS102-2026','FIXED_ASSETS'),('FRS102-2026','DEBTORS'),('FRS102-2026','CREDITORS'),('FRS102-2026','RELATED_PARTIES'),
  ('FRS102-1A-2026','ACCOUNTING_POLICIES'),('FRS102-1A-2026','FIXED_ASSETS'),('FRS102-1A-2026','DEBTORS'),
  ('FRS102-1A-2026','CREDITORS'),('FRS102-1A-2026','RELATED_PARTIES'),
  ('FRS105-2026','ADVANCES_AND_CREDITS'),('FRS105-2026','FINANCIAL_COMMITMENTS'),
  ('CHARITIES-SORP-2026','CHARITY_INFORMATION'),('CHARITIES-SORP-2026','TRUSTEES_REPORT'),
  ('CHARITIES-SORP-2026','ACCOUNTING_POLICIES'),('CHARITIES-SORP-2026','FUND_ANALYSIS'),
  ('CHARITIES-SORP-2026','STAFF_COSTS'),('CHARITIES-SORP-2026','TRUSTEE_REMUNERATION'),
  ('CHARITIES-SORP-2026','RELATED_PARTIES'),('CHARITIES-SORP-2026','PUBLIC_BENEFIT'),
  ('CHARITIES-SORP-2026','RESERVES_POLICY'),
  ('ACADEMIES-2025-26','TRUSTEES_REPORT'),('ACADEMIES-2025-26','GOVERNANCE_STATEMENT'),
  ('ACADEMIES-2025-26','REGULARITY_STATEMENT'),('ACADEMIES-2025-26','TRUSTEE_RESPONSIBILITIES'),
  ('ACADEMIES-2025-26','FUND_ANALYSIS'),('ACADEMIES-2025-26','GOVERNMENT_GRANTS'),
  ('ACADEMIES-2025-26','PENSIONS'),('ACADEMIES-2025-26','EXECUTIVE_PAY'),
  ('ACADEMIES-2025-26','RELATED_PARTIES'),('ACADEMIES-2025-26','CENTRAL_SERVICES'),
  ('LLP-SORP-2026','ACCOUNTING_POLICIES'),('LLP-SORP-2026','MEMBERS_INTERESTS'),
  ('LLP-SORP-2026','MEMBERS_REMUNERATION'),('LLP-SORP-2026','PROFIT_DIVISION'),
  ('LLP-SORP-2026','LOANS_TO_MEMBERS'),('LLP-SORP-2026','DESIGNATED_MEMBERS')
) AS v(pack_code,disclosure_code)
JOIN reporting_framework_pack p ON p.pack_code=v.pack_code AND p.version_no=1;

-- Taxonomy mappings are intentionally unseeded because packs.ts contains no
-- taxonomy concept identifiers. A later sourced pack version can add them.

ALTER TABLE reporting_framework_pack ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_framework_pack FORCE ROW LEVEL SECURITY;
CREATE POLICY reporting_framework_pack_authenticated_actor ON reporting_framework_pack FOR SELECT TO accounts_app
  USING(EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY reporting_framework_pack_migration_owner ON reporting_framework_pack TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE statement_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY statement_definition_authenticated_actor ON statement_definition FOR SELECT TO accounts_app
  USING(EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY statement_definition_migration_owner ON statement_definition TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE statement_definition_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_definition_line FORCE ROW LEVEL SECURITY;
CREATE POLICY statement_definition_line_authenticated_actor ON statement_definition_line FOR SELECT TO accounts_app
  USING(EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY statement_definition_line_migration_owner ON statement_definition_line TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE disclosure_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosure_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY disclosure_rule_authenticated_actor ON disclosure_rule FOR SELECT TO accounts_app
  USING(EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY disclosure_rule_migration_owner ON disclosure_rule TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE taxonomy_concept_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_concept_mapping FORCE ROW LEVEL SECURITY;
CREATE POLICY taxonomy_concept_mapping_authenticated_actor ON taxonomy_concept_mapping FOR SELECT TO accounts_app
  USING(EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY taxonomy_concept_mapping_migration_owner ON taxonomy_concept_mapping TO neondb_owner USING(true) WITH CHECK(true);

GRANT SELECT ON reporting_framework_pack,statement_definition,statement_definition_line,
  disclosure_rule,taxonomy_concept_mapping TO accounts_app;

-- This function is intentionally owner-only. It creates exactly one workspace
-- and exactly one OWNER membership for a verified Neon Auth subject atomically.
CREATE FUNCTION admin_provision_workspace(p_tenant_id uuid,p_name text,p_actor_id text)
RETURNS uuid LANGUAGE sql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH new_tenant AS (INSERT INTO public.tenant(id,name) VALUES(p_tenant_id,btrim(p_name)) RETURNING id), new_member AS (INSERT INTO public.tenant_member(tenant_id,actor_id,role_code) SELECT id,btrim(p_actor_id),''OWNER'' FROM new_tenant RETURNING tenant_id) SELECT tenant_id FROM new_member';
REVOKE ALL ON FUNCTION admin_provision_workspace(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_provision_workspace(uuid,text,text) FROM accounts_app;
GRANT EXECUTE ON FUNCTION admin_provision_workspace(uuid,text,text) TO neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0008','versioned reporting framework content and trusted workspace provisioning')
ON CONFLICT(version) DO NOTHING;

COMMIT;
