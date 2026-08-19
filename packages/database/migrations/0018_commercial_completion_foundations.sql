BEGIN;

CREATE ROLE accounts_publisher NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE client_contact(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  display_name text NOT NULL CHECK(btrim(display_name) <> ''),
  email_normalized text NOT NULL CHECK(email_normalized=lower(btrim(email_normalized)) AND position('@' in email_normalized)>1),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,email_normalized),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id)
);

CREATE TABLE client_portal_identity(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_contact_id uuid NOT NULL,
  auth_actor_id text NOT NULL CHECK(btrim(auth_actor_id) <> '' AND char_length(auth_actor_id)<=320),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,client_contact_id),
  UNIQUE(tenant_id,auth_actor_id),
  FOREIGN KEY(tenant_id,client_contact_id) REFERENCES client_contact(tenant_id,id)
);

CREATE TABLE client_engagement_access(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  client_contact_id uuid NOT NULL,
  access_role text NOT NULL CHECK(access_role IN ('CLIENT_PREPARER','CLIENT_APPROVER','CLIENT_VIEWER')),
  status text NOT NULL DEFAULT 'INVITED' CHECK(status IN ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  granted_by text NOT NULL CHECK(btrim(granted_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,engagement_id,client_contact_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,client_contact_id) REFERENCES client_contact(tenant_id,id),
  CHECK((revoked_by IS NULL)=(revoked_at IS NULL)),
  CHECK(status<>'REVOKED' OR revoked_at IS NOT NULL)
);

CREATE TABLE client_portal_invitation(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_engagement_access_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,client_engagement_access_id) REFERENCES client_engagement_access(tenant_id,id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '168 hours'),
  CHECK((accepted_by IS NULL)=(accepted_at IS NULL)),
  CHECK((revoked_by IS NULL)=(revoked_at IS NULL)),
  CHECK(NOT(accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE FUNCTION client_actor_has_engagement_access(p_tenant_id uuid,p_engagement_id uuid)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(
  SELECT 1 FROM public.client_portal_identity i
  JOIN public.client_engagement_access a
    ON a.tenant_id=i.tenant_id AND a.client_contact_id=i.client_contact_id
  WHERE i.tenant_id=p_tenant_id AND a.engagement_id=p_engagement_id
    AND i.auth_actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''')
    AND a.status=''ACTIVE''
)';

CREATE FUNCTION accept_client_portal_invitation(p_token_hash text)
RETURNS TABLE(invitation_id uuid,tenant_id uuid,engagement_id uuid,client_contact_id uuid,access_id uuid,access_role text,accepted boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH input AS (
  SELECT btrim(current_setting(''app.actor_id'',true))::public.invitation_actor_id AS actor_id,
    p_token_hash::public.invitation_token_hash AS token_hash,
    nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::public.invitation_tenant_context AS tenant_context
), claimed AS (
  UPDATE public.client_portal_invitation i
  SET accepted_by=x.actor_id,accepted_at=now()
  FROM input x,public.client_engagement_access a
  WHERE i.token_hash=x.token_hash AND x.tenant_context IS NULL
    AND a.id=i.client_engagement_access_id AND a.tenant_id=i.tenant_id
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
    AND a.status=''INVITED''
    AND NOT EXISTS(
      SELECT 1 FROM public.client_portal_identity existing
      WHERE existing.tenant_id=i.tenant_id
        AND (existing.client_contact_id=a.client_contact_id OR existing.auth_actor_id=x.actor_id)
        AND NOT(existing.client_contact_id=a.client_contact_id AND existing.auth_actor_id=x.actor_id)
    )
  RETURNING i.id,i.tenant_id,i.client_engagement_access_id,i.accepted_by
), identity_result AS (
  INSERT INTO public.client_portal_identity(tenant_id,client_contact_id,auth_actor_id)
  SELECT c.tenant_id,a.client_contact_id,c.accepted_by
  FROM claimed c JOIN public.client_engagement_access a ON a.id=c.client_engagement_access_id
  ON CONFLICT(tenant_id,client_contact_id) DO UPDATE
    SET auth_actor_id=public.client_portal_identity.auth_actor_id
  RETURNING tenant_id,client_contact_id,auth_actor_id
), activated AS (
  UPDATE public.client_engagement_access a SET status=''ACTIVE'',updated_at=now()
  FROM claimed c,identity_result ir
  WHERE a.id=c.client_engagement_access_id AND a.tenant_id=c.tenant_id
    AND ir.tenant_id=a.tenant_id AND ir.client_contact_id=a.client_contact_id
    AND ir.auth_actor_id=c.accepted_by
  RETURNING a.id,a.tenant_id,a.engagement_id,a.client_contact_id,a.access_role
), audit_insert AS (
  INSERT INTO public.audit_event(
    occurred_at_utc,tenant_id,organisation_id,engagement_id,actor_type,actor_id,
    event_type,object_type,object_id,correlation_id,metadata,event_hash
  )
  SELECT now(),a.tenant_id,e.organisation_id,a.engagement_id,''CLIENT'',c.accepted_by,
    ''CLIENT_PORTAL_INVITATION_ACCEPTED'',''CLIENT_PORTAL_INVITATION'',c.id::text,
    c.id::text,jsonb_build_object(''accessId'',a.id,''contactId'',a.client_contact_id),
    encode(digest(a.tenant_id::text||'':''||c.id::text||'':''||c.accepted_by,''sha256''),''hex'')
  FROM claimed c JOIN activated a ON a.id=c.client_engagement_access_id
  JOIN public.engagement e ON e.tenant_id=a.tenant_id AND e.id=a.engagement_id
  RETURNING event_id
), outbox_insert AS (
  INSERT INTO public.outbox_event(
    tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key
  )
  SELECT a.tenant_id,''CLIENT_PORTAL_INVITATION'',c.id::text,
    ''CLIENT_PORTAL_INVITATION_ACCEPTED'',jsonb_build_object(''accessId'',a.id),
    c.id::text,''client-portal-accept:''||c.id::text
  FROM claimed c JOIN activated a ON a.id=c.client_engagement_access_id
  RETURNING id
), first_result AS (
  SELECT c.id AS invitation_id,a.tenant_id,a.engagement_id,a.client_contact_id,
    a.id AS access_id,a.access_role,true AS accepted
  FROM claimed c JOIN activated a ON a.id=c.client_engagement_access_id
), replay_result AS (
  SELECT i.id,a.tenant_id,a.engagement_id,a.client_contact_id,a.id,a.access_role,false
  FROM public.client_portal_invitation i
  JOIN input x ON x.token_hash=i.token_hash AND x.tenant_context IS NULL
  JOIN public.client_engagement_access a ON a.id=i.client_engagement_access_id AND a.tenant_id=i.tenant_id
  JOIN public.client_portal_identity pi ON pi.tenant_id=a.tenant_id
    AND pi.client_contact_id=a.client_contact_id AND pi.auth_actor_id=x.actor_id
  WHERE i.accepted_by=x.actor_id AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
    AND a.status=''ACTIVE'' AND NOT EXISTS(SELECT 1 FROM first_result)
)
SELECT * FROM first_result UNION ALL SELECT * FROM replay_result';

CREATE FUNCTION list_authenticated_client_access()
RETURNS TABLE(tenant_id uuid,tenant_name text,organisation_id uuid,organisation_name text,engagement_id uuid,period_start date,period_end date,client_contact_id uuid,access_id uuid,access_role text)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT a.tenant_id,t.name,c.organisation_id,o.legal_name,a.engagement_id,e.period_start,e.period_end,
  c.id,a.id,a.access_role
FROM public.client_portal_identity i
JOIN public.client_contact c ON c.tenant_id=i.tenant_id AND c.id=i.client_contact_id AND c.status=''ACTIVE''
JOIN public.client_engagement_access a ON a.tenant_id=c.tenant_id AND a.client_contact_id=c.id AND a.status=''ACTIVE''
JOIN public.tenant t ON t.id=a.tenant_id
JOIN public.organisation o ON o.tenant_id=c.tenant_id AND o.id=c.organisation_id
JOIN public.engagement e ON e.tenant_id=a.tenant_id AND e.id=a.engagement_id
WHERE i.auth_actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''')
  AND nullif(btrim(current_setting(''app.tenant_id'',true)),'''') IS NULL
ORDER BY t.name,e.period_end DESC,a.id';

CREATE TABLE client_document_request(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  client_contact_id uuid NOT NULL,
  title text NOT NULL CHECK(btrim(title) <> ''),
  description text,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESPONDED','APPROVED','REJECTED','CANCELLED')),
  due_at timestamptz,
  requested_by text NOT NULL CHECK(btrim(requested_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,engagement_id,client_contact_id)
    REFERENCES client_engagement_access(tenant_id,engagement_id,client_contact_id)
);

CREATE TABLE client_document_response(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_request_id uuid NOT NULL,
  version_no integer NOT NULL CHECK(version_no > 0),
  storage_key text NOT NULL CHECK(btrim(storage_key) <> ''),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  original_filename text NOT NULL CHECK(btrim(original_filename) <> ''),
  media_type text NOT NULL CHECK(btrim(media_type) <> ''),
  byte_size bigint NOT NULL CHECK(byte_size >= 0),
  submitted_by text NOT NULL CHECK(btrim(submitted_by) <> ''),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  UNIQUE(tenant_id,id),
  UNIQUE(document_request_id,version_no),
  UNIQUE(document_request_id,content_hash),
  FOREIGN KEY(tenant_id,document_request_id) REFERENCES client_document_request(tenant_id,id)
);

CREATE TABLE client_document_review(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_request_id uuid NOT NULL,
  document_response_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  reviewed_by text NOT NULL CHECK(btrim(reviewed_by) <> ''),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  UNIQUE(document_response_id),
  FOREIGN KEY(tenant_id,document_request_id) REFERENCES client_document_request(tenant_id,id),
  FOREIGN KEY(tenant_id,document_response_id) REFERENCES client_document_response(tenant_id,id)
);

CREATE FUNCTION client_response_version_is_allowed(p_request_id uuid,p_version_no integer)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT NOT EXISTS(
  SELECT 1 FROM public.client_document_review review
  JOIN public.client_document_response response ON response.id=review.document_response_id
  WHERE response.document_request_id=p_request_id AND review.decision=''APPROVED''
) AND p_version_no=(
  SELECT coalesce(max(existing.version_no),0)+1
  FROM public.client_document_response existing
  WHERE existing.document_request_id=p_request_id
)';

CREATE FUNCTION client_review_is_independent(p_response_id uuid,p_reviewed_by text)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(
  SELECT 1 FROM public.client_document_response response
  WHERE response.id=p_response_id AND response.submitted_by<>p_reviewed_by
)';

CREATE FUNCTION record_client_document_response(
  p_request_id uuid,p_response_id uuid,p_storage_key text,p_content_hash text,
  p_filename text,p_media_type text,p_byte_size bigint,p_metadata jsonb
)
RETURNS TABLE(response_id uuid,version_no integer,content_hash text,created boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH input AS (
  SELECT nullif(btrim(current_setting(''app.actor_id'',true)),'''') AS actor_id,
    nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::uuid AS tenant_id
), request_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(hashtextextended(p_request_id::text,0))
), authorised AS (
  SELECT r.tenant_id,r.id AS request_id,r.engagement_id,r.client_contact_id,r.status AS request_status,x.actor_id,
    coalesce((SELECT max(existing.version_no) FROM public.client_document_response existing WHERE existing.document_request_id=r.id),0)+1 AS next_version
  FROM public.client_document_request r JOIN input x ON x.tenant_id=r.tenant_id
  CROSS JOIN request_lock
  JOIN public.client_portal_identity i ON i.tenant_id=r.tenant_id
    AND i.client_contact_id=r.client_contact_id AND i.auth_actor_id=x.actor_id
  JOIN public.client_engagement_access a ON a.tenant_id=r.tenant_id
    AND a.client_contact_id=r.client_contact_id AND a.engagement_id=r.engagement_id
  WHERE r.id=p_request_id AND a.status=''ACTIVE''
    AND a.access_role IN (''CLIENT_PREPARER'',''CLIENT_APPROVER'')
), inserted AS (
  INSERT INTO public.client_document_response(
    id,tenant_id,document_request_id,version_no,storage_key,content_hash,
    original_filename,media_type,byte_size,submitted_by,metadata
  )
  SELECT p_response_id,a.tenant_id,a.request_id,a.next_version,p_storage_key,p_content_hash,
    p_filename,p_media_type,p_byte_size,a.actor_id,coalesce(p_metadata,''{}''::jsonb)
  FROM authorised a WHERE a.request_status IN (''OPEN'',''REJECTED'')
    AND NOT EXISTS(
      SELECT 1 FROM public.client_document_response existing
      WHERE existing.document_request_id=a.request_id AND existing.content_hash=p_content_hash
    )
  RETURNING id,tenant_id,document_request_id,version_no,content_hash,submitted_by
), request_update AS (
  UPDATE public.client_document_request r SET status=''RESPONDED'',updated_at=now()
  FROM inserted response WHERE r.id=response.document_request_id AND r.tenant_id=response.tenant_id
  RETURNING r.engagement_id
), audit_insert AS (
  INSERT INTO public.audit_event(
    occurred_at_utc,tenant_id,organisation_id,engagement_id,actor_type,actor_id,
    event_type,object_type,object_id,correlation_id,metadata,event_hash
  )
  SELECT now(),response.tenant_id,e.organisation_id,e.id,''CLIENT'',response.submitted_by,
    CASE WHEN response.version_no=1 THEN ''CLIENT_DOCUMENT_RESPONSE_CREATED'' ELSE ''CLIENT_DOCUMENT_RESPONSE_REPLACED'' END,
    ''CLIENT_DOCUMENT_RESPONSE'',response.id::text,response.id::text,
    jsonb_build_object(''requestId'',response.document_request_id,''version'',response.version_no,''contentHash'',response.content_hash),
    encode(digest(response.tenant_id::text||'':''||response.id::text||'':''||response.content_hash,''sha256''),''hex'')
  FROM inserted response JOIN public.client_document_request r ON r.id=response.document_request_id
  JOIN public.engagement e ON e.tenant_id=response.tenant_id AND e.id=r.engagement_id
  RETURNING event_id
), outbox_insert AS (
  INSERT INTO public.outbox_event(
    tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key
  )
  SELECT response.tenant_id,''CLIENT_DOCUMENT_RESPONSE'',response.id::text,
    CASE WHEN response.version_no=1 THEN ''CLIENT_DOCUMENT_RESPONSE_CREATED'' ELSE ''CLIENT_DOCUMENT_RESPONSE_REPLACED'' END,
    jsonb_build_object(''requestId'',response.document_request_id,''version'',response.version_no),
    response.id::text,''client-document-response:''||response.id::text
  FROM inserted response RETURNING id
), first_result AS (
  SELECT id,version_no,content_hash,true AS created FROM inserted
), replay_result AS (
  SELECT existing.id,existing.version_no,existing.content_hash,false AS created
  FROM public.client_document_response existing JOIN authorised a
    ON a.request_id=existing.document_request_id AND a.actor_id=existing.submitted_by
  WHERE existing.content_hash=p_content_hash AND NOT EXISTS(SELECT 1 FROM first_result)
)
SELECT * FROM first_result UNION ALL SELECT * FROM replay_result';

ALTER TABLE client_document_response
  ADD CONSTRAINT client_document_response_version_allowed_ck
    CHECK(client_response_version_is_allowed(document_request_id,version_no));
ALTER TABLE client_document_review
  ADD CONSTRAINT client_document_review_rejection_reason_ck
    CHECK(decision<>'REJECTED' OR btrim(coalesce(reason,''))<>''),
  ADD CONSTRAINT client_document_review_independent_ck
    CHECK(client_review_is_independent(document_response_id,reviewed_by));

CREATE TABLE connector_definition(
  connector_code text PRIMARY KEY,
  display_name text NOT NULL CHECK(btrim(display_name) <> ''),
  source_type text NOT NULL CHECK(source_type IN ('CSV','XLSX','XERO','QUICKBOOKS','SAGE','FREEAGENT','API')),
  credential_mode text NOT NULL CHECK(credential_mode IN ('NONE','SECRET_REFERENCE')),
  lifecycle_status text NOT NULL DEFAULT 'AVAILABLE' CHECK(lifecycle_status IN ('AVAILABLE','DISABLED','RETIRED')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(capabilities)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integration_connection(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  connector_code text NOT NULL REFERENCES connector_definition(connector_code),
  display_name text NOT NULL CHECK(btrim(display_name) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','SUSPENDED','ERROR','REVOKED')),
  credential_reference text CHECK(credential_reference IS NULL OR credential_reference ~ '^(cloudflare-secret|vault|secret)://[A-Za-z0-9._/-]+$'),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,organisation_id,connector_code,display_name),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  CHECK(lower(configuration::text) !~ '"[^"]*(password|secret|token|credential|private[_-]?key)[^"]*"[[:space:]]*:')
);

CREATE TABLE integration_sync_run(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK(btrim(idempotency_key) <> ''),
  sync_type text NOT NULL CHECK(sync_type IN ('FULL','INCREMENTAL','MANUAL_IMPORT')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
  cursor_before text,
  cursor_after text,
  started_at timestamptz,
  completed_at timestamptz,
  item_count integer NOT NULL DEFAULT 0 CHECK(item_count>=0),
  error_count integer NOT NULL DEFAULT 0 CHECK(error_count>=0),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(connection_id,idempotency_key),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,connection_id) REFERENCES integration_connection(tenant_id,id),
  CHECK((started_at IS NULL OR started_at>=created_at) AND (completed_at IS NULL OR started_at IS NOT NULL AND completed_at>=started_at)),
  CHECK(status NOT IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED') OR completed_at IS NOT NULL)
);

CREATE TABLE integration_sync_item(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sync_run_id uuid NOT NULL,
  external_object_type text NOT NULL CHECK(btrim(external_object_type) <> ''),
  external_object_id text NOT NULL CHECK(btrim(external_object_id) <> ''),
  operation text NOT NULL CHECK(operation IN ('CREATED','UPDATED','SKIPPED','REJECTED')),
  content_hash text CHECK(content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  import_batch_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  UNIQUE(sync_run_id,external_object_type,external_object_id),
  FOREIGN KEY(tenant_id,sync_run_id) REFERENCES integration_sync_run(tenant_id,id),
  FOREIGN KEY(tenant_id,import_batch_id) REFERENCES import_batch(tenant_id,id),
  CHECK(lower(metadata::text) !~ '"[^"]*(password|secret|token|credential|private[_-]?key)[^"]*"[[:space:]]*:')
);

CREATE TABLE integration_sync_error(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sync_run_id uuid NOT NULL,
  error_code text NOT NULL CHECK(btrim(error_code) <> ''),
  error_class text NOT NULL CHECK(error_class IN ('AUTH','RATE_LIMIT','VALIDATION','TRANSPORT','PROVIDER','INTERNAL')),
  retryable boolean NOT NULL,
  message text NOT NULL CHECK(btrim(message) <> ''),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
  FOREIGN KEY(tenant_id,sync_run_id) REFERENCES integration_sync_run(tenant_id,id),
  CHECK(lower(details::text) !~ '"[^"]*(password|secret|token|credential|private[_-]?key)[^"]*"[[:space:]]*:')
);

ALTER TABLE outbox_event
  ADD COLUMN locked_by text,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN dead_lettered_at timestamptz,
  ADD COLUMN dead_letter_reason text,
  ADD COLUMN provider_message_id text,
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 8,
  ADD CONSTRAINT outbox_event_lock_pair_ck CHECK((locked_by IS NULL)=(locked_at IS NULL)),
  ADD CONSTRAINT outbox_event_dead_letter_pair_ck CHECK((dead_lettered_at IS NULL)=(dead_letter_reason IS NULL)),
  ADD CONSTRAINT outbox_event_terminal_ck CHECK(NOT(published_at IS NOT NULL AND dead_lettered_at IS NOT NULL)),
  ADD CONSTRAINT outbox_event_max_attempts_ck CHECK(max_attempts BETWEEN 1 AND 25),
  ADD CONSTRAINT outbox_event_tenant_id_uq UNIQUE(tenant_id,id);

CREATE TABLE notification(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid,
  outbox_event_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN ('EMAIL','IN_APP','WEBHOOK')),
  recipient_reference text NOT NULL CHECK(btrim(recipient_reference) <> ''),
  template_code text NOT NULL CHECK(btrim(template_code) <> ''),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  idempotency_key text NOT NULL CHECK(btrim(idempotency_key) <> ''),
  read_status text NOT NULL DEFAULT 'UNREAD' CHECK(read_status IN ('UNREAD','READ')),
  read_by text,
  read_at timestamptz,
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key),
  UNIQUE(tenant_id,outbox_event_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  FOREIGN KEY(tenant_id,outbox_event_id) REFERENCES outbox_event(tenant_id,id),
  CHECK((read_by IS NULL)=(read_at IS NULL)),
  CHECK((read_status='READ')=(read_at IS NOT NULL)),
  CHECK(lower(payload::text) !~ '"[^"]*(password|secret|token|credential|private[_-]?key)[^"]*"[[:space:]]*:')
);

CREATE TABLE outbox_delivery_attempt(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  outbox_event_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK(attempt_no>0),
  status text NOT NULL CHECK(status IN ('PENDING','RETRY','DELIVERED','DEAD_LETTER')),
  worker_id text NOT NULL CHECK(btrim(worker_id) <> ''),
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(response_metadata)='object'),
  UNIQUE(outbox_event_id,attempt_no),
  FOREIGN KEY(tenant_id,outbox_event_id) REFERENCES outbox_event(tenant_id,id),
  CHECK(lower(response_metadata::text) !~ '"[^"]*(password|secret|token|credential|private[_-]?key)[^"]*"[[:space:]]*:')
);

CREATE FUNCTION claim_outbox_events(p_worker_id text,p_limit integer)
RETURNS SETOF outbox_event LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH candidate AS (
  SELECT id FROM public.outbox_event
  WHERE published_at IS NULL AND dead_lettered_at IS NULL
    AND available_at<=now() AND locked_at IS NULL AND attempt_count<max_attempts
    AND btrim(p_worker_id)<>'''' AND p_limit BETWEEN 1 AND 100
  ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
)
UPDATE public.outbox_event o SET locked_by=p_worker_id,locked_at=now(),
  last_attempt_at=now(),attempt_count=o.attempt_count+1
FROM candidate c WHERE o.id=c.id RETURNING o.*';

CREATE FUNCTION complete_outbox_event(p_event_id uuid,p_worker_id text,p_provider_message_id text,p_metadata jsonb)
RETURNS boolean LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH completed AS (
  UPDATE public.outbox_event o SET published_at=now(),provider_message_id=p_provider_message_id,
    locked_by=NULL,locked_at=NULL,last_error=NULL
  WHERE o.id=p_event_id AND o.locked_by=p_worker_id AND o.published_at IS NULL
    AND o.dead_lettered_at IS NULL
  RETURNING o.id,o.tenant_id,o.attempt_count
), evidence AS (
  INSERT INTO public.outbox_delivery_attempt(tenant_id,outbox_event_id,attempt_no,status,worker_id,provider_message_id,response_metadata)
  SELECT tenant_id,id,attempt_count,''DELIVERED'',p_worker_id,p_provider_message_id,
    coalesce(p_metadata,''{}''::jsonb) FROM completed RETURNING id
)
SELECT EXISTS(SELECT 1 FROM evidence)';

CREATE FUNCTION fail_outbox_event(p_event_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retry_at timestamptz,p_dead_letter boolean,p_metadata jsonb)
RETURNS boolean LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH failed AS (
  UPDATE public.outbox_event o SET locked_by=NULL,locked_at=NULL,
    last_error=p_error_message,available_at=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN o.available_at ELSE greatest(p_retry_at,now()) END,
    dead_lettered_at=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN now() ELSE NULL END,
    dead_letter_reason=CASE WHEN p_dead_letter OR o.attempt_count>=o.max_attempts THEN p_error_message ELSE NULL END
  WHERE o.id=p_event_id AND o.locked_by=p_worker_id AND o.published_at IS NULL
    AND o.dead_lettered_at IS NULL AND btrim(coalesce(p_error_code,''''))<>''''
    AND btrim(coalesce(p_error_message,''''))<>''''
  RETURNING o.id,o.tenant_id,o.attempt_count,o.dead_lettered_at
), evidence AS (
  INSERT INTO public.outbox_delivery_attempt(tenant_id,outbox_event_id,attempt_no,status,worker_id,error_code,error_message,response_metadata)
  SELECT tenant_id,id,attempt_count,CASE WHEN dead_lettered_at IS NOT NULL THEN ''DEAD_LETTER'' ELSE ''RETRY'' END,
    p_worker_id,p_error_code,p_error_message,coalesce(p_metadata,''{}''::jsonb)
  FROM failed RETURNING id
)
SELECT EXISTS(SELECT 1 FROM evidence)';

CREATE TABLE tenant_lifecycle_state(
  tenant_id uuid PRIMARY KEY REFERENCES tenant(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','CLOSURE_REQUESTED','CLOSED')),
  reason text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL CHECK(btrim(changed_by) <> ''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status='ACTIVE' OR btrim(coalesce(reason,''))<>'')
);

CREATE TABLE tenant_lifecycle_event(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  from_status text CHECK(from_status IS NULL OR from_status IN ('ACTIVE','SUSPENDED','CLOSURE_REQUESTED','CLOSED')),
  to_status text NOT NULL CHECK(to_status IN ('ACTIVE','SUSPENDED','CLOSURE_REQUESTED','CLOSED')),
  reason text NOT NULL CHECK(btrim(reason) <> ''),
  changed_by text NOT NULL CHECK(btrim(changed_by) <> ''),
  changed_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object')
);

CREATE FUNCTION transition_tenant_lifecycle(p_tenant_id uuid,p_to_status text,p_reason text)
RETURNS TABLE(tenant_id uuid,status text,changed boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH authorised AS (
  SELECT p_tenant_id AS tenant_id,
    nullif(btrim(current_setting(''app.actor_id'',true)),'''') AS actor_id
  WHERE p_tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''')
    AND p_to_status IN (''ACTIVE'',''SUSPENDED'',''CLOSURE_REQUESTED'',''CLOSED'')
    AND (p_to_status=''ACTIVE'' OR btrim(coalesce(p_reason,''''))<>'''')
    AND EXISTS(SELECT 1 FROM public.tenant_member m WHERE m.tenant_id=p_tenant_id
      AND m.actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''')
      AND m.role_code IN (''OWNER'',''ADMIN''))
), previous AS (
  SELECT a.tenant_id,a.actor_id,coalesce(s.status,''ACTIVE'') AS from_status
  FROM authorised a LEFT JOIN public.tenant_lifecycle_state s ON s.tenant_id=a.tenant_id
), transitionable AS (
  SELECT * FROM previous
  WHERE (from_status=''ACTIVE'' AND p_to_status IN (''SUSPENDED'',''CLOSURE_REQUESTED''))
    OR (from_status=''SUSPENDED'' AND p_to_status IN (''ACTIVE'',''CLOSURE_REQUESTED''))
    OR (from_status=''CLOSURE_REQUESTED'' AND p_to_status IN (''ACTIVE'',''CLOSED''))
), changed_state AS (
  INSERT INTO public.tenant_lifecycle_state(tenant_id,status,reason,effective_at,changed_by,updated_at)
  SELECT tenant_id,p_to_status,nullif(btrim(p_reason),''''),now(),actor_id,now() FROM transitionable
  ON CONFLICT(tenant_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,
    effective_at=excluded.effective_at,changed_by=excluded.changed_by,updated_at=excluded.updated_at
  WHERE public.tenant_lifecycle_state.status<>excluded.status
  RETURNING tenant_lifecycle_state.tenant_id,tenant_lifecycle_state.status,tenant_lifecycle_state.changed_by
), event_insert AS (
  INSERT INTO public.tenant_lifecycle_event(tenant_id,from_status,to_status,reason,changed_by,evidence)
  SELECT c.tenant_id,p.from_status,c.status,coalesce(nullif(btrim(p_reason),''''),''reactivated''),
    c.changed_by,jsonb_build_object(''source'',''transition_tenant_lifecycle'')
  FROM changed_state c JOIN previous p ON p.tenant_id=c.tenant_id RETURNING id
)
SELECT p_tenant_id,c.status,true FROM changed_state c
UNION ALL SELECT p_tenant_id,coalesce(s.status,''ACTIVE''),false
FROM previous p LEFT JOIN public.tenant_lifecycle_state s ON s.tenant_id=p.tenant_id
WHERE p.from_status=p_to_status AND NOT EXISTS(SELECT 1 FROM changed_state)';

CREATE TABLE tenant_export_request(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','GENERATING','READY','FAILED','EXPIRED')),
  scope_type text NOT NULL DEFAULT 'TENANT' CHECK(scope_type IN ('TENANT','ENGAGEMENT')),
  engagement_id uuid,
  export_format text NOT NULL DEFAULT 'ZIP' CHECK(export_format IN ('ZIP')),
  idempotency_key text NOT NULL CHECK(btrim(idempotency_key) <> ''),
  requested_by text NOT NULL CHECK(btrim(requested_by) <> ''),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  storage_key text,
  content_hash text,
  byte_size bigint,
  failure_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  CHECK((scope_type='TENANT' AND engagement_id IS NULL) OR (scope_type='ENGAGEMENT' AND engagement_id IS NOT NULL)),
  CHECK((storage_key IS NULL)=(content_hash IS NULL) AND (storage_key IS NULL)=(byte_size IS NULL)),
  CHECK(content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  CHECK(byte_size IS NULL OR byte_size>=0),
  CHECK(status<>'READY' OR (completed_at IS NOT NULL AND storage_key IS NOT NULL AND byte_size IS NOT NULL AND expires_at>completed_at)),
  CHECK(status<>'FAILED' OR btrim(coalesce(failure_code,''))<>'')
);

ALTER TABLE accounts_version
  ADD CONSTRAINT accounts_version_tenant_engagement_id_hash_uq
    UNIQUE(tenant_id,engagement_id,id,content_hash);

CREATE TABLE accounts_version_comparative(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  accounts_version_id uuid NOT NULL,
  current_manifest_hash text NOT NULL CHECK(btrim(current_manifest_hash) <> ''),
  comparative_engagement_id uuid NOT NULL,
  comparative_accounts_version_id uuid NOT NULL,
  comparative_manifest_hash text NOT NULL CHECK(btrim(comparative_manifest_hash) <> ''),
  created_by text NOT NULL CHECK(btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,accounts_version_id),
  FOREIGN KEY(tenant_id,engagement_id,accounts_version_id,current_manifest_hash)
    REFERENCES accounts_version(tenant_id,engagement_id,id,content_hash),
  FOREIGN KEY(tenant_id,comparative_engagement_id,comparative_accounts_version_id,comparative_manifest_hash)
    REFERENCES accounts_version(tenant_id,engagement_id,id,content_hash),
  CHECK(engagement_id<>comparative_engagement_id)
);

CREATE FUNCTION accounts_comparative_is_valid(p_tenant_id uuid,p_engagement_id uuid,p_comparative_engagement_id uuid)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(
  SELECT 1 FROM public.engagement current_e JOIN public.engagement prior_e
    ON prior_e.tenant_id=current_e.tenant_id AND prior_e.organisation_id=current_e.organisation_id
  WHERE current_e.tenant_id=p_tenant_id AND current_e.id=p_engagement_id
    AND prior_e.id=p_comparative_engagement_id
    AND prior_e.period_end<current_e.period_start
)';

ALTER TABLE accounts_version_comparative ADD CONSTRAINT accounts_version_comparative_period_ck
  CHECK(accounts_comparative_is_valid(tenant_id,engagement_id,comparative_engagement_id));

CREATE RULE client_document_response_no_update AS ON UPDATE TO client_document_response DO INSTEAD NOTHING;
CREATE RULE client_document_response_no_delete AS ON DELETE TO client_document_response DO INSTEAD NOTHING;
CREATE RULE client_document_review_no_update AS ON UPDATE TO client_document_review DO INSTEAD NOTHING;
CREATE RULE client_document_review_no_delete AS ON DELETE TO client_document_review DO INSTEAD NOTHING;
CREATE RULE integration_sync_item_no_update AS ON UPDATE TO integration_sync_item DO INSTEAD NOTHING;
CREATE RULE integration_sync_item_no_delete AS ON DELETE TO integration_sync_item DO INSTEAD NOTHING;
CREATE RULE integration_sync_error_no_update AS ON UPDATE TO integration_sync_error DO INSTEAD NOTHING;
CREATE RULE integration_sync_error_no_delete AS ON DELETE TO integration_sync_error DO INSTEAD NOTHING;
CREATE RULE outbox_delivery_attempt_no_update AS ON UPDATE TO outbox_delivery_attempt DO INSTEAD NOTHING;
CREATE RULE outbox_delivery_attempt_no_delete AS ON DELETE TO outbox_delivery_attempt DO INSTEAD NOTHING;
CREATE RULE tenant_lifecycle_event_no_update AS ON UPDATE TO tenant_lifecycle_event DO INSTEAD NOTHING;
CREATE RULE tenant_lifecycle_event_no_delete AS ON DELETE TO tenant_lifecycle_event DO INSTEAD NOTHING;
CREATE RULE accounts_version_comparative_no_update AS ON UPDATE TO accounts_version_comparative DO INSTEAD NOTHING;
CREATE RULE accounts_version_comparative_no_delete AS ON DELETE TO accounts_version_comparative DO INSTEAD NOTHING;

CREATE INDEX client_portal_identity_actor_idx ON client_portal_identity(auth_actor_id,tenant_id);
CREATE INDEX client_access_actor_lookup_idx ON client_engagement_access(tenant_id,engagement_id,status);
CREATE INDEX document_request_status_idx ON client_document_request(tenant_id,engagement_id,status,due_at);
CREATE INDEX sync_run_status_idx ON integration_sync_run(tenant_id,status,created_at);
CREATE INDEX outbox_claim_idx ON outbox_event(available_at,created_at,id) WHERE published_at IS NULL AND dead_lettered_at IS NULL;
CREATE INDEX tenant_export_status_idx ON tenant_export_request(tenant_id,status,requested_at);

ALTER TABLE client_contact ENABLE ROW LEVEL SECURITY; ALTER TABLE client_contact FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_identity ENABLE ROW LEVEL SECURITY; ALTER TABLE client_portal_identity FORCE ROW LEVEL SECURITY;
ALTER TABLE client_engagement_access ENABLE ROW LEVEL SECURITY; ALTER TABLE client_engagement_access FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_invitation ENABLE ROW LEVEL SECURITY; ALTER TABLE client_portal_invitation FORCE ROW LEVEL SECURITY;
ALTER TABLE client_document_request ENABLE ROW LEVEL SECURITY; ALTER TABLE client_document_request FORCE ROW LEVEL SECURITY;
ALTER TABLE client_document_response ENABLE ROW LEVEL SECURITY; ALTER TABLE client_document_response FORCE ROW LEVEL SECURITY;
ALTER TABLE client_document_review ENABLE ROW LEVEL SECURITY; ALTER TABLE client_document_review FORCE ROW LEVEL SECURITY;
ALTER TABLE connector_definition ENABLE ROW LEVEL SECURITY; ALTER TABLE connector_definition FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connection ENABLE ROW LEVEL SECURITY; ALTER TABLE integration_connection FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_run ENABLE ROW LEVEL SECURITY; ALTER TABLE integration_sync_run FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_item ENABLE ROW LEVEL SECURITY; ALTER TABLE integration_sync_item FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_error ENABLE ROW LEVEL SECURITY; ALTER TABLE integration_sync_error FORCE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY; ALTER TABLE notification FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_delivery_attempt ENABLE ROW LEVEL SECURITY; ALTER TABLE outbox_delivery_attempt FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_lifecycle_state ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_lifecycle_state FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_lifecycle_event ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_lifecycle_event FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_export_request ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_export_request FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts_version_comparative ENABLE ROW LEVEL SECURITY; ALTER TABLE accounts_version_comparative FORCE ROW LEVEL SECURITY;

CREATE POLICY client_contact_actor ON client_contact TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_contact.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')) OR EXISTS(SELECT 1 FROM client_portal_identity i WHERE i.tenant_id=client_contact.tenant_id AND i.client_contact_id=client_contact.id AND i.auth_actor_id=nullif(current_setting('app.actor_id',true),''))))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_contact.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY client_portal_identity_actor ON client_portal_identity FOR SELECT TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (auth_actor_id=nullif(current_setting('app.actor_id',true),'') OR EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_portal_identity.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))));
CREATE POLICY client_engagement_access_actor ON client_engagement_access TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_engagement_access.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')) OR client_actor_has_engagement_access(tenant_id,engagement_id)))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_engagement_access.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY client_portal_invitation_staff ON client_portal_invitation TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_portal_invitation.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_portal_invitation.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY client_document_request_actor ON client_document_request TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND (EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_document_request.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')) OR EXISTS(SELECT 1 FROM client_portal_identity i JOIN client_engagement_access a ON a.tenant_id=i.tenant_id AND a.client_contact_id=i.client_contact_id WHERE i.tenant_id=client_document_request.tenant_id AND i.client_contact_id=client_document_request.client_contact_id AND i.auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND a.engagement_id=client_document_request.engagement_id AND a.status='ACTIVE')))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_document_request.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY client_document_response_actor ON client_document_response TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM client_document_request r WHERE r.tenant_id=client_document_response.tenant_id AND r.id=client_document_response.document_request_id AND (EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=r.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')) OR EXISTS(SELECT 1 FROM client_portal_identity i JOIN client_engagement_access a ON a.tenant_id=i.tenant_id AND a.client_contact_id=i.client_contact_id WHERE i.tenant_id=r.tenant_id AND i.client_contact_id=r.client_contact_id AND i.auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND a.engagement_id=r.engagement_id AND a.status='ACTIVE'))))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND submitted_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM client_document_request r JOIN client_portal_identity i ON i.tenant_id=r.tenant_id AND i.client_contact_id=r.client_contact_id JOIN client_engagement_access a ON a.tenant_id=i.tenant_id AND a.client_contact_id=i.client_contact_id AND a.engagement_id=r.engagement_id WHERE r.tenant_id=client_document_response.tenant_id AND r.id=client_document_response.document_request_id AND r.status IN ('OPEN','REJECTED') AND i.auth_actor_id=nullif(current_setting('app.actor_id',true),'') AND a.status='ACTIVE' AND a.access_role IN ('CLIENT_PREPARER','CLIENT_APPROVER')));
CREATE POLICY client_document_review_actor ON client_document_review TO accounts_app
  USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM client_document_request r WHERE r.tenant_id=client_document_review.tenant_id AND r.id=client_document_review.document_request_id AND (EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=r.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')) OR client_actor_has_engagement_access(r.tenant_id,r.engagement_id))))
  WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND reviewed_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=client_document_review.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));

CREATE POLICY connector_definition_authenticated ON connector_definition FOR SELECT TO accounts_app USING(EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY integration_connection_actor ON integration_connection TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_connection.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_connection.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY integration_sync_run_actor ON integration_sync_run TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_run.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_run.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY integration_sync_item_actor ON integration_sync_item TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_item.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_item.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY integration_sync_error_actor ON integration_sync_error TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_error.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=integration_sync_error.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY notification_select_actor ON notification FOR SELECT TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND recipient_reference=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY notification_insert_staff ON notification FOR INSERT TO accounts_app WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=notification.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));
CREATE POLICY notification_read_actor ON notification FOR UPDATE TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND recipient_reference=nullif(current_setting('app.actor_id',true),'')) WITH CHECK(recipient_reference=nullif(current_setting('app.actor_id',true),'') AND read_by=nullif(current_setting('app.actor_id',true),'') AND read_status='READ');
CREATE POLICY outbox_event_publisher ON outbox_event TO accounts_publisher USING(true) WITH CHECK(true);
CREATE POLICY outbox_delivery_attempt_owner ON outbox_delivery_attempt TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY tenant_lifecycle_state_actor ON tenant_lifecycle_state TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=tenant_lifecycle_state.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=tenant_lifecycle_state.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'' ) AND m.role_code IN ('OWNER','ADMIN')));
CREATE POLICY tenant_lifecycle_event_actor ON tenant_lifecycle_event TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=tenant_lifecycle_event.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND changed_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=tenant_lifecycle_event.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'') AND m.role_code IN ('OWNER','ADMIN')));
CREATE POLICY tenant_export_request_actor ON tenant_export_request TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND requested_by=nullif(current_setting('app.actor_id',true),'')) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND requested_by=nullif(current_setting('app.actor_id',true),'' ) AND status='REQUESTED' AND storage_key IS NULL AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=tenant_export_request.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'') AND m.role_code IN ('OWNER','ADMIN')));
CREATE POLICY accounts_version_comparative_actor ON accounts_version_comparative TO accounts_app USING(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=accounts_version_comparative.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),''))) WITH CHECK(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND created_by=nullif(current_setting('app.actor_id',true),'') AND EXISTS(SELECT 1 FROM tenant_member m WHERE m.tenant_id=accounts_version_comparative.tenant_id AND m.actor_id=nullif(current_setting('app.actor_id',true),'')));

CREATE POLICY commercial_owner_client_contact ON client_contact TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_client_identity ON client_portal_identity TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_client_access ON client_engagement_access TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_client_invitation ON client_portal_invitation TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_document_request ON client_document_request TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_document_response ON client_document_response TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_document_review ON client_document_review TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_connector_definition ON connector_definition TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_integration_connection ON integration_connection TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_sync_run ON integration_sync_run TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_sync_item ON integration_sync_item TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_sync_error ON integration_sync_error TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_notification ON notification TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_lifecycle_state ON tenant_lifecycle_state TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_lifecycle_event ON tenant_lifecycle_event TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_export_request ON tenant_export_request TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY commercial_owner_comparative ON accounts_version_comparative TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON client_contact,client_portal_identity,client_engagement_access,client_portal_invitation,
  client_document_request,client_document_response,client_document_review,connector_definition,
  integration_connection,integration_sync_run,integration_sync_item,integration_sync_error,
  notification,outbox_delivery_attempt,tenant_lifecycle_state,tenant_lifecycle_event,
  tenant_export_request,accounts_version_comparative FROM PUBLIC,accounts_app,accounts_publisher;

GRANT SELECT,INSERT ON client_contact,client_engagement_access,client_document_request TO accounts_app;
GRANT UPDATE(display_name,email_normalized,status,updated_at) ON client_contact TO accounts_app;
GRANT UPDATE(access_role,status,updated_at,revoked_by,revoked_at) ON client_engagement_access TO accounts_app;
GRANT UPDATE(title,description,status,due_at,updated_at) ON client_document_request TO accounts_app;
GRANT SELECT ON client_portal_identity TO accounts_app;
GRANT SELECT(id,tenant_id,client_engagement_access_id,created_by,created_at,expires_at,accepted_by,accepted_at,revoked_by,revoked_at) ON client_portal_invitation TO accounts_app;
GRANT INSERT(id,tenant_id,client_engagement_access_id,token_hash,created_by,expires_at) ON client_portal_invitation TO accounts_app;
GRANT UPDATE(revoked_by,revoked_at) ON client_portal_invitation TO accounts_app;
GRANT SELECT ON client_document_response TO accounts_app;
GRANT SELECT,INSERT ON client_document_review TO accounts_app;
GRANT SELECT ON connector_definition TO accounts_app;
GRANT SELECT(id,tenant_id,organisation_id,connector_code,display_name,status,configuration,created_by,created_at,updated_at) ON integration_connection TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,connector_code,display_name,status,configuration,created_by) ON integration_connection TO accounts_app;
GRANT UPDATE(display_name,status,configuration,updated_at) ON integration_connection TO accounts_app;
GRANT SELECT,INSERT ON integration_sync_run,integration_sync_item,integration_sync_error TO accounts_app;
GRANT UPDATE(status,cursor_before,cursor_after,started_at,completed_at,item_count,error_count) ON integration_sync_run TO accounts_app;
GRANT SELECT,INSERT ON notification TO accounts_app;
GRANT UPDATE(read_status,read_by,read_at) ON notification TO accounts_app;
GRANT SELECT ON tenant_lifecycle_state,tenant_lifecycle_event TO accounts_app;
GRANT SELECT,INSERT ON tenant_export_request,accounts_version_comparative TO accounts_app;
REVOKE UPDATE ON tenant FROM accounts_app;
GRANT UPDATE(name) ON tenant TO accounts_app;

REVOKE ALL ON FUNCTION client_actor_has_engagement_access(uuid,uuid) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION accept_client_portal_invitation(text) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION list_authenticated_client_access() FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION accounts_comparative_is_valid(uuid,uuid,uuid) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION client_response_version_is_allowed(uuid,integer),client_review_is_independent(uuid,text) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION transition_tenant_lifecycle(uuid,text,text) FROM PUBLIC,accounts_app;
REVOKE ALL ON FUNCTION record_client_document_response(uuid,uuid,text,text,text,text,bigint,jsonb) FROM PUBLIC,accounts_app;
GRANT EXECUTE ON FUNCTION client_actor_has_engagement_access(uuid,uuid),accept_client_portal_invitation(text),list_authenticated_client_access(),accounts_comparative_is_valid(uuid,uuid,uuid),client_response_version_is_allowed(uuid,integer),client_review_is_independent(uuid,text),transition_tenant_lifecycle(uuid,text,text),record_client_document_response(uuid,uuid,text,text,text,text,bigint,jsonb) TO accounts_app,neondb_owner;

REVOKE ALL ON FUNCTION claim_outbox_events(text,integer),complete_outbox_event(uuid,text,text,jsonb),fail_outbox_event(uuid,text,text,text,timestamptz,boolean,jsonb) FROM PUBLIC,accounts_app,accounts_publisher;
GRANT EXECUTE ON FUNCTION claim_outbox_events(text,integer),complete_outbox_event(uuid,text,text,jsonb),fail_outbox_event(uuid,text,text,text,timestamptz,boolean,jsonb) TO accounts_publisher,neondb_owner;

INSERT INTO connector_definition(connector_code,display_name,source_type,credential_mode,capabilities) VALUES
  ('CSV','CSV upload','CSV','NONE','{"implemented":true,"mode":"UPLOAD"}'::jsonb),
  ('XLSX','Excel upload','XLSX','NONE','{"implemented":false,"mode":"UPLOAD"}'::jsonb),
  ('XERO','Xero','XERO','SECRET_REFERENCE','{"implemented":false,"mode":"API"}'::jsonb),
  ('QUICKBOOKS','QuickBooks','QUICKBOOKS','SECRET_REFERENCE','{"implemented":false,"mode":"API"}'::jsonb),
  ('SAGE','Sage','SAGE','SECRET_REFERENCE','{"implemented":false,"mode":"API"}'::jsonb),
  ('FREEAGENT','FreeAgent','FREEAGENT','SECRET_REFERENCE','{"implemented":false,"mode":"API"}'::jsonb);

INSERT INTO schema_migration(version,description)
VALUES('0018','commercial portal connectors delivery lifecycle exports and comparative foundations')
ON CONFLICT(version) DO NOTHING;

COMMIT;
