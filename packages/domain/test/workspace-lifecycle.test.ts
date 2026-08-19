import test from "node:test";
import assert from "node:assert/strict";
import { transitionWorkspace, transitionWorkspaceExport } from "../src/workspace-lifecycle.js";

test("workspace suspension and closure require explicit reason and remain recoverable until closed", () => {
  assert.throws(() => transitionWorkspace({ status: "ACTIVE" }, "SUSPENDED"), /WORKSPACE_TRANSITION_REASON_REQUIRED/);
  const suspended = transitionWorkspace({ status: "ACTIVE" }, "SUSPENDED", "Billing review");
  assert.equal(transitionWorkspace(suspended, "ACTIVE").status, "ACTIVE");
  const closure = transitionWorkspace({ status: "ACTIVE" }, "CLOSURE_REQUESTED", "Customer request");
  const closed = transitionWorkspace(closure, "CLOSED", "Approved retention workflow complete");
  assert.throws(() => transitionWorkspace(closed, "ACTIVE"), /WORKSPACE_TRANSITION_NOT_ALLOWED:CLOSED:ACTIVE/);
});

test("workspace export is ready only with immutable integrity metadata", () => {
  const requested = { status: "REQUESTED" as const, requestedBy: "owner-1" };
  const generating = transitionWorkspaceExport(requested, "GENERATING");
  assert.throws(
    () => transitionWorkspaceExport(generating, "READY", { contentHash: "short", byteSize: 10, expiresAt: "2026-08-19T10:00:00Z" }),
    /WORKSPACE_EXPORT_HASH_REQUIRED/,
  );
  const ready = transitionWorkspaceExport(generating, "READY", {
    contentHash: "f".repeat(64),
    byteSize: 1_024,
    expiresAt: "2026-08-19T10:00:00Z",
  });
  assert.equal(ready.expiresAt, "2026-08-19T10:00:00.000Z");
  assert.equal(transitionWorkspaceExport(ready, "EXPIRED").status, "EXPIRED");
});
