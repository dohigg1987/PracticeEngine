-- PM-007 disposable Neon resource/economics RLS and historical-value checks.
-- Run only through the confirmed disposable migration verifier; all fixtures roll back.
BEGIN;
GRANT accounts_app TO neondb_owner;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0035') THEN RAISE EXCEPTION 'migration 0035 is not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('resource_profile'),('resource_working_pattern'),('resource_availability_adjustment'),('work_assignment_history'),
  ('resource_cost_rate'),('time_entry'),('work_commercial_context'),('billing_recovery')) required(name)
  LEFT JOIN pg_class c ON c.relname=required.name LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'PM-007 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name,legal_name) VALUES
 ('80000000-0000-0000-0000-000000000001','PM007 tenant A','PM007 tenant A'),
 ('80000000-0000-0000-0000-000000000002','PM007 tenant B','PM007 tenant B');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code,display_name) VALUES
 ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','pm007-owner-a','OWNER','Owner A'),
 ('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','pm007-owner-b','OWNER','Owner B');
INSERT INTO organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,created_by,updated_by) VALUES
 ('82000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Client A','COMPANY','GB','Client A','COMPANY','pm007-owner-a','pm007-owner-a'),
 ('82000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','Client B','COMPANY','GB','Client B','COMPANY','pm007-owner-b','pm007-owner-b');
INSERT INTO practice_service(id,tenant_id,name,category,created_by,updated_by) VALUES
 ('83000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Service A','advisory','pm007-owner-a','pm007-owner-a'),
 ('83000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','Service B','advisory','pm007-owner-b','pm007-owner-b');
INSERT INTO client_service(id,tenant_id,client_id,service_id,start_date,created_by,updated_by) VALUES
 ('84000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001',current_date,'pm007-owner-a','pm007-owner-a'),
 ('84000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000002',current_date,'pm007-owner-b','pm007-owner-b');
INSERT INTO work_item(id,tenant_id,client_id,client_service_id,title,assigned_member_id,planned_start_date,planned_end_date,planned_effort_minutes,estimated_effort_minutes,remaining_effort_minutes,estimate_provenance,assignment_state,created_by,updated_by) VALUES
 ('85000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','Work A','81000000-0000-0000-0000-000000000001',current_date,current_date+6,600,600,600,'manual_override','confirmed','pm007-owner-a','pm007-owner-a'),
 ('85000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000002','Work B','81000000-0000-0000-0000-000000000002',current_date,current_date+6,600,600,600,'manual_override','confirmed','pm007-owner-b','pm007-owner-b');
INSERT INTO resource_working_pattern(id,tenant_id,tenant_member_id,name,effective_from,created_by,updated_by) VALUES
 ('86000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Standard',current_date-30,'pm007-owner-a','pm007-owner-a'),
 ('86000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000002','Standard',current_date-30,'pm007-owner-b','pm007-owner-b');
INSERT INTO resource_cost_rate(id,tenant_id,tenant_member_id,effective_from,effective_to,internal_cost_rate,currency,rate_basis,provenance,created_by,updated_by) VALUES
 ('87000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',current_date-30,current_date-1,40,'GBP','hourly','test historical rate','pm007-owner-a','pm007-owner-a'),
 ('87000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',current_date,NULL,45,'GBP','hourly','test current rate','pm007-owner-a','pm007-owner-a'),
 ('87000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000002',current_date,NULL,50,'GBP','hourly','test tenant B rate','pm007-owner-b','pm007-owner-b');
INSERT INTO time_entry(id,tenant_id,tenant_member_id,entry_date,client_id,client_service_id,work_item_id,duration_minutes,classification,status,cost_rate_id,cost_rate_snapshot,cost_rate_basis,cost_amount_snapshot,currency,created_by,updated_by) VALUES
 ('88000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',current_date,'82000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001',120,'billable','submitted','87000000-0000-0000-0000-000000000002',45,'hourly',90,'GBP','pm007-owner-a','pm007-owner-a'),
 ('88000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000002',current_date,'82000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000002',60,'billable','submitted','87000000-0000-0000-0000-000000000003',50,'hourly',50,'GBP','pm007-owner-b','pm007-owner-b');

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='80000000-0000-0000-0000-000000000001'; SET LOCAL app.actor_id='pm007-owner-a';
DO $$ BEGIN
 IF (SELECT count(*) FROM resource_profile)<>1 THEN RAISE EXCEPTION 'resource profile tenant isolation failed'; END IF;
 IF (SELECT count(*) FROM resource_cost_rate)<>2 THEN RAISE EXCEPTION 'restricted cost-rate tenant isolation failed'; END IF;
 IF (SELECT count(*) FROM time_entry)<>1 THEN RAISE EXCEPTION 'time-entry tenant isolation failed'; END IF;
 IF (SELECT cost_amount_snapshot FROM time_entry WHERE id='88000000-0000-0000-0000-000000000001')<>90 THEN RAISE EXCEPTION 'historical time valuation snapshot changed'; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN
 IF has_table_privilege('accounts_app','resource_cost_rate','DELETE') OR has_table_privilege('accounts_app','time_entry','DELETE') OR
    has_table_privilege('accounts_app','work_commercial_context','DELETE') OR has_table_privilege('accounts_app','billing_recovery','DELETE')
 THEN RAISE EXCEPTION 'runtime role has destructive PM-007 grants'; END IF;
 IF has_column_privilege('accounts_app','time_entry','cost_rate_snapshot','UPDATE') OR
    has_column_privilege('accounts_app','time_entry','cost_rate_id','UPDATE')
 THEN RAISE EXCEPTION 'historical rate provenance snapshots are mutable by runtime'; END IF;
END $$;
ROLLBACK;
