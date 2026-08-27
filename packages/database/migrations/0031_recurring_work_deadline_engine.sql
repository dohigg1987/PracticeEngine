BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE tenant_member ADD COLUMN display_name text;
UPDATE tenant_member SET display_name=actor_id WHERE display_name IS NULL;
ALTER TABLE tenant_member ALTER COLUMN display_name SET NOT NULL;
CREATE OR REPLACE FUNCTION resolve_platform_user_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.platform_user(auth_provider,external_subject) VALUES('NEON_AUTH',NEW.actor_id)
  ON CONFLICT(auth_provider,external_subject) DO UPDATE SET external_subject=excluded.external_subject
  RETURNING id INTO NEW.user_id;
  NEW.display_name=coalesce(nullif(btrim(NEW.display_name),''),NEW.actor_id);
  NEW.updated_at=now(); RETURN NEW;
END $$;

ALTER TABLE client_service ADD COLUMN instance_key text NOT NULL DEFAULT 'primary'
  CHECK(btrim(instance_key)<>'' AND char_length(instance_key)<=100);
WITH duplicates AS (
  SELECT id,row_number() OVER(PARTITION BY tenant_id,client_id,service_id ORDER BY created_at,id) ordinal
  FROM client_service WHERE status='active'
)
UPDATE client_service cs SET instance_key='legacy-'||cs.id::text
FROM duplicates d WHERE d.id=cs.id AND d.ordinal>1;
ALTER TABLE client_service ADD CONSTRAINT client_service_active_period_excl
  EXCLUDE USING gist (
    tenant_id WITH =,client_id WITH =,service_id WITH =,instance_key WITH =,
    daterange(start_date,coalesce(end_date,'infinity'::date),'[]') WITH &&
  ) WHERE(status='active');

ALTER TABLE work_template DROP CONSTRAINT work_template_status_check;
UPDATE work_template SET status=CASE status WHEN 'active' THEN 'published' ELSE 'archived' END;
ALTER TABLE work_template ADD CONSTRAINT work_template_status_check
  CHECK(status IN ('draft','published','superseded','archived'));
ALTER TABLE work_template ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE work_template ADD COLUMN template_family_id uuid;
UPDATE work_template SET template_family_id=id WHERE template_family_id IS NULL;
ALTER TABLE work_template ALTER COLUMN template_family_id SET NOT NULL;
ALTER TABLE work_template ADD COLUMN published_at timestamptz;
UPDATE work_template SET published_at=created_at WHERE status IN ('published','superseded');
CREATE UNIQUE INDEX work_template_family_version_uq ON work_template(tenant_id,template_family_id,version);

CREATE TABLE deadline_rule(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180),
  rule_type text NOT NULL CHECK(rule_type IN ('days_after_period_end','days_before_date','fixed_calendar_day','months_after_period_end','months_plus_days','explicit_date','configurable')),
  configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,name)
);

CREATE TABLE recurring_work_schedule(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,client_service_id uuid NOT NULL,engagement_id uuid,
  work_template_id uuid NOT NULL,deadline_rule_id uuid,
  recurrence_rule jsonb NOT NULL CHECK(jsonb_typeof(recurrence_rule)='object'),
  effective_from date NOT NULL,effective_to date,
  generation_horizon_type text NOT NULL DEFAULT 'periods' CHECK(generation_horizon_type IN ('periods','date','next')),
  generation_horizon_value integer CHECK(generation_horizon_value IS NULL OR generation_horizon_value BETWEEN 1 AND 120),
  generation_horizon_date date,
  due_date_rule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(due_date_rule)='object'),
  default_assignee_member_id uuid,default_team_id uuid,
  specialist_module_key text REFERENCES module_definition(module_key),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','blocked_entitlement','archived')),
  last_generated_at timestamptz,last_generated_occurrence date,
  next_occurrence_date date,next_due_date date,
  generation_block_reason text,
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,work_template_id) REFERENCES work_template(tenant_id,id),
  FOREIGN KEY(tenant_id,deadline_rule_id) REFERENCES deadline_rule(tenant_id,id),
  FOREIGN KEY(tenant_id,default_assignee_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,default_team_id) REFERENCES team(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  CHECK((generation_horizon_type='periods' AND generation_horizon_value IS NOT NULL) OR
        (generation_horizon_type='date' AND generation_horizon_date IS NOT NULL) OR generation_horizon_type='next')
);

CREATE TABLE recurrence_generation(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
  recurring_schedule_id uuid NOT NULL,occurrence_date date NOT NULL,
  period_start date NOT NULL,period_end date NOT NULL,work_item_id uuid,
  idempotency_key text NOT NULL,status text NOT NULL CHECK(status IN ('generated','blocked_entitlement','failed')),
  error_code text,generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,recurring_schedule_id,occurrence_date),UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,recurring_schedule_id) REFERENCES recurring_work_schedule(tenant_id,id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  CHECK(period_end>=period_start)
);

ALTER TABLE work_item
  ADD COLUMN period_start date,ADD COLUMN period_end date,
  ADD COLUMN source_template_id uuid,ADD COLUMN source_template_version integer,
  ADD COLUMN recurring_schedule_id uuid,ADD COLUMN generation_id uuid,
  ADD COLUMN calculated_due_date date,ADD COLUMN due_date_rule_id uuid,
  ADD COLUMN due_date_calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN due_date_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN due_date_override_reason text,ADD COLUMN due_date_override_actor text,
  ADD COLUMN due_date_overridden_at timestamptz;
ALTER TABLE work_item ADD FOREIGN KEY(tenant_id,source_template_id) REFERENCES work_template(tenant_id,id);
ALTER TABLE work_item ADD FOREIGN KEY(tenant_id,recurring_schedule_id) REFERENCES recurring_work_schedule(tenant_id,id);
ALTER TABLE work_item ADD FOREIGN KEY(tenant_id,generation_id) REFERENCES recurrence_generation(tenant_id,id);
ALTER TABLE work_item ADD FOREIGN KEY(tenant_id,due_date_rule_id) REFERENCES deadline_rule(tenant_id,id);
ALTER TABLE work_item ADD CONSTRAINT work_item_period_ck CHECK(period_end IS NULL OR period_start IS NULL OR period_end>=period_start);
ALTER TABLE work_item ADD CONSTRAINT work_item_deadline_override_ck CHECK(
  (NOT due_date_overridden AND due_date_override_reason IS NULL AND due_date_override_actor IS NULL AND due_date_overridden_at IS NULL)
  OR (due_date_overridden AND btrim(due_date_override_reason)<>'' AND due_date_override_actor IS NOT NULL AND due_date_overridden_at IS NOT NULL));

ALTER TABLE practice_task ADD COLUMN source_template_task_id uuid,ADD COLUMN mandatory boolean NOT NULL DEFAULT true;
ALTER TABLE practice_task ADD FOREIGN KEY(tenant_id,source_template_task_id) REFERENCES work_template_task(tenant_id,id);

CREATE TABLE practice_task_dependency(
  tenant_id uuid NOT NULL,predecessor_task_id uuid NOT NULL,successor_task_id uuid NOT NULL,
  dependency_type text NOT NULL DEFAULT 'finish_to_start' CHECK(dependency_type='finish_to_start'),
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,predecessor_task_id,successor_task_id),
  FOREIGN KEY(tenant_id,predecessor_task_id) REFERENCES practice_task(tenant_id,id),
  FOREIGN KEY(tenant_id,successor_task_id) REFERENCES practice_task(tenant_id,id),
  CHECK(predecessor_task_id<>successor_task_id)
);

CREATE INDEX recurring_schedule_next_idx ON recurring_work_schedule(tenant_id,status,next_occurrence_date);
CREATE INDEX recurring_schedule_client_idx ON recurring_work_schedule(tenant_id,client_id,status);
CREATE INDEX recurrence_generation_schedule_idx ON recurrence_generation(tenant_id,recurring_schedule_id,occurrence_date DESC);
CREATE INDEX work_item_schedule_idx ON work_item(tenant_id,recurring_schedule_id,period_end);

INSERT INTO permission_definition(permission_key,description) VALUES
 ('recurrence.view','View recurring work schedules'),('recurrence.manage','Manage recurring work schedules'),
 ('deadlines.view','View calculated deadline provenance'),('deadlines.override','Override calculated work deadlines'),
 ('work.generate','Generate work from recurring schedules'),('worktemplates.publish','Publish versioned work templates')
ON CONFLICT(permission_key) DO NOTHING;

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
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view','recurrence.view','deadlines.view')))
 ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f
 WHERE f.feature_key IN ('practice.clients','practice.enabled','practice.work','practice.workflow')
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['deadline_rule','recurring_work_schedule','recurrence_generation','practice_task_dependency'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

REVOKE ALL ON deadline_rule,recurring_work_schedule,recurrence_generation,practice_task_dependency FROM PUBLIC,accounts_app;
GRANT SELECT ON deadline_rule,recurring_work_schedule,recurrence_generation,practice_task_dependency TO accounts_app;
GRANT INSERT ON deadline_rule,recurring_work_schedule,recurrence_generation,practice_task_dependency TO accounts_app;
GRANT UPDATE(name,configuration,status,updated_by,updated_at) ON deadline_rule TO accounts_app;
GRANT UPDATE(recurrence_rule,effective_from,effective_to,generation_horizon_type,generation_horizon_value,generation_horizon_date,due_date_rule,default_assignee_member_id,default_team_id,status,last_generated_at,last_generated_occurrence,next_occurrence_date,next_due_date,generation_block_reason,updated_by,updated_at) ON recurring_work_schedule TO accounts_app;
GRANT UPDATE(work_item_id,status,error_code) ON recurrence_generation TO accounts_app;
GRANT UPDATE(display_name) ON tenant_member TO accounts_app;
GRANT UPDATE(status,published_at,updated_by,updated_at) ON work_template TO accounts_app;
GRANT UPDATE(period_start,period_end,source_template_id,source_template_version,recurring_schedule_id,generation_id,calculated_due_date,due_date_rule_id,due_date_calculation,due_date_overridden,due_date_override_reason,due_date_override_actor,due_date_overridden_at) ON work_item TO accounts_app;
GRANT UPDATE(source_template_task_id,mandatory) ON practice_task TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0031','Recurring work schedules deadline rules template instantiation and generation safety')
ON CONFLICT(version) DO NOTHING;

COMMIT;
