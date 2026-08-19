BEGIN;

CREATE DOMAIN invitation_actor_id AS text
  CONSTRAINT invitation_actor_id_valid_ck
  CHECK(VALUE IS NOT NULL AND btrim(VALUE) <> '' AND char_length(VALUE) <= 320);

CREATE DOMAIN invitation_token_hash AS text
  CONSTRAINT invitation_token_hash_valid_ck
  CHECK(VALUE IS NOT NULL AND VALUE ~ '^[0-9a-f]{64}$');

CREATE DOMAIN invitation_tenant_context AS text
  CONSTRAINT invitation_tenant_context_absent_ck
  CHECK(VALUE IS NULL);

CREATE FUNCTION tenant_actor_is_administrator(p_tenant_id uuid)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT EXISTS(SELECT 1 FROM public.tenant_member tm WHERE tm.tenant_id=p_tenant_id AND tm.actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''') AND tm.role_code IN (''OWNER'',''ADMIN''))';

REVOKE ALL ON FUNCTION tenant_actor_is_administrator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_actor_is_administrator(uuid) FROM accounts_app;
GRANT EXECUTE ON FUNCTION tenant_actor_is_administrator(uuid) TO accounts_app,neondb_owner;

CREATE POLICY tenant_member_administrator_list ON tenant_member FOR SELECT TO accounts_app
  USING(
    tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
    AND tenant_actor_is_administrator(tenant_id)
  );

CREATE TABLE tenant_invitation(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  role_code text NOT NULL CHECK(role_code IN ('ADMIN','MEMBER')),
  created_by text NOT NULL CHECK(btrim(created_by) <> '' AND char_length(created_by) <= 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE(tenant_id,id),
  CHECK(expires_at > created_at AND expires_at <= created_at + interval '168 hours'),
  CHECK((accepted_by IS NULL) = (accepted_at IS NULL)),
  CHECK((revoked_by IS NULL) = (revoked_at IS NULL)),
  CHECK(accepted_by IS NULL OR (btrim(accepted_by) <> '' AND char_length(accepted_by) <= 320)),
  CHECK(revoked_by IS NULL OR (btrim(revoked_by) <> '' AND char_length(revoked_by) <= 320)),
  CHECK(accepted_at IS NULL OR accepted_at >= created_at),
  CHECK(revoked_at IS NULL OR revoked_at >= created_at),
  CHECK(NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE INDEX tenant_invitation_active_idx
  ON tenant_invitation(tenant_id,expires_at,id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE tenant_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitation FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_invitation_select ON tenant_invitation FOR SELECT TO accounts_app
  USING(
    tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id=tenant_invitation.tenant_id
        AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
        AND app_tm.role_code IN ('OWNER','ADMIN')
    )
  );

CREATE POLICY tenant_invitation_insert ON tenant_invitation FOR INSERT TO accounts_app
  WITH CHECK(
    tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
    AND created_by=nullif(current_setting('app.actor_id',true),'')
    AND accepted_at IS NULL AND accepted_by IS NULL
    AND revoked_at IS NULL AND revoked_by IS NULL
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id=tenant_invitation.tenant_id
        AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
        AND (
          app_tm.role_code='OWNER'
          OR (app_tm.role_code='ADMIN' AND tenant_invitation.role_code='MEMBER')
        )
    )
  );

CREATE POLICY tenant_invitation_revoke ON tenant_invitation FOR UPDATE TO accounts_app
  USING(
    tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
    AND accepted_at IS NULL AND revoked_at IS NULL
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id=tenant_invitation.tenant_id
        AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
        AND (
          app_tm.role_code='OWNER'
          OR (app_tm.role_code='ADMIN' AND tenant_invitation.role_code='MEMBER')
        )
    )
  )
  WITH CHECK(
    tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
    AND accepted_at IS NULL AND accepted_by IS NULL
    AND revoked_at IS NOT NULL
    AND revoked_by=nullif(current_setting('app.actor_id',true),'')
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id=tenant_invitation.tenant_id
        AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
        AND (
          app_tm.role_code='OWNER'
          OR (app_tm.role_code='ADMIN' AND tenant_invitation.role_code='MEMBER')
        )
    )
  );

CREATE POLICY tenant_invitation_migration_owner ON tenant_invitation
  TO neondb_owner USING(true) WITH CHECK(true);

CREATE FUNCTION accept_authenticated_invitation(p_token_hash text)
RETURNS TABLE(invitation_id uuid,tenant_id uuid,name text,role_code text,member_created boolean,accepted boolean)
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'WITH input AS (
  SELECT
    btrim(current_setting(''app.actor_id'',true))::public.invitation_actor_id AS actor_id,
    p_token_hash::public.invitation_token_hash AS token_hash,
    nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::public.invitation_tenant_context AS tenant_context
), claimed AS (
  UPDATE public.tenant_invitation i
  SET accepted_by=x.actor_id,accepted_at=now()
  FROM input x
  WHERE i.token_hash=x.token_hash
    AND x.tenant_context IS NULL
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL
    AND i.expires_at>now()
    AND NOT EXISTS(
      SELECT 1 FROM public.tenant_member existing_tm
      WHERE existing_tm.tenant_id=i.tenant_id
        AND existing_tm.actor_id=x.actor_id
        AND existing_tm.role_code<>i.role_code
    )
  RETURNING i.id,i.tenant_id,i.role_code,i.accepted_by
), candidate AS (
  SELECT c.*,gen_random_uuid() AS member_id FROM claimed c
), member_result AS (
  INSERT INTO public.tenant_member(id,tenant_id,actor_id,role_code)
  SELECT c.member_id,c.tenant_id,c.accepted_by,c.role_code
  FROM candidate c
  ON CONFLICT(tenant_id,actor_id) DO UPDATE
    SET role_code=public.tenant_member.role_code
  RETURNING tenant_member.id,tenant_member.tenant_id,tenant_member.actor_id,tenant_member.role_code
), first_result AS (
  SELECT c.id AS invitation_id,c.tenant_id,c.role_code,
    mr.id=c.member_id AS member_created,true AS accepted
  FROM candidate c
  JOIN member_result mr ON mr.tenant_id=c.tenant_id AND mr.actor_id=c.accepted_by
  WHERE mr.role_code=c.role_code
), replay_result AS (
  SELECT i.id AS invitation_id,i.tenant_id,i.role_code,
    false AS member_created,false AS accepted
  FROM public.tenant_invitation i
  JOIN input x ON x.token_hash=i.token_hash AND x.tenant_context IS NULL
  JOIN public.tenant_member tm ON tm.tenant_id=i.tenant_id
    AND tm.actor_id=x.actor_id AND tm.role_code=i.role_code
  WHERE i.accepted_by=x.actor_id AND i.accepted_at IS NOT NULL
    AND i.revoked_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM first_result)
), result AS (
  SELECT * FROM first_result
  UNION ALL
  SELECT * FROM replay_result
)
SELECT r.invitation_id,r.tenant_id,t.name,r.role_code,r.member_created,r.accepted
FROM result r
JOIN public.tenant t ON t.id=r.tenant_id
';

REVOKE ALL ON TABLE tenant_invitation FROM PUBLIC;
REVOKE ALL ON TABLE tenant_invitation FROM accounts_app;
GRANT SELECT(id,tenant_id,role_code,created_by,created_at,expires_at,accepted_by,accepted_at,revoked_by,revoked_at)
  ON tenant_invitation TO accounts_app;
GRANT INSERT(id,tenant_id,token_hash,role_code,created_by,expires_at)
  ON tenant_invitation TO accounts_app;
GRANT UPDATE(revoked_by,revoked_at) ON tenant_invitation TO accounts_app;

REVOKE ALL ON FUNCTION accept_authenticated_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_authenticated_invitation(text) FROM accounts_app;
GRANT EXECUTE ON FUNCTION accept_authenticated_invitation(text) TO accounts_app,neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0014','secure tenant team invitations and actor-only acceptance')
ON CONFLICT(version) DO NOTHING;

COMMIT;
