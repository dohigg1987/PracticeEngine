import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCatalogue, evaluatePredicate, type ComplianceRule } from "../../rules/src/catalog.js";

test("compound compliance predicates support all, any and not", () => {
  const facts = { entityType: "CHARITY", employeeCount: 12, dormant: false };
  assert.equal(evaluatePredicate({ all: [
    { field: "entityType", operator: "EQ", value: "CHARITY" },
    { any: [{ field: "employeeCount", operator: "GT", value: 0 }, { field: "dormant", operator: "EQ", value: true }] },
    { not: { field: "dormant", operator: "EQ", value: true } },
  ] }, facts), true);
});

test("catalogue applies effective framework rules and resolves target priority", () => {
  const rules: ComplianceRule[] = [
    { id: "CHAR-EMP-001", framework: "FRS_102", sector: "CHARITIES_SORP_2026", effectiveFrom: "2026-01-01", sourceReference: "SORP 2026 staff costs module", priority: 100, condition: { field: "employeeCount", operator: "GT", value: 0 }, outcome: { type: "REQUIRE", target: "NOTE.STAFF_COSTS", message: "Provide staff-cost information." } },
    { id: "GEN-EMP-001", framework: "FRS_102", effectiveFrom: "2026-01-01", sourceReference: "FRS 102", priority: 10, condition: { field: "employeeCount", operator: "GT", value: 0 }, outcome: { type: "RECOMMEND", target: "NOTE.STAFF_COSTS", message: "Consider staff-cost information." } },
  ];
  const results = evaluateCatalogue(rules, { framework: "FRS_102", sector: "CHARITIES_SORP_2026", periodStart: "2026-01-01", facts: { employeeCount: 12 } });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.ruleId, "CHAR-EMP-001");
  assert.equal(results[0]?.type, "REQUIRE");
});
