import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dispatcher = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const dashboardSource = dispatcher.slice(
  dispatcher.indexOf("async function dashboard("),
  dispatcher.indexOf("async function engagementTrialBalance("),
);

test("keeps Ledgerly dashboard authorization ahead of its aggregate read", () => {
  assert.match(dashboardSource, /withTenantTransaction/);
  assert.match(dashboardSource, /await engagementAccess\(tx, ctx, engagementId\)/);
  assert.ok(
    dashboardSource.indexOf("await engagementAccess") <
      dashboardSource.indexOf("const metricRows = await tx"),
  );
});

test("loads all dashboard metrics in one SQL round trip", () => {
  assert.equal(dashboardSource.match(/await tx`/g)?.length, 1);
  for (const metric of [
    "journals",
    "reconciliations",
    "tasks",
    "reviewPoints",
    "workingPapers",
    "disclosures",
    "accountsVersions",
    "signoffs",
    "filingAttempts",
    "blockingItems",
  ]) assert.match(dashboardSource, new RegExp(`'${metric}'`));
});

test("preserves dashboard response fields and cancelled-task progress semantics", () => {
  for (const field of [
    "engagementId",
    "journals",
    "reconciliations",
    "tasks",
    "reviewPoints",
    "workingPapers",
    "disclosures",
    "accountsVersions",
    "signoffs",
    "filingAttempts",
    "progress",
    "blockingItems",
  ]) assert.match(dashboardSource, new RegExp(`\\b${field}\\b`));
  assert.match(dashboardSource, /tasks\.total - \(tasks\.byStatus\.CANCELLED \?\? 0\)/);
  assert.match(dashboardSource, /tasks\.byStatus\.COMPLETE \?\? 0/);
});
