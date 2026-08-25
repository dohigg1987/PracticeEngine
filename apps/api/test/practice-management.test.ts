import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../src/practice-management.ts", import.meta.url), "utf8");
const platform = await readFile(new URL("../src/platform-core.ts", import.meta.url), "utf8");
const dispatcher = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../packages/database/migrations/0030_practice_management_work_foundation.sql", import.meta.url), "utf8");

test("exposes the complete Practice Management route surface", () => {
  for (const route of [
    "practice/services", "clients", "client-services", "practice/engagements", "practice/work",
    "tasks", "work-templates", "ledgerly-link", "summary",
  ]) assert.ok(service.replaceAll("\\/", "/").includes(route), route);
  assert.match(service, /handlePracticeManagementRoute/);
});

test("enforces tenant context permissions and commercial entitlements server-side", () => {
  assert.match(service, /platformContext\(request, actorId\)/);
  assert.match(service, /assertPlatformPermission/);
  assert.match(service, /assertPlatformEntitled\(tx, "practice\.enabled"\)/);
  assert.match(service, /assertPlatformEntitled\(tx, "ledgerly\.enabled"\)/);
  assert.match(service, /where tenant_id=\$\{ctx\.tenantId\}/);
  for (const permission of ["services.view", "services.manage", "engagements.view", "engagements.manage", "work.view", "work.create", "work.edit", "work.assign", "work.complete", "tasks.view", "tasks.manage", "worktemplates.manage"])
    assert.ok(service.includes(`"${permission}"`), permission);
});

test("writes immutable audit records and normalized transactional outbox events", () => {
  assert.match(service, /insert into audit_event/);
  assert.match(service, /insert into outbox_event/);
  for (const event of ["service.activated", "service.terminated", "engagement.created", "engagement.activated", "engagement.completed", "work.created", "work.assigned", "work.status_changed", "work.completed", "task.completed"])
    assert.ok(service.includes(`"${event}"`), event);
  for (const event of ["ledgerly.workspace.created", "ledgerly.accounts.started", "ledgerly.accounts.completed", "ledgerly.filing.submitted"])
    assert.ok(dispatcher.includes(`"${event}"`), event);
});

test("keeps Ledgerly accounting ownership behind a validated stable link", () => {
  assert.match(service, /work_item_ledgerly_link/);
  assert.match(service, /e\.organisation_id=w\.client_id/);
  assert.match(service, /requiredFeatureKey/);
  assert.doesNotMatch(service, /insert into (?:trial_balance|journal|reconciliation|accounts_version|filing_attempt)/i);
  assert.match(migration, /tenant_feature_is_enabled/);
  assert.match(migration, /required_feature_key/);
});

test("uses the shared Platform Core transaction and decision seam", () => {
  for (const exported of ["platformDatabase", "platformContext", "platformTransaction", "assertPlatformPermission", "assertPlatformEntitled"])
    assert.match(platform, new RegExp(`export (?:const |async function |function )${exported}\\b`));
  assert.match(service, /platformTransaction\(sql, ctx/);
});

test("models lifecycle completion and cross-tenant database enforcement", () => {
  assert.match(service, /INVALID_STATUS_TRANSITION/);
  assert.match(service, /completed_at=\$\{completedAt\}/);
  assert.match(migration, /ALTER TABLE work_item FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE work_item_ledgerly_link FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /FOREIGN KEY\(tenant_id,client_service_id,client_id\)/);
  assert.match(migration, /FOREIGN KEY\(tenant_id,engagement_id,client_id\)/);
});

test("separates completion, assignment, task visibility and Ledgerly-link authority", () => {
  assert.match(service, /status === "completed" && action !== "complete"\) await assertPlatformPermission\(tx, "work\.complete"\)/);
  assert.match(service, /assignedMemberId \|\| assignedTeamId\) await assertPlatformPermission\(tx, "work\.assign"\)/);
  assert.match(service, /if \(request\.method === "GET"\) \{\s*await assertPlatformPermission\(tx, "tasks\.view"\)/);
  assert.match(service, /INVALID_LEDGERLY_LINK/);
  assert.match(service, /feature_definition where feature_key=\$\{featureKey\} and module_key=\$\{moduleKey\}/);
  assert.match(service, /update work_item set specialist_module_key='ledgerly',specialist_record_reference=null[\s\S]*insert into work_item_ledgerly_link/);
});

test("rejects malformed identifiers dates and duplicate lifecycle facts", () => {
  assert.match(service, /must be a valid identifier/);
  assert.match(service, /must be a valid ISO date/);
  assert.match(service, /Work is already \$\{status\}/);
  assert.match(service, /Task is already \$\{status\}/);
  assert.match(service, /Client service is already terminated/);
  assert.match(service, /current\[0\]!\.status !== "completed" && rows\[0\]!\.status === "completed"/);
});

test("returns safe team and service labels without exposing authentication subjects", () => {
  assert.doesNotMatch(service, /actor_id assigned_member_name/);
  assert.doesNotMatch(service, /assigned_member_name/);
  assert.match(service, /assigned_team_name/);
  assert.match(service, /s\.name service_name/);
});
