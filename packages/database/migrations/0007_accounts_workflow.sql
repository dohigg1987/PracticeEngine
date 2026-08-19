BEGIN;

ALTER TABLE trial_balance
  ADD CONSTRAINT trial_balance_tenant_engagement_id_uq UNIQUE(tenant_id,engagement_id,id);

CREATE TABLE journal(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  journal_no integer NOT NULL,
  journal_type text NOT NULL CHECK(journal_type IN ('ADJUSTING','RECLASSIFICATION','CONSOLIDATION','ELIMINATION','DISCLOSURE_ONLY','PRIOR_PERIOD','AUDIT','CLIENT_POSTED')),
  description text NOT NULL CHECK(btrim(description) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PREPARED','APPROVED','POSTED','VOIDED')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  prepared_by text NOT NULL CHECK(btrim(prepared_by) <> ''),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,engagement_id,id),
  UNIQUE(engagement_id,journal_no,version),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK((status IN ('APPROVED','POSTED') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status NOT IN ('APPROVED','POSTED')),
  CHECK((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK(approved_by IS NULL OR approved_by <> prepared_by)
);

CREATE TABLE journal_line(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no > 0),
  canonical_account_id uuid NOT NULL REFERENCES canonical_account(id),
  debit numeric(30,2) NOT NULL DEFAULT 0 CHECK(debit >= 0),
  credit numeric(30,2) NOT NULL DEFAULT 0 CHECK(credit >= 0),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(dimensions)='object'),
  narrative text,
  UNIQUE(journal_id,line_no),
  FOREIGN KEY(tenant_id,journal_id) REFERENCES journal(tenant_id,id),
  CHECK((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK(debit <> 'NaN'::numeric AND credit <> 'NaN'::numeric)
);

CREATE TABLE reconciliation(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  trial_balance_id uuid,
  reconciliation_type text NOT NULL CHECK(reconciliation_type IN ('BANK','DEBTORS','CREDITORS','VAT','PAYROLL','FIXED_ASSETS','LOANS','PENSIONS','INTERCOMPANY','FUNDS','OTHER')),
  title text NOT NULL CHECK(btrim(title) <> ''),
  ledger_balance numeric(30,2) NOT NULL DEFAULT 0,
  supporting_balance numeric(30,2) NOT NULL DEFAULT 0,
  tolerance numeric(30,2) NOT NULL DEFAULT 0 CHECK(tolerance >= 0),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','RECONCILED','EXCEPTION','REVIEWED')),
  prepared_by text,
  prepared_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,trial_balance_id) REFERENCES trial_balance(tenant_id,engagement_id,id),
  CHECK(reviewed_by IS NULL OR (prepared_by IS NOT NULL AND reviewed_by <> prepared_by)),
  CHECK((prepared_by IS NULL) = (prepared_at IS NULL)),
  CHECK((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK(status <> 'REVIEWED' OR reviewed_by IS NOT NULL),
  CHECK(ledger_balance <> 'NaN'::numeric AND supporting_balance <> 'NaN'::numeric AND tolerance <> 'NaN'::numeric)
);

CREATE TABLE working_paper(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  code text NOT NULL CHECK(btrim(code) <> ''),
  title text NOT NULL CHECK(btrim(title) <> ''),
  report_line_id uuid REFERENCES canonical_report_line(id),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','PREPARED','REVIEWED','SUPERSEDED')),
  current_version integer NOT NULL DEFAULT 1 CHECK(current_version > 0),
  prepared_by text,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(engagement_id,code),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK(reviewed_by IS NULL OR (prepared_by IS NOT NULL AND reviewed_by <> prepared_by)),
  CHECK(status NOT IN ('PREPARED','REVIEWED') OR prepared_by IS NOT NULL),
  CHECK(status <> 'REVIEWED' OR reviewed_by IS NOT NULL)
);

CREATE TABLE working_paper_version(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  working_paper_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(content)='object'),
  content_hash text NOT NULL CHECK(btrim(content_hash) <> ''),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(working_paper_id,version),
  FOREIGN KEY(tenant_id,working_paper_id) REFERENCES working_paper(tenant_id,id)
);

CREATE TABLE workflow_task(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL CHECK(btrim(title) <> ''),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','BLOCKED','COMPLETE','CANCELLED')),
  blocking boolean NOT NULL DEFAULT false,
  assigned_to text,
  due_at timestamptz,
  completed_by text,
  completed_at timestamptz,
  dependency_type text,
  dependency_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK((status='COMPLETE') = (completed_by IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK((completed_by IS NULL) = (completed_at IS NULL))
);

CREATE TABLE review_point(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  raised_by text NOT NULL,
  assigned_to text,
  severity text NOT NULL DEFAULT 'NORMAL' CHECK(severity IN ('NORMAL','BLOCKING')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESPONDED','CLEARED','REOPENED')),
  question text NOT NULL CHECK(btrim(question) <> ''),
  response text,
  cleared_by text,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK((status='CLEARED') = (cleared_by IS NOT NULL AND cleared_at IS NOT NULL)),
  CHECK((cleared_by IS NULL) = (cleared_at IS NULL)),
  CHECK(status NOT IN ('RESPONDED','CLEARED') OR btrim(coalesce(response,'')) <> '')
);

CREATE TABLE disclosure(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  disclosure_code text NOT NULL,
  applicability text NOT NULL DEFAULT 'UNASSESSED' CHECK(applicability IN ('UNASSESSED','REQUIRED','RECOMMENDED','NOT_APPLICABLE','PROHIBITED')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETE','REVIEWED','SUPERSEDED')),
  current_version integer NOT NULL DEFAULT 1 CHECK(current_version > 0),
  rule_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(engagement_id,disclosure_code),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id)
);

CREATE TABLE disclosure_version(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  disclosure_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  answer jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answer)='object'),
  content_hash text NOT NULL CHECK(btrim(content_hash) <> ''),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(disclosure_id,version),
  FOREIGN KEY(tenant_id,disclosure_id) REFERENCES disclosure(tenant_id,id)
);

CREATE TABLE accounts_version(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','APPROVED','FINAL','FILED','SUPERSEDED')),
  trial_balance_id uuid NOT NULL,
  framework_pack_id text NOT NULL,
  content_manifest jsonb NOT NULL CHECK(jsonb_typeof(content_manifest)='object'),
  content_hash text NOT NULL CHECK(btrim(content_hash) <> ''),
  html_storage_key text,
  pdf_storage_key text,
  ixbrl_storage_key text,
  generated_by text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  frozen_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,engagement_id,id),
  UNIQUE(engagement_id,version),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,trial_balance_id) REFERENCES trial_balance(tenant_id,engagement_id,id),
  CHECK((status IN ('APPROVED','FINAL','FILED') AND frozen_at IS NOT NULL) OR status NOT IN ('APPROVED','FINAL','FILED'))
);

CREATE TABLE signoff(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  object_version integer NOT NULL CHECK(object_version > 0),
  signoff_type text NOT NULL CHECK(signoff_type IN ('PREPARED','REVIEWED','CLIENT_APPROVED','PARTNER_APPROVED','FILING_AUTHORISED')),
  signed_by text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  dependency_manifest jsonb NOT NULL CHECK(jsonb_typeof(dependency_manifest)='object'),
  signature_hash text NOT NULL CHECK(btrim(signature_hash) <> ''),
  invalidated_at timestamptz,
  invalidation_reason text,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  UNIQUE(engagement_id,object_type,object_id,object_version,signoff_type,signed_by)
);

CREATE TABLE filing_attempt(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  accounts_version_id uuid NOT NULL,
  regulator text NOT NULL CHECK(regulator IN ('COMPANIES_HOUSE','HMRC','CCEW','OSCR','CCNI','DFE')),
  attempt_no integer NOT NULL CHECK(attempt_no > 0),
  status text NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','SUBMITTED','ACCEPTED','REJECTED','FAILED','WITHDRAWN')),
  payload_storage_key text NOT NULL,
  payload_hash text NOT NULL CHECK(btrim(payload_hash) <> ''),
  response_storage_key text,
  regulator_reference text,
  submitted_by text,
  submitted_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,accounts_version_id) REFERENCES accounts_version(tenant_id,engagement_id,id),
  UNIQUE(engagement_id,regulator,attempt_no),
  CHECK((submitted_by IS NULL) = (submitted_at IS NULL)),
  CHECK(status NOT IN ('SUBMITTED','ACCEPTED','REJECTED') OR submitted_by IS NOT NULL),
  CHECK(status NOT IN ('ACCEPTED','REJECTED') OR responded_at IS NOT NULL)
);

CREATE INDEX journal_engagement_status_idx ON journal(tenant_id,engagement_id,status,journal_no);
CREATE INDEX reconciliation_engagement_status_idx ON reconciliation(tenant_id,engagement_id,status);
CREATE INDEX workflow_task_engagement_status_idx ON workflow_task(tenant_id,engagement_id,status,due_at);
CREATE INDEX review_point_engagement_status_idx ON review_point(tenant_id,engagement_id,status,severity);
CREATE INDEX accounts_version_engagement_idx ON accounts_version(tenant_id,engagement_id,version DESC);
CREATE INDEX filing_attempt_engagement_idx ON filing_attempt(tenant_id,engagement_id,regulator,attempt_no DESC);

-- The SQL function bodies contain one statement and no internal delimiter, so
-- they remain safe for the Neon migration statement parser.
CREATE FUNCTION journal_is_balanced(p_tenant_id uuid,p_journal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public
AS 'SELECT EXISTS(SELECT 1 FROM public.journal_line jl WHERE jl.tenant_id=p_tenant_id AND jl.journal_id=p_journal_id) AND (SELECT coalesce(sum(jl.debit),0)=coalesce(sum(jl.credit),0) FROM public.journal_line jl WHERE jl.tenant_id=p_tenant_id AND jl.journal_id=p_journal_id)';
CREATE FUNCTION journal_accepts_lines(p_tenant_id uuid,p_journal_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,public
AS 'SELECT EXISTS(SELECT 1 FROM public.journal j WHERE j.tenant_id=p_tenant_id AND j.id=p_journal_id AND j.status<>''POSTED'' FOR UPDATE)';
REVOKE ALL ON FUNCTION journal_is_balanced(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION journal_accepts_lines(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION journal_is_balanced(uuid,uuid),journal_accepts_lines(uuid,uuid) TO accounts_app,neondb_owner;
ALTER TABLE journal ADD CONSTRAINT journal_posting_balanced_ck
  CHECK(status<>'POSTED' OR journal_is_balanced(tenant_id,id));

-- Every new business table is forced through tenant RLS for accounts_app. The
-- Neon migration owner has an explicit unrestricted policy and also BYPASSRLS.
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_tenant_actor ON journal TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY journal_migration_owner ON journal TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE journal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_line FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_line_select ON journal_line FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY journal_line_insert ON journal_line FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')) AND journal_accepts_lines(tenant_id,journal_id));
CREATE POLICY journal_line_update ON journal_line FOR UPDATE TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')) AND journal_accepts_lines(tenant_id,journal_id))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=journal_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')) AND journal_accepts_lines(tenant_id,journal_id));
CREATE POLICY journal_line_migration_owner ON journal_line TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation FORCE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_tenant_actor ON reconciliation TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=reconciliation.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=reconciliation.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY reconciliation_migration_owner ON reconciliation TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE working_paper ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper FORCE ROW LEVEL SECURITY;
CREATE POLICY working_paper_tenant_actor ON working_paper TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=working_paper.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=working_paper.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_migration_owner ON working_paper TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE working_paper_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_version FORCE ROW LEVEL SECURITY;
CREATE POLICY working_paper_version_select ON working_paper_version FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=working_paper_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_version_insert ON working_paper_version FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=working_paper_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY working_paper_version_migration_owner ON working_paper_version TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE workflow_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_task FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_task_tenant_actor ON workflow_task TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=workflow_task.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=workflow_task.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY workflow_task_migration_owner ON workflow_task TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE review_point ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_point FORCE ROW LEVEL SECURITY;
CREATE POLICY review_point_tenant_actor ON review_point TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=review_point.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=review_point.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY review_point_migration_owner ON review_point TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosure FORCE ROW LEVEL SECURITY;
CREATE POLICY disclosure_tenant_actor ON disclosure TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=disclosure.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=disclosure.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY disclosure_migration_owner ON disclosure TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE disclosure_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosure_version FORCE ROW LEVEL SECURITY;
CREATE POLICY disclosure_version_select ON disclosure_version FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=disclosure_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY disclosure_version_insert ON disclosure_version FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=disclosure_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY disclosure_version_migration_owner ON disclosure_version TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE accounts_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_version FORCE ROW LEVEL SECURITY;
CREATE POLICY accounts_version_select ON accounts_version FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=accounts_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY accounts_version_insert ON accounts_version FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=accounts_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY accounts_version_update ON accounts_version FOR UPDATE TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=accounts_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=accounts_version.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY accounts_version_migration_owner ON accounts_version TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE signoff ENABLE ROW LEVEL SECURITY;
ALTER TABLE signoff FORCE ROW LEVEL SECURITY;
CREATE POLICY signoff_select ON signoff FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=signoff.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY signoff_insert ON signoff FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=signoff.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY signoff_update ON signoff FOR UPDATE TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=signoff.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=signoff.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY signoff_migration_owner ON signoff TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE filing_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE filing_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY filing_attempt_select ON filing_attempt FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=filing_attempt.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY filing_attempt_insert ON filing_attempt FOR INSERT TO accounts_app
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=filing_attempt.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY filing_attempt_update ON filing_attempt FOR UPDATE TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=filing_attempt.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=filing_attempt.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY filing_attempt_migration_owner ON filing_attempt TO neondb_owner USING(true) WITH CHECK(true);

GRANT SELECT,INSERT ON journal,journal_line,reconciliation,working_paper,working_paper_version,
  workflow_task,review_point,disclosure,disclosure_version,accounts_version,signoff,filing_attempt TO accounts_app;
GRANT UPDATE ON journal,reconciliation,working_paper,workflow_task,review_point,disclosure TO accounts_app;
GRANT UPDATE(line_no,canonical_account_id,debit,credit,dimensions,narrative) ON journal_line TO accounts_app;
GRANT UPDATE(status,html_storage_key,pdf_storage_key,ixbrl_storage_key,frozen_at) ON accounts_version TO accounts_app;
GRANT UPDATE(invalidated_at,invalidation_reason) ON signoff TO accounts_app;
GRANT UPDATE(status,response_storage_key,regulator_reference,submitted_by,submitted_at,responded_at) ON filing_attempt TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0007','journals, working papers, workflow, disclosures, accounts versions and filing evidence')
ON CONFLICT(version) DO NOTHING;

COMMIT;
