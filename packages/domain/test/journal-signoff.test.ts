import test from "node:test";
import assert from "node:assert/strict";
import { applyApprovedJournals, assertJournalBalanced, transitionJournal, type Journal } from "../src/journal.js";
import { invalidateSignoff, type Signoff } from "../src/signoff.js";

const prepared: Journal = {
  id: "j1",
  type: "ADJUSTING",
  state: "PREPARED",
  description: "Accrued audit fee",
  preparedBy: "preparer",
  lines: [
    { id: "jl1", canonicalCode: "EXP.AUDIT", debit: 1200000n, credit: 0n },
    { id: "jl2", canonicalCode: "LIAB.ACCRUALS", debit: 0n, credit: 1200000n },
  ],
};

test("journal approval enforces balance and segregation of duties", () => {
  assert.doesNotThrow(() => assertJournalBalanced(prepared));
  assert.throws(() => transitionJournal(prepared, "APPROVED", "preparer"), /SEGREGATION/);
  assert.equal(transitionJournal(prepared, "APPROVED", "reviewer").approvedBy, "reviewer");
});

test("approved journals create adjusted balances with provenance", () => {
  const approved = transitionJournal(prepared, "APPROVED", "reviewer");
  const result = applyApprovedJournals([], [approved]);
  assert.equal(result.find((line) => line.canonicalCode === "EXP.AUDIT")?.balance, 1200000n);
  assert.deepEqual(result.find((line) => line.canonicalCode === "LIAB.ACCRUALS")?.journalIds, ["j1"]);
});

test("dependency change invalidates an existing signoff", () => {
  const signoff: Signoff = {
    id: "s1", objectType: "NOTE", objectId: "note-12", objectVersion: 6, signedBy: "reviewer",
    signedAt: "2027-03-14T11:03:00Z", status: "VALID",
    dependencies: [{ objectType: "TRIAL_BALANCE", objectId: "tb-1", version: 4, contentHash: "hash-4" }],
  };
  const invalidated = invalidateSignoff(signoff, [{ objectType: "TRIAL_BALANCE", objectId: "tb-1", version: 5, contentHash: "hash-5" }], "2027-03-14T11:04:00Z");
  assert.equal(invalidated.status, "INVALIDATED");
  assert.match(invalidated.invalidationReason ?? "", /TRIAL_BALANCE:tb-1/);
});
