-- Trusted-admin workspace provisioning
--
-- Connect as neondb_owner. Never run this with the accounts_app credential.
-- Confirm the actor value is the verified Neon Auth JWT subject. Replace every
-- placeholder before running. The function is atomic and always creates the
-- initial membership with role OWNER.

BEGIN;

SELECT admin_provision_workspace(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'REPLACE WITH WORKSPACE NAME',
  'REPLACE WITH VERIFIED JWT SUBJECT'
);

COMMIT;

-- Verify the new workspace and its single initial owner membership.
-- SELECT t.id,t.name,tm.actor_id,tm.role_code
-- FROM tenant t
-- JOIN tenant_member tm ON tm.tenant_id=t.id
-- WHERE t.id='00000000-0000-0000-0000-000000000000'::uuid
