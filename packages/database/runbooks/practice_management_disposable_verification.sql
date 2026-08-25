-- PM-002 disposable Neon branch verification.
-- Run only on an isolated branch as the migration owner after applying 0030.
-- The transaction always rolls back its fixtures.
BEGIN;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0030') THEN
  RAISE EXCEPTION 'migration 0030 is not recorded';
 END IF;
 IF EXISTS(
  SELECT 1 FROM (VALUES
   ('practice_service'),('client_service'),('practice_engagement'),
   ('practice_engagement_service'),('work_template'),('work_template_task'),
   ('work_item'),('practice_task'),('work_item_ledgerly_link')
  ) required(table_name)
  LEFT JOIN pg_class c ON c.relname=required.table_name
  LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR n.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
 ) THEN RAISE EXCEPTION 'PM-002 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name) VALUES
 ('30000000-0000-0000-0000-000000000001','PM002 tenant A'),
 ('30000000-0000-0000-0000-000000000002','PM002 tenant B');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code) VALUES
 ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','pm002-a','OWNER'),
 ('31000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','pm002-b','OWNER');
INSERT INTO organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,created_by,updated_by) VALUES
 ('32000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Client A','COMPANY','UK','Client A','COMPANY','pm002-a','pm002-a'),
 ('32000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Client B','COMPANY','UK','Client B','COMPANY','pm002-b','pm002-b');
INSERT INTO practice_service(id,tenant_id,name,category,specialist_module_key,required_entitlement_feature_key,created_by,updated_by) VALUES
 ('33000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Annual accounts','Accounts','ledgerly','ledgerly.accounts','pm002-a','pm002-a'),
 ('33000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Advisory','Advisory',NULL,NULL,'pm002-b','pm002-b');
INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,specialist_module_key,created_by,updated_by) VALUES
 ('34000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',current_date,'ledgerly','pm002-a','pm002-a'),
 ('34000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000002',current_date,NULL,'pm002-b','pm002-b');
INSERT INTO practice_engagement(id,tenant_id,client_id,reference,name,created_by,updated_by) VALUES
 ('35000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','A-2026','Accounts 2026','pm002-a','pm002-a'),
 ('35000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000002','B-2026','Advisory 2026','pm002-b','pm002-b');
INSERT INTO work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,specialist_module_key,created_by,updated_by) VALUES
 ('36000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','2026 Annual Accounts','ledgerly','pm002-a','pm002-a'),
 ('36000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000002','35000000-0000-0000-0000-000000000002','2026 Advisory',NULL,'pm002-b','pm002-b');
INSERT INTO work_item(id,tenant_id,client_id,client_service_id,title,created_by,updated_by)
VALUES('36000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001',
 '32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001',
 'Generic conversion fixture','pm002-a','pm002-a');
INSERT INTO practice_task(id,tenant_id,work_item_id,title,sequence,created_by,updated_by) VALUES
 ('37000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','Prepare accounts',1,'pm002-a','pm002-a'),
 ('37000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','36000000-0000-0000-0000-000000000002','Prepare advice',1,'pm002-b','pm002-b');
INSERT INTO engagement(id,tenant_id,organisation_id,period_start,period_end,framework,status) VALUES
 ('38000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','2026-01-01','2026-12-31','FRS102','DRAFT');

-- A newest override disables accounts while leaving ledgerly.enabled enabled.
INSERT INTO tenant_entitlement_override(tenant_id,feature_key,enabled,reason,valid_from,created_by)
VALUES('30000000-0000-0000-0000-000000000001','ledgerly.accounts',false,'PM-002 denial fixture',now()-interval '2 minutes','pm002-a');

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='30000000-0000-0000-0000-000000000001';
SET LOCAL app.actor_id='pm002-a';
DO $$ BEGIN
 IF (SELECT count(*) FROM practice_service)<>1 OR
    (SELECT count(*) FROM practice_engagement)<>1 OR
    (SELECT count(*) FROM work_item)<>2 OR
    (SELECT count(*) FROM practice_task)<>1 THEN
  RAISE EXCEPTION 'tenant A did not see exactly its own PM-002 rows';
 END IF;
 -- Revocation must not freeze operational updates to already-Ledgerly work.
 UPDATE work_item SET title='2026 Annual Accounts updated',updated_by='pm002-a',updated_at=now()
 WHERE id='36000000-0000-0000-0000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'existing Ledgerly work was frozen after entitlement revocation'; END IF;
 -- It must still prevent converting existing generic work into new Ledgerly work.
 BEGIN
  UPDATE work_item SET specialist_module_key='ledgerly',updated_by='pm002-a',updated_at=now()
  WHERE id='36000000-0000-0000-0000-000000000004';
  RAISE EXCEPTION 'generic work unexpectedly converted to Ledgerly without entitlement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO work_item(id,tenant_id,client_id,client_service_id,title,specialist_module_key,created_by,updated_by)
  VALUES('36000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',
   '32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001',
   'Entitlement denial fixture','ledgerly','pm002-a','pm002-a');
  RAISE EXCEPTION 'Ledgerly-backed work unexpectedly bypassed disabled entitlement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO work_item_ledgerly_link(tenant_id,work_item_id,ledgerly_engagement_id,created_by)
  VALUES('30000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','pm002-a');
  RAISE EXCEPTION 'Ledgerly link unexpectedly bypassed disabled entitlement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL app.tenant_id='30000000-0000-0000-0000-000000000002';
-- Deliberately retain tenant A's actor: every tenant-owned aggregate must hide B.
DO $$ BEGIN
 IF (SELECT count(*) FROM practice_service)<>0 OR
    (SELECT count(*) FROM practice_engagement)<>0 OR
    (SELECT count(*) FROM work_item)<>0 OR
    (SELECT count(*) FROM practice_task)<>0 THEN
  RAISE EXCEPTION 'cross-tenant PM-002 rows were visible';
 END IF;
END $$;

RESET ROLE;
INSERT INTO tenant_entitlement_override(tenant_id,feature_key,enabled,reason,valid_from,created_by)
VALUES('30000000-0000-0000-0000-000000000001','ledgerly.accounts',true,'PM-002 allow fixture',now()-interval '1 minute','pm002-a');
SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='30000000-0000-0000-0000-000000000001';
SET LOCAL app.actor_id='pm002-a';
INSERT INTO work_item_ledgerly_link(tenant_id,work_item_id,ledgerly_engagement_id,created_by)
VALUES('30000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','pm002-a');

RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('accounts_app','practice_service','DELETE') OR
    has_table_privilege('accounts_app','work_item','DELETE') OR
    has_table_privilege('accounts_app','practice_task','DELETE') OR
    has_table_privilege('accounts_app','tenant_entitlement_override','INSERT') OR
    has_table_privilege('accounts_app','tenant_entitlement_override','UPDATE') THEN
  RAISE EXCEPTION 'accounts_app has an unexpected PM-002 or entitlement mutation privilege';
 END IF;
END $$;

ROLLBACK;
