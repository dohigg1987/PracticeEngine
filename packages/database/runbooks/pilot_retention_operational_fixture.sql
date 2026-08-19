-- Rollback-only verification for migration 0017.
-- Run only as neondb_owner on a disposable Neon branch cloned from production.

BEGIN;

INSERT INTO tenant(id,name) VALUES
  ('17000000-0000-0000-0000-000000000001','retention-fixture-a'),
  ('17000000-0000-0000-0000-000000000002','retention-fixture-b');

INSERT INTO organisation(id,tenant_id,legal_name,legal_form) VALUES
  ('17000000-0000-0000-0000-000000000011','17000000-0000-0000-0000-000000000001','Retention Fixture A Ltd','LIMITED_COMPANY'),
  ('17000000-0000-0000-0000-000000000012','17000000-0000-0000-0000-000000000002','Retention Fixture B Ltd','LIMITED_COMPANY');

INSERT INTO engagement(
  id,tenant_id,organisation_id,period_start,period_end,framework,sector_profile
) VALUES
  ('17000000-0000-0000-0000-000000000021','17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000011',date '2009-01-01',date '2009-12-31','FRS102','GENERAL'),
  ('17000000-0000-0000-0000-000000000022','17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000012',date '2009-01-01',date '2009-12-31','FRS102','GENERAL');

INSERT INTO retention_scope(
  id,tenant_id,engagement_id,policy_code,policy_version_no,retention_period,
  clock_at,retention_until,clock_evidence,created_by
) VALUES
  ('17000000-0000-0000-0000-000000000031','17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000021','ACCOUNTING_RECORDS',1,interval '7 years',timestamptz '2010-01-01T00:00:00Z',timestamptz '2017-01-01T00:00:00Z','{"fixture":true}'::jsonb,'retention-fixture'),
  ('17000000-0000-0000-0000-000000000032','17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000022','ACCOUNTING_RECORDS',1,interval '7 years',timestamptz '2010-01-01T00:00:00Z',timestamptz '2017-01-01T00:00:00Z','{"fixture":true}'::jsonb,'retention-fixture'),
  ('17000000-0000-0000-0000-000000000033','17000000-0000-0000-0000-000000000001',NULL,'TENANT_OPERATIONS',1,interval '90 days',timestamptz '2090-01-01T00:00:00Z',timestamptz '2090-04-01T00:00:00Z','{"fixture":true}'::jsonb,'retention-fixture');

DO $verify$
BEGIN
  IF NOT retention_scope_is_eligible('17000000-0000-0000-0000-000000000031') THEN
    RAISE EXCEPTION 'due retention scope was not eligible';
  END IF;
  IF retention_scope_is_eligible('17000000-0000-0000-0000-000000000033') THEN
    RAISE EXCEPTION 'future retention scope was eligible';
  END IF;
END
$verify$;

INSERT INTO retention_purge_candidate(
  id,tenant_id,retention_scope_id,cutoff_at,database_inventory,r2_inventory,
  inventory_checksum,created_by
) VALUES
  ('17000000-0000-0000-0000-000000000041','17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000031',transaction_timestamp(),'{"contractVersion":1,"queryComplete":true,"fixture":"a1"}'::jsonb,'{"contractVersion":1,"continuationComplete":true,"fixture":"a1"}'::jsonb,repeat('a',64),'retention-fixture'),
  ('17000000-0000-0000-0000-000000000042','17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000031',transaction_timestamp(),'{"contractVersion":1,"queryComplete":true,"fixture":"a2"}'::jsonb,'{"contractVersion":1,"continuationComplete":true,"fixture":"a2"}'::jsonb,repeat('b',64),'retention-fixture'),
  ('17000000-0000-0000-0000-000000000043','17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000032',transaction_timestamp(),'{"contractVersion":1,"queryComplete":true,"fixture":"b1"}'::jsonb,'{"contractVersion":1,"continuationComplete":true,"fixture":"b1"}'::jsonb,repeat('c',64),'retention-fixture');

INSERT INTO retention_candidate_decision(
  id,tenant_id,candidate_id,decision,decided_by,reason,evidence
) VALUES
  ('17000000-0000-0000-0000-000000000051','17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000041','APPROVED','retention-approver','fixture approval','{"fixture":true}'::jsonb),
  ('17000000-0000-0000-0000-000000000053','17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000043','APPROVED','retention-approver','fixture approval','{"fixture":true}'::jsonb);

DO $verify$
BEGIN
  IF (SELECT count(*) FROM retention_purge_ready_inventory) <> 2 THEN
    RAISE EXCEPTION 'initial ready inventory count was not 2';
  END IF;
END
$verify$;

INSERT INTO legal_hold(
  id,tenant_id,engagement_id,hold_reference,reason,imposed_by,evidence
) VALUES(
  '17000000-0000-0000-0000-000000000061',
  '17000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000021',
  'RETENTION-FIXTURE-HOLD','fixture hold','retention-legal','{"fixture":true}'::jsonb
);

DO $verify$
BEGIN
  IF retention_scope_is_eligible('17000000-0000-0000-0000-000000000031') THEN
    RAISE EXCEPTION 'held scope remained eligible';
  END IF;
  IF NOT retention_scope_is_eligible('17000000-0000-0000-0000-000000000032') THEN
    RAISE EXCEPTION 'hold crossed tenant boundary';
  END IF;
  IF EXISTS(
    SELECT 1 FROM retention_purge_ready_inventory
    WHERE tenant_id='17000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'stale approval remained ready after hold';
  END IF;
END
$verify$;

DO $verify$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO retention_purge_candidate(
      id,tenant_id,retention_scope_id,cutoff_at,database_inventory,r2_inventory,
      inventory_checksum,created_by
    ) VALUES(
      '17000000-0000-0000-0000-000000000044',
      '17000000-0000-0000-0000-000000000001',
      '17000000-0000-0000-0000-000000000031',transaction_timestamp(),
      '{"contractVersion":1,"queryComplete":true}'::jsonb,
      '{"contractVersion":1,"continuationComplete":true}'::jsonb,
      repeat('d',64),'retention-fixture'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'held candidate insertion was not rejected';
  END IF;
END
$verify$;

DO $verify$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO retention_candidate_decision(
      id,tenant_id,candidate_id,decision,decided_by,reason,evidence
    ) VALUES(
      '17000000-0000-0000-0000-000000000052',
      '17000000-0000-0000-0000-000000000001',
      '17000000-0000-0000-0000-000000000042','APPROVED',
      'retention-approver','must fail while held','{"fixture":true}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'held candidate approval was not rejected';
  END IF;
END
$verify$;

DO $verify$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO retention_purge_candidate(
      id,tenant_id,retention_scope_id,cutoff_at,database_inventory,r2_inventory,
      inventory_checksum,created_by
    ) VALUES(
      '17000000-0000-0000-0000-000000000045',
      '17000000-0000-0000-0000-000000000002',
      '17000000-0000-0000-0000-000000000032',transaction_timestamp(),
      '{"contractVersion":1,"queryComplete":false}'::jsonb,
      '{"contractVersion":1,"continuationComplete":false}'::jsonb,
      repeat('e',64),'retention-fixture'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'incomplete inventory was not rejected';
  END IF;
END
$verify$;

INSERT INTO legal_hold_release(
  id,tenant_id,legal_hold_id,released_by,reason,evidence
) VALUES(
  '17000000-0000-0000-0000-000000000071',
  '17000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000061',
  'retention-legal','fixture release','{"fixture":true}'::jsonb
);

INSERT INTO retention_candidate_decision(
  id,tenant_id,candidate_id,decision,decided_by,reason,evidence
) VALUES(
  '17000000-0000-0000-0000-000000000052',
  '17000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000042','APPROVED',
  'retention-approver','approved after release','{"fixture":true}'::jsonb
);

DO $verify$
DECLARE affected bigint;
BEGIN
  UPDATE legal_hold
  SET reason='mutation must not persist'
  WHERE id='17000000-0000-0000-0000-000000000061';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'append only hold accepted an update';
  END IF;

  IF (SELECT count(*) FROM retention_purge_ready_inventory) <> 3 THEN
    RAISE EXCEPTION 'released ready inventory count was not 3';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee='accounts_app' AND table_schema='public'
      AND table_name IN (
        'retention_policy','retention_scope','legal_hold','legal_hold_release',
        'retention_purge_candidate','retention_candidate_decision',
        'retention_purge_ready_inventory'
      )
  ) THEN
    RAISE EXCEPTION 'accounts_app received a retention table privilege';
  END IF;

  IF has_function_privilege('accounts_app','retention_scope_is_eligible(uuid)','EXECUTE')
     OR has_function_privilege('accounts_app','retention_candidate_is_approvable(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'accounts_app received a retention function privilege';
  END IF;
END
$verify$;

SELECT 'PASS' AS retention_fixture_result,
       (SELECT count(*) FROM retention_purge_ready_inventory) AS ready_before_rollback;

ROLLBACK;
