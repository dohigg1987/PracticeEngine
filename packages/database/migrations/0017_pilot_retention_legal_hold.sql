BEGIN;

CREATE TABLE retention_policy(
  policy_code text NOT NULL,
  version_no integer NOT NULL CHECK(version_no > 0),
  data_class text NOT NULL CHECK(data_class IN (
    'ACCOUNTING_EVIDENCE','TENANT_OPERATIONS','INVITATION',
    'OUTBOX_DELIVERED','APPLICATION_LOG','SECURITY_AUDIT','R2_ORPHAN'
  )),
  clock_basis text NOT NULL CHECK(clock_basis IN (
    'PERIOD_OR_ENGAGEMENT_CLOSE','CONTRACT_END','TERMINAL_STATE',
    'PUBLISHED_AT','EVENT_AT','DETECTION_AT'
  )),
  retention_period interval NOT NULL CHECK(retention_period > interval '0 seconds'),
  disposition text NOT NULL CHECK(disposition IN ('PURGE','ANONYMISE_OR_PURGE','REVIEW_THEN_PURGE')),
  authority_reference text NOT NULL CHECK(btrim(authority_reference) <> ''),
  effective_from date NOT NULL,
  effective_to date,
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(policy_code,version_no),
  UNIQUE(policy_code,version_no,retention_period),
  CHECK(effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE retention_scope(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  engagement_id uuid,
  policy_code text NOT NULL,
  policy_version_no integer NOT NULL,
  retention_period interval NOT NULL,
  clock_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  clock_evidence jsonb NOT NULL CHECK(jsonb_typeof(clock_evidence)='object'),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(policy_code,policy_version_no,retention_period)
    REFERENCES retention_policy(policy_code,version_no,retention_period),
  CHECK(retention_until=clock_at+retention_period)
);

CREATE TABLE legal_hold(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  engagement_id uuid,
  hold_reference text NOT NULL CHECK(btrim(hold_reference) <> ''),
  reason text NOT NULL CHECK(btrim(reason) <> ''),
  imposed_by text NOT NULL CHECK(btrim(imposed_by) <> ''),
  imposed_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,hold_reference),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id)
);

CREATE TABLE legal_hold_release(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  legal_hold_id uuid NOT NULL,
  released_by text NOT NULL CHECK(btrim(released_by) <> ''),
  released_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK(btrim(reason) <> ''),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  UNIQUE(legal_hold_id),
  FOREIGN KEY(tenant_id,legal_hold_id) REFERENCES legal_hold(tenant_id,id)
);

CREATE FUNCTION retention_scope_is_eligible(p_scope_id uuid)
RETURNS boolean LANGUAGE SQL STABLE
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(
  SELECT 1
  FROM public.retention_scope s
  WHERE s.id=p_scope_id
    AND s.retention_until<=statement_timestamp()
    AND NOT EXISTS(
      SELECT 1
      FROM public.legal_hold h
      WHERE h.tenant_id=s.tenant_id
        AND (h.engagement_id IS NULL OR h.engagement_id=s.engagement_id)
        AND NOT EXISTS(
          SELECT 1 FROM public.legal_hold_release r WHERE r.legal_hold_id=h.id
        )
    )
)';

CREATE TABLE retention_purge_candidate(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  retention_scope_id uuid NOT NULL,
  cutoff_at timestamptz NOT NULL,
  database_inventory jsonb NOT NULL
    CHECK(jsonb_typeof(database_inventory)='object')
    CHECK(database_inventory @> '{"contractVersion":1,"queryComplete":true}'::jsonb),
  r2_inventory jsonb NOT NULL
    CHECK(jsonb_typeof(r2_inventory)='object')
    CHECK(r2_inventory @> '{"contractVersion":1,"continuationComplete":true}'::jsonb),
  inventory_checksum text NOT NULL CHECK(inventory_checksum ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(retention_scope_id,inventory_checksum),
  FOREIGN KEY(tenant_id,retention_scope_id) REFERENCES retention_scope(tenant_id,id),
  CHECK(cutoff_at<=created_at),
  CONSTRAINT retention_purge_candidate_eligible_ck
    CHECK(retention_scope_is_eligible(retention_scope_id))
);

CREATE FUNCTION retention_candidate_is_approvable(p_candidate_id uuid)
RETURNS boolean LANGUAGE SQL STABLE
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(
  SELECT 1
  FROM public.retention_purge_candidate c
  WHERE c.id=p_candidate_id
    AND public.retention_scope_is_eligible(c.retention_scope_id)
)';

CREATE TABLE retention_candidate_decision(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('APPROVED','CANCELLED')),
  decided_by text NOT NULL CHECK(btrim(decided_by) <> ''),
  decided_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK(btrim(reason) <> ''),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  UNIQUE(candidate_id),
  FOREIGN KEY(tenant_id,candidate_id) REFERENCES retention_purge_candidate(tenant_id,id),
  CONSTRAINT retention_candidate_approval_eligible_ck
    CHECK(decision<>'APPROVED' OR retention_candidate_is_approvable(candidate_id))
);

CREATE RULE retention_policy_no_update AS
  ON UPDATE TO retention_policy DO INSTEAD NOTHING;
CREATE RULE retention_policy_no_delete AS
  ON DELETE TO retention_policy DO INSTEAD NOTHING;
CREATE RULE retention_scope_no_update AS
  ON UPDATE TO retention_scope DO INSTEAD NOTHING;
CREATE RULE retention_scope_no_delete AS
  ON DELETE TO retention_scope DO INSTEAD NOTHING;
CREATE RULE legal_hold_no_update AS
  ON UPDATE TO legal_hold DO INSTEAD NOTHING;
CREATE RULE legal_hold_no_delete AS
  ON DELETE TO legal_hold DO INSTEAD NOTHING;
CREATE RULE legal_hold_release_no_update AS
  ON UPDATE TO legal_hold_release DO INSTEAD NOTHING;
CREATE RULE legal_hold_release_no_delete AS
  ON DELETE TO legal_hold_release DO INSTEAD NOTHING;
CREATE RULE retention_purge_candidate_no_update AS
  ON UPDATE TO retention_purge_candidate DO INSTEAD NOTHING;
CREATE RULE retention_purge_candidate_no_delete AS
  ON DELETE TO retention_purge_candidate DO INSTEAD NOTHING;
CREATE RULE retention_candidate_decision_no_update AS
  ON UPDATE TO retention_candidate_decision DO INSTEAD NOTHING;
CREATE RULE retention_candidate_decision_no_delete AS
  ON DELETE TO retention_candidate_decision DO INSTEAD NOTHING;

CREATE INDEX retention_scope_due_idx
  ON retention_scope(retention_until,tenant_id,engagement_id);
CREATE INDEX legal_hold_active_lookup_idx
  ON legal_hold(tenant_id,engagement_id,imposed_at);
CREATE INDEX retention_candidate_scope_idx
  ON retention_purge_candidate(retention_scope_id,created_at);

CREATE VIEW retention_purge_ready_inventory
WITH (security_barrier=true,security_invoker=true)
AS
SELECT c.id AS candidate_id,c.tenant_id,s.engagement_id,s.policy_code,
  s.policy_version_no,s.retention_until,c.cutoff_at,c.database_inventory,
  c.r2_inventory,c.inventory_checksum,c.created_at,d.decided_at,d.decided_by
FROM retention_purge_candidate c
JOIN retention_scope s ON s.id=c.retention_scope_id AND s.tenant_id=c.tenant_id
JOIN retention_candidate_decision d
  ON d.candidate_id=c.id AND d.tenant_id=c.tenant_id AND d.decision='APPROVED'
WHERE retention_scope_is_eligible(c.retention_scope_id);

ALTER TABLE retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policy_migration_owner
  ON retention_policy TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE retention_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_scope_migration_owner
  ON retention_scope TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE legal_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_hold_migration_owner
  ON legal_hold TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE legal_hold_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_hold_release FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_hold_release_migration_owner
  ON legal_hold_release TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE retention_purge_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_purge_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_purge_candidate_migration_owner
  ON retention_purge_candidate TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE retention_candidate_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_candidate_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_candidate_decision_migration_owner
  ON retention_candidate_decision TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON retention_policy,retention_scope,legal_hold,legal_hold_release,
  retention_purge_candidate,retention_candidate_decision FROM PUBLIC,accounts_app;
REVOKE ALL ON retention_purge_ready_inventory FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION retention_scope_is_eligible(uuid) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION retention_candidate_is_approvable(uuid) FROM PUBLIC,accounts_app;
GRANT EXECUTE ON FUNCTION retention_scope_is_eligible(uuid) TO neondb_owner;
GRANT EXECUTE ON FUNCTION retention_candidate_is_approvable(uuid) TO neondb_owner;

INSERT INTO retention_policy(
  policy_code,version_no,data_class,clock_basis,retention_period,disposition,
  authority_reference,effective_from,created_by
)
VALUES
  ('ACCOUNTING_RECORDS',1,'ACCOUNTING_EVIDENCE','PERIOD_OR_ENGAGEMENT_CLOSE',interval '7 years','REVIEW_THEN_PURGE','PILOT_BASELINE_LEGAL_REVIEW_REQUIRED',date '2026-08-18','migration-0017'),
  ('TENANT_OPERATIONS',1,'TENANT_OPERATIONS','CONTRACT_END',interval '90 days','ANONYMISE_OR_PURGE','PILOT_BASELINE_LEGAL_REVIEW_REQUIRED',date '2026-08-18','migration-0017'),
  ('INVITATION_TERMINAL',1,'INVITATION','TERMINAL_STATE',interval '30 days','PURGE','PILOT_BASELINE_OPERATIONAL',date '2026-08-18','migration-0017'),
  ('OUTBOX_DELIVERED',1,'OUTBOX_DELIVERED','PUBLISHED_AT',interval '90 days','PURGE','PILOT_BASELINE_OPERATIONAL',date '2026-08-18','migration-0017'),
  ('APPLICATION_LOG',1,'APPLICATION_LOG','EVENT_AT',interval '30 days','PURGE','PILOT_BASELINE_OPERATIONAL',date '2026-08-18','migration-0017'),
  ('SECURITY_AUDIT',1,'SECURITY_AUDIT','EVENT_AT',interval '365 days','REVIEW_THEN_PURGE','PILOT_BASELINE_SECURITY_REVIEW_REQUIRED',date '2026-08-18','migration-0017'),
  ('R2_ORPHAN',1,'R2_ORPHAN','DETECTION_AT',interval '7 days','REVIEW_THEN_PURGE','PILOT_BASELINE_OPERATIONAL',date '2026-08-18','migration-0017');

INSERT INTO schema_migration(version,description)
VALUES('0017','pilot retention scopes append only legal holds and purge candidate inventory')
ON CONFLICT(version) DO NOTHING;

COMMIT;
