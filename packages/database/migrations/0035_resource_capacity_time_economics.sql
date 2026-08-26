BEGIN;

-- PM-007 extends the existing tenant membership and Practice work model. It
-- deliberately does not create another employee, client, service or ledger.
ALTER TABLE work_template
  ADD COLUMN estimated_effort_minutes integer CHECK(estimated_effort_minutes IS NULL OR estimated_effort_minutes>=0),
  ADD COLUMN estimate_provenance text CHECK(estimate_provenance IS NULL OR estimate_provenance IN ('template','manual_override','historical_derived'));
ALTER TABLE work_template_task
  ADD COLUMN estimated_effort_minutes integer CHECK(estimated_effort_minutes IS NULL OR estimated_effort_minutes>=0);
ALTER TABLE work_item
  ADD COLUMN planned_end_date date,
  ADD COLUMN planned_effort_minutes integer CHECK(planned_effort_minutes IS NULL OR planned_effort_minutes>=0),
  ADD COLUMN estimated_effort_minutes integer CHECK(estimated_effort_minutes IS NULL OR estimated_effort_minutes>=0),
  ADD COLUMN remaining_effort_minutes integer CHECK(remaining_effort_minutes IS NULL OR remaining_effort_minutes>=0),
  ADD COLUMN estimate_provenance text CHECK(estimate_provenance IS NULL OR estimate_provenance IN ('template','manual_override','historical_derived')),
  ADD COLUMN review_member_id uuid,
  ADD COLUMN assignment_state text NOT NULL DEFAULT 'proposed' CHECK(assignment_state IN ('proposed','confirmed','completed','cancelled')),
  ADD FOREIGN KEY(tenant_id,review_member_id) REFERENCES tenant_member(tenant_id,id),
  ADD CONSTRAINT work_item_planned_period_ck CHECK(planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date>=planned_start_date),
  ADD CONSTRAINT work_item_tenant_work_client_service_uq UNIQUE(tenant_id,id,client_id,client_service_id);
ALTER TABLE practice_task
  ADD COLUMN estimated_effort_minutes integer CHECK(estimated_effort_minutes IS NULL OR estimated_effort_minutes>=0),
  ADD COLUMN remaining_effort_minutes integer CHECK(remaining_effort_minutes IS NULL OR remaining_effort_minutes>=0),
  ADD CONSTRAINT practice_task_tenant_task_work_uq UNIQUE(tenant_id,id,work_item_id);
ALTER TABLE quotebench_proposal_reference
  ADD COLUMN accepted_value numeric(18,2) CHECK(accepted_value IS NULL OR accepted_value>=0),
  ADD COLUMN accepted_currency char(3) CHECK(accepted_currency IS NULL OR accepted_currency=upper(accepted_currency)),
  ADD COLUMN billing_model text CHECK(billing_model IS NULL OR billing_model IN ('fixed_fee','time_and_materials','subscription','retainer','other')),
  ADD COLUMN billing_frequency text CHECK(billing_frequency IS NULL OR char_length(billing_frequency)<=80),
  ADD COLUMN accepted_service_values jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(accepted_service_values)='array');

CREATE TABLE resource_profile(
  tenant_id uuid NOT NULL,
  tenant_member_id uuid NOT NULL,
  job_title text CHECK(job_title IS NULL OR char_length(job_title)<=160),
  resource_status text NOT NULL DEFAULT 'active' CHECK(resource_status IN ('active','inactive','unavailable','future_starter')),
  manager_member_id uuid,
  location_code text CHECK(location_code IS NULL OR char_length(location_code)<=100),
  skills jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(skills)='array'),
  standard_capacity_minutes_week integer NOT NULL DEFAULT 2250 CHECK(standard_capacity_minutes_week BETWEEN 0 AND 10080),
  utilisation_target numeric(5,2) CHECK(utilisation_target IS NULL OR utilisation_target BETWEEN 0 AND 100),
  chargeability_target numeric(5,2) CHECK(chargeability_target IS NULL OR chargeability_target BETWEEN 0 AND 100),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,tenant_member_id),
  FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,manager_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(manager_member_id IS NULL OR manager_member_id<>tenant_member_id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
);

CREATE FUNCTION sync_resource_profile_from_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.resource_profile(tenant_id,tenant_member_id,resource_status,effective_from,created_by,updated_by)
 VALUES(NEW.tenant_id,NEW.id,CASE WHEN NEW.membership_status='ACTIVE' THEN 'active' ELSE 'inactive' END,current_date,NEW.actor_id,NEW.actor_id)
 ON CONFLICT(tenant_id,tenant_member_id) DO UPDATE SET
  resource_status=CASE WHEN NEW.membership_status='ACTIVE' AND resource_profile.resource_status='inactive' THEN 'active'
                       WHEN NEW.membership_status<>'ACTIVE' THEN 'inactive' ELSE resource_profile.resource_status END,
  updated_by=NEW.actor_id,updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_member_resource_profile
AFTER INSERT OR UPDATE OF membership_status ON tenant_member
FOR EACH ROW EXECUTE FUNCTION sync_resource_profile_from_membership();
INSERT INTO resource_profile(tenant_id,tenant_member_id,resource_status,effective_from,created_by,updated_by)
SELECT tenant_id,id,CASE WHEN membership_status='ACTIVE' THEN 'active' ELSE 'inactive' END,current_date,actor_id,actor_id
FROM tenant_member ON CONFLICT(tenant_id,tenant_member_id) DO NOTHING;

CREATE TABLE resource_working_pattern(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,tenant_member_id uuid NOT NULL,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=120),
  effective_from date NOT NULL,effective_to date,
  monday_minutes integer NOT NULL DEFAULT 450 CHECK(monday_minutes BETWEEN 0 AND 1440),
  tuesday_minutes integer NOT NULL DEFAULT 450 CHECK(tuesday_minutes BETWEEN 0 AND 1440),
  wednesday_minutes integer NOT NULL DEFAULT 450 CHECK(wednesday_minutes BETWEEN 0 AND 1440),
  thursday_minutes integer NOT NULL DEFAULT 450 CHECK(thursday_minutes BETWEEN 0 AND 1440),
  friday_minutes integer NOT NULL DEFAULT 450 CHECK(friday_minutes BETWEEN 0 AND 1440),
  saturday_minutes integer NOT NULL DEFAULT 0 CHECK(saturday_minutes BETWEEN 0 AND 1440),
  sunday_minutes integer NOT NULL DEFAULT 0 CHECK(sunday_minutes BETWEEN 0 AND 1440),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
ALTER TABLE resource_working_pattern ADD CONSTRAINT resource_working_pattern_period_excl
  EXCLUDE USING gist(tenant_id WITH =,tenant_member_id WITH =,daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') WITH &&);

CREATE TABLE resource_availability_adjustment(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,tenant_member_id uuid NOT NULL,
  adjustment_type text NOT NULL CHECK(adjustment_type IN ('annual_leave','training','internal_commitment','unavailable','additional_capacity','other')),
  starts_on date NOT NULL,ends_on date NOT NULL,
  capacity_delta_minutes integer NOT NULL CHECK(capacity_delta_minutes BETWEEN -1440 AND 1440 AND capacity_delta_minutes<>0),
  description text CHECK(description IS NULL OR char_length(description)<=500),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(ends_on>=starts_on)
);

CREATE TABLE work_assignment_history(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,work_item_id uuid NOT NULL,
  previous_member_id uuid,assigned_member_id uuid,previous_team_id uuid,assigned_team_id uuid,review_member_id uuid,
  planned_effort_minutes integer CHECK(planned_effort_minutes IS NULL OR planned_effort_minutes>=0),
  planned_start_date date,planned_end_date date,
  assignment_state text NOT NULL CHECK(assignment_state IN ('proposed','confirmed','completed','cancelled')),
  change_reason text CHECK(change_reason IS NULL OR char_length(change_reason)<=1000),
  changed_by text NOT NULL CHECK(btrim(changed_by)<>''),changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,previous_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,assigned_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,previous_team_id) REFERENCES team(tenant_id,id),
  FOREIGN KEY(tenant_id,assigned_team_id) REFERENCES team(tenant_id,id),
  FOREIGN KEY(tenant_id,review_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date>=planned_start_date)
);

CREATE TABLE resource_cost_rate(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,tenant_member_id uuid NOT NULL,
  effective_from date NOT NULL,effective_to date,
  internal_cost_rate numeric(18,4) NOT NULL CHECK(internal_cost_rate>=0),currency char(3) NOT NULL CHECK(currency=upper(currency)),
  rate_basis text NOT NULL CHECK(rate_basis IN ('hourly','daily')),
  provenance text NOT NULL CHECK(btrim(provenance)<>'' AND char_length(provenance)<=200),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
ALTER TABLE resource_cost_rate ADD CONSTRAINT resource_cost_rate_period_excl
  EXCLUDE USING gist(tenant_id WITH =,tenant_member_id WITH =,currency WITH =,rate_basis WITH =,daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') WITH &&);

CREATE TABLE time_entry(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,tenant_member_id uuid NOT NULL,
  entry_date date NOT NULL,client_id uuid NOT NULL,engagement_id uuid,client_service_id uuid NOT NULL,work_item_id uuid NOT NULL,practice_task_id uuid,
  duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
  narrative text CHECK(narrative IS NULL OR char_length(narrative)<=2000),
  classification text NOT NULL CHECK(classification IN ('billable','non_billable')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
  cost_rate_id uuid,cost_rate_snapshot numeric(18,4),cost_rate_basis text CHECK(cost_rate_basis IS NULL OR cost_rate_basis IN ('hourly','daily')),
  cost_amount_snapshot numeric(18,4),currency char(3),
  billable_value_snapshot numeric(18,4),value_provenance text CHECK(value_provenance IS NULL OR char_length(value_provenance)<=200),
  approved_by text,approved_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,work_item_id,client_id,client_service_id) REFERENCES work_item(tenant_id,id,client_id,client_service_id),
  FOREIGN KEY(tenant_id,practice_task_id,work_item_id) REFERENCES practice_task(tenant_id,id,work_item_id),
  FOREIGN KEY(tenant_id,cost_rate_id) REFERENCES resource_cost_rate(tenant_id,id),
  CHECK((cost_rate_id IS NULL AND cost_rate_snapshot IS NULL AND cost_amount_snapshot IS NULL AND currency IS NULL) OR
        (cost_rate_id IS NOT NULL AND cost_rate_snapshot IS NOT NULL AND cost_amount_snapshot IS NOT NULL AND currency=upper(currency))),
  CHECK((status='approved')=(approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE work_commercial_context(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,client_service_id uuid NOT NULL,
  engagement_id uuid,work_item_id uuid,proposal_reference_id uuid,
  agreed_value numeric(18,2) NOT NULL CHECK(agreed_value>=0),currency char(3) NOT NULL CHECK(currency=upper(currency)),
  billing_model text NOT NULL CHECK(billing_model IN ('fixed_fee','time_and_materials','subscription','retainer','other')),
  billing_frequency text CHECK(billing_frequency IS NULL OR char_length(billing_frequency)<=80),
  value_status text NOT NULL DEFAULT 'known' CHECK(value_status IN ('known','estimated')),
  source_type text NOT NULL CHECK(source_type IN ('quotebench_accepted_proposal','manual_authorised','external_billing')),
  source_version text CHECK(source_version IS NULL OR char_length(source_version)<=100),
  effective_from date NOT NULL,effective_to date,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,work_item_id,client_id,client_service_id) REFERENCES work_item(tenant_id,id,client_id,client_service_id),
  FOREIGN KEY(tenant_id,proposal_reference_id) REFERENCES quotebench_proposal_reference(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  CHECK(source_type<>'quotebench_accepted_proposal' OR proposal_reference_id IS NOT NULL)
);

CREATE TABLE billing_recovery(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,client_service_id uuid NOT NULL,
  engagement_id uuid,work_item_id uuid,recovery_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK(amount>=0),currency char(3) NOT NULL CHECK(currency=upper(currency)),
  recovery_type text NOT NULL CHECK(recovery_type IN ('billed','recovered','credit','write_off')),
  source_reference text NOT NULL CHECK(btrim(source_reference)<>'' AND char_length(source_reference)<=300),
  provenance text NOT NULL CHECK(btrim(provenance)<>'' AND char_length(provenance)<=200),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,work_item_id,client_id,client_service_id) REFERENCES work_item(tenant_id,id,client_id,client_service_id)
);

CREATE INDEX resource_profile_status_idx ON resource_profile(tenant_id,resource_status,tenant_member_id);
CREATE INDEX resource_pattern_member_period_idx ON resource_working_pattern(tenant_id,tenant_member_id,effective_from,effective_to);
CREATE INDEX resource_adjustment_period_idx ON resource_availability_adjustment(tenant_id,tenant_member_id,starts_on,ends_on);
CREATE INDEX work_assignment_member_period_idx ON work_assignment_history(tenant_id,assigned_member_id,planned_start_date,planned_end_date);
CREATE INDEX time_entry_resource_date_idx ON time_entry(tenant_id,tenant_member_id,entry_date,status);
CREATE INDEX time_entry_work_date_idx ON time_entry(tenant_id,work_item_id,entry_date,status);
CREATE INDEX commercial_context_client_idx ON work_commercial_context(tenant_id,client_id,client_service_id,effective_from);
CREATE INDEX billing_recovery_client_idx ON billing_recovery(tenant_id,client_id,recovery_date);

INSERT INTO feature_definition(feature_key,module_key,display_name,value_type,status) VALUES
 ('practice.resources','practice','Resources','BOOLEAN','ACTIVE'),('practice.capacity','practice','Capacity planning','BOOLEAN','ACTIVE'),
 ('practice.time','practice','Time capture','BOOLEAN','ACTIVE'),('practice.wip','practice','Operational WIP','BOOLEAN','ACTIVE'),
 ('practice.economics','practice','Practice economics','BOOLEAN','ACTIVE'),('practice.reporting','practice','Management reporting','BOOLEAN','ACTIVE')
ON CONFLICT(feature_key) DO NOTHING;

INSERT INTO permission_definition(permission_key,description) VALUES
 ('resources.view','View operational resource profiles'),('resources.manage','Manage operational resource profiles'),
 ('capacity.view','View capacity and workload'),('capacity.manage','Manage working patterns and availability'),
 ('assignments.manage','Plan and reassign work'),('time.view','View permitted time entries'),
 ('time.enter','Enter own time'),('time.manage','Manage time entries'),('time.approve','Approve submitted time'),
 ('costrates.view','View restricted internal cost rates'),('costrates.manage','Manage restricted internal cost rates'),
 ('economics.view','View restricted WIP and economics'),('economics.manage','Manage commercial and recovery context'),
 ('portfolio.view','View management portfolios')
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
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view','recurrence.view','deadlines.view','automation.view','recurrence.operations','crm.view','onboarding.view','notifications.view','client_requests.view','portal_messages.view','resources.view','capacity.view','time.view','time.enter')))
 ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f
 WHERE f.feature_key IN ('practice.clients','practice.enabled','practice.work','practice.workflow','practice.automation','practice.crm','practice.onboarding','practice.portal','practice.portal.requests','practice.portal.documents','practice.portal.messaging','practice.resources','practice.capacity','practice.time','practice.wip','practice.economics','practice.reporting')
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.crm_stage_definition(tenant_id,stage_key,display_name,sequence,default_probability,terminal_outcome,created_by,updated_by) VALUES
  (p_tenant_id,'qualification','Qualification',10,10,NULL,'migration-0035','migration-0035'),
  (p_tenant_id,'discovery','Discovery',20,25,NULL,'migration-0035','migration-0035'),
  (p_tenant_id,'scoped','Scoped',30,50,NULL,'migration-0035','migration-0035'),
  (p_tenant_id,'proposal','Proposal',40,65,NULL,'migration-0035','migration-0035'),
  (p_tenant_id,'negotiation','Negotiation',50,80,NULL,'migration-0035','migration-0035'),
  (p_tenant_id,'won','Won',60,100,'won','migration-0035','migration-0035'),
  (p_tenant_id,'lost','Lost',70,0,'lost','migration-0035','migration-0035')
 ON CONFLICT(tenant_id,stage_key) DO NOTHING;
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['resource_profile','resource_working_pattern','resource_availability_adjustment','work_assignment_history'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY; ALTER TABLE time_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY time_entry_actor ON time_entry TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id) AND
  (actor_has_permission('time.view') OR EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=time_entry.tenant_id AND tm.id=time_entry.tenant_member_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),''))))
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id) AND
  (actor_has_permission('time.manage') OR EXISTS(SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=time_entry.tenant_id AND tm.id=time_entry.tenant_member_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),''))));
CREATE POLICY time_entry_owner ON time_entry TO neondb_owner USING(true) WITH CHECK(true);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['resource_cost_rate','work_commercial_context','billing_recovery'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_economics_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id) AND actor_has_permission(''economics.view'')) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id) AND actor_has_permission(''economics.manage''))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;
DROP POLICY resource_cost_rate_economics_actor ON resource_cost_rate;
CREATE POLICY resource_cost_rate_economics_actor ON resource_cost_rate TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id) AND
  (actor_has_permission('costrates.view') OR actor_has_permission('time.manage') OR (actor_has_permission('time.enter') AND EXISTS(
   SELECT 1 FROM tenant_member tm WHERE tm.tenant_id=resource_cost_rate.tenant_id AND tm.id=resource_cost_rate.tenant_member_id
    AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')))))
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id) AND actor_has_permission('costrates.manage'));
CREATE POLICY work_commercial_context_quotebench_insert ON work_commercial_context FOR INSERT TO accounts_app
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  AND nullif(current_setting('app.actor_id',true),'') LIKE 'quotebench:%'
  AND machine_tenant_feature_enabled(tenant_id,'quotebench.proposals')
  AND source_type='quotebench_accepted_proposal'
  AND EXISTS(SELECT 1 FROM quotebench_proposal_reference q
   WHERE q.tenant_id=work_commercial_context.tenant_id AND q.id=work_commercial_context.proposal_reference_id AND q.status='accepted'));

REVOKE ALL ON resource_profile,resource_working_pattern,resource_availability_adjustment,work_assignment_history,
 resource_cost_rate,time_entry,work_commercial_context,billing_recovery FROM PUBLIC,accounts_app;
GRANT SELECT,INSERT,UPDATE ON resource_profile,resource_working_pattern,resource_availability_adjustment,work_assignment_history TO accounts_app;
GRANT SELECT,INSERT ON time_entry TO accounts_app;
GRANT UPDATE(duration_minutes,narrative,classification,status,approved_by,approved_at,updated_by,updated_at,cost_amount_snapshot) ON time_entry TO accounts_app;
GRANT SELECT,INSERT ON resource_cost_rate,work_commercial_context,billing_recovery TO accounts_app;
GRANT UPDATE(effective_to,updated_by,updated_at) ON resource_cost_rate TO accounts_app;
GRANT UPDATE(agreed_value,currency,billing_model,billing_frequency,value_status,effective_to,updated_by,updated_at) ON work_commercial_context TO accounts_app;
GRANT UPDATE(planned_end_date,planned_effort_minutes,estimated_effort_minutes,remaining_effort_minutes,estimate_provenance,review_member_id,assignment_state) ON work_item TO accounts_app;
GRANT UPDATE(estimated_effort_minutes,estimate_provenance) ON work_template TO accounts_app;
GRANT UPDATE(estimated_effort_minutes) ON work_template_task TO accounts_app;
GRANT UPDATE(estimated_effort_minutes,remaining_effort_minutes) ON practice_task TO accounts_app;
GRANT UPDATE(accepted_value,accepted_currency,billing_model,billing_frequency,accepted_service_values) ON quotebench_proposal_reference TO accounts_app;
REVOKE ALL ON FUNCTION sync_resource_profile_from_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_resource_profile_from_membership() TO neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0035','Practice resource profiles capacity time capture WIP and management economics')
ON CONFLICT(version) DO NOTHING;

COMMIT;
