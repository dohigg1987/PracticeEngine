BEGIN;

CREATE OR REPLACE FUNCTION manage_workspace_member(
  p_member_id uuid,
  p_action text,
  p_role_code text DEFAULT NULL
)
RETURNS TABLE(member_id uuid,previous_role text,role_code text,removed boolean)
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS 'WITH context AS MATERIALIZED (
  SELECT
    nullif(btrim(current_setting(''app.tenant_id'',true)),'''')::uuid AS tenant_id,
    nullif(btrim(current_setting(''app.actor_id'',true)),'''') AS actor_id,
    upper(btrim(p_action)) AS requested_action,
    upper(nullif(btrim(p_role_code),'''')) AS requested_role
), requester AS MATERIALIZED (
  SELECT tm.id,tm.role_code,c.tenant_id,c.requested_action,c.requested_role
  FROM context c
  JOIN public.tenant_member tm
    ON tm.tenant_id=c.tenant_id AND tm.actor_id=c.actor_id
  FOR UPDATE OF tm
), target AS MATERIALIZED (
  SELECT tm.id,tm.role_code,r.tenant_id,r.requested_action,r.requested_role,
    r.id AS requester_id,r.role_code AS requester_role
  FROM requester r
  JOIN public.tenant_member tm
    ON tm.tenant_id=r.tenant_id AND tm.id=p_member_id
  FOR UPDATE OF tm
), permitted AS MATERIALIZED (
  SELECT t.*
  FROM target t
  WHERE t.requester_role IN (''OWNER'',''ADMIN'')
    AND t.id<>t.requester_id
    AND t.requested_action IN (''SET_ROLE'',''REMOVE'')
    AND (t.requested_action<>''SET_ROLE'' OR t.requested_role IN (''OWNER'',''ADMIN'',''MEMBER''))
    AND (t.requester_role<>''ADMIN'' OR (t.role_code=''MEMBER'' AND coalesce(t.requested_role,''MEMBER'')=''MEMBER''))
    AND (t.role_code<>''OWNER'' OR (SELECT count(*) FROM public.tenant_member owner_member WHERE owner_member.tenant_id=t.tenant_id AND owner_member.role_code=''OWNER'')>1)
), changed AS (
  UPDATE public.tenant_member tm
  SET role_code=p.requested_role
  FROM permitted p
  WHERE p.requested_action=''SET_ROLE'' AND tm.id=p.id
  RETURNING tm.id,p.role_code AS previous_role,tm.role_code
), removed_member AS (
  DELETE FROM public.tenant_member tm
  USING permitted p
  WHERE p.requested_action=''REMOVE'' AND tm.id=p.id
  RETURNING tm.id,p.role_code AS previous_role
)
SELECT c.id,c.previous_role,c.role_code,false FROM changed c
UNION ALL
SELECT r.id,r.previous_role,NULL::text,true FROM removed_member r';

REVOKE ALL ON FUNCTION manage_workspace_member(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manage_workspace_member(uuid,text,text) TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0024','Controlled workspace role changes and access removal');

COMMIT;
