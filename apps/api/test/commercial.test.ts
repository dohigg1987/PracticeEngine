import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LIFECYCLE_TRANSITIONS, safeCommercialConfiguration } from "../src/commercial-contracts.ts";
import { publisherRetryAt, runPublisherBatch, type ClaimedOutboxEvent, type OutboxPublisherStore } from "../src/publisher.ts";

test("integration configuration recursively rejects secret-like keys and bounds JSON", () => {
  assert.deepEqual(safeCommercialConfiguration({ delimiter: ",", mapping: { account: "code" } }), { delimiter: ",", mapping: { account: "code" } });
  assert.throws(() => safeCommercialConfiguration({ nested: { accessToken: "plaintext" } }), /SECRET_CONFIGURATION_FORBIDDEN/);
  assert.throws(() => safeCommercialConfiguration({ value: "x".repeat(17 * 1024) }), /CONFIGURATION_TOO_LARGE/);
});

test("workspace lifecycle adjacency matches controlled close and reopen semantics", () => {
  assert.deepEqual(LIFECYCLE_TRANSITIONS.ACTIVE, ["SUSPENDED", "CLOSURE_REQUESTED"]);
  assert.ok(LIFECYCLE_TRANSITIONS.CLOSURE_REQUESTED!.includes("ACTIVE"));
  assert.ok(LIFECYCLE_TRANSITIONS.CLOSURE_REQUESTED!.includes("CLOSED"));
  assert.deepEqual(LIFECYCLE_TRANSITIONS.CLOSED, []);
});

test("publisher contract uses bounded exponential retry and terminal dead letter", async () => {
  assert.equal(publisherRetryAt("2026-08-18T10:00:00Z", 1), "2026-08-18T10:00:30.000Z");
  assert.equal(publisherRetryAt("2026-08-18T10:00:00Z", 20), "2026-08-18T11:00:00.000Z");
  const claimed: ClaimedOutboxEvent[] = [
    { id: "retry", tenantId: "t", eventType: "TEST", payload: {}, attemptCount: 1, maxAttempts: 3 },
    { id: "dead", tenantId: "t", eventType: "TEST", payload: {}, attemptCount: 3, maxAttempts: 3 },
  ];
  const failures: Array<{ id: string; dead: boolean; code: string }> = [];
  const store: OutboxPublisherStore = {
    claim: async () => claimed,
    complete: async () => true,
    fail: async (id, _worker, code, _message, _retryAt, dead) => { failures.push({ id, dead, code }); return true; },
  };
  const result = await runPublisherBatch({ store, adapter: { deliver: async () => { throw Object.assign(new Error("Provider timeout"), { code: "UPSTREAM TIMEOUT" }); } }, workerId: "pilot-publisher", occurredAt: "2026-08-18T10:00:00Z" });
  assert.deepEqual(result, { claimed: 2, delivered: 0, retry: 1, deadLetter: 1 });
  assert.deepEqual(failures, [
    { id: "retry", dead: false, code: "UPSTREAM_TIMEOUT" },
    { id: "dead", dead: true, code: "UPSTREAM_TIMEOUT" },
  ]);
});

test("client evidence is stored before the atomic database record and private keys stay server-side", async () => {
  const source = await readFile(new URL("../src/commercial.ts", import.meta.url), "utf8");
  const upload = source.indexOf("await env.ARTEFACTS.put(uploadedKey");
  const record = source.indexOf("record_client_document_response(");
  assert.ok(upload >= 0 && record > upload);
  assert.match(source, /if \(uploadedKey\) await deleteR2ObjectSafely/);
  assert.doesNotMatch(source, /select c\.[^`]*credential_reference/i);
  assert.match(source, /recipient_reference=\$\{ctx\.actorId\}/);
});
