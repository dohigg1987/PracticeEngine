BEGIN;

-- PM-005 keeps pre-client commercial records in Practice Management, reuses
-- the canonical contact/client/service/work aggregates and stores only the
-- QuoteBench integration reference owned by PracticeEngine.
CREATE TABLE crm_stage_definition(
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK(stage_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  display_name text NOT NULL CHECK(btrim(display_name)<>'' AND char_length(display_name)<=100),
  sequence integer NOT NULL CHECK(sequence>0),
  default_probability numeric(5,2) CHECK(default_probability BETWEEN 0 AND 100),
  terminal_outcome text CHECK(terminal_outcome IN ('won','lost')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,stage_key),
  UNIQUE(tenant_id,sequence)
);

CREATE TABLE prospect(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK(btrim(display_name)<>'' AND char_length(display_name)<=240),
  legal_name text CHECK(legal_name IS NULL OR (btrim(legal_name)<>'' AND char_length(legal_name)<=240)),
  entity_type text NOT NULL CHECK(entity_type IN ('COMPANY','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','TRUST','OTHER')),
  status text NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','qualified','converted','lost','archived')),
  primary_contact_id uuid,
  responsible_member_id uuid,
  responsible_team_id uuid,
  source text CHECK(source IS NULL OR char_length(source)<=120),
  converted_client_id uuid,
  converted_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,primary_contact_id) REFERENCES contact(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  FOREIGN KEY(tenant_id,converted_client_id) REFERENCES organisation(tenant_id,id),
  CHECK((status='converted')=(converted_client_id IS NOT NULL AND converted_at IS NOT NULL))
);

CREATE TABLE prospect_contact_relationship(
  tenant_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  relationship_type text NOT NULL DEFAULT 'CONTACT' CHECK(btrim(relationship_type)<>'' AND char_length(relationship_type)<=80),
  is_primary boolean NOT NULL DEFAULT false,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,prospect_id,contact_id),
  FOREIGN KEY(tenant_id,prospect_id) REFERENCES prospect(tenant_id,id),
  FOREIGN KEY(tenant_id,contact_id) REFERENCES contact(tenant_id,id)
);
CREATE UNIQUE INDEX prospect_one_primary_contact_uq
  ON prospect_contact_relationship(tenant_id,prospect_id) WHERE is_primary;

CREATE TABLE opportunity(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  prospect_id uuid,
  existing_client_id uuid,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=240),
  stage_key text NOT NULL,
  responsible_member_id uuid,
  responsible_team_id uuid,
  expected_close_date date,
  probability numeric(5,2) CHECK(probability BETWEEN 0 AND 100),
  estimated_value numeric(18,2) CHECK(estimated_value IS NULL OR estimated_value>=0),
  currency char(3) NOT NULL DEFAULT 'GBP' CHECK(currency=upper(currency)),
  source text CHECK(source IS NULL OR char_length(source)<=120),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','won','lost','cancelled')),
  outcome_reason text CHECK(outcome_reason IS NULL OR char_length(outcome_reason)<=1000),
  conversion_state text NOT NULL DEFAULT 'not_converted' CHECK(conversion_state IN ('not_converted','converting','converted','failed')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,prospect_id) REFERENCES prospect(tenant_id,id),
  FOREIGN KEY(tenant_id,existing_client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,stage_key) REFERENCES crm_stage_definition(tenant_id,stage_key),
  FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  CHECK(prospect_id IS NOT NULL OR existing_client_id IS NOT NULL)
);

CREATE TABLE opportunity_service(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  service_id uuid NOT NULL,
  notes text CHECK(notes IS NULL OR char_length(notes)<=2000),
  accepted boolean NOT NULL DEFAULT false,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,opportunity_id,service_id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES opportunity(tenant_id,id),
  FOREIGN KEY(tenant_id,service_id) REFERENCES practice_service(tenant_id,id)
);

CREATE TABLE crm_activity(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  prospect_id uuid,
  opportunity_id uuid,
  activity_type text NOT NULL CHECK(activity_type IN ('note','call','email','meeting','stage_change','system')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL CHECK(btrim(summary)<>'' AND char_length(summary)<=4000),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,prospect_id) REFERENCES prospect(tenant_id,id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES opportunity(tenant_id,id),
  CHECK(prospect_id IS NOT NULL OR opportunity_id IS NOT NULL)
);

CREATE TABLE quotebench_proposal_reference(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  proposal_id text NOT NULL CHECK(btrim(proposal_id)<>'' AND char_length(proposal_id)<=200),
  proposal_version text NOT NULL DEFAULT '1' CHECK(btrim(proposal_version)<>'' AND char_length(proposal_version)<=80),
  status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','sent','viewed','accepted','declined','expired')),
  commercial_acceptance_reference text CHECK(commercial_acceptance_reference IS NULL OR char_length(commercial_acceptance_reference)<=500),
  accepted_event_id uuid,
  accepted_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,proposal_id,proposal_version),
  UNIQUE(tenant_id,opportunity_id,proposal_id,proposal_version),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES opportunity(tenant_id,id),
  CHECK((status='accepted')=(accepted_event_id IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE TABLE specialist_event_receipt(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES module_definition(module_key),
  event_id uuid NOT NULL,
  event_type text NOT NULL CHECK(btrim(event_type)<>'' AND char_length(event_type)<=160),
  payload_version integer NOT NULL DEFAULT 1 CHECK(payload_version>0),
  status text NOT NULL CHECK(status IN ('processed','ignored')),
  subject_reference text NOT NULL CHECK(btrim(subject_reference)<>'' AND char_length(subject_reference)<=240),
  processed_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,module_key,event_id)
);

ALTER TABLE client_service
  ADD COLUMN delivery_readiness text NOT NULL DEFAULT 'active'
    CHECK(delivery_readiness IN ('commercially_accepted','onboarding','ready_for_delivery','active')),
  ADD COLUMN originating_opportunity_service_id uuid;

CREATE TABLE onboarding_case(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  proposal_reference_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  work_template_id uuid,
  work_item_id uuid,
  responsible_member_id uuid,
  responsible_team_id uuid,
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','blocked','ready_for_delivery','completed','cancelled')),
  mandatory_gates_complete boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,opportunity_id,proposal_reference_id),
  UNIQUE(tenant_id,work_item_id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES opportunity(tenant_id,id),
  FOREIGN KEY(tenant_id,proposal_reference_id) REFERENCES quotebench_proposal_reference(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,work_template_id) REFERENCES work_template(tenant_id,id),
  FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
  FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK(status<>'completed' OR mandatory_gates_complete)
);

CREATE TABLE onboarding_case_service(
  tenant_id uuid NOT NULL,
  onboarding_case_id uuid NOT NULL,
  client_service_id uuid NOT NULL,
  opportunity_service_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,onboarding_case_id,client_service_id),
  UNIQUE(tenant_id,opportunity_service_id),
  FOREIGN KEY(tenant_id,onboarding_case_id) REFERENCES onboarding_case(tenant_id,id),
  FOREIGN KEY(tenant_id,client_service_id) REFERENCES client_service(tenant_id,id),
  FOREIGN KEY(tenant_id,opportunity_service_id) REFERENCES opportunity_service(tenant_id,id)
);

CREATE TABLE onboarding_blocker(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  onboarding_case_id uuid NOT NULL,
  summary text NOT NULL CHECK(btrim(summary)<>'' AND char_length(summary)<=1000),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolved_at timestamptz,
  resolved_by text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,onboarding_case_id) REFERENCES onboarding_case(tenant_id,id),
  CHECK((status='resolved')=(resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);

CREATE TABLE crm_conversion(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  acceptance_event_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  proposal_reference_id uuid NOT NULL,
  prospect_id uuid,
  client_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  onboarding_case_id uuid NOT NULL,
  converted_at timestamptz NOT NULL DEFAULT now(),
  converted_by text NOT NULL CHECK(btrim(converted_by)<>''),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,acceptance_event_id),
  UNIQUE(tenant_id,opportunity_id,proposal_reference_id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES opportunity(tenant_id,id),
  FOREIGN KEY(tenant_id,proposal_reference_id) REFERENCES quotebench_proposal_reference(tenant_id,id),
  FOREIGN KEY(tenant_id,prospect_id) REFERENCES prospect(tenant_id,id),
  FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,client_id) REFERENCES practice_engagement(tenant_id,id,client_id),
  FOREIGN KEY(tenant_id,onboarding_case_id) REFERENCES onboarding_case(tenant_id,id)
);

ALTER TABLE client_service ADD CONSTRAINT client_service_opportunity_service_fk
  FOREIGN KEY(tenant_id,originating_opportunity_service_id) REFERENCES opportunity_service(tenant_id,id);
CREATE UNIQUE INDEX client_service_opportunity_service_uq
  ON client_service(tenant_id,originating_opportunity_service_id)
  WHERE originating_opportunity_service_id IS NOT NULL;

ALTER TABLE organisation
  ADD COLUMN originating_prospect_id uuid,
  ADD COLUMN originating_opportunity_id uuid,
  ADD COLUMN originating_proposal_reference_id uuid,
  ADD COLUMN converted_at timestamptz,
  ADD FOREIGN KEY(tenant_id,originating_prospect_id) REFERENCES prospect(tenant_id,id),
  ADD FOREIGN KEY(tenant_id,originating_opportunity_id) REFERENCES opportunity(tenant_id,id),
  ADD FOREIGN KEY(tenant_id,originating_proposal_reference_id) REFERENCES quotebench_proposal_reference(tenant_id,id);

-- Extend the existing recipient notification projection. Delivery continues to
-- be claimed from outbox_event; this table holds channel-specific user state.
ALTER TABLE notification
  ADD COLUMN related_entity_type text,
  ADD COLUMN related_entity_id text,
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'QUEUED'
    CHECK(delivery_status IN ('QUEUED','RETRY','DELIVERED','FAILED')),
  ADD COLUMN scheduled_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  ADD COLUMN last_error text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT notification_delivery_state_ck CHECK(
    (delivery_status='DELIVERED')=(delivered_at IS NOT NULL)
    AND (delivery_status<>'FAILED' OR last_error IS NOT NULL)
  );

UPDATE notification n SET
  delivery_status=CASE WHEN o.published_at IS NOT NULL THEN 'DELIVERED' WHEN o.dead_lettered_at IS NOT NULL THEN 'FAILED' ELSE 'QUEUED' END,
  delivered_at=o.published_at, attempt_count=o.attempt_count,
  last_error=coalesce(o.dead_letter_reason,o.last_error), updated_at=now()
FROM outbox_event o WHERE o.tenant_id=n.tenant_id AND o.id=n.outbox_event_id;

CREATE FUNCTION claim_notification_events(p_worker_id text,p_limit integer)
RETURNS SETOF outbox_event LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH candidate AS (
  SELECT id FROM public.outbox_event
  WHERE event_type=''notification.requested'' AND published_at IS NULL AND dead_lettered_at IS NULL
    AND available_at<=now() AND locked_at IS NULL AND attempt_count<max_attempts
    AND btrim(p_worker_id)<>'''' AND p_limit BETWEEN 1 AND 100
  ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
)
UPDATE public.outbox_event o SET locked_by=p_worker_id,locked_at=now(),
  last_attempt_at=now(),attempt_count=o.attempt_count+1
FROM candidate c WHERE o.id=c.id RETURNING o.*';

CREATE OR REPLACE FUNCTION complete_outbox_event(p_event_id uuid,p_worker_id text,p_provider_message_id text,p_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE completed_id uuid; completed_tenant uuid; completed_attempt integer;
BEGIN
 UPDATE public.outbox_event o SET published_at=now(),provider_message_id=p_provider_message_id,
   locked_by=NULL,locked_at=NULL,last_error=NULL
 WHERE o.id=p_event_id AND o.locked_by=p_worker_id AND o.published_at IS NULL AND o.dead_lettered_at IS NULL
 RETURNING o.id,o.tenant_id,o.attempt_count INTO completed_id,completed_tenant,completed_attempt;
 IF completed_id IS NULL THEN RETURN false; END IF;
 INSERT INTO public.outbox_delivery_attempt(tenant_id,outbox_event_id,attempt_no,status,worker_id,provider_message_id,response_metadata)
 VALUES(completed_tenant,completed_id,completed_attempt,'DELIVERED',p_worker_id,p_provider_message_id,coalesce(p_metadata,'{}'::jsonb));
 UPDATE public.notification SET delivery_status='DELIVERED',delivered_at=now(),attempt_count=completed_attempt,
   last_error=NULL,updated_at=now() WHERE tenant_id=completed_tenant AND outbox_event_id=completed_id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION fail_outbox_event(p_event_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retry_at timestamptz,p_dead_letter boolean,p_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE failed_id uuid; failed_tenant uuid; failed_attempt integer; terminal_at timestamptz;
BEGIN
 UPDATE public.outbox_event o SET locked_by=NULL,locked_at=NULL,last_error=p_error_message,
   available_at=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN o.available_at ELSE greatest(p_retry_at,now()) END,
   dead_lettered_at=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN now() ELSE NULL END,
   dead_letter_reason=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN p_error_message ELSE NULL END
 WHERE o.id=p_event_id AND o.locked_by=p_worker_id AND o.published_at IS NULL AND o.dead_lettered_at IS NULL
   AND btrim(coalesce(p_error_code,''))<>'' AND btrim(coalesce(p_error_message,''))<>''
 RETURNING o.id,o.tenant_id,o.attempt_count,o.dead_lettered_at INTO failed_id,failed_tenant,failed_attempt,terminal_at;
 IF failed_id IS NULL THEN RETURN false; END IF;
 INSERT INTO public.outbox_delivery_attempt(tenant_id,outbox_event_id,attempt_no,status,worker_id,error_code,error_message,response_metadata)
 VALUES(failed_tenant,failed_id,failed_attempt,CASE WHEN terminal_at IS NULL THEN 'RETRY' ELSE 'DEAD_LETTER' END,
   p_worker_id,p_error_code,p_error_message,coalesce(p_metadata,'{}'::jsonb));
 UPDATE public.notification SET delivery_status=CASE WHEN terminal_at IS NULL THEN 'RETRY' ELSE 'FAILED' END,
   scheduled_at=CASE WHEN terminal_at IS NULL THEN greatest(p_retry_at,now()) ELSE scheduled_at END,
   attempt_count=failed_attempt,last_error=p_error_message,updated_at=now()
 WHERE tenant_id=failed_tenant AND outbox_event_id=failed_id;
 RETURN true;
END $$;

CREATE INDEX prospect_pipeline_idx ON prospect(tenant_id,status,responsible_member_id,updated_at DESC);
CREATE INDEX opportunity_pipeline_idx ON opportunity(tenant_id,status,stage_key,expected_close_date);
CREATE INDEX crm_activity_timeline_idx ON crm_activity(tenant_id,opportunity_id,occurred_at DESC);
CREATE INDEX proposal_opportunity_idx ON quotebench_proposal_reference(tenant_id,opportunity_id,last_event_at DESC);
CREATE INDEX onboarding_queue_idx ON onboarding_case(tenant_id,status,responsible_member_id,updated_at DESC);
CREATE INDEX notification_delivery_idx ON notification(delivery_status,scheduled_at,created_at) WHERE delivery_status IN ('QUEUED','RETRY');

INSERT INTO product_definition(product_key,display_name,status) VALUES('quotebench','QuoteBench','ACTIVE')
ON CONFLICT(product_key) DO NOTHING;
INSERT INTO module_definition(module_key,product_key,display_name,status) VALUES('quotebench','quotebench','QuoteBench','ACTIVE')
ON CONFLICT(module_key) DO NOTHING;
INSERT INTO feature_definition(feature_key,module_key,display_name,value_type,status) VALUES
 ('practice.crm','practice','CRM','BOOLEAN','ACTIVE'),
 ('practice.onboarding','practice','Client onboarding','BOOLEAN','ACTIVE'),
 ('quotebench.enabled','quotebench','QuoteBench','BOOLEAN','ACTIVE'),
 ('quotebench.proposals','quotebench','QuoteBench proposals','BOOLEAN','ACTIVE'),
 ('quotebench.pricing','quotebench','QuoteBench pricing','BOOLEAN','ACTIVE'),
 ('quotebench.templates','quotebench','QuoteBench templates','BOOLEAN','ACTIVE'),
 ('quotebench.esign','quotebench','QuoteBench e-signature','BOOLEAN','ACTIVE')
ON CONFLICT(feature_key) DO NOTHING;

INSERT INTO permission_definition(permission_key,description) VALUES
 ('crm.view','View CRM records'),('crm.manage','Manage CRM records'),
 ('prospects.create','Create prospects'),('prospects.edit','Edit prospects'),
 ('opportunities.create','Create opportunities'),('opportunities.edit','Edit opportunities'),
 ('opportunities.convert','Convert an accepted proposal into Practice records'),
 ('onboarding.view','View onboarding cases'),('onboarding.manage','Manage onboarding cases'),
 ('onboarding.complete','Complete onboarding gates'),('notifications.view','View notification delivery state')
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
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view','recurrence.view','deadlines.view','automation.view','recurrence.operations','crm.view','onboarding.view','notifications.view')))
 ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f
 WHERE f.feature_key IN ('practice.clients','practice.enabled','practice.work','practice.workflow','practice.automation','practice.crm','practice.onboarding')
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.crm_stage_definition(tenant_id,stage_key,display_name,sequence,default_probability,terminal_outcome,created_by,updated_by) VALUES
  (p_tenant_id,'qualification','Qualification',10,10,NULL,'migration-0033','migration-0033'),
  (p_tenant_id,'discovery','Discovery',20,25,NULL,'migration-0033','migration-0033'),
  (p_tenant_id,'scoped','Scoped',30,50,NULL,'migration-0033','migration-0033'),
  (p_tenant_id,'proposal','Proposal',40,65,NULL,'migration-0033','migration-0033'),
  (p_tenant_id,'negotiation','Negotiation',50,80,NULL,'migration-0033','migration-0033'),
  (p_tenant_id,'won','Won',60,100,'won','migration-0033','migration-0033'),
  (p_tenant_id,'lost','Lost',70,0,'lost','migration-0033','migration-0033')
 ON CONFLICT(tenant_id,stage_key) DO NOTHING;
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['crm_stage_definition','prospect','prospect_contact_relationship','opportunity','opportunity_service','crm_activity','quotebench_proposal_reference','specialist_event_receipt','onboarding_case','onboarding_case_service','onboarding_blocker','crm_conversion'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

REVOKE ALL ON crm_stage_definition,prospect,prospect_contact_relationship,opportunity,opportunity_service,crm_activity,
 quotebench_proposal_reference,specialist_event_receipt,onboarding_case,onboarding_case_service,onboarding_blocker,crm_conversion FROM PUBLIC,accounts_app;
GRANT SELECT ON crm_stage_definition,prospect,prospect_contact_relationship,opportunity,opportunity_service,crm_activity,
 quotebench_proposal_reference,specialist_event_receipt,onboarding_case,onboarding_case_service,onboarding_blocker,crm_conversion TO accounts_app;
GRANT INSERT ON prospect,prospect_contact_relationship,opportunity,opportunity_service,crm_activity,
 quotebench_proposal_reference,specialist_event_receipt,onboarding_case,onboarding_case_service,onboarding_blocker,crm_conversion TO accounts_app;
GRANT UPDATE(display_name,legal_name,entity_type,status,primary_contact_id,responsible_member_id,responsible_team_id,source,converted_client_id,converted_at,updated_by,updated_at) ON prospect TO accounts_app;
GRANT UPDATE(prospect_id,existing_client_id,name,stage_key,responsible_member_id,responsible_team_id,expected_close_date,probability,estimated_value,currency,source,status,outcome_reason,conversion_state,updated_by,updated_at) ON opportunity TO accounts_app;
GRANT UPDATE(notes,accepted) ON opportunity_service TO accounts_app;
GRANT UPDATE(proposal_id,proposal_version,status,commercial_acceptance_reference,accepted_event_id,accepted_at,last_event_at,updated_by,updated_at) ON quotebench_proposal_reference TO accounts_app;
GRANT UPDATE(responsible_member_id,responsible_team_id,status,mandatory_gates_complete,started_at,completed_at,updated_by,updated_at) ON onboarding_case TO accounts_app;
GRANT UPDATE(summary,status,resolved_at,resolved_by) ON onboarding_blocker TO accounts_app;
GRANT UPDATE(delivery_readiness,originating_opportunity_service_id) ON client_service TO accounts_app;
GRANT INSERT(originating_prospect_id,originating_opportunity_id,originating_proposal_reference_id,converted_at) ON organisation TO accounts_app;
GRANT UPDATE(originating_prospect_id,originating_opportunity_id,originating_proposal_reference_id,converted_at) ON organisation TO accounts_app;
REVOKE ALL ON FUNCTION claim_notification_events(text,integer) FROM PUBLIC,accounts_app,accounts_publisher;
GRANT EXECUTE ON FUNCTION claim_notification_events(text,integer),complete_outbox_event(uuid,text,text,jsonb),
 fail_outbox_event(uuid,text,text,text,timestamptz,boolean,jsonb) TO accounts_publisher,neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0033','CRM QuoteBench acceptance conversion onboarding and durable notifications')
ON CONFLICT(version) DO NOTHING;

COMMIT;
