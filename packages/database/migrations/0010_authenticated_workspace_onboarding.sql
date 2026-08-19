BEGIN;

CREATE DOMAIN onboarding_actor_id AS text
  CONSTRAINT onboarding_actor_id_valid_ck
  CHECK(VALUE IS NOT NULL AND btrim(VALUE) <> '' AND char_length(VALUE) <= 320);

CREATE DOMAIN onboarding_workspace_name AS text
  CONSTRAINT onboarding_workspace_name_valid_ck
  CHECK(VALUE IS NOT NULL AND btrim(VALUE) <> '' AND char_length(VALUE) <= 160);

CREATE DOMAIN onboarding_tenant_context AS text
  CONSTRAINT onboarding_tenant_context_absent_ck
  CHECK(VALUE IS NULL);

CREATE TABLE workspace_onboarding(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL CHECK(btrim(actor_id) <> '' AND char_length(actor_id) <= 320),
  requested_name text NOT NULL CHECK(btrim(requested_name) <> '' AND char_length(requested_name) <= 160),
  normalized_name text NOT NULL CHECK(btrim(normalized_name) <> '' AND char_length(normalized_name) <= 160),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenant(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,normalized_name)
);

CREATE INDEX workspace_onboarding_actor_created_idx
  ON workspace_onboarding(actor_id,created_at DESC);

ALTER TABLE workspace_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_onboarding_migration_owner ON workspace_onboarding
  TO neondb_owner USING(true) WITH CHECK(true);

-- The function reads the verified actor only from transaction-local context.
-- It generates the tenant identifier internally and cannot attach a caller to
-- a tenant that already exists. Same-actor same-name retries are idempotent.
CREATE FUNCTION create_authenticated_workspace(p_name text)
RETURNS TABLE(tenant_id uuid,name text,role_code text,created boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH input AS (
  SELECT
    btrim(current_setting(''app.actor_id'',true))::public.onboarding_actor_id AS actor_id,
    btrim(p_name)::public.onboarding_workspace_name AS requested_name,
    lower(regexp_replace(btrim(p_name),''[[:space:]]+'','' '',''g''))::public.onboarding_workspace_name AS normalized_name,
    nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::public.onboarding_tenant_context AS tenant_context,
    gen_random_uuid() AS candidate_tenant_id
), claimed AS (
  INSERT INTO public.workspace_onboarding(actor_id,requested_name,normalized_name,tenant_id)
  SELECT i.actor_id,i.requested_name,i.normalized_name,i.candidate_tenant_id
  FROM input i
  WHERE i.tenant_context IS NULL
  ON CONFLICT(actor_id,normalized_name) DO UPDATE
    SET requested_name=public.workspace_onboarding.requested_name
  RETURNING workspace_onboarding.actor_id,workspace_onboarding.requested_name,
    workspace_onboarding.tenant_id
), new_tenant AS (
  INSERT INTO public.tenant(id,name)
  SELECT c.tenant_id,c.requested_name
  FROM claimed c
  JOIN input i ON i.candidate_tenant_id=c.tenant_id
  RETURNING tenant.id,tenant.name
), new_member AS (
  INSERT INTO public.tenant_member(tenant_id,actor_id,role_code)
  SELECT nt.id,c.actor_id,''OWNER''
  FROM new_tenant nt
  JOIN claimed c ON c.tenant_id=nt.id
  RETURNING tenant_member.tenant_id
)
SELECT c.tenant_id,c.requested_name::text,''OWNER''::text,
  EXISTS(SELECT 1 FROM new_member nm WHERE nm.tenant_id=c.tenant_id)
FROM claimed c
';

REVOKE ALL ON TABLE workspace_onboarding FROM PUBLIC;
REVOKE ALL ON TABLE workspace_onboarding FROM accounts_app;
REVOKE ALL ON FUNCTION create_authenticated_workspace(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_authenticated_workspace(text) FROM accounts_app;
GRANT EXECUTE ON FUNCTION create_authenticated_workspace(text) TO accounts_app,neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0010','secure authenticated and idempotent workspace onboarding')
ON CONFLICT(version) DO NOTHING;

COMMIT;
