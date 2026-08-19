BEGIN;

-- tenant_member.actor_id stores the verified Neon Auth JWT subject directly.
-- This is the identity-to-membership mapping and avoids a second identity table.

-- The application must SET LOCAL both values inside every business transaction.
-- Membership discovery is the sole exception and uses actor_id alone. Missing or
-- empty values deny all business data. Each business policy checks membership
-- through tenant_member, which exposes only the current actor's membership rows.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_authenticated_actor ON tenant TO accounts_app
  USING(
    id::text = nullif(current_setting('app.tenant_id',true),'')
    AND nullif(current_setting('app.actor_id',true),'') IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id = tenant.id
        AND app_tm.actor_id = nullif(current_setting('app.actor_id',true),'')
    )
  )
  WITH CHECK(
    id::text = nullif(current_setting('app.tenant_id',true),'')
    AND nullif(current_setting('app.actor_id',true),'') IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id = tenant.id
        AND app_tm.actor_id = nullif(current_setting('app.actor_id',true),'')
    )
  );
CREATE POLICY tenant_actor_discovery ON tenant FOR SELECT TO accounts_app
  USING(
    nullif(current_setting('app.tenant_id',true),'') IS NULL
    AND nullif(current_setting('app.actor_id',true),'') IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id = tenant.id
        AND app_tm.actor_id = nullif(current_setting('app.actor_id',true),'')
    )
  );
ALTER TABLE tenant_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_member FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_member_actor_discovery ON tenant_member FOR SELECT TO accounts_app
  USING(
    actor_id = nullif(current_setting('app.actor_id',true),'')
    AND (
      nullif(current_setting('app.tenant_id',true),'') IS NULL
      OR tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    )
  );
CREATE POLICY tenant_member_actor_update ON tenant_member FOR UPDATE TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND actor_id = nullif(current_setting('app.actor_id',true),'')
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND actor_id = nullif(current_setting('app.actor_id',true),'')
  );
CREATE POLICY tenant_member_actor_delete ON tenant_member FOR DELETE TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND actor_id = nullif(current_setting('app.actor_id',true),'')
  );
ALTER TABLE organisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_tenant_actor ON organisation TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=organisation.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=organisation.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_tenant_actor ON engagement TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=engagement.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=engagement.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE engagement_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_member FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_member_tenant_actor ON engagement_member TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=engagement_member.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=engagement_member.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY import_batch_tenant_actor ON import_batch TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_batch.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_batch.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE import_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_row FORCE ROW LEVEL SECURITY;
CREATE POLICY import_row_tenant_actor ON import_row TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_row.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_row.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE import_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY import_snapshot_tenant_actor ON import_snapshot TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_snapshot.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=import_snapshot.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE source_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_account FORCE ROW LEVEL SECURITY;
CREATE POLICY source_account_tenant_actor ON source_account TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=source_account.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=source_account.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE account_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_mapping FORCE ROW LEVEL SECURITY;
CREATE POLICY account_mapping_tenant_actor ON account_mapping TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=account_mapping.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=account_mapping.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE trial_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_balance FORCE ROW LEVEL SECURITY;
CREATE POLICY trial_balance_tenant_actor ON trial_balance TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=trial_balance.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=trial_balance.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE trial_balance_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_balance_line FORCE ROW LEVEL SECURITY;
CREATE POLICY trial_balance_line_tenant_actor ON trial_balance_line TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=trial_balance_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=trial_balance_line.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_tenant_actor ON audit_event TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=audit_event.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=audit_event.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_event_tenant_actor ON outbox_event TO accounts_app
  USING(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=outbox_event.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  )
  WITH CHECK(
    tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
    AND EXISTS(SELECT 1 FROM tenant_member app_tm WHERE app_tm.tenant_id=outbox_event.tenant_id AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),''))
  );

-- Canonical taxonomy rows are global, but still require a valid tenant/actor
-- context. They remain SELECT-only for accounts_app through the grant runbook.
ALTER TABLE canonical_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_account FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_account_authenticated_actor ON canonical_account FOR SELECT TO accounts_app
  USING(
    EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
        AND app_tm.actor_id = nullif(current_setting('app.actor_id',true),'')
    )
  );

ALTER TABLE canonical_report_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_report_line FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_report_line_authenticated_actor ON canonical_report_line FOR SELECT TO accounts_app
  USING(
    EXISTS(
      SELECT 1 FROM tenant_member app_tm
      WHERE app_tm.tenant_id::text = nullif(current_setting('app.tenant_id',true),'')
        AND app_tm.actor_id = nullif(current_setting('app.actor_id',true),'')
    )
  );

INSERT INTO schema_migration(version,description)
VALUES('0006','authenticated tenant context and forced row level security')
ON CONFLICT(version) DO NOTHING;

COMMIT;
