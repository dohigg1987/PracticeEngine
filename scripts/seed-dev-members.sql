\set ON_ERROR_STOP on

-- Identity/membership bootstrap only. All business data is created through the
-- Worker API by seed-dev-showcase.mjs so normal authorization, audit and outbox
-- behaviour is exercised.
BEGIN;
CREATE TEMP TABLE dev_seed_input(
  tenant_id uuid NOT NULL,environment_name text NOT NULL,
  owner_actor_id text NOT NULL,manager_actor_id text NOT NULL,
  reviewer_actor_id text NOT NULL,member_actor_id text NOT NULL
) ON COMMIT DROP;
INSERT INTO dev_seed_input VALUES(
  :'tenant_id',:'environment_name',:'owner_actor_id',:'manager_actor_id',:'reviewer_actor_id',:'member_actor_id'
);
DO $guard$
BEGIN
  IF current_setting('practiceengine.environment', true) IS DISTINCT FROM 'dev' THEN
    RAISE EXCEPTION 'Refusing seed: PGOPTIONS must set practiceengine.environment=dev';
  END IF;
  IF (SELECT environment_name FROM dev_seed_input) <> 'practiceengine-dev' THEN
    RAISE EXCEPTION 'Refusing seed: environment_name must equal practiceengine-dev';
  END IF;
END $guard$;

SELECT pg_advisory_xact_lock(hashtextextended('practiceengine:dev-showcase:' || :'tenant_id', 0));

DO $seed$
DECLARE
  v_tenant uuid := (SELECT tenant_id FROM dev_seed_input);
  v_row record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant WHERE id=v_tenant) THEN
    RAISE EXCEPTION 'Tenant % does not exist', v_tenant;
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      ((SELECT owner_actor_id FROM dev_seed_input),    'Development Owner',    'OWNER'),
      ((SELECT manager_actor_id FROM dev_seed_input),  'Development Manager',  'ADMIN'),
      ((SELECT reviewer_actor_id FROM dev_seed_input), 'Development Reviewer', 'MEMBER'),
      ((SELECT member_actor_id FROM dev_seed_input),   'Development Team',     'MEMBER')
    ) AS x(actor_id,display_name,role_key)
  LOOP
    INSERT INTO tenant_member(id,tenant_id,actor_id,display_name,role_code,membership_status)
    VALUES(gen_random_uuid(),v_tenant,v_row.actor_id,v_row.display_name,v_row.role_key,'ACTIVE')
    ON CONFLICT(tenant_id,actor_id) DO UPDATE SET
      display_name=excluded.display_name,role_code=excluded.role_code,
      membership_status='ACTIVE',updated_at=now();

    INSERT INTO tenant_member_role(tenant_id,tenant_member_id,role_id,assigned_by)
    SELECT v_tenant,m.id,r.id,'dev-seed-bootstrap'
    FROM tenant_member m JOIN tenant_role r ON r.tenant_id=m.tenant_id AND r.role_key=v_row.role_key
    WHERE m.tenant_id=v_tenant AND m.actor_id=v_row.actor_id
    ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM seed_tenant_platform_defaults(v_tenant);

  INSERT INTO tenant_role(tenant_id,role_key,display_name,system_role,created_by)
  VALUES(v_tenant,'REVIEWER','Reviewer',false,'dev-seed-bootstrap')
  ON CONFLICT(tenant_id,role_key) DO UPDATE SET status='ACTIVE',updated_at=now();
  INSERT INTO tenant_role_permission(tenant_id,role_id,permission_key,granted_by)
  SELECT v_tenant,r.id,p.permission_key,'dev-seed-bootstrap'
  FROM tenant_role r CROSS JOIN permission_definition p
  WHERE r.tenant_id=v_tenant AND r.role_key='REVIEWER'
    AND p.permission_key IN ('clients.view','services.view','engagements.view','work.view','tasks.view','review.perform','review.request','resources.view','capacity.view','time.view','time.enter')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_member_role(tenant_id,tenant_member_id,role_id,assigned_by)
  SELECT v_tenant,m.id,r.id,'dev-seed-bootstrap'
  FROM tenant_member m JOIN tenant_role r ON r.tenant_id=m.tenant_id AND r.role_key='REVIEWER'
  WHERE m.tenant_id=v_tenant AND m.actor_id=(SELECT reviewer_actor_id FROM dev_seed_input)
  ON CONFLICT DO NOTHING;
END $seed$;
COMMIT;
