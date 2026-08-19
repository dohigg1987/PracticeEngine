import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReconciliation, reviewReconciliation } from "../src/reconciliation.js";
import { rollForward, transitionEngagement, type CompletionState } from "../src/workflow.js";

const incomplete: CompletionState = { mappingComplete: false, blockingReconciliations: 1, blockingReviewPoints: 0, disclosuresComplete: false, accountsVersionFrozen: false, ixbrlBlockingErrors: 0, clientApproved: false };
const complete: CompletionState = { mappingComplete: true, blockingReconciliations: 0, blockingReviewPoints: 0, disclosuresComplete: true, accountsVersionFrozen: true, ixbrlBlockingErrors: 0, clientApproved: true };

test("workflow blocks review until accounting work is complete", () => {
  assert.throws(() => transitionEngagement("PREPARED", "READY_FOR_REVIEW", "PREPARER", incomplete), /NOT_READY/);
  assert.equal(transitionEngagement("PREPARED", "READY_FOR_REVIEW", "PREPARER", complete), "READY_FOR_REVIEW");
});

test("final approval requires the partner role", () => {
  assert.throws(() => transitionEngagement("CLIENT_APPROVAL", "FINAL_APPROVAL", "MANAGER", complete), /ROLE_NOT_ALLOWED/);
  assert.equal(transitionEngagement("CLIENT_APPROVAL", "FINAL_APPROVAL", "PARTNER", complete), "FINAL_APPROVAL");
});

test("roll forward respects reset, confirmation and never policies", () => {
  const result = rollForward<unknown>([
    { key: "policy", value: "FRS 102 revenue policy", policy: "CONFIRM" },
    { key: "currentYearValue", value: 10, policy: "RESET" },
    { key: "temporaryQuery", value: "question", policy: "NEVER" },
  ]);
  assert.deepEqual(result, [
    { key: "policy", value: "FRS 102 revenue policy", requiresConfirmation: true },
    { key: "currentYearValue", value: null, requiresConfirmation: false },
  ]);
});

test("reconciliation computes exceptions and enforces independent review", () => {
  const base = { id: "r1", type: "FIXED_ASSETS" as const, ledgerBalance: 81241000n, supportingBalance: 81241000n, tolerance: 0n, status: "RECONCILED" as const, preparedBy: "preparer" };
  assert.equal(evaluateReconciliation(base).withinTolerance, true);
  assert.throws(() => reviewReconciliation(base, "preparer"), /SEGREGATION/);
  assert.equal(reviewReconciliation(base, "reviewer").status, "REVIEWED");
});
