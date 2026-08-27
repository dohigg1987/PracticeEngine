import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const service = await readFile(new URL("apps/api/src/crm-onboarding.ts", root), "utf8");

function handlerSource(start: string, end: string): string {
  const from = service.indexOf(start);
  const to = service.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `${start} must exist`);
  assert.notEqual(to, -1, `${end} must exist after ${start}`);
  return service.slice(from, to);
}

test("prospect list enrichments use tenant-bounded set aggregates", () => {
  const source = handlerSource("async function prospectCollection", "async function prospectItem");
  assert.match(source, /with activity_rollup as/);
  assert.match(source, /where tenant_id=\$\{ctx\.tenantId\} and prospect_id is not null group by tenant_id,prospect_id/);
  assert.match(source, /opportunity_rollup as/);
  assert.doesNotMatch(source, /where a\.tenant_id=p\.tenant_id and a\.prospect_id=p\.id/);
  assert.doesNotMatch(source, /where o\.tenant_id=p\.tenant_id and o\.prospect_id=p\.id/);
});

test("opportunity list services, latest proposals, and capabilities use one statement", () => {
  const source = handlerSource("async function opportunityCollection", "async function opportunityItem");
  const getBranch = source.slice(0, source.indexOf("const opportunityId"));
  assert.match(getBranch, /with capabilities as/);
  assert.match(getBranch, /service_rollup as/);
  assert.match(getBranch, /latest_proposal as/);
  assert.match(getBranch, /distinct on \(tenant_id,opportunity_id\)/);
  assert.match(getBranch, /where os\.tenant_id=\$\{ctx\.tenantId\} group by os\.tenant_id,os\.opportunity_id/);
  assert.match(getBranch, /where tenant_id=\$\{ctx\.tenantId\}/);
  assert.equal((getBranch.match(/await tx`/g) ?? []).length, 1);
  assert.doesNotMatch(getBranch, /where os\.tenant_id=o\.tenant_id/);
  assert.doesNotMatch(getBranch, /where q\.tenant_id=o\.tenant_id/);
});

test("CRM list projections retain authorization, entitlement, and tenant scoping", () => {
  for (const start of ["async function prospectCollection", "async function opportunityCollection"]) {
    const end = start.includes("prospect") ? "async function prospectItem" : "async function opportunityItem";
    const source = handlerSource(start, end);
    assert.match(source, /request\.method === "GET" \? "crm\.view"/);
    assert.match(source, /"practice\.crm"/);
    assert.match(source, /ctx\.tenantId/);
  }
});
