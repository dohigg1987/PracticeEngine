import test from "node:test";
import assert from "node:assert/strict";
import { ManualPortalAdapter, prepareFilingEvidence } from "../src/filing-adapter.js";

test("filing preparation hashes the exact immutable payload", () => {
  const payload = { regulator: "COMPANIES_HOUSE" as const, engagementId: "e1", accountsVersionId: "av1", mediaType: "application/xhtml+xml", bytes: new TextEncoder().encode("<html>iXBRL</html>"), metadata: { taxonomy: "UK-2026" } };
  const first = prepareFilingEvidence(payload);
  const second = prepareFilingEvidence(payload);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(first.payloadSize, payload.bytes.byteLength);
});

test("manual regulator adapters do not pretend an online submission exists", async () => {
  const adapter = new ManualPortalAdapter("CCEW");
  assert.equal(adapter.supportsDirectSubmission, false);
  await assert.rejects(() => adapter.submit(), /DIRECT_SUBMISSION_UNAVAILABLE:CCEW/);
});
