import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = await readFile(
    new URL(
      "../../../packages/database/migrations/0029_platform_core_client_entitlements.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  service = await readFile(
    new URL("../src/platform-core.ts", import.meta.url),
    "utf8",
  ),
  dispatcher = await readFile(
    new URL("../src/index.ts", import.meta.url),
    "utf8",
  );
test("separates authenticated identity from tenant membership", () => {
  assert.match(migration, /CREATE TABLE platform_user/);
  assert.match(
    migration,
    /tenant_member_user_fk FOREIGN KEY\(user_id\) REFERENCES platform_user\(id\)/,
  );
  assert.match(
    migration,
    /membership_status IN \('PENDING','ACTIVE','SUSPENDED'\)/,
  );
  assert.match(migration, /UNIQUE\(tenant_id,user_id\)/);
});
test("creates tenant roles permissions and teams with tenant-safe relationships", () => {
  for (const table of [
    "permission_definition",
    "tenant_role",
    "tenant_role_permission",
    "tenant_member_role",
    "team",
    "team_member",
  ])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(
    migration,
    /FOREIGN KEY\(tenant_id,tenant_member_id\) REFERENCES tenant_member\(tenant_id,id\)/,
  );
  assert.match(migration, /actor_has_permission\(p_permission_key text\)/);
  assert.doesNotMatch(service, /permission\s*===\s*["'](?:OWNER|ADMIN)/);
});
test("enforces active membership tenant scope permission and entitlement", () => {
  assert.match(migration, /tm\.membership_status='ACTIVE'/);
  for (const table of [
    "team",
    "team_member",
    "contact",
    "client_contact_relationship",
    "tenant_entitlement",
    "tenant_setting",
  ])
    assert.ok(migration.includes(`'${table}'`));
  assert.match(service, /permission\(tx,\s*"clients\.view"\)/);
  assert.match(service, /permission\(tx,\s*"clients\.create"\)/);
  assert.match(service, /permission\(tx,\s*"clients\.edit"\)/);
  assert.match(service, /entitled\(tx,\s*"practice\.clients"\)/);
  assert.match(service, /where tenant_id=\$1/);
  assert.match(
    service,
    /where tenant_id=\$\{ctx\.tenantId\} and id=\$\{clientId\}/,
  );
});
test("uses organisation id directly and preserves Ledgerly routes", () => {
  assert.match(migration, /expands the established identifiers/);
  assert.match(migration, /ALTER TABLE organisation/);
  assert.doesNotMatch(migration, /CREATE TABLE client\s*\(/);
  assert.match(service, /\/v1\/clients/);
  assert.match(dispatcher, /\/v1\/organisations/);
  assert.match(dispatcher, /handlePlatformCoreRoute/);
});
test("supports reusable contacts and dated client relationships", () => {
  assert.match(migration, /CREATE TABLE contact\(/);
  assert.match(migration, /CREATE TABLE client_contact_relationship\(/);
  assert.match(migration, /start_date date,end_date date/);
  assert.match(migration, /relationship_type_key='OTHER'/);
  assert.match(migration, /legacy_client_contact_id/);
  assert.match(service, /CLIENT_CONTACT_RELATIONSHIP_CHANGED/);
});
test("models catalogue entitlements and override precedence", () => {
  for (const table of [
    "product_definition",
    "module_definition",
    "feature_definition",
    "tenant_entitlement",
    "tenant_entitlement_override",
  ])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(migration, /\('ledgerly\.enabled','ledgerly','Ledgerly'\)/);
  assert.match(migration, /'TRANSITIONAL'/);
  assert.match(migration, /1 precedence/);
  assert.match(migration, /2 precedence/);
  assert.match(service, /tenant_feature_decision/);
  assert.doesNotMatch(service, /package(?:Name|_name)/i);
});
test("audits every new mutation and rejects audit mutation", () => {
  for (const event of [
    "CLIENT_CREATED",
    "CLIENT_UPDATED",
    "CLIENT_ARCHIVED",
    "CONTACT_CREATED",
    "CONTACT_UPDATED",
    "CLIENT_CONTACT_RELATIONSHIP_CHANGED",
    "TEAM_CREATED",
    "TEAM_ASSIGNMENT_CHANGED",
    "SETTING_CHANGED",
  ])
    assert.match(service, new RegExp(`"${event}"`));
  assert.match(dispatcher, /"TENANT_CREATED"/);
  assert.match(dispatcher, /"TENANT_MEMBERSHIP_CREATED"/);
  assert.match(migration, /DROP RULE audit_event_no_update/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON audit_event/);
  assert.match(migration, /RAISE EXCEPTION 'audit_event is immutable'/);
  assert.match(service, /insert into outbox_event/);
});
test("does not introduce excluded Practice Management domains", () =>
  assert.doesNotMatch(
    migration,
    /CREATE TABLE (?:job|recurring_work|workflow_definition|capacity_plan|crm_pipeline|service_catalogue)\b/i,
  ));
