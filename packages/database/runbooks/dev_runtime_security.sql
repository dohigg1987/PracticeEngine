\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_setting('practiceengine.environment', true) IS DISTINCT FROM 'dev' THEN
    RAISE EXCEPTION 'Refusing DEV runtime security runbook outside development';
  END IF;
END $$;

GRANT SELECT(id,tenant_id,idempotency_key) ON public.outbox_event TO accounts_app;

DROP POLICY IF EXISTS audit_event_authenticated_insert ON public.audit_event;
CREATE POLICY audit_event_authenticated_insert ON public.audit_event
  FOR INSERT TO accounts_app
  WITH CHECK (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));

DROP POLICY IF EXISTS outbox_event_authenticated_insert ON public.outbox_event;
CREATE POLICY outbox_event_authenticated_insert ON public.outbox_event
  FOR INSERT TO accounts_app
  WITH CHECK (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));

DROP POLICY IF EXISTS outbox_event_authenticated_select ON public.outbox_event;
CREATE POLICY outbox_event_authenticated_select ON public.outbox_event
  FOR SELECT TO accounts_app
  USING (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));

DROP POLICY IF EXISTS portal_document_authenticated_insert ON public.portal_document;
CREATE POLICY portal_document_authenticated_insert ON public.portal_document
  FOR INSERT TO accounts_app
  WITH CHECK (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));

DROP POLICY IF EXISTS portal_document_version_authenticated_insert ON public.portal_document_version;
CREATE POLICY portal_document_version_authenticated_insert ON public.portal_document_version
  FOR INSERT TO accounts_app
  WITH CHECK (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
