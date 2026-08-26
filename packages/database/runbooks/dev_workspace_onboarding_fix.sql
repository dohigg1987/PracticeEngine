\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_setting('practiceengine.environment', true) IS DISTINCT FROM 'dev' THEN
    RAISE EXCEPTION 'Refusing DEV workspace fix outside development';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_authenticated_workspace(p_name text)
RETURNS TABLE(tenant_id uuid,name text,role_code text,created boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS 'WITH input AS (
 SELECT btrim(current_setting(''app.actor_id'',true))::public.onboarding_actor_id actor_id,
 btrim(p_name)::public.onboarding_workspace_name requested_name,
 lower(regexp_replace(btrim(p_name),''[[:space:]]+'','' '',''g''))::public.onboarding_workspace_name normalized_name,
 nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::public.onboarding_tenant_context tenant_context,
 gen_random_uuid() candidate_tenant_id
), claimed AS (
 INSERT INTO public.workspace_onboarding(actor_id,requested_name,normalized_name,tenant_id)
 SELECT actor_id,requested_name,normalized_name,candidate_tenant_id FROM input WHERE tenant_context IS NULL
 ON CONFLICT(actor_id,normalized_name) DO UPDATE SET requested_name=public.workspace_onboarding.requested_name
 RETURNING workspace_onboarding.actor_id,workspace_onboarding.requested_name,workspace_onboarding.tenant_id
), new_tenant AS (
 INSERT INTO public.tenant(id,name,legal_name,trading_name)
 SELECT c.tenant_id,c.requested_name,c.requested_name,c.requested_name FROM claimed c JOIN input i ON i.candidate_tenant_id=c.tenant_id
 RETURNING tenant.id,tenant.name
), new_member AS (
 INSERT INTO public.tenant_member(tenant_id,actor_id,role_code,display_name)
 SELECT nt.id,c.actor_id,''OWNER'',c.requested_name || '' Owner'' FROM new_tenant nt JOIN claimed c ON c.tenant_id=nt.id
 RETURNING tenant_member.tenant_id
)
SELECT c.tenant_id,c.requested_name::text,''OWNER''::text,
 EXISTS(SELECT 1 FROM new_member nm WHERE nm.tenant_id=c.tenant_id) FROM claimed c';
