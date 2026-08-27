-- PM-003 disposable Neon behavioral verification. All fixtures and role grants roll back.
BEGIN;
GRANT accounts_app TO neondb_owner;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0031') THEN RAISE EXCEPTION 'migration 0031 is not recorded'; END IF;
 IF EXISTS(
  SELECT 1 FROM (VALUES('deadline_rule'),('recurring_work_schedule'),('recurrence_generation'),('practice_task_dependency')) required(name)
  LEFT JOIN pg_class c ON c.relname=required.name LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
 ) THEN RAISE EXCEPTION 'PM-003 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name,legal_name) VALUES('40000000-0000-0000-0000-000000000001','PM003 tenant','PM003 tenant');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code) VALUES('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','pm003-owner','OWNER');
INSERT INTO organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,created_by,updated_by)
VALUES('42000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','PM003 client','COMPANY','UK','PM003 client','COMPANY','pm003-owner','pm003-owner');
INSERT INTO practice_service(id,tenant_id,name,category,created_by,updated_by)
VALUES('43000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Quarterly advisory','Advisory','pm003-owner','pm003-owner');
INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,created_by,updated_by)
VALUES('44000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','2027-01-01','pm003-owner','pm003-owner');
DO $$ BEGIN
 BEGIN
  INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,created_by,updated_by)
  VALUES('44000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','2027-02-01','pm003-owner','pm003-owner');
  RAISE EXCEPTION 'overlapping duplicate active client service was accepted';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
END $$;
INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,instance_key,created_by,updated_by)
VALUES('44000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','2027-02-01','parallel-advisory','pm003-owner','pm003-owner');

INSERT INTO work_template(id,tenant_id,name,service_id,status,version,template_family_id,published_at,created_by,updated_by)
VALUES('45000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Quarterly delivery','43000000-0000-0000-0000-000000000001','published',1,'45000000-0000-0000-0000-000000000001',now(),'pm003-owner','pm003-owner');
INSERT INTO work_template_task(id,tenant_id,work_template_id,title,sequence,mandatory,created_by,updated_by)
VALUES('46000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','Prepare advice',10,true,'pm003-owner','pm003-owner');
INSERT INTO deadline_rule(id,tenant_id,name,rule_type,configuration,created_by,updated_by)
VALUES('47000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Thirty days after period','days_after_period_end','{"days":30}','pm003-owner','pm003-owner');
INSERT INTO recurring_work_schedule(id,tenant_id,client_id,client_service_id,work_template_id,deadline_rule_id,recurrence_rule,effective_from,generation_horizon_type,generation_horizon_value,created_by,updated_by)
VALUES('48000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','{"frequency":"quarterly"}','2027-01-01','periods',3,'pm003-owner','pm003-owner');
INSERT INTO recurrence_generation(id,tenant_id,recurring_schedule_id,occurrence_date,period_start,period_end,idempotency_key,status)
VALUES('49000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','2027-01-01','2027-01-01','2027-03-31','pm003:quarter:2027-01-01','generated');
DO $$ BEGIN
 BEGIN
  INSERT INTO recurrence_generation(tenant_id,recurring_schedule_id,occurrence_date,period_start,period_end,idempotency_key,status)
  VALUES('40000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','2027-01-01','2027-01-01','2027-03-31','another-key','generated');
  RAISE EXCEPTION 'duplicate occurrence marker was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
INSERT INTO work_item(id,tenant_id,client_id,client_service_id,title,period_start,period_end,due_date,calculated_due_date,due_date_rule_id,due_date_calculation,source_template_id,source_template_version,recurring_schedule_id,generation_id,created_by,updated_by)
VALUES('4a000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','Q1 advisory','2027-01-01','2027-03-31','2027-04-30','2027-04-30','47000000-0000-0000-0000-000000000001','{"rule":"fixture"}','45000000-0000-0000-0000-000000000001',1,'48000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','pm003-owner','pm003-owner');
UPDATE recurrence_generation SET work_item_id='4a000000-0000-0000-0000-000000000001' WHERE id='49000000-0000-0000-0000-000000000001';

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='40000000-0000-0000-0000-000000000001';
SET LOCAL app.actor_id='pm003-owner';
DO $$ BEGIN
 IF (SELECT count(*) FROM recurring_work_schedule)<>1 OR (SELECT count(*) FROM recurrence_generation)<>1 OR (SELECT count(*) FROM deadline_rule)<>1 THEN
  RAISE EXCEPTION 'runtime role did not see its PM-003 data'; END IF;
 IF (SELECT display_name FROM tenant_member WHERE id='41000000-0000-0000-0000-000000000001')<>'pm003-owner' THEN
  RAISE EXCEPTION 'member display-name fallback was not populated'; END IF;
END $$;
SET LOCAL app.tenant_id='40000000-0000-0000-0000-000000000099';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM recurring_work_schedule) OR EXISTS(SELECT 1 FROM deadline_rule) THEN RAISE EXCEPTION 'cross-tenant PM-003 data was visible'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('accounts_app','recurring_work_schedule','DELETE') OR has_table_privilege('accounts_app','recurrence_generation','DELETE') THEN
  RAISE EXCEPTION 'runtime role has destructive PM-003 grants'; END IF;
END $$;
ROLLBACK;
