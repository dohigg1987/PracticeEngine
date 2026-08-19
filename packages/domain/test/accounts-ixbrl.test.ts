import test from "node:test";
import assert from "node:assert/strict";
import { freezeAccountsVersion, transitionFiling, verifyAccountsVersion } from "../src/accounts-version.js";
import { validateIxbrlModel } from "../src/ixbrl.js";

test("frozen accounts manifest is deterministic and tamper evident", () => {
  const frozen = freezeAccountsVersion({ engagementId: "e1", accountsVersion: 1, trialBalanceId: "tb1", frameworkPackId: "FRS102-2026", taxonomyVersion: "UK-2026", generatedAt: "2027-03-14T11:00:00Z", dependencies: [
    { objectType: "DISCLOSURE", objectId: "d1", version: 2, contentHash: "d-hash" },
    { objectType: "TRIAL_BALANCE", objectId: "tb1", version: 4, contentHash: "tb-hash" },
  ] }, "2027-03-14T11:01:00Z");
  assert.equal(verifyAccountsVersion(frozen), true);
  assert.equal(verifyAccountsVersion({ ...frozen, manifest: { ...frozen.manifest, accountsVersion: 2 } }), false);
});

test("filing evidence retains rejected and accepted attempts as separate state", () => {
  const submitted = transitionFiling({ attemptNo: 1, regulator: "COMPANIES_HOUSE", status: "PREPARED", accountsManifestHash: "manifest", payloadHash: "payload" }, "SUBMITTED");
  assert.equal(transitionFiling(submitted, "REJECTED").status, "REJECTED");
  assert.throws(() => transitionFiling(submitted, "ACCEPTED"), /REFERENCE_REQUIRED/);
  assert.equal(transitionFiling(submitted, "ACCEPTED", "CH-REF-1").regulatorReference, "CH-REF-1");
});

test("iXBRL facts require valid contexts, qualified concepts and provenance", () => {
  const valid = validateIxbrlModel([{ id: "current", entityIdentifier: "01234567", periodStart: "2026-01-01", periodEnd: "2026-12-31" }], [{ id: "f1", concept: "uk-gaap:TurnoverRevenue", contextId: "current", value: "150000", unit: "GBP", decimals: 0, provenance: [{ objectType: "REPORT_LINE", objectId: "PL.REVENUE", version: 1, contentHash: "line-hash" }] }]);
  assert.deepEqual(valid, []);
  const invalid = validateIxbrlModel([], [{ id: "f1", concept: "Turnover", contextId: "missing", value: "150000", provenance: [] }]);
  assert.equal(invalid.filter((issue) => issue.severity === "ERROR").length, 3);
});
