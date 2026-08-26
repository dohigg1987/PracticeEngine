BEGIN;

CREATE TABLE work_template_stage(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  work_template_id uuid NOT NULL,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180),
  sequence integer NOT NULL CHECK(sequence>0),
  stage_type text NOT NULL CHECK(stage_type IN ('preparation','client_input','internal_review','approval','specialist_execution','completion')),
  default_assignee_role_id uuid,
  default_reviewer_role_id uuid,
  entry_criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(entry_criteria)='object'),
  completion_criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(completion_criteria)='object'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  skippable boolean NOT NULL DEFAULT false,
  created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,work_template_id), UNIQUE(tenant_id,work_template_id,sequence),
  FOREIGN KEY(tenant_id,work_template_id) REFERENCES work_template(tenant_id,id),
  FOREIGN KEY(tenant_id,default_assignee_role_id) REFERENCES tenant_role(tenant_id,id),
  FOREIGN KEY(tenant_id,default_reviewer_role_id) REFERENCES tenant_role(tenant_id,id)
);

CREATE TABLE work_stage(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL,
  source_template_stage_id uuid,
  source_template_id uuid NOT NULL,
  source_template_version integer NOT NULL CHECK(source_template_version>0),
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180),
  sequence integer NOT NULL CHECK(sequence>0),
  stage_type text NOT NULL CHECK(stage_type IN ('preparation','client_input','internal_review','approval','specialist_execution','completion')),
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','active','blocked','waiting','review','completed','skipped')),
  assignee_member_id uuid, reviewer_member_id uuid,
  entry_criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(entry_criteria)='object'),
  completion_criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(completion_criteria)='object'),
  skippable boolean NOT NULL DEFAULT false,
  block_reason text, started_at timestamptz, completed_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,work_item_id), UNIQUE(tenant_id,work_item_id,sequence),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,source_template_stage_id) REFERENCES work_template_stage(tenant_id,id),
  FOREIGN KEY(tenant_id,source_template_stage_id,source_template_id) REFERENCES work_template_stage(tenant_id,id,work_template_id),
  FOREIGN KEY(tenant_id,source_template_id) REFERENCES work_template(tenant_id,id),
  FOREIGN KEY(tenant_id,assignee_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,reviewer_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK((status='active')=(started_at IS NOT NULL AND completed_at IS NULL) OR status<>'active'),
  CHECK((status IN ('completed','skipped'))=(completed_at IS NOT NULL)),
  CHECK((status='blocked')=(block_reason IS NOT NULL))
);

ALTER TABLE work_template_task ADD COLUMN work_template_stage_id uuid, ADD COLUMN review_required boolean NOT NULL DEFAULT false;
ALTER TABLE work_template_task ADD FOREIGN KEY(tenant_id,work_template_stage_id) REFERENCES work_template_stage(tenant_id,id);
ALTER TABLE practice_task ADD COLUMN work_stage_id uuid, ADD COLUMN review_required boolean NOT NULL DEFAULT false;
ALTER TABLE practice_task ADD FOREIGN KEY(tenant_id,work_stage_id) REFERENCES work_stage(tenant_id,id);
ALTER TABLE practice_task ADD CONSTRAINT practice_task_tenant_id_id_work_item_uq UNIQUE(tenant_id,id,work_item_id);

ALTER TABLE practice_task_dependency DROP CONSTRAINT practice_task_dependency_dependency_type_check;
ALTER TABLE practice_task_dependency
  ADD CONSTRAINT practice_task_dependency_type_ck CHECK(dependency_type IN ('finish_to_start','start_to_start','blocks')),
  ADD COLUMN blocking_reason text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by text,
  ADD CONSTRAINT practice_task_dependency_resolution_ck CHECK((resolved_at IS NULL)=(resolved_by IS NULL));

CREATE OR REPLACE FUNCTION reject_practice_task_dependency_cycle() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(
    WITH RECURSIVE successors(task_id) AS (
      SELECT NEW.successor_task_id
      UNION
      SELECT d.successor_task_id FROM public.practice_task_dependency d
      JOIN successors s ON s.task_id=d.predecessor_task_id
      WHERE d.tenant_id=NEW.tenant_id AND d.resolved_at IS NULL
    ) SELECT 1 FROM successors WHERE task_id=NEW.predecessor_task_id
  ) THEN RAISE EXCEPTION 'practice task dependency cycle' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.practice_task a JOIN public.practice_task b
      ON b.tenant_id=a.tenant_id AND b.work_item_id=a.work_item_id
    WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.predecessor_task_id AND b.id=NEW.successor_task_id
  ) THEN RAISE EXCEPTION 'practice task dependencies must remain within one work item' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_task_dependency_cycle_guard BEFORE INSERT OR UPDATE OF predecessor_task_id,successor_task_id,resolved_at
ON practice_task_dependency FOR EACH ROW EXECUTE FUNCTION reject_practice_task_dependency_cycle();

CREATE TABLE practice_review(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL, practice_task_id uuid, work_stage_id uuid,
  preparer_member_id uuid, reviewer_member_id uuid, approver_member_id uuid,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','in_progress','changes_requested','approved','rejected','completed','reopened')),
  segregation_required boolean NOT NULL DEFAULT true,
  requested_by text NOT NULL CHECK(btrim(requested_by)<>''), requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, decided_at timestamptz, decision_by text, decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,work_item_id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,practice_task_id) REFERENCES practice_task(tenant_id,id),
  FOREIGN KEY(tenant_id,work_stage_id) REFERENCES work_stage(tenant_id,id),
  FOREIGN KEY(tenant_id,practice_task_id,work_item_id) REFERENCES practice_task(tenant_id,id,work_item_id),
  FOREIGN KEY(tenant_id,work_stage_id,work_item_id) REFERENCES work_stage(tenant_id,id,work_item_id),
  FOREIGN KEY(tenant_id,preparer_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,reviewer_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,approver_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(practice_task_id IS NOT NULL OR work_stage_id IS NOT NULL),
  CHECK(NOT segregation_required OR approver_member_id IS NULL OR preparer_member_id IS NULL OR approver_member_id<>preparer_member_id),
  CHECK((decided_at IS NULL AND decision_by IS NULL) OR (decided_at IS NOT NULL AND decision_by IS NOT NULL))
);

CREATE TABLE practice_review_point(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  review_id uuid NOT NULL, work_item_id uuid NOT NULL, practice_task_id uuid, work_stage_id uuid,
  description text NOT NULL CHECK(btrim(description)<>'' AND char_length(description)<=4000),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','addressed','cleared','reopened')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''), assigned_member_id uuid,
  resolution text, addressed_at timestamptz, cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL CHECK(btrim(updated_by)<>''), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,review_id) REFERENCES practice_review(tenant_id,id),
  FOREIGN KEY(tenant_id,review_id,work_item_id) REFERENCES practice_review(tenant_id,id,work_item_id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,practice_task_id) REFERENCES practice_task(tenant_id,id),
  FOREIGN KEY(tenant_id,work_stage_id) REFERENCES work_stage(tenant_id,id),
  FOREIGN KEY(tenant_id,assigned_member_id) REFERENCES tenant_member(tenant_id,id)
);

CREATE TABLE automation_rule(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180), enabled boolean NOT NULL DEFAULT false,
  trigger_type text NOT NULL CHECK(trigger_type IN ('work.created','work.status_changed','stage.completed','task.completed','deadline.approaching','deadline.overdue','review.requested','review.approved','recurring_work.generated','specialist.event_received')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(conditions)='array' AND jsonb_array_length(conditions)<=20),
  actions jsonb NOT NULL CHECK(jsonb_typeof(actions)='array' AND jsonb_array_length(actions) BETWEEN 1 AND 20),
  priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 1000), effective_from timestamptz, effective_to timestamptz,
  last_executed_at timestamptz, last_failure_at timestamptz, last_failure_code text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,name), CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from)
);

CREATE TABLE automation_execution(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  automation_rule_id uuid NOT NULL, trigger_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  triggering_event_id uuid, idempotency_key text NOT NULL, causation_chain jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(causation_chain)='array' AND jsonb_array_length(causation_chain)<=8),
  status text NOT NULL CHECK(status IN ('started','succeeded','failed','skipped_loop','skipped_condition')),
  actions_attempted integer NOT NULL DEFAULT 0, actions_completed integer NOT NULL DEFAULT 0,
  error_code text, error_summary text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,automation_rule_id) REFERENCES automation_rule(tenant_id,id),
  CHECK(actions_completed<=actions_attempted)
);

CREATE TABLE recurrence_execution(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK(trigger_type IN ('scheduled','manual','dry_run','replay')),
  status text NOT NULL CHECK(status IN ('running','succeeded','partially_failed','failed','resolved')),
  range_from date, range_to date, actor_id text NOT NULL CHECK(btrim(actor_id)<>''), correlation_id uuid NOT NULL,
  schedules_evaluated integer NOT NULL DEFAULT 0, work_generated integer NOT NULL DEFAULT 0,
  blocked_entitlement integer NOT NULL DEFAULT 0, skipped_idempotent integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(warnings)='array'), diagnostic_summary text,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, resolved_at timestamptz, resolved_by text,
  UNIQUE(tenant_id,id), CHECK(range_to IS NULL OR range_from IS NULL OR range_to>=range_from),
  CHECK((resolved_at IS NULL)=(resolved_by IS NULL))
);

CREATE TABLE recurrence_execution_item(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, recurrence_execution_id uuid NOT NULL,
  recurring_schedule_id uuid NOT NULL, occurrence_date date, prospective_due_date date, work_item_id uuid,
  outcome text NOT NULL CHECK(outcome IN ('prospective','generated','blocked_entitlement','skipped_idempotent','failed')),
  diagnostic_code text, diagnostic_summary text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,recurrence_execution_id,recurring_schedule_id,occurrence_date),
  FOREIGN KEY(tenant_id,recurrence_execution_id) REFERENCES recurrence_execution(tenant_id,id),
  FOREIGN KEY(tenant_id,recurring_schedule_id) REFERENCES recurring_work_schedule(tenant_id,id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id)
);

CREATE INDEX work_stage_progress_idx ON work_stage(tenant_id,work_item_id,status,sequence);
CREATE INDEX practice_review_queue_idx ON practice_review(tenant_id,status,reviewer_member_id,requested_at);
CREATE INDEX practice_review_point_open_idx ON practice_review_point(tenant_id,review_id,status);
CREATE INDEX automation_rule_trigger_idx ON automation_rule(tenant_id,enabled,trigger_type,priority);
CREATE INDEX automation_execution_history_idx ON automation_execution(tenant_id,automation_rule_id,started_at DESC);
CREATE INDEX recurrence_execution_history_idx ON recurrence_execution(tenant_id,started_at DESC);

INSERT INTO feature_definition(feature_key,module_key,display_name,value_type,status) VALUES
 ('practice.automation','practice','Practice automation','BOOLEAN','ACTIVE') ON CONFLICT(feature_key) DO NOTHING;
INSERT INTO permission_definition(permission_key,description) VALUES
 ('workflow.manage','Manage workflow definitions'),('workflow.advance','Advance operational workflow'),
 ('review.request','Request operational reviews'),('review.perform','Perform operational reviews'),
 ('review.approve','Approve operational reviews'),('review.override','Override approval gates'),
 ('automation.view','View automation rules and history'),('automation.manage','Manage automation rules'),
 ('automation.execute','Execute automation rules'),('recurrence.operations','View and dry-run recurring work operations'),
 ('recurrence.replay','Run bounded recurring work replay') ON CONFLICT(permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION seed_tenant_platform_defaults(p_tenant_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE key text;
BEGIN
 FOREACH key IN ARRAY ARRAY['OWNER','ADMIN','MEMBER'] LOOP
  INSERT INTO public.tenant_role(tenant_id,role_key,display_name,system_role) VALUES(p_tenant_id,key,initcap(lower(key)),true) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO public.tenant_role_permission(tenant_id,role_id,permission_key)
 SELECT r.tenant_id,r.id,p.permission_key FROM public.tenant_role r CROSS JOIN public.permission_definition p
 WHERE r.tenant_id=p_tenant_id AND (r.role_key IN ('OWNER','ADMIN') OR
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view','recurrence.view','deadlines.view','automation.view','recurrence.operations')))
 ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f
 WHERE f.feature_key IN ('practice.clients','practice.enabled','practice.work','practice.workflow','practice.automation')
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['work_template_stage','work_stage','practice_review','practice_review_point','automation_rule','automation_execution','recurrence_execution','recurrence_execution_item'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

REVOKE ALL ON work_template_stage,work_stage,practice_review,practice_review_point,automation_rule,automation_execution,recurrence_execution,recurrence_execution_item FROM PUBLIC,accounts_app;
GRANT SELECT,INSERT ON work_template_stage,work_stage,practice_review,practice_review_point,automation_rule,automation_execution,recurrence_execution,recurrence_execution_item TO accounts_app;
GRANT UPDATE(name,sequence,stage_type,default_assignee_role_id,default_reviewer_role_id,entry_criteria,completion_criteria,status,skippable,updated_by,updated_at) ON work_template_stage TO accounts_app;
GRANT UPDATE(status,assignee_member_id,reviewer_member_id,block_reason,started_at,completed_at,updated_by,updated_at) ON work_stage TO accounts_app;
GRANT UPDATE(status,reviewer_member_id,approver_member_id,started_at,decided_at,decision_by,decision_reason,updated_at) ON practice_review TO accounts_app;
GRANT UPDATE(status,assigned_member_id,resolution,addressed_at,cleared_at,updated_by,updated_at) ON practice_review_point TO accounts_app;
GRANT UPDATE(name,enabled,trigger_type,conditions,actions,priority,effective_from,effective_to,last_executed_at,last_failure_at,last_failure_code,updated_by,updated_at) ON automation_rule TO accounts_app;
GRANT UPDATE(status,actions_attempted,actions_completed,error_code,error_summary,completed_at) ON automation_execution TO accounts_app;
GRANT UPDATE(status,schedules_evaluated,work_generated,blocked_entitlement,skipped_idempotent,failures,warnings,diagnostic_summary,completed_at,resolved_at,resolved_by) ON recurrence_execution TO accounts_app;
GRANT UPDATE(work_template_stage_id,review_required) ON work_template_task TO accounts_app;
GRANT UPDATE(work_stage_id,review_required) ON practice_task TO accounts_app;
GRANT UPDATE(dependency_type,blocking_reason,resolved_at,resolved_by) ON practice_task_dependency TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0032','Operational workflow review automation and recurrence execution controls')
ON CONFLICT(version) DO NOTHING;

COMMIT;
