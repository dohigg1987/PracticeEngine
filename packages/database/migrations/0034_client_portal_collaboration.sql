BEGIN;

-- PM-006 extends the legacy engagement portal without replacing its identities or files.
-- Canonical contacts and organisations remain the client master anchors.
CREATE TABLE portal_principal(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 contact_id uuid NOT NULL, auth_actor_id text CHECK(auth_actor_id IS NULL OR (btrim(auth_actor_id)<>'' AND char_length(auth_actor_id)<=320)),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended','revoked')),
 activated_at timestamptz, last_access_at timestamptz, revoked_at timestamptz, revoked_by text,
 created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,contact_id), UNIQUE(tenant_id,auth_actor_id),
 FOREIGN KEY(tenant_id,contact_id) REFERENCES contact(tenant_id,id),
 CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE portal_client_access(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, portal_principal_id uuid NOT NULL,
 client_id uuid NOT NULL, engagement_id uuid, client_service_id uuid,
 access_role text NOT NULL CHECK(access_role IN ('viewer','contributor','approver')),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended','revoked')),
 granted_by text NOT NULL CHECK(btrim(granted_by)<>''), granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_by text, revoked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE NULLS NOT DISTINCT(tenant_id,portal_principal_id,client_id,engagement_id,client_service_id),
 FOREIGN KEY(tenant_id,portal_principal_id) REFERENCES portal_principal(tenant_id,id),
 FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES practice_engagement(tenant_id,id),
 FOREIGN KEY(tenant_id,client_service_id) REFERENCES client_service(tenant_id,id),
 CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE portal_invitation(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, portal_client_access_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked','expired')),
 expires_at timestamptz NOT NULL, accepted_at timestamptz, accepted_by text, revoked_at timestamptz, revoked_by text,
 created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,portal_client_access_id) REFERENCES portal_client_access(tenant_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '168 hours'),
 CHECK(status<>'accepted' OR accepted_at IS NOT NULL), CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE client_request(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid NOT NULL,
 engagement_id uuid, work_item_id uuid, task_id uuid,
 request_type text NOT NULL CHECK(request_type IN ('information','document','confirmation','approval','questionnaire')),
 title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240), description text,
 responsible_member_id uuid, responsible_team_id uuid, due_at timestamptz,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','viewed','responded','partially_complete','completed','cancelled','overdue')),
 completion_mode text NOT NULL DEFAULT 'manual' CHECK(completion_mode IN ('manual','automatic','workflow')),
 response_requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(response_requirements)='object'),
 reminder_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(reminder_configuration)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), opened_at timestamptz, completed_at timestamptz,
 created_by text NOT NULL CHECK(btrim(created_by)<>''), updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES practice_engagement(tenant_id,id),
 FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
 FOREIGN KEY(tenant_id,task_id) REFERENCES practice_task(tenant_id,id),
 FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
 FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id)
);

CREATE TABLE client_request_recipient(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_request_id uuid NOT NULL,
 portal_client_access_id uuid NOT NULL, required boolean NOT NULL DEFAULT true,
 viewed_at timestamptz, last_notified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,client_request_id,portal_client_access_id),
 FOREIGN KEY(tenant_id,client_request_id) REFERENCES client_request(tenant_id,id),
 FOREIGN KEY(tenant_id,portal_client_access_id) REFERENCES portal_client_access(tenant_id,id)
);

CREATE TABLE client_request_response(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_request_id uuid NOT NULL,
 portal_principal_id uuid NOT NULL, request_version integer NOT NULL CHECK(request_version>0),
 response_type text NOT NULL CHECK(response_type IN ('text','document','confirmation','structured')),
 text_response text, structured_response jsonb, confirmation_value boolean,
 submitted_at timestamptz NOT NULL DEFAULT now(), idempotency_key text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,client_request_id,idempotency_key),
 FOREIGN KEY(tenant_id,client_request_id) REFERENCES client_request(tenant_id,id),
 FOREIGN KEY(tenant_id,portal_principal_id) REFERENCES portal_principal(tenant_id,id),
 CHECK(num_nonnulls(text_response,structured_response,confirmation_value)=1)
);

CREATE TABLE portal_document(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid NOT NULL,
 engagement_id uuid, work_item_id uuid, task_id uuid, client_request_id uuid,
 display_filename text NOT NULL CHECK(btrim(display_filename)<>'' AND char_length(display_filename)<=255),
 visibility text NOT NULL CHECK(visibility IN ('internal','shared_with_client','client_uploaded','restricted')),
 current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0), archived_at timestamptz,
 created_by text NOT NULL CHECK(btrim(created_by)<>''), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES practice_engagement(tenant_id,id),
 FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
 FOREIGN KEY(tenant_id,task_id) REFERENCES practice_task(tenant_id,id),
 FOREIGN KEY(tenant_id,client_request_id) REFERENCES client_request(tenant_id,id)
);

CREATE TABLE portal_document_version(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, portal_document_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), object_key text NOT NULL CHECK(btrim(object_key)<>''),
 original_filename text NOT NULL CHECK(btrim(original_filename)<>''), media_type text NOT NULL CHECK(btrim(media_type)<>''),
 byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=26214400), content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 uploader_context text NOT NULL CHECK(uploader_context IN ('practice','portal')),
 uploader_actor_id text NOT NULL CHECK(btrim(uploader_actor_id)<>''),
 scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','accepted','quarantined','rejected')),
 superseded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,portal_document_id,version), UNIQUE(tenant_id,object_key),
 FOREIGN KEY(tenant_id,portal_document_id) REFERENCES portal_document(tenant_id,id)
);

CREATE TABLE portal_thread(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid NOT NULL,
 engagement_id uuid, work_item_id uuid, client_request_id uuid,
 subject text NOT NULL CHECK(btrim(subject)<>'' AND char_length(subject)<=240),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','archived')),
 created_by_context text NOT NULL CHECK(created_by_context IN ('practice','portal')), created_by text NOT NULL CHECK(btrim(created_by)<>''),
 created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES practice_engagement(tenant_id,id),
 FOREIGN KEY(tenant_id,work_item_id) REFERENCES work_item(tenant_id,id),
 FOREIGN KEY(tenant_id,client_request_id) REFERENCES client_request(tenant_id,id)
);

CREATE TABLE portal_thread_participant(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, portal_thread_id uuid NOT NULL,
 participant_context text NOT NULL CHECK(participant_context IN ('practice','portal')),
 tenant_member_id uuid, portal_principal_id uuid, added_by text NOT NULL CHECK(btrim(added_by)<>''),
 added_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE NULLS NOT DISTINCT(tenant_id,portal_thread_id,tenant_member_id,portal_principal_id),
 FOREIGN KEY(tenant_id,portal_thread_id) REFERENCES portal_thread(tenant_id,id),
 FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id),
 FOREIGN KEY(tenant_id,portal_principal_id) REFERENCES portal_principal(tenant_id,id),
 CHECK((participant_context='practice' AND tenant_member_id IS NOT NULL AND portal_principal_id IS NULL) OR
       (participant_context='portal' AND portal_principal_id IS NOT NULL AND tenant_member_id IS NULL))
);

CREATE TABLE portal_message(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, portal_thread_id uuid NOT NULL,
 sender_context text NOT NULL CHECK(sender_context IN ('practice','portal')), sender_actor_id text NOT NULL CHECK(btrim(sender_actor_id)<>''),
 body text NOT NULL CHECK(btrim(body)<>'' AND char_length(body)<=20000), reply_to_message_id uuid,
 idempotency_key text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,portal_thread_id,idempotency_key),
 FOREIGN KEY(tenant_id,portal_thread_id) REFERENCES portal_thread(tenant_id,id),
 FOREIGN KEY(tenant_id,reply_to_message_id) REFERENCES portal_message(tenant_id,id)
);

CREATE TABLE portal_message_attachment(
 tenant_id uuid NOT NULL, portal_message_id uuid NOT NULL, portal_document_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,portal_message_id,portal_document_id),
 FOREIGN KEY(tenant_id,portal_message_id) REFERENCES portal_message(tenant_id,id),
 FOREIGN KEY(tenant_id,portal_document_id) REFERENCES portal_document(tenant_id,id)
);

CREATE TABLE portal_thread_read(
 tenant_id uuid NOT NULL, portal_thread_id uuid NOT NULL, actor_id text NOT NULL CHECK(btrim(actor_id)<>''),
 last_read_message_id uuid, read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,portal_thread_id,actor_id),
 FOREIGN KEY(tenant_id,portal_thread_id) REFERENCES portal_thread(tenant_id,id),
 FOREIGN KEY(tenant_id,last_read_message_id) REFERENCES portal_message(tenant_id,id)
);

CREATE TABLE client_confirmation(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid NOT NULL,
 portal_client_access_id uuid NOT NULL, client_request_id uuid, resource_type text NOT NULL, resource_id text NOT NULL,
 confirmation_text text NOT NULL CHECK(btrim(confirmation_text)<>''), confirmation_version integer NOT NULL DEFAULT 1 CHECK(confirmation_version>0),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','declined','cancelled','expired')),
 requested_by text NOT NULL CHECK(btrim(requested_by)<>''), requested_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
 response boolean, response_text text, responded_by_principal_id uuid, responded_at timestamptz, idempotency_key text,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,portal_client_access_id) REFERENCES portal_client_access(tenant_id,id),
 FOREIGN KEY(tenant_id,client_request_id) REFERENCES client_request(tenant_id,id),
 FOREIGN KEY(tenant_id,responded_by_principal_id) REFERENCES portal_principal(tenant_id,id),
 CHECK((status IN ('confirmed','declined'))=(responded_at IS NOT NULL))
);

CREATE TABLE quotebench_machine_key(
 key_id text PRIMARY KEY CHECK(key_id ~ '^[A-Za-z0-9._-]{3,80}$'), algorithm text NOT NULL DEFAULT 'Ed25519' CHECK(algorithm='Ed25519'),
 public_key_jwk jsonb NOT NULL CHECK(jsonb_typeof(public_key_jwk)='object'), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retiring','revoked')),
 not_before timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);

CREATE TABLE quotebench_request_receipt(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, key_id text NOT NULL REFERENCES quotebench_machine_key(key_id),
 event_id text NOT NULL CHECK(btrim(event_id)<>''), payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 signed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,event_id), UNIQUE(tenant_id,key_id,payload_hash,signed_at), FOREIGN KEY(tenant_id) REFERENCES tenant(id)
);

CREATE FUNCTION quotebench_machine_key_for_request(p_key_id text,p_tenant_id uuid)
RETURNS TABLE(key_id text,public_key_jwk jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT k.key_id,k.public_key_jwk FROM public.quotebench_machine_key k
 WHERE k.key_id=p_key_id AND k.status IN ('active','retiring') AND k.not_before<=now() AND (k.expires_at IS NULL OR k.expires_at>now())
 AND EXISTS(SELECT 1 FROM public.tenant t WHERE t.id=p_tenant_id) $$;

CREATE FUNCTION claim_quotebench_request(p_tenant_id uuid,p_key_id text,p_event_id text,p_payload_hash text,p_signed_at timestamptz,p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_signed_at<now()-interval '5 minutes' OR p_signed_at>now()+interval '1 minute' OR p_expires_at<=now() OR p_expires_at>p_signed_at+interval '5 minutes' THEN RETURN false; END IF;
 INSERT INTO public.quotebench_request_receipt(tenant_id,key_id,event_id,payload_hash,signed_at,expires_at)
 VALUES(p_tenant_id,p_key_id,p_event_id,p_payload_hash,p_signed_at,p_expires_at);
 RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $$;

CREATE FUNCTION machine_tenant_feature_enabled(p_tenant_id uuid,p_feature_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH override_decision AS (
  SELECT o.enabled,1 precedence,o.valid_from FROM public.tenant_entitlement_override o WHERE o.tenant_id=p_tenant_id AND o.feature_key=p_feature_key
  AND o.valid_from<=now() AND (o.valid_until IS NULL OR o.valid_until>now()) ORDER BY o.valid_from DESC,o.id DESC LIMIT 1
 ), base_decision AS (
  SELECT e.enabled,2 precedence,e.valid_from FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=p_feature_key
  AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()) ORDER BY e.valid_from DESC,e.id DESC LIMIT 1
 ), effective AS (SELECT * FROM override_decision UNION ALL SELECT * FROM base_decision)
 SELECT coalesce((SELECT enabled FROM effective ORDER BY precedence LIMIT 1),false) $$;

CREATE INDEX portal_access_actor_idx ON portal_principal(auth_actor_id,tenant_id,status);
CREATE INDEX portal_access_client_idx ON portal_client_access(tenant_id,client_id,status);
CREATE INDEX client_request_queue_idx ON client_request(tenant_id,status,due_at,priority);
CREATE INDEX portal_document_client_idx ON portal_document(tenant_id,client_id,visibility,updated_at DESC);
CREATE INDEX portal_thread_client_idx ON portal_thread(tenant_id,client_id,status,updated_at DESC);
CREATE INDEX portal_message_thread_idx ON portal_message(tenant_id,portal_thread_id,sent_at,id);
CREATE UNIQUE INDEX client_confirmation_response_idempotency_idx ON client_confirmation(tenant_id,portal_client_access_id,resource_type,resource_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE FUNCTION portal_actor_has_client_access(p_tenant_id uuid,p_client_id uuid,p_access_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.portal_principal p JOIN public.portal_client_access a ON a.tenant_id=p.tenant_id AND a.portal_principal_id=p.id
 WHERE p.tenant_id=p_tenant_id AND a.client_id=p_client_id AND p.auth_actor_id=nullif(current_setting('app.actor_id',true),'')
 AND p.status='active' AND a.status='active' AND (p_access_id IS NULL OR a.id=p_access_id)) $$;

CREATE FUNCTION portal_actor_has_request_access(p_tenant_id uuid,p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.client_request r JOIN public.client_request_recipient rr ON rr.tenant_id=r.tenant_id AND rr.client_request_id=r.id
 JOIN public.portal_client_access a ON a.tenant_id=rr.tenant_id AND a.id=rr.portal_client_access_id
 JOIN public.portal_principal p ON p.tenant_id=a.tenant_id AND p.id=a.portal_principal_id
 WHERE r.tenant_id=p_tenant_id AND r.id=p_request_id AND p.auth_actor_id=nullif(current_setting('app.actor_id',true),'')
 AND p.status='active' AND a.status='active' AND a.client_id=r.client_id) $$;

CREATE FUNCTION portal_actor_participates_thread(p_tenant_id uuid,p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.portal_thread t JOIN public.portal_thread_participant participant ON participant.tenant_id=t.tenant_id AND participant.portal_thread_id=t.id
 JOIN public.portal_principal p ON p.tenant_id=participant.tenant_id AND p.id=participant.portal_principal_id
 JOIN public.portal_client_access a ON a.tenant_id=p.tenant_id AND a.portal_principal_id=p.id AND a.client_id=t.client_id
 WHERE t.tenant_id=p_tenant_id AND t.id=p_thread_id AND participant.removed_at IS NULL AND p.auth_actor_id=nullif(current_setting('app.actor_id',true),'')
 AND p.status='active' AND a.status='active') $$;

CREATE FUNCTION portal_tenant_feature_enabled(p_feature_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH principal AS (
  SELECT p.tenant_id FROM public.portal_principal p JOIN public.portal_client_access a ON a.tenant_id=p.tenant_id AND a.portal_principal_id=p.id
  WHERE p.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND p.auth_actor_id=nullif(current_setting('app.actor_id',true),'')
    AND p.status='active' AND a.status='active' LIMIT 1
 ), override_decision AS (
  SELECT o.enabled,1 precedence,o.valid_from FROM public.tenant_entitlement_override o JOIN principal p ON p.tenant_id=o.tenant_id
  WHERE o.feature_key=p_feature_key AND o.valid_from<=now() AND (o.valid_until IS NULL OR o.valid_until>now()) ORDER BY o.valid_from DESC,o.id DESC LIMIT 1
 ), base_decision AS (
  SELECT e.enabled,2 precedence,e.valid_from FROM public.tenant_entitlement e JOIN principal p ON p.tenant_id=e.tenant_id
  WHERE e.feature_key=p_feature_key AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()) ORDER BY e.valid_from DESC,e.id DESC LIMIT 1
 ), effective AS (SELECT * FROM override_decision UNION ALL SELECT * FROM base_decision)
 SELECT coalesce((SELECT enabled FROM effective ORDER BY precedence LIMIT 1),false) $$;

CREATE FUNCTION accept_portal_invitation(p_token_hash text)
RETURNS TABLE(invitation_id uuid,tenant_id uuid,portal_principal_id uuid,client_id uuid,accepted boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor text:=nullif(btrim(current_setting('app.actor_id',true)),''); tenant_context uuid:=nullif(btrim(current_setting('app.tenant_id',true)),'')::uuid;
DECLARE invitation public.portal_invitation%ROWTYPE; access_row public.portal_client_access%ROWTYPE; principal_row public.portal_principal%ROWTYPE;
BEGIN
 IF actor IS NULL OR tenant_context IS NULL THEN RETURN; END IF;
 SELECT * INTO invitation FROM public.portal_invitation i WHERE i.tenant_id=tenant_context AND i.token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO access_row FROM public.portal_client_access a WHERE a.tenant_id=invitation.tenant_id AND a.id=invitation.portal_client_access_id FOR UPDATE;
 SELECT * INTO principal_row FROM public.portal_principal p WHERE p.tenant_id=access_row.tenant_id AND p.id=access_row.portal_principal_id FOR UPDATE;
 IF invitation.status='accepted' AND principal_row.auth_actor_id=actor AND principal_row.status='active' AND access_row.status='active' THEN
  RETURN QUERY SELECT invitation.id,invitation.tenant_id,principal_row.id,access_row.client_id,false; RETURN;
 END IF;
 IF invitation.status<>'pending' OR invitation.expires_at<=now() OR access_row.status NOT IN ('invited','suspended') OR principal_row.status NOT IN ('invited','suspended') THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_principal other WHERE other.tenant_id=invitation.tenant_id AND other.auth_actor_id=actor AND other.id<>principal_row.id) THEN RETURN; END IF;
 IF NOT public.machine_tenant_feature_enabled(invitation.tenant_id,'practice.portal') THEN RETURN; END IF;
 UPDATE public.portal_invitation SET status='accepted',accepted_at=now(),accepted_by=actor WHERE id=invitation.id;
 UPDATE public.portal_principal SET auth_actor_id=actor,status='active',activated_at=coalesce(activated_at,now()),updated_at=now() WHERE id=principal_row.id;
 UPDATE public.portal_client_access SET status='active',updated_at=now() WHERE id=access_row.id;
 RETURN QUERY SELECT invitation.id,invitation.tenant_id,principal_row.id,access_row.client_id,true;
END $$;

INSERT INTO feature_definition(feature_key,module_key,display_name,value_type,status) VALUES
 ('practice.portal.requests','practice','Client portal requests','BOOLEAN','ACTIVE'),
 ('practice.portal.documents','practice','Client portal documents','BOOLEAN','ACTIVE'),
 ('practice.portal.messaging','practice','Client portal messaging','BOOLEAN','ACTIVE')
ON CONFLICT(feature_key) DO NOTHING;

INSERT INTO permission_definition(permission_key,description) VALUES
 ('portal.manage','Manage portal access'),('portal.invite','Invite portal users'),('portal.revoke','Revoke portal access'),
 ('client_requests.view','View client requests'),('client_requests.manage','Manage client requests'),
 ('documents.share','Share client documents'),('portal_messages.view','View portal messages'),
 ('portal_messages.send','Send portal messages'),('confirmations.request','Request client confirmations')
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
  (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view','services.view','engagements.view','work.view','tasks.view','recurrence.view','deadlines.view','automation.view','recurrence.operations','crm.view','onboarding.view','notifications.view','client_requests.view','portal_messages.view')))
 ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f
 WHERE f.feature_key IN ('practice.clients','practice.enabled','practice.work','practice.workflow','practice.automation','practice.crm','practice.onboarding','practice.portal','practice.portal.requests','practice.portal.documents','practice.portal.messaging')
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.crm_stage_definition(tenant_id,stage_key,display_name,sequence,default_probability,terminal_outcome,created_by,updated_by) VALUES
  (p_tenant_id,'qualification','Qualification',10,10,NULL,'migration-0034','migration-0034'),
  (p_tenant_id,'discovery','Discovery',20,25,NULL,'migration-0034','migration-0034'),
  (p_tenant_id,'scoped','Scoped',30,50,NULL,'migration-0034','migration-0034'),
  (p_tenant_id,'proposal','Proposal',40,65,NULL,'migration-0034','migration-0034'),
  (p_tenant_id,'negotiation','Negotiation',50,80,NULL,'migration-0034','migration-0034'),
  (p_tenant_id,'won','Won',60,100,'won','migration-0034','migration-0034'),
  (p_tenant_id,'lost','Lost',70,0,'lost','migration-0034','migration-0034')
 ON CONFLICT(tenant_id,stage_key) DO NOTHING;
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['portal_principal','portal_client_access','portal_invitation','client_request','client_request_recipient','client_request_response','portal_document','portal_document_version','portal_thread','portal_thread_participant','portal_message','portal_message_attachment','portal_thread_read','client_confirmation','quotebench_request_receipt'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_staff ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

-- Portal policies add the client-resource dimension; identity alone never grants access.
CREATE POLICY portal_principal_self ON portal_principal FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND status='active');
CREATE POLICY portal_principal_last_access ON portal_principal FOR UPDATE TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND status='active')
 WITH CHECK(auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND status='active');
CREATE POLICY portal_client_access_self ON portal_client_access FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_client_access(tenant_id,client_id,id));
CREATE POLICY client_request_portal ON client_request FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_request_access(tenant_id,id));
CREATE POLICY client_request_portal_update ON client_request FOR UPDATE TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_request_access(tenant_id,id))
 WITH CHECK(portal_actor_has_request_access(tenant_id,id));
CREATE POLICY client_request_recipient_portal ON client_request_recipient FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_request_access(tenant_id,client_request_id));
CREATE POLICY client_request_response_portal ON client_request_response FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_request_access(tenant_id,client_request_id));
CREATE POLICY client_request_response_submit ON client_request_response FOR INSERT TO accounts_app WITH CHECK(
 tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM portal_principal p JOIN client_request r ON r.tenant_id=p.tenant_id
 WHERE p.tenant_id=client_request_response.tenant_id AND p.id=client_request_response.portal_principal_id AND p.auth_actor_id=nullif(current_setting('app.actor_id',true),'')
 AND p.status='active' AND r.id=client_request_response.client_request_id AND portal_actor_has_client_access(r.tenant_id,r.client_id)));
CREATE POLICY portal_document_portal ON portal_document FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND visibility IN ('shared_with_client','client_uploaded') AND portal_actor_has_client_access(tenant_id,client_id));
CREATE POLICY portal_document_version_portal ON portal_document_version FOR SELECT TO accounts_app
 USING(EXISTS(SELECT 1 FROM portal_document d WHERE d.tenant_id=portal_document_version.tenant_id AND d.id=portal_document_version.portal_document_id));
CREATE POLICY portal_thread_portal ON portal_thread FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_participates_thread(tenant_id,id));
CREATE POLICY portal_message_portal ON portal_message FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_participates_thread(tenant_id,portal_thread_id));
CREATE POLICY portal_message_submit ON portal_message FOR INSERT TO accounts_app
 WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND sender_context='portal' AND sender_actor_id=nullif(current_setting('app.actor_id',true),'') AND portal_actor_participates_thread(tenant_id,portal_thread_id));
CREATE POLICY portal_thread_participant_portal ON portal_thread_participant FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_participates_thread(tenant_id,portal_thread_id));
CREATE POLICY portal_message_attachment_portal ON portal_message_attachment FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM public.portal_message m WHERE m.tenant_id=portal_message_attachment.tenant_id AND m.id=portal_message_attachment.portal_message_id AND portal_actor_participates_thread(m.tenant_id,m.portal_thread_id)));
CREATE POLICY portal_thread_read_self ON portal_thread_read TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND actor_id=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM portal_thread t WHERE t.tenant_id=portal_thread_read.tenant_id AND t.id=portal_thread_read.portal_thread_id))
 WITH CHECK(actor_id=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY client_confirmation_portal ON client_confirmation FOR SELECT TO accounts_app
 USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND portal_actor_has_client_access(tenant_id,client_id,portal_client_access_id));

ALTER TABLE quotebench_machine_key ENABLE ROW LEVEL SECURITY; ALTER TABLE quotebench_machine_key FORCE ROW LEVEL SECURITY;
CREATE POLICY quotebench_machine_key_owner ON quotebench_machine_key TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON portal_principal,portal_client_access,portal_invitation,client_request,client_request_recipient,client_request_response,
 portal_document,portal_document_version,portal_thread,portal_thread_participant,portal_message,portal_message_attachment,portal_thread_read,
 client_confirmation,quotebench_machine_key,quotebench_request_receipt FROM PUBLIC,accounts_app;
GRANT SELECT,INSERT ON portal_principal,portal_client_access,portal_invitation,client_request,client_request_recipient,client_request_response,
 portal_document,portal_document_version,portal_thread,portal_thread_participant,portal_message,portal_message_attachment,portal_thread_read,client_confirmation TO accounts_app;
GRANT UPDATE(status,activated_at,last_access_at,revoked_at,revoked_by,updated_at) ON portal_principal TO accounts_app;
GRANT UPDATE(access_role,status,revoked_by,revoked_at,updated_at) ON portal_client_access TO accounts_app;
GRANT UPDATE(status,accepted_at,accepted_by,revoked_at,revoked_by) ON portal_invitation TO accounts_app;
GRANT UPDATE(status,opened_at,completed_at,updated_by,updated_at,version) ON client_request TO accounts_app;
GRANT UPDATE(viewed_at,last_notified_at) ON client_request_recipient TO accounts_app;
GRANT UPDATE(current_version,archived_at,updated_at) ON portal_document TO accounts_app;
GRANT UPDATE(superseded_at,scan_status) ON portal_document_version TO accounts_app;
GRANT UPDATE(status,closed_at,updated_at) ON portal_thread TO accounts_app;
GRANT UPDATE(removed_at) ON portal_thread_participant TO accounts_app;
GRANT UPDATE(last_read_message_id,read_at) ON portal_thread_read TO accounts_app;
GRANT UPDATE(status,response,response_text,responded_by_principal_id,responded_at,idempotency_key) ON client_confirmation TO accounts_app;
GRANT SELECT,INSERT ON quotebench_request_receipt TO accounts_app;
REVOKE ALL ON FUNCTION portal_actor_has_client_access(uuid,uuid,uuid),portal_actor_has_request_access(uuid,uuid),portal_actor_participates_thread(uuid,uuid),portal_tenant_feature_enabled(text),accept_portal_invitation(text),quotebench_machine_key_for_request(text,uuid),claim_quotebench_request(uuid,text,text,text,timestamptz,timestamptz),machine_tenant_feature_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_actor_has_client_access(uuid,uuid,uuid),portal_actor_has_request_access(uuid,uuid),portal_actor_participates_thread(uuid,uuid),portal_tenant_feature_enabled(text),accept_portal_invitation(text),quotebench_machine_key_for_request(text,uuid),claim_quotebench_request(uuid,text,text,text,timestamptz,timestamptz),machine_tenant_feature_enabled(uuid,text) TO accounts_app,neondb_owner;

INSERT INTO schema_migration(version,description) VALUES('0034','unified client portal requests documents messaging confirmations and machine authentication')
ON CONFLICT(version) DO NOTHING;
COMMIT;
