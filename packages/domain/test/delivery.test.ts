import test from "node:test";
import assert from "node:assert/strict";
import { recordDeliveryFailure, recordDeliverySuccess, type DeliveryState } from "../src/delivery.js";

const pending = (): DeliveryState => ({
  status: "PENDING",
  attemptCount: 0,
  availableAt: "2026-08-18T10:00:00.000Z",
});

test("delivery failures use bounded exponential retry and dead-letter terminal state", () => {
  const policy = { maxAttempts: 3, baseDelaySeconds: 10, maximumDelaySeconds: 15 };
  const first = recordDeliveryFailure(pending(), "2026-08-18T10:00:00Z", "UPSTREAM_TIMEOUT", policy);
  assert.deepEqual(first, {
    status: "RETRY",
    attemptCount: 1,
    availableAt: "2026-08-18T10:00:10.000Z",
    lastErrorCode: "UPSTREAM_TIMEOUT",
  });
  const second = recordDeliveryFailure(first, "2026-08-18T10:00:10Z", "UPSTREAM_TIMEOUT", policy);
  assert.equal(second.availableAt, "2026-08-18T10:00:25.000Z");
  const dead = recordDeliveryFailure(second, "2026-08-18T10:00:25Z", "UPSTREAM_REJECTED", policy);
  assert.equal(dead.status, "DEAD_LETTER");
  assert.equal(dead.attemptCount, 3);
  assert.throws(() => recordDeliveryFailure(dead, "2026-08-18T10:01:00Z", "RETRY"), /DELIVERY_TERMINAL/);
});

test("successful delivery records an immutable terminal timestamp", () => {
  const delivered = recordDeliverySuccess(pending(), "2026-08-18T10:00:03Z");
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.deliveredAt, "2026-08-18T10:00:03.000Z");
  assert.throws(() => recordDeliverySuccess(delivered, "2026-08-18T10:00:04Z"), /DELIVERY_TERMINAL/);
});
