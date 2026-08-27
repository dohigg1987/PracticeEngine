import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("packages/database/migrations/0035_resource_capacity_time_economics.sql", root), "utf8");
const service = await readFile(new URL("apps/api/src/resource-economics.ts", root), "utf8");
const core = await readFile(new URL("apps/api/src/resource-economics-core.ts", root), "utf8");
const docs = await Promise.all([
  "resource-management", "capacity-planning", "time-capture", "practice-economics", "wip", "portfolio-management"
].map((name) => readFile(new URL(`docs/architecture/${name}.md`, root), "utf8")));

test("PM-007 adds sequential migration 0035 and required architecture sources", async () => {
  const migrations = (await readdir(new URL("packages/database/migrations/", root))).filter((name) => /^\d{4}_/.test(name)).sort();
  assert.ok(migrations.includes("0035_resource_capacity_time_economics.sql"));
  assert.match(migration, /VALUES\('0035','Practice resource profiles capacity time capture WIP and management economics'\)/);
  for (const document of docs) assert.ok(document.trim().length > 200);
});

test("resource identity extends membership and preserves assignment history", () => {
  assert.match(migration, /CREATE TABLE resource_profile\(/);
  assert.match(migration, /PRIMARY KEY\(tenant_id,tenant_member_id\)/);
  assert.match(migration, /REFERENCES tenant_member\(tenant_id,id\)/);
  assert.match(migration, /CREATE TRIGGER tenant_member_resource_profile/);
  assert.match(migration, /CREATE TABLE work_assignment_history\(/);
  assert.doesNotMatch(migration, /CREATE TABLE (?:employee|resource_user)\(/i);
});

test("working patterns and cost rates are effective dated without overlap", () => {
  assert.match(migration, /resource_working_pattern_period_excl/);
  assert.match(migration, /resource_cost_rate_period_excl/);
  assert.match(migration, /daterange\(effective_from,coalesce\(effective_to,'infinity'::date\),'\[\]'\)/);
  assert.match(migration, /capacity_delta_minutes integer NOT NULL CHECK\(capacity_delta_minutes BETWEEN -1440 AND 1440/);
});

test("time and economics keep tenant-safe associations and valuation provenance", () => {
  for (const table of ["time_entry", "work_commercial_context", "billing_recovery"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  }
  assert.match(migration, /FOREIGN KEY\(tenant_id,work_item_id,client_id,client_service_id\) REFERENCES work_item\(tenant_id,id,client_id,client_service_id\)/);
  for (const field of ["cost_rate_id", "cost_rate_snapshot", "cost_amount_snapshot", "value_provenance", "source_version"]) {
    assert.ok(migration.includes(field), field);
  }
  assert.match(migration, /source_type<>'quotebench_accepted_proposal' OR proposal_reference_id IS NOT NULL/);
});

test("new tenant data has forced RLS and restricted economics policies", () => {
  const tables = [
    "resource_profile", "resource_working_pattern", "resource_availability_adjustment", "work_assignment_history",
    "resource_cost_rate", "time_entry", "work_commercial_context", "billing_recovery"
  ];
  for (const table of tables) assert.ok(migration.includes(`'${table}'`) || migration.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`), table);
  assert.match(migration, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /actor_has_permission\(''economics\.view''\)/);
  assert.match(migration, /actor_has_permission\('costrates\.view'\)/);
  assert.match(migration, /REVOKE ALL ON resource_profile[\s\S]*FROM PUBLIC,accounts_app/);
});

test("commercial entitlements remain separate from functional permissions", () => {
  for (const key of ["practice.resources", "practice.capacity", "practice.time", "practice.wip", "practice.economics", "practice.reporting"]) {
    assert.ok(migration.includes(`'${key}'`), key);
  }
  for (const permission of [
    "resources.view", "resources.manage", "capacity.view", "capacity.manage", "assignments.manage",
    "time.view", "time.enter", "time.manage", "time.approve", "costrates.view", "costrates.manage",
    "economics.view", "economics.manage", "portfolio.view"
  ]) assert.ok(migration.includes(`'${permission}'`), permission);
});

test("application boundary enforces permission and entitlement before resource or economic access", () => {
  assert.match(service, /assertPlatformPermission\(tx, permission\)/);
  assert.match(service, /assertPlatformEntitled\(tx, "practice\.enabled"\)/);
  assert.match(service, /assertPlatformEntitled\(tx, entitlement\)/);
  for (const route of ["resources", "capacity", "work-allocations", "time-entries", "cost-rates", "portfolio-economics", "economics/overview"]) {
    assert.ok(service.includes(route), route);
  }
});

test("material mutations share immutable audit and transactional outbox facts", () => {
  assert.match(service, /insert into audit_event/);
  assert.match(service, /insert into outbox_event/);
  for (const event of ["RESOURCE_PATTERN_CHANGED", "WORK_REASSIGNED", "TIME_ENTRY_CREATED", "COST_RATE_CREATED"]) {
    assert.ok(service.includes(event), event);
  }
});

test("capacity keeps committed remaining distinct from recurring forecast pressure", () => {
  assert.match(core, /remainingMinutes/);
  assert.match(core, /forecastRemainingMinutes/);
  assert.match(core, /forecastOverallocated/);
  assert.match(core, /source: "generated" \| "forecast"/);
  assert.match(core, /if \(workMinutes !== null && workMinutes !== undefined\)[\s\S]*presentTasks/);
});

test("architecture distinguishes transaction, derivation, cache, snapshot and unavailable values", () => {
  const architecture = docs.join("\n").toLowerCase();
  for (const concept of ["transactional", "derived", "cached", "snapshot", "unknown", "unavailable", "zero"]) {
    assert.ok(architecture.includes(concept), concept);
  }
  assert.match(architecture, /unknown is not zero|unknown[^\n]*never zero|unavailable[^\n]*never zero/);
  assert.match(architecture, /quotebench/);
  assert.match(architecture, /audit/);
  assert.match(architecture, /outbox/);
});
