export type DeliveryStatus = "PENDING" | "DELIVERED" | "RETRY" | "DEAD_LETTER";

export interface DeliveryState {
  status: DeliveryStatus;
  attemptCount: number;
  availableAt: string;
  deliveredAt?: string;
  lastErrorCode?: string;
}

export interface DeliveryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  maximumDelaySeconds: number;
}

export const defaultDeliveryPolicy: DeliveryPolicy = {
  maxAttempts: 8,
  baseDelaySeconds: 30,
  maximumDelaySeconds: 3_600,
};

function checkedDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error("DELIVERY_TIMESTAMP_INVALID");
  return date;
}

function validatePolicy(policy: DeliveryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) throw new Error("DELIVERY_MAX_ATTEMPTS_INVALID");
  if (!Number.isInteger(policy.baseDelaySeconds) || policy.baseDelaySeconds < 1) throw new Error("DELIVERY_BASE_DELAY_INVALID");
  if (!Number.isInteger(policy.maximumDelaySeconds) || policy.maximumDelaySeconds < policy.baseDelaySeconds) {
    throw new Error("DELIVERY_MAXIMUM_DELAY_INVALID");
  }
}

export function recordDeliverySuccess(state: DeliveryState, occurredAt: string): DeliveryState {
  if (state.status === "DELIVERED" || state.status === "DEAD_LETTER") {
    throw new Error(`DELIVERY_TERMINAL:${state.status}`);
  }
  return {
    status: "DELIVERED",
    attemptCount: state.attemptCount + 1,
    availableAt: state.availableAt,
    deliveredAt: checkedDate(occurredAt).toISOString(),
  };
}

export function recordDeliveryFailure(
  state: DeliveryState,
  occurredAt: string,
  errorCode: string,
  policy: DeliveryPolicy = defaultDeliveryPolicy,
): DeliveryState {
  validatePolicy(policy);
  if (state.status === "DELIVERED" || state.status === "DEAD_LETTER") {
    throw new Error(`DELIVERY_TERMINAL:${state.status}`);
  }
  const normalizedError = errorCode.trim().slice(0, 120);
  if (!normalizedError) throw new Error("DELIVERY_ERROR_CODE_REQUIRED");
  const attemptCount = state.attemptCount + 1;
  if (attemptCount >= policy.maxAttempts) {
    return {
      status: "DEAD_LETTER",
      attemptCount,
      availableAt: state.availableAt,
      lastErrorCode: normalizedError,
    };
  }
  const delaySeconds = Math.min(
    policy.maximumDelaySeconds,
    policy.baseDelaySeconds * 2 ** Math.max(0, attemptCount - 1),
  );
  const nextAttempt = checkedDate(occurredAt);
  nextAttempt.setUTCSeconds(nextAttempt.getUTCSeconds() + delaySeconds);
  return {
    status: "RETRY",
    attemptCount,
    availableAt: nextAttempt.toISOString(),
    lastErrorCode: normalizedError,
  };
}
