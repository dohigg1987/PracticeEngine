import test from "node:test";
import assert from "node:assert/strict";
import { buildFrameworkStatements, selectFrameworkPack } from "../../reporting/src/framework.js";
import { baselineFrameworkPacks } from "../../reporting/src/packs.js";

test("framework selection pins the period-specific academy pack", () => {
  const pack = selectFrameworkPack(baselineFrameworkPacks, "FRS_102", "ACADEMIES_2026", "2025-09-01");
  assert.equal(pack.id, "ACADEMIES-2025-26");
  assert.ok(pack.requiredDisclosures.includes("REGULARITY_STATEMENT"));
});

test("charity pack builds separate SOFA and balance sheet statements", () => {
  const pack = selectFrameworkPack(baselineFrameworkPacks, "FRS_102", "CHARITIES_SORP_2026", "2026-01-01");
  const statements = buildFrameworkStatements([{ canonicalCode: "REV.DONATIONS", balance: -500000n, sourceAccountIds: ["4000"] }, { canonicalCode: "ASSET.CASH", balance: 500000n, sourceAccountIds: ["1000"] }], pack);
  assert.deepEqual(statements.map((statement) => statement.code), ["SOFA", "BALANCE_SHEET"]);
  assert.equal(statements[0]?.lines[0]?.balance, -500000n);
  assert.deepEqual(statements[0]?.lines[0]?.sourceAccountIds, ["4000"]);
});
