BEGIN;

ALTER TABLE working_paper_template
  ADD COLUMN service_family text NOT NULL DEFAULT 'ACCOUNTS_PRODUCTION',
  ADD COLUMN applicability_layer text NOT NULL DEFAULT 'CORE';

ALTER TABLE working_paper_template
  ADD CONSTRAINT working_paper_template_service_family_ck
    CHECK(service_family IN ('ACCOUNTS_PRODUCTION','LEGACY_RETIRED')),
  ADD CONSTRAINT working_paper_template_applicability_layer_ck
    CHECK(applicability_layer IN ('CORE','FRAMEWORK','SECTOR','ENTITY_FORM'));

UPDATE working_paper_template
SET applicability_layer='SECTOR'
WHERE status='ACTIVE' AND cardinality(sector_codes)>0;

ALTER TABLE working_paper_template
  ADD CONSTRAINT working_paper_template_layer_profile_ck CHECK(
    (applicability_layer='CORE' AND cardinality(legal_forms)=0 AND cardinality(framework_codes)=0 AND cardinality(sector_codes)=0)
    OR (applicability_layer='FRAMEWORK' AND cardinality(legal_forms)=0 AND cardinality(framework_codes)>0 AND cardinality(sector_codes)=0)
    OR (applicability_layer='SECTOR' AND cardinality(legal_forms)=0 AND cardinality(framework_codes)=0 AND cardinality(sector_codes)>0)
    OR (applicability_layer='ENTITY_FORM' AND cardinality(legal_forms)>0 AND cardinality(framework_codes)=0 AND cardinality(sector_codes)=0)
  );

-- These repository-baseline versions contain audit or assurance concepts, or
-- assurance-style wording. Retain them for historical deployed-paper lineage,
-- but remove them from every selectable and deployable catalogue.
UPDATE working_paper_template
SET status='RETIRED',
    service_family='LEGACY_RETIRED',
    governance_status='RETIRED',
    reviewed_by='SYSTEM_PRODUCT_REVIEW',
    reviewed_at=now(),
    approved_by='SYSTEM_PRODUCT_APPROVAL',
    approved_at=now(),
    approval_evidence=jsonb_build_object(
      'decision','RETIRED_FROM_ACCOUNTS_PRODUCTION',
      'reason','Audit and assurance content is outside the accounts-production service family',
      'migration','0027'
    ),
    effective_from=coalesce(effective_from,date '2000-01-01')
WHERE version=1
  AND template_code IN ('A01','A02','B01','B02','B03','C04','E02','F01','H08','J02','J03','J04','J05');

WITH corrected(template_code,category_code,sequence_no,title,objective,legal_forms,framework_codes,sector_codes,required_by_default,layer) AS (
  VALUES
  ('A01','ACCEPTANCE',10,'Engagement setup and responsibilities','Record the client identity, reporting period, reporting framework, deliverables, information responsibilities, timetable and approval authority.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('A02','ACCEPTANCE',20,'Client information authority and access','Record authorised client contacts, information providers, approval authority and secure access arrangements for accounts production.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('B01','PLANNING',40,'Entity and reporting profile','Document the legal form, activities, ownership or governance, reporting regime, accounting policies and source-data environment.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('B02','PLANNING',50,'Information requirements and dependencies','List required source records, responsible providers, due dates, dependencies and unresolved information gaps.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('B03','PLANNING',60,'Significant balances and judgements','Identify balances, transactions, estimates and judgements requiring focused preparation, evidence and review.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('C04','RECORDS',110,'Accounting estimates schedule','Record each estimate, its accounting basis, inputs, calculation, client judgement, resulting entry and disclosure.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('E02','EXPENDITURE',150,'Payroll control and reconciliation','Agree payroll totals to the ledger and control accounts and document tax, pension and year-end payroll liabilities.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('F01','ASSETS',170,'Bank and cash reconciliation','Agree each bank and cash ledger balance to the relevant statement or cash record and resolve reconciling items.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('H08','REPORTING',310,'Public benefit and activities report source schedule','Assemble trustee-approved source information for public benefit, objectives, activities, achievements and performance, with cross-references to the report.',ARRAY[]::text[],ARRAY[]::text[],ARRAY['CHARITIES_SORP_2026'],true,'SECTOR'),
  ('J02','COMPLETION',370,'Subsequent events confirmation','Record client confirmation of events through the accounts approval date and document any accounting or disclosure effect.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('J03','COMPLETION',380,'Related parties and statutory compliance disclosures','Record client declarations, related-party balances and transactions, and legal or regulatory matters that affect the accounts or statutory reports.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('J04','COMPLETION',390,'Final accounts consistency review','Compare the draft accounts with the final ledger and prior period, explain significant changes, and cross-check statements, notes and statutory reports.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('J05','COMPLETION',400,'Client information confirmation and accounts approval','Record the responsible client approver''s confirmation that information supplied is complete and document formal approval of the accounts.',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],true,'CORE'),
  ('K01','REPORTING',341,'FRS 101 reporting framework schedule','Document the FRS 101 recognition, measurement, presentation and disclosure decisions applicable to this accounts set.',ARRAY[]::text[],ARRAY['FRS_101'],ARRAY[]::text[],true,'FRAMEWORK'),
  ('K02','REPORTING',342,'FRS 102 reporting framework schedule','Document the FRS 102 recognition, measurement, presentation and disclosure decisions applicable to this accounts set.',ARRAY[]::text[],ARRAY['FRS_102'],ARRAY[]::text[],true,'FRAMEWORK'),
  ('K03','REPORTING',343,'FRS 102 Section 1A schedule','Document the small-entity presentation, disclosure and true-and-fair considerations applicable under FRS 102 Section 1A.',ARRAY[]::text[],ARRAY['FRS_102_1A'],ARRAY[]::text[],true,'FRAMEWORK'),
  ('K04','REPORTING',344,'FRS 105 micro-entity schedule','Document the micro-entity eligibility, prescribed formats, accounting treatments and minimum disclosures under FRS 105.',ARRAY[]::text[],ARRAY['FRS_105'],ARRAY[]::text[],true,'FRAMEWORK'),
  ('L01','REPORTING',351,'Company statutory information and approvals','Complete the company information, directors'' responsibilities, approval statements, signatures and filing presentation.',ARRAY['PRIVATE_LIMITED_COMPANY','PUBLIC_LIMITED_COMPANY','CHARITABLE_COMPANY','COMMUNITY_INTEREST_COMPANY'],ARRAY[]::text[],ARRAY[]::text[],true,'ENTITY_FORM'),
  ('L02','REPORTING',352,'LLP statutory information and approvals','Complete the LLP information, designated members'' responsibilities, approval statements, signatures and filing presentation.',ARRAY['LIMITED_LIABILITY_PARTNERSHIP'],ARRAY[]::text[],ARRAY[]::text[],true,'ENTITY_FORM'),
  ('L03','REPORTING',353,'Non-company charity statutory information and approvals','Complete the charity registration, trustees'' responsibilities, approval statements, signatures and filing presentation for the charity''s legal form.',ARRAY['CHARITABLE_INCORPORATED_ORGANISATION','CHARITABLE_TRUST'],ARRAY[]::text[],ARRAY[]::text[],true,'ENTITY_FORM'),
  ('L04','REPORTING',354,'Unincorporated entity information and approvals','Complete the proprietor or partner information, responsibilities, approval statements, signatures and applicable presentation.',ARRAY['LIMITED_PARTNERSHIP','GENERAL_PARTNERSHIP','SOLE_TRADER','OTHER'],ARRAY[]::text[],ARRAY[]::text[],true,'ENTITY_FORM'),
  ('M01','REPORTING',355,'Academies Accounts Direction schedule','Complete the academy-specific governance, regularity, funding, pension, related-party and statutory reporting schedules.',ARRAY[]::text[],ARRAY[]::text[],ARRAY['ACADEMIES_2026'],true,'SECTOR'),
  ('M02','REPORTING',356,'LLP SORP presentation schedule','Complete the LLP SORP classification, members'' interests, allocation, remuneration and disclosure schedules.',ARRAY[]::text[],ARRAY[]::text[],ARRAY['LLP_SORP_2026'],true,'SECTOR')
)
INSERT INTO working_paper_template(
  template_code,version,category_code,sequence_no,title,objective,default_content,
  legal_forms,framework_codes,sector_codes,required_by_default,status,
  provenance_label,content_hash,source_reference,governance_status,
  reviewed_by,reviewed_at,approved_by,approved_at,approval_evidence,
  effective_from,supersedes_version,service_family,applicability_layer
)
SELECT template_code,
       CASE WHEN template_code IN ('K01','K02','K03','K04','L01','L02','L03','L04','M01','M02') THEN 1 ELSE 2 END,
       category_code,sequence_no,title,objective,
       jsonb_build_object('procedures',jsonb_build_array(objective,'Cross-reference the supporting records and document the conclusion.'),'findings','','conclusion',''),
       legal_forms,framework_codes,sector_codes,required_by_default,'ACTIVE',
       'GOVERNED_ACCOUNTS_PRODUCTION',repeat('0',64),
       'repository:packages/database/migrations/0027_accounts_production_working_paper_family.sql#'||template_code,
       'APPROVED','SYSTEM_PRODUCT_REVIEW',now(),'SYSTEM_PRODUCT_APPROVAL',now(),
       jsonb_build_object('decision','APPROVED_FOR_ACCOUNTS_PRODUCTION','service_family','ACCOUNTS_PRODUCTION','migration','0027'),
       date '2000-01-01',
       CASE WHEN template_code IN ('K01','K02','K03','K04','L01','L02','L03','L04','M01','M02') THEN NULL ELSE 1 END,
       'ACCOUNTS_PRODUCTION',layer
FROM corrected;

UPDATE working_paper_template
SET content_hash=encode(digest(jsonb_build_object(
      'templateCode',template_code,'version',version,'categoryCode',category_code,
      'sequenceNo',sequence_no,'title',title,'objective',objective,'guidance',guidance,
      'defaultContent',default_content,'legalForms',to_jsonb(legal_forms),
      'frameworkCodes',to_jsonb(framework_codes),'sectorCodes',to_jsonb(sector_codes),
      'requiredByDefault',required_by_default,'serviceFamily',service_family,
      'applicabilityLayer',applicability_layer,'provenanceLabel',provenance_label
    )::text::bytea,'sha256'),'hex')
WHERE source_reference LIKE 'repository:packages/database/migrations/0027_%';

INSERT INTO working_paper_template_theme(template_code,template_version,theme_code,is_primary) VALUES
('C04',2,'ACCOUNTING_ESTIMATES',true),
('F01',2,'COMPLETENESS',true),
('H08',2,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('J02',2,'SUBSEQUENT_EVENTS',true),
('J03',2,'RELATED_PARTIES',true),
('J04',2,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('K01',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('K02',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('K03',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('K04',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('L01',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('L02',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('L03',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('L04',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('M01',1,'FINANCIAL_STATEMENT_DISCLOSURE',true),
('M02',1,'FINANCIAL_STATEMENT_DISCLOSURE',true);

-- Audit-only catalogue concepts are retained for existing historical links but
-- are not offered for new accounts-production work.
UPDATE working_paper_theme
SET status='RETIRED'
WHERE theme_code IN ('FRAUD','INTERNAL_CONTROLS');

INSERT INTO schema_migration(version,description)
VALUES('0027','governed layered accounts-production working-paper family and controlled retirement of assurance content')
ON CONFLICT(version) DO NOTHING;

COMMIT;
