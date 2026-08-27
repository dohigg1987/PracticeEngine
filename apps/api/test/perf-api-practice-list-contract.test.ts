import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const service = await readFile(new URL("apps/api/src/practice-management.ts", root), "utf8");

function handlerSource(start: string, end: string): string {
  const from = service.indexOf(start);
  const to = service.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `${start} must exist`);
  assert.notEqual(to, -1, `${end} must exist after ${start}`);
  return service.slice(from, to);
}

test("work list uses one explicit list projection", () => {
  const source = handlerSource("async function workCollection", "async function workItem");
  const getBranch = source.slice(0, source.indexOf("const id = crypto.randomUUID()"));
  assert.equal((getBranch.match(/await tx`/g) ?? []).length, 1);
  assert.doesNotMatch(getBranch, /select w\.\*/);
  for (const field of [
    "w.id", "w.client_id", "w.client_service_id", "w.title", "w.period_reference", "w.status", "w.priority",
    "w.assigned_member_id", "w.assigned_team_id", "w.due_date", "w.calculated_due_date", "w.due_date_overridden",
    "w.due_date_calculation", "w.completed_at", "w.specialist_module_key", "o.display_name client_name",
    "s.name service_name", "am.display_name assigned_member_name", "at.name assigned_team_name",
  ]) assert.ok(getBranch.includes(field), `Work list must retain ${field}`);
});

test("work list omits internal and non-list work fields", () => {
  const source = handlerSource("async function workCollection", "async function workItem");
  const projection = source.slice(source.indexOf("await tx`select"), source.indexOf("from work_item w"));
  for (const field of [
    "w.tenant_id", "w.created_by", "w.updated_by", "w.due_date_override_actor", "w.due_date_overridden_at",
    "w.generation_id", "w.recurring_schedule_id", "w.review_member_id", "w.assignment_state",
  ]) assert.ok(!projection.includes(field), `Work list must omit ${field}`);
});

test("work list retains tenant, permission, entitlement and tenant-qualified joins", () => {
  const source = handlerSource("async function workCollection", "async function workItem");
  assert.match(source, /request\.method === "GET" \? "work\.view"/);
  assert.match(source, /"practice\.work"/);
  assert.match(source, /where w\.tenant_id=\$\{ctx\.tenantId\}/);
  for (const join of ["organisation o", "client_service cs", "practice_service s", "tenant_member am", "team at"])
    assert.match(source, new RegExp(`${join.replace(" ", "\\s+")} on [^\\n]+tenant_id=`));
});
