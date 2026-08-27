import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const service = await readFile(new URL("apps/api/src/crm-onboarding.ts", root), "utf8");
const client = await readFile(new URL("apps/web/src/api.ts", root), "utf8");
const migration = await readFile(new URL("packages/database/migrations/0036_opportunity_service_editing.sql", root), "utf8");

test("UX-002 adds the sequential, tenant-RLS-preserving service replacement grant", async () => {
  const migrations = (await readdir(new URL("packages/database/migrations/", root))).sort();
  assert.equal(migrations.at(-1), "0036_opportunity_service_editing.sql");
  assert.match(migration, /GRANT DELETE ON opportunity_service TO accounts_app/);
  assert.match(migration, /VALUES\('0036','Opportunity proposed service editing'\)/);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|GRANT ALL/i);
});

test("opportunity item PATCH supports governed field and service editing", () => {
  assert.match(service, /request\.method === "PATCH" \? await requestBody/);
  assert.match(service, /request\.method === "GET" \? "crm\.view" : "opportunities\.edit"/);
  for (const field of ["name", "responsibleMemberId", "responsibleTeamId", "expectedCloseDate", "probability", "estimatedValue", "currency", "source", "serviceIds"])
    assert.match(service, new RegExp(`"${field}"`));
  assert.match(service, /delete from opportunity_service where tenant_id=\$\{ctx\.tenantId\}/);
  assert.match(service, /OPPORTUNITY_UPDATED/);
  assert.match(service, /opportunity\.updated/);
  assert.match(service, /Opportunity updated:/);
  assert.match(client, /updateCrmOpportunity:.*method: "PATCH"/);
});

test("stage transitions reject no-ops and require a recorded lost reason before mutation", () => {
  const noOp = service.indexOf("NO_OP_STAGE_TRANSITION");
  const update = service.indexOf("update opportunity set stage_key", noOp);
  assert.ok(noOp > 0 && update > noOp);
  assert.match(service, /terminal_outcome === "lost" \? required\(input, "outcomeReason", 1000\) : null/);
  assert.match(service, /\{ fromStage: String\(current\[0\]!\.stage_key\), toStage: stageKey, status, outcomeReason \}/);
});

test("opportunity reads expose ownership, stage, capabilities, and conversion destinations", () => {
  for (const projection of ["stage_name", "responsible_member_name", "responsible_team_name", "client_name", "engagement_name", "onboarding_status", "activated_services"])
    assert.match(service, new RegExp(projection));
  for (const capability of ["canCreate", "canEdit", "canConvert", "quoteBenchAvailable"])
    assert.match(service, new RegExp(capability));
  for (const destination of ["client_id", "engagement_id", "onboarding_case_id"])
    assert.match(client, new RegExp(destination));
});
