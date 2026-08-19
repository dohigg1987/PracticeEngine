import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelDocumentRequest,
  decideClientResponse,
  recordClientResponse,
  type DocumentRequestState,
} from "../src/client-portal.js";

const open = (): DocumentRequestState => ({ status: "OPEN", responseVersion: 0 });
const hash = "a".repeat(64);

test("client document response is versioned and independently approved", () => {
  const response = recordClientResponse(open(), { id: "client-1", kind: "CLIENT" }, hash);
  assert.equal(response.responseVersion, 1);
  assert.equal(response.status, "RESPONDED");
  const approved = decideClientResponse(response, { id: "staff-1", kind: "STAFF" }, "APPROVED");
  assert.equal(approved.status, "APPROVED");
  assert.throws(
    () => recordClientResponse(approved, { id: "client-1", kind: "CLIENT" }, hash),
    /CLIENT_RESPONSE_NOT_ALLOWED:APPROVED/,
  );
});

test("rejected client responses require a reason and allow a new immutable version", () => {
  const response = recordClientResponse(open(), { id: "client-1", kind: "CLIENT" }, hash);
  assert.throws(
    () => decideClientResponse(response, { id: "staff-1", kind: "STAFF" }, "REJECTED"),
    /CLIENT_REJECTION_REASON_REQUIRED/,
  );
  const rejected = decideClientResponse(response, { id: "staff-1", kind: "STAFF" }, "REJECTED", "Statement is incomplete");
  const replacement = recordClientResponse(rejected, { id: "client-1", kind: "CLIENT" }, "b".repeat(64));
  assert.equal(replacement.responseVersion, 2);
  assert.equal(replacement.responseContentHash, "b".repeat(64));
});

test("staff cannot impersonate a client response and clients cannot decide it", () => {
  assert.throws(
    () => recordClientResponse(open(), { id: "staff-1", kind: "STAFF" }, hash),
    /CLIENT_RESPONSE_ACTOR_REQUIRED/,
  );
  const response = recordClientResponse(open(), { id: "client-1", kind: "CLIENT" }, hash);
  assert.throws(
    () => decideClientResponse(response, { id: "client-2", kind: "CLIENT" }, "APPROVED"),
    /CLIENT_DECISION_STAFF_REQUIRED/,
  );
  assert.throws(
    () => cancelDocumentRequest(response, { id: "staff-1", kind: "STAFF" }),
    /CLIENT_REQUEST_CANCEL_NOT_ALLOWED:RESPONDED/,
  );
});
