-- PM-004 disposable Neon behavioral and cross-tenant verification. All fixtures roll back.
BEGIN;
GRANT accounts_app TO neondb_owner;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0032') THEN RAISE EXCEPTION 'migration 0032 is not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('work_template_stage'),('work_stage'),('practice_review'),('practice_review_point'),('automation_rule'),('automation_execution'),('recurrence_execution'),('recurrence_execution_item')) required(name)
 LEFT JOIN pg_class c ON c.relname=required.name LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
 WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity) THEN RAISE EXCEPTION 'PM-004 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name,legal_name) VALUES
 ('50000000-0000-0000-0000-000000000001','PM004 tenant A','PM004 tenant A'),
 ('50000000-0000-0000-0000-000000000002','PM004 tenant B','PM004 tenant B');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code) VALUES
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','pm004-owner-a','OWNER'),
 ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','pm004-owner-b','OWNER');
INSERT INTO organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,created_by,updated_by) VALUES
 ('52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Client A','COMPANY','UK','Client A','COMPANY','pm004-owner-a','pm004-owner-a'),
 ('52000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','Client B','COMPANY','UK','Client B','COMPANY','pm004-owner-b','pm004-owner-b');
INSERT INTO practice_service(id,tenant_id,name,category,created_by,updated_by) VALUES
 ('53000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Delivery A','Advisory','pm004-owner-a','pm004-owner-a'),
 ('53000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','Delivery B','Advisory','pm004-owner-b','pm004-owner-b');
INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,created_by,updated_by) VALUES
 ('54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','2027-01-01','pm004-owner-a','pm004-owner-a'),
 ('54000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000002','53000000-0000-0000-0000-000000000002','2027-01-01','pm004-owner-b','pm004-owner-b');
INSERT INTO work_template(id,tenant_id,name,service_id,status,version,template_family_id,published_at,created_by,updated_by) VALUES
 ('55000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Delivery workflow A','53000000-0000-0000-0000-000000000001','published',1,'55000000-0000-0000-0000-000000000001',now(),'pm004-owner-a','pm004-owner-a'),
 ('55000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','Delivery workflow B','53000000-0000-0000-0000-000000000002','published',1,'55000000-0000-0000-0000-000000000002',now(),'pm004-owner-b','pm004-owner-b');
INSERT INTO work_template_stage(id,tenant_id,work_template_id,name,sequence,stage_type,completion_criteria,created_by,updated_by) VALUES
 ('56000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','Preparation',10,'preparation','{"allMandatoryTasksComplete":true}','pm004-owner-a','pm004-owner-a'),
 ('56000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000002','Preparation',10,'preparation','{}','pm004-owner-b','pm004-owner-b');
INSERT INTO work_template_task(id,tenant_id,work_template_id,title,sequence,mandatory,work_template_stage_id,review_required,created_by,updated_by) VALUES
 ('57000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','Prepare',10,true,'56000000-0000-0000-0000-000000000001',true,'pm004-owner-a','pm004-owner-a'),
 ('57000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000002','Prepare',10,true,'56000000-0000-0000-0000-000000000002',false,'pm004-owner-b','pm004-owner-b');
INSERT INTO work_item(id,tenant_id,client_id,client_service_id,title,source_template_id,source_template_version,created_by,updated_by) VALUES
 ('58000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000001','Work A','55000000-0000-0000-0000-000000000001',1,'pm004-owner-a','pm004-owner-a'),
 ('58000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000002','54000000-0000-0000-0000-000000000002','Work B','55000000-0000-0000-0000-000000000002',1,'pm004-owner-b','pm004-owner-b');
INSERT INTO work_stage(id,tenant_id,work_item_id,source_template_stage_id,source_template_id,source_template_version,name,sequence,stage_type,status,started_at,entry_criteria,completion_criteria,created_by,updated_by) VALUES
 ('59000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001',1,'Preparation',10,'preparation','active',now(),'{}','{"allMandatoryTasksComplete":true}','pm004-owner-a','pm004-owner-a'),
 ('59000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000002',1,'Preparation',10,'preparation','active',now(),'{}','{}','pm004-owner-b','pm004-owner-b');
INSERT INTO practice_task(id,tenant_id,work_item_id,title,status,sequence,source_template_task_id,mandatory,work_stage_id,review_required,created_by,updated_by) VALUES
 ('5a000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','First','not_started',10,'57000000-0000-0000-0000-000000000001',true,'59000000-0000-0000-0000-000000000001',true,'pm004-owner-a','pm004-owner-a'),
 ('5a000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','Second','not_started',20,null,true,'59000000-0000-0000-0000-000000000001',false,'pm004-owner-a','pm004-owner-a');
INSERT INTO practice_task_dependency(tenant_id,predecessor_task_id,successor_task_id,dependency_type,created_by)
VALUES('50000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000002','finish_to_start','pm004-owner-a');
DO $$ BEGIN BEGIN
 INSERT INTO practice_task_dependency(tenant_id,predecessor_task_id,successor_task_id,dependency_type,created_by)
 VALUES('50000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000002','5a000000-0000-0000-0000-000000000001','blocks','pm004-owner-a');
 RAISE EXCEPTION 'dependency cycle was accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;
INSERT INTO practice_review(id,tenant_id,work_item_id,practice_task_id,preparer_member_id,reviewer_member_id,status,requested_by)
VALUES('5b000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',null,'requested','pm004-owner-a');
INSERT INTO practice_review_point(id,tenant_id,review_id,work_item_id,practice_task_id,description,created_by,updated_by)
VALUES('5c000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','5b000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001','Operational finding','pm004-owner-a','pm004-owner-a');
INSERT INTO automation_rule(id,tenant_id,name,enabled,trigger_type,conditions,actions,created_by,updated_by)
VALUES('5d000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Fixture rule',true,'work.created','[]','[{"type":"mark_blocked"}]','pm004-owner-a','pm004-owner-a');
INSERT INTO automation_execution(id,tenant_id,automation_rule_id,trigger_type,aggregate_type,aggregate_id,idempotency_key,status)
VALUES('5e000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','5d000000-0000-0000-0000-000000000001','work.created','WORK_ITEM','58000000-0000-0000-0000-000000000001','fixture-execution','succeeded');
INSERT INTO recurrence_execution(id,tenant_id,trigger_type,status,actor_id,correlation_id,schedules_evaluated)
VALUES('5f000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','dry_run','succeeded','pm004-owner-a','5f000000-0000-0000-0000-000000000099',1);

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='50000000-0000-0000-0000-000000000001'; SET LOCAL app.actor_id='pm004-owner-a';
DO $$ BEGIN IF (SELECT count(*) FROM work_stage)<>1 OR (SELECT count(*) FROM practice_review)<>1 OR (SELECT count(*) FROM automation_rule)<>1 OR (SELECT count(*) FROM recurrence_execution)<>1 THEN RAISE EXCEPTION 'runtime role did not see tenant A PM-004 data'; END IF; END $$;
SET LOCAL app.tenant_id='50000000-0000-0000-0000-000000000002'; SET LOCAL app.actor_id='pm004-owner-b';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM practice_review) OR EXISTS(SELECT 1 FROM automation_rule) OR EXISTS(SELECT 1 FROM recurrence_execution) THEN RAISE EXCEPTION 'cross-tenant PM-004 data was visible'; END IF; IF (SELECT count(*) FROM work_stage)<>1 THEN RAISE EXCEPTION 'tenant B could not see its workflow stage'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF has_table_privilege('accounts_app','work_stage','DELETE') OR has_table_privilege('accounts_app','practice_review','DELETE') OR has_table_privilege('accounts_app','automation_rule','DELETE') OR has_table_privilege('accounts_app','recurrence_execution','DELETE') THEN RAISE EXCEPTION 'runtime role has destructive PM-004 grants'; END IF; END $$;
ROLLBACK;
