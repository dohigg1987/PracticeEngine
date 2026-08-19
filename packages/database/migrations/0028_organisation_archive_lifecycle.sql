BEGIN;

ALTER TABLE organisation
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK(lifecycle_status IN ('ACTIVE','ARCHIVED')),
  ADD COLUMN archive_reason text,
  ADD COLUMN archived_by text,
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT organisation_archive_coherence_ck CHECK(
    (lifecycle_status='ACTIVE'
      AND archive_reason IS NULL AND archived_by IS NULL AND archived_at IS NULL)
    OR
    (lifecycle_status='ARCHIVED'
      AND btrim(coalesce(archive_reason,''))<>''
      AND char_length(archive_reason)<=1000
      AND btrim(coalesce(archived_by,''))<>''
      AND archived_at IS NOT NULL)
  );

CREATE INDEX organisation_tenant_lifecycle_name_idx
  ON organisation(tenant_id,lifecycle_status,legal_name,id);

CREATE FUNCTION archive_authenticated_organisation(
  p_organisation_id uuid,
  p_reason text
)
RETURNS TABLE(
  id uuid,
  legal_name text,
  legal_form text,
  jurisdiction text,
  lifecycle_status text,
  archive_reason text,
  archived_at timestamptz,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS '
WITH actor_context AS MATERIALIZED (
  SELECT nullif(current_setting(''app.tenant_id'',true),'''')::uuid AS tenant_id,
         nullif(current_setting(''app.actor_id'',true),'''') AS actor_id
), authorised AS MATERIALIZED (
  SELECT c.tenant_id,c.actor_id
  FROM actor_context c
  JOIN public.tenant_member tm ON tm.tenant_id=c.tenant_id AND tm.actor_id=c.actor_id
  WHERE tm.role_code IN (''OWNER'',''ADMIN'')
    AND p_reason IS NOT NULL AND btrim(p_reason)<>''''
    AND char_length(btrim(p_reason))<=1000
), locked AS MATERIALIZED (
  SELECT o.*
  FROM public.organisation o JOIN authorised a ON a.tenant_id=o.tenant_id
  WHERE o.id=p_organisation_id
  FOR UPDATE OF o
), updated AS (
  UPDATE public.organisation target
  SET lifecycle_status=''ARCHIVED'',archive_reason=btrim(p_reason),
      archived_by=a.actor_id,archived_at=now(),version=target.version+1,updated_at=now()
  FROM authorised a,locked prior
  WHERE target.tenant_id=a.tenant_id AND target.id=prior.id
    AND prior.lifecycle_status=''ACTIVE''
  RETURNING target.*
), result AS (
  SELECT u.*,true AS changed FROM updated u
  UNION ALL
  SELECT l.*,false AS changed FROM locked l WHERE NOT EXISTS(SELECT 1 FROM updated)
)
SELECT r.id,r.legal_name,r.legal_form,r.jurisdiction,r.lifecycle_status,
       r.archive_reason,r.archived_at,r.version,r.created_at,r.updated_at,r.changed
FROM result r
';

REVOKE ALL ON FUNCTION archive_authenticated_organisation(uuid,text)
  FROM PUBLIC,accounts_app;
GRANT EXECUTE ON FUNCTION archive_authenticated_organisation(uuid,text)
  TO accounts_app,neondb_owner;

-- Keep lifecycle columns unreachable by ad-hoc runtime DML. The function above
-- derives the actor and tenant from transaction-local authenticated context.
REVOKE INSERT ON organisation FROM accounts_app;
GRANT INSERT(id,tenant_id,legal_name,legal_form,jurisdiction) ON organisation
  TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0028','organisation archive lifecycle and authenticated archival')
ON CONFLICT(version) DO NOTHING;

COMMIT;
