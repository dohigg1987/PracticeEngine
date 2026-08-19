import test from "node:test";
import assert from "node:assert/strict";
import {
  finishSyncRun,
  startSyncRun,
  validateIntegrationConnection,
  type SyncRunState,
} from "../src/integration-sync.js";

const queued = (): SyncRunState => ({
  status: "QUEUED",
  idempotencyKey: "sync:tenant-1:engagement-1:source-1",
  recordsRead: 0,
  recordsAccepted: 0,
  recordsRejected: 0,
});

test("file import is the honest built-in connector and stores no credential", () => {
  assert.deepEqual(
    validateIntegrationConnection({ provider: "FILE_IMPORT", availability: "CONFIGURATION_REQUIRED" }),
    { provider: "FILE_IMPORT", availability: "AVAILABLE" },
  );
  assert.throws(
    () => validateIntegrationConnection({ provider: "FILE_IMPORT", availability: "AVAILABLE", credentialReference: "secret://file" }),
    /FILE_IMPORT_CREDENTIAL_FORBIDDEN/,
  );
});

test("external connectors accept opaque references but not embedded credential labels", () => {
  assert.equal(
    validateIntegrationConnection({ provider: "XERO", availability: "AVAILABLE", credentialReference: "oauth://connections/xero-17" }).credentialReference,
    "oauth://connections/xero-17",
  );
  assert.throws(
    () => validateIntegrationConnection({ provider: "SAGE", availability: "AVAILABLE", credentialReference: "secret://password-value" }),
    /CONNECTOR_CREDENTIAL_REFERENCE_UNSAFE/,
  );
});

test("sync lifecycle preserves coherent deterministic outcome counts", () => {
  const running = startSyncRun(queued(), "2026-08-18T10:00:00Z");
  const partial = finishSyncRun(running, "PARTIAL", "2026-08-18T10:00:04Z", { read: 10, accepted: 8, rejected: 2 });
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.completedAt, "2026-08-18T10:00:04.000Z");
  assert.throws(
    () => finishSyncRun(running, "SUCCEEDED", "2026-08-18T10:00:04Z", { read: 10, accepted: 8, rejected: 2 }),
    /SYNC_SUCCESS_REJECTIONS_FORBIDDEN/,
  );
  assert.throws(
    () => finishSyncRun(running, "FAILED", "2026-08-18T10:00:04Z", { read: 0, accepted: 0, rejected: 0 }),
    /SYNC_FAILURE_CODE_REQUIRED/,
  );
});
