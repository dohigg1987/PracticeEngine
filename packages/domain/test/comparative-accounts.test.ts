import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComparativeReport,
  validateComparativeVersionLink,
} from "../src/comparative-accounts.js";

test("comparative accounts require immutable, earlier version provenance", () => {
  const link = validateComparativeVersionLink({
    currentAccountsVersionId: "accounts-2026",
    currentManifestHash: "current-hash",
    currentPeriod: { start: "2026-01-01", end: "2026-12-31" },
    comparativeAccountsVersionId: "accounts-2025",
    comparativeManifestHash: "comparative-hash",
    comparativePeriod: { start: "2025-01-01", end: "2025-12-31" },
  });
  assert.equal(link.comparativePeriod.end, "2025-12-31");
  assert.throws(
    () => validateComparativeVersionLink({ ...link, comparativePeriod: { start: "2026-01-01", end: "2026-06-30" } }),
    /COMPARATIVE_PERIOD_OVERLAPS_CURRENT/,
  );
  assert.throws(
    () => validateComparativeVersionLink({ ...link, comparativeAccountsVersionId: "accounts-2026" }),
    /COMPARATIVE_VERSION_SELF_REFERENCE/,
  );
});

test("comparative report retains prior-only lines and computes movements", () => {
  const rows = buildComparativeReport(
    [
      { code: "INCOME", caption: "Income", amountMinor: 125_00n },
      { code: "CASH", caption: "Cash", amountMinor: 40_00n },
    ],
    [
      { code: "INCOME", caption: "Income", amountMinor: 100_00n },
      { code: "LEGACY", caption: "Legacy balance", amountMinor: 10_00n },
    ],
  );
  assert.deepEqual(rows, [
    { code: "CASH", caption: "Cash", currentAmountMinor: 40_00n, comparativeAmountMinor: null, movementMinor: null, movementPercent: null },
    { code: "INCOME", caption: "Income", currentAmountMinor: 125_00n, comparativeAmountMinor: 100_00n, movementMinor: 25_00n, movementPercent: 25 },
    { code: "LEGACY", caption: "Legacy balance", currentAmountMinor: 0n, comparativeAmountMinor: 10_00n, movementMinor: -10_00n, movementPercent: -100 },
  ]);
});

test("comparative report rejects duplicate report codes", () => {
  assert.throws(
    () => buildComparativeReport([
      { code: "CASH", caption: "Cash", amountMinor: 1n },
      { code: "CASH", caption: "Cash duplicate", amountMinor: 2n },
    ], []),
    /REPORT_LINE_DUPLICATE:CURRENT:CASH/,
  );
});
