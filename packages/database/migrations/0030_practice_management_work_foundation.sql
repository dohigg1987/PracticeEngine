BEGIN;

-- PM-002 introduces Practice Management aggregates alongside the existing
-- Ledgerly engagement and workflow tables. No Ledgerly object is renamed or
-- widened into a generic operational record.
ALTER TABLE feature_definition ADD CONSTRAINT feature_definition_module_feature_uq
  UNIQUE(module_key,feature_key);

CREATE TABLE practice_service(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180),
  description text,
  category text NOT NULL CHECK(btrim(category)<>'' AND char_length(category)<=100),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  default_frequency text CHECK(default_frequency IS NULL OR btrim(default_frequency)<>''),
  responsible_team_id uuid,
  default_work_template_id uuid,
  specialist_module_key text REFERENCES module_definition(module_key),
  required_entitlement_feature_key text REFERENCES feature_definition(feature_key),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  FOREIGN KEY(specialist_module_key,required_entitlement_feature_key)
    REFERENCES feature_definition(module_key,feature_key),
  CHECK(specialist_module_key IS NOT NULL OR required_entitlement_feature_key IS NULL)
);

CREATE TABLE client_service(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  service_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','terminated')),
  start_date date NOT NULL,
  end_date date,
  frequency text CHECK(frequency IS NULL OR btrim(frequency)<>''),
  responsible_member_id uuid,
  responsible_team_id uuid,
  specialist_module_key text REFERENCES module_definition(module_key),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,service_id) REFERENCES practice_service(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  CHECK(end_date IS NULL OR end_date>=start_date),
  CHECK(status<>'terminated' OR end_date IS NOT NULL)
);

CREATE TABLE practice_engagement(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  reference text NOT NULL CHECK(btrim(reference)<>'' AND char_length(reference)<=100),
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=240),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','proposed','active','suspended','completed','terminated')),
  start_date date,
  end_date date,
  responsible_owner_id uuid,
  responsible_team_id uuid,
  acceptance_state text NOT NULL DEFAULT 'pending' CHECK(acceptance_state IN ('not_required','pending','accepted','declined')),
  accepted_by text,
  accepted_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,id,client_id),
  UNIQUE(tenant_id,reference),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_owner_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date),
  CHECK((acceptance_state='accepted')=(accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE TABLE practice_engagement_service(
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  client_service_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,engagement_id,client_service_id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id)
);

CREATE TABLE work_template(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=180),
  service_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,id,service_id),
  UNIQUE(tenant_id,name,version),
  FOREIGN KEY(tenant_id,service_id) REFERENCES practice_service(tenant_id,id)
);
ALTER TABLE practice_service ADD CONSTRAINT practice_service_default_template_fk
  FOREIGN KEY(tenant_id,default_work_template_id,id) REFERENCES work_template(tenant_id,id,service_id);

CREATE TABLE work_template_task(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  work_template_id uuid NOT NULL,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  description text,
  sequence integer NOT NULL CHECK(sequence>0),
  default_assignee_role_id uuid,
  default_team_id uuid,
  due_date_offset_days integer,
  mandatory boolean NOT NULL DEFAULT true,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,work_template_id,sequence),
  FOREIGN KEY(tenant_id,work_template_id) REFERENCES work_template(tenant_id,id),
  FOREIGN KEY(tenant_id,default_assignee_role_id) REFERENCES tenant_role(tenant_id,id),
  FOREIGN KEY(tenant_id,default_team_id) REFERENCES team(tenant_id,id)
);

CREATE TABLE work_item(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  client_service_id uuid NOT NULL,
  engagement_id uuid,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  period_reference text CHECK(period_reference IS NULL OR btrim(period_reference)<>''),
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','ready','in_progress','waiting_on_client','waiting_internal','review','completed','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  assigned_member_id uuid,
  assigned_team_id uuid,
  planned_start_date date,
  due_date date,
  completed_at timestamptz,
  specialist_module_key text REFERENCES module_definition(module_key),
  specialist_record_reference text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,client_service_id,client_id) REFERENCES client_service(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,assigned_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,assigned_team_id) REFERENCES team(tenant_id,id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK(specialist_record_reference IS NULL OR specialist_module_key IS NOT NULL)
);

CREATE TABLE practice_task(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  description text,
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','blocked','review','completed','skipped')),
  assignee_member_id uuid,
  team_id uuid,
  sequence integer NOT NULL CHECK(sequence>0),
  due_date date,
  completed_at timestamptz,
  reviewer_member_id uuid,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,work_item_id,sequence),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,assignee_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,team_id) REFERENCES team(tenant_id,id),
  FOREIGN KEY(tenant_id,reviewer_member_id) REFERENCES tenant_member(tenant_id,id),
  CHECK((status IN ('completed','skipped'))=(completed_at IS NOT NULL))
);

CREATE TABLE work_item_ledgerly_link(
  tenant_id uuid NOT NULL,
  work_item_id uuid NOT NULL,
  ledgerly_engagement_id uuid NOT NULL,
  required_feature_key text NOT NULL DEFAULT 'ledgerly.accounts' REFERENCES feature_definition(feature_key),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,work_item_id),
  UNIQUE(tenant_id,ledgerly_engagement_id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,ledgerly_engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK(required_feature_key LIKE 'ledgerly.%')
);

CREATE INDEX practice_service_status_idx ON practice_service(tenant_id,status,name);
CREATE INDEX client_service_client_status_idx ON client_service(tenant_id,client_id,status);
CREATE INDEX practice_engagement_client_status_idx ON practice_engagement(tenant_id,client_id,status);
CREATE INDEX work_item_operational_idx ON work_item(tenant_id,status,due_date,priority);
CREATE INDEX work_item_client_idx ON work_item(tenant_id,client_id,status,due_date);
CREATE INDEX practice_task_work_status_idx ON practice_task(tenant_id,work_item_id,status,sequence);
CREATE INDEX work_template_service_idx ON work_template(tenant_id,service_id,status,version DESC);

INSERT INTO permission_definition(permission_key,description) VALUES
 ('services.view','View the service catalogue and client services'),
 ('services.manage','Manage the service catalogue and client services'),
 ('engagements.view','View Practice Management engagements'),
 ('engagements.manage','Manage Practice Management engagements'),
 ('work.view','View work items'),('work.create','Create work items'),
 ('work.edit','Edit work items'),('work.assign','Assign work items'),
 ('work.complete','Complete work items'),('tasks.view','View work tasks'),
 ('tasks.manage','Manage work tasks'),('worktemplates.manage','Manage work templates')
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
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view')))
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

CREATE FUNCTION tenant_feature_is_enabled(p_tenant_id uuid,p_feature_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((
  SELECT decision.enabled FROM (
   SELECT o.enabled,1 precedence,o.valid_from,o.id FROM public.tenant_entitlement_override o
    WHERE o.tenant_id=p_tenant_id AND p_tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
     AND public.tenant_actor_is_active(p_tenant_id)
     AND o.feature_key=p_feature_key AND o.valid_from<=now() AND (o.valid_until IS NULL OR o.valid_until>now())
   UNION ALL
   SELECT e.enabled,2 precedence,e.valid_from,e.id FROM public.tenant_entitlement e
    WHERE e.tenant_id=p_tenant_id AND p_tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
     AND public.tenant_actor_is_active(p_tenant_id)
     AND e.feature_key=p_feature_key AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now())
  ) decision ORDER BY decision.precedence,decision.valid_from DESC,decision.id DESC LIMIT 1
 ),false) $$;

-- An entitlement gates creation/conversion into Ledgerly, but an entitlement
-- ending later must not freeze completion, cancellation or reassignment of an
-- already-Ledgerly work item.
CREATE FUNCTION work_item_ledgerly_update_allowed(
 p_tenant_id uuid,p_work_item_id uuid,p_new_module_key text,p_client_service_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  AND public.tenant_actor_is_active(p_tenant_id)
  AND (
   p_new_module_key IS DISTINCT FROM 'ledgerly'
   OR EXISTS(
    SELECT 1 FROM public.work_item existing_work
    WHERE existing_work.tenant_id=p_tenant_id AND existing_work.id=p_work_item_id
      AND existing_work.specialist_module_key='ledgerly'
   )
   OR (
    public.tenant_feature_is_enabled(p_tenant_id,'ledgerly.enabled') AND EXISTS(
     SELECT 1 FROM public.client_service entitlement_cs
     JOIN public.practice_service entitlement_ps
       ON entitlement_ps.tenant_id=entitlement_cs.tenant_id AND entitlement_ps.id=entitlement_cs.service_id
     WHERE entitlement_cs.tenant_id=p_tenant_id AND entitlement_cs.id=p_client_service_id
       AND public.tenant_feature_is_enabled(
        p_tenant_id,coalesce(entitlement_ps.required_entitlement_feature_key,'ledgerly.accounts')
       )
    )
   )
  ) $$;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['practice_service','client_service','practice_engagement','practice_engagement_service','work_template','work_template_task','practice_task'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

-- Specialized forced-RLS inventory: 'work_item' and
-- 'work_item_ledgerly_link' use entitlement-aware policies below.
ALTER TABLE work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item FORCE ROW LEVEL SECURITY;
CREATE POLICY work_item_select ON work_item FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id));
CREATE POLICY work_item_insert ON work_item FOR INSERT TO accounts_app
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id)
  AND (specialist_module_key IS DISTINCT FROM 'ledgerly' OR
   (tenant_feature_is_enabled(tenant_id,'ledgerly.enabled') AND EXISTS(
    SELECT 1 FROM client_service entitlement_cs
    JOIN practice_service entitlement_ps ON entitlement_ps.tenant_id=entitlement_cs.tenant_id AND entitlement_ps.id=entitlement_cs.service_id
    WHERE entitlement_cs.tenant_id=work_item.tenant_id AND entitlement_cs.id=work_item.client_service_id
      AND tenant_feature_is_enabled(work_item.tenant_id,coalesce(entitlement_ps.required_entitlement_feature_key,'ledgerly.accounts'))
   ))));
CREATE POLICY work_item_update ON work_item FOR UPDATE TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id))
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id)
  AND work_item_ledgerly_update_allowed(tenant_id,id,specialist_module_key,client_service_id));
CREATE POLICY work_item_owner ON work_item TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE work_item_ledgerly_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_ledgerly_link FORCE ROW LEVEL SECURITY;
CREATE POLICY work_item_ledgerly_link_select ON work_item_ledgerly_link FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id));
CREATE POLICY work_item_ledgerly_link_insert ON work_item_ledgerly_link FOR INSERT TO accounts_app
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tenant_actor_is_active(tenant_id)
  AND tenant_feature_is_enabled(tenant_id,'ledgerly.enabled') AND tenant_feature_is_enabled(tenant_id,required_feature_key)
  AND EXISTS(
   SELECT 1 FROM work_item entitlement_work
   JOIN client_service entitlement_cs ON entitlement_cs.tenant_id=entitlement_work.tenant_id AND entitlement_cs.id=entitlement_work.client_service_id
   JOIN practice_service entitlement_ps ON entitlement_ps.tenant_id=entitlement_cs.tenant_id AND entitlement_ps.id=entitlement_cs.service_id
   WHERE entitlement_work.tenant_id=work_item_ledgerly_link.tenant_id
     AND entitlement_work.id=work_item_ledgerly_link.work_item_id
     AND work_item_ledgerly_link.required_feature_key=coalesce(entitlement_ps.required_entitlement_feature_key,'ledgerly.accounts')
  ));
CREATE POLICY work_item_ledgerly_link_owner ON work_item_ledgerly_link TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON practice_service,client_service,practice_engagement,practice_engagement_service,
 work_template,work_template_task,work_item,practice_task,work_item_ledgerly_link FROM PUBLIC,accounts_app;
GRANT SELECT ON practice_service,client_service,practice_engagement,practice_engagement_service,
 work_template,work_template_task,work_item,practice_task,work_item_ledgerly_link TO accounts_app;
GRANT INSERT ON practice_service,client_service,practice_engagement,work_template,
 work_template_task,work_item,practice_task TO accounts_app;
GRANT UPDATE(name,description,category,status,default_frequency,responsible_team_id,
 default_work_template_id,specialist_module_key,required_entitlement_feature_key,updated_by,updated_at)
 ON practice_service TO accounts_app;
GRANT UPDATE(status,end_date,updated_by,updated_at) ON client_service TO accounts_app;
GRANT UPDATE(reference,name,status,start_date,end_date,responsible_owner_id,responsible_team_id,updated_by,updated_at)
 ON practice_engagement TO accounts_app;
GRANT UPDATE(name,status,updated_by,updated_at) ON work_template TO accounts_app;
GRANT UPDATE(title,period_reference,engagement_id,priority,assigned_member_id,assigned_team_id,
 planned_start_date,due_date,status,completed_at,specialist_module_key,specialist_record_reference,updated_by,updated_at)
 ON work_item TO accounts_app;
GRANT UPDATE(title,description,status,assignee_member_id,team_id,sequence,due_date,completed_at,
 reviewer_member_id,updated_by,updated_at) ON practice_task TO accounts_app;
GRANT INSERT ON practice_engagement_service,work_item_ledgerly_link TO accounts_app;
REVOKE INSERT,UPDATE ON tenant_entitlement_override FROM accounts_app;
REVOKE ALL ON FUNCTION tenant_feature_is_enabled(uuid,text),work_item_ledgerly_update_allowed(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_feature_is_enabled(uuid,text),work_item_ledgerly_update_allowed(uuid,uuid,text,uuid)
 TO accounts_app,neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0030','Practice Management services engagements work tasks templates and Ledgerly linkage')
ON CONFLICT(version) DO NOTHING;

COMMIT;
