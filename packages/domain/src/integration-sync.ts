export type IntegrationProvider = "FILE_IMPORT" | "XERO" | "QUICKBOOKS" | "SAGE";
export type IntegrationAvailability = "AVAILABLE" | "CONFIGURATION_REQUIRED" | "UNAVAILABLE";
export type SyncRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";

export interface IntegrationConnection {
  provider: IntegrationProvider;
  availability: IntegrationAvailability;
  credentialReference?: string;
}

export interface SyncRunState {
  status: SyncRunStatus;
  idempotencyKey: string;
  recordsRead: number;
  recordsAccepted: number;
  recordsRejected: number;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new Error("SYNC_TIMESTAMP_INVALID");
  return parsed.toISOString();
}

export function validateIntegrationConnection(connection: IntegrationConnection): IntegrationConnection {
  if (connection.provider === "FILE_IMPORT") {
    if (connection.credentialReference) throw new Error("FILE_IMPORT_CREDENTIAL_FORBIDDEN");
    return { ...connection, availability: "AVAILABLE" };
  }
  if (connection.availability === "AVAILABLE") {
    const reference = connection.credentialReference?.trim();
    if (!reference || !/^(secret|oauth):\/\/[a-zA-Z0-9/_:.-]+$/.test(reference)) {
      throw new Error("CONNECTOR_CREDENTIAL_REFERENCE_REQUIRED");
    }
    if (/token|password|bearer/i.test(reference.split("://", 2)[1] ?? "")) {
      throw new Error("CONNECTOR_CREDENTIAL_REFERENCE_UNSAFE");
    }
    return { ...connection, credentialReference: reference };
  }
  if (connection.credentialReference) throw new Error("UNAVAILABLE_CONNECTOR_CREDENTIAL_FORBIDDEN");
  return connection;
}

export function startSyncRun(state: SyncRunState, occurredAt: string): SyncRunState {
  if (state.status !== "QUEUED") throw new Error(`SYNC_START_NOT_ALLOWED:${state.status}`);
  if (!state.idempotencyKey.trim()) throw new Error("SYNC_IDEMPOTENCY_KEY_REQUIRED");
  return { ...state, status: "RUNNING", startedAt: timestamp(occurredAt) };
}

export function finishSyncRun(
  state: SyncRunState,
  outcome: "SUCCEEDED" | "PARTIAL" | "FAILED",
  occurredAt: string,
  counts: { read: number; accepted: number; rejected: number },
  errorCode?: string,
): SyncRunState {
  if (state.status !== "RUNNING") throw new Error(`SYNC_FINISH_NOT_ALLOWED:${state.status}`);
  if (![counts.read, counts.accepted, counts.rejected].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error("SYNC_COUNTS_INVALID");
  }
  if (counts.accepted + counts.rejected !== counts.read) throw new Error("SYNC_COUNTS_INCOHERENT");
  if (outcome === "SUCCEEDED" && counts.rejected !== 0) throw new Error("SYNC_SUCCESS_REJECTIONS_FORBIDDEN");
  if (outcome === "PARTIAL" && (counts.accepted === 0 || counts.rejected === 0)) throw new Error("SYNC_PARTIAL_COUNTS_REQUIRED");
  const normalizedError = errorCode?.trim().slice(0, 120);
  if (outcome === "FAILED" && !normalizedError) throw new Error("SYNC_FAILURE_CODE_REQUIRED");
  return {
    ...state,
    status: outcome,
    recordsRead: counts.read,
    recordsAccepted: counts.accepted,
    recordsRejected: counts.rejected,
    completedAt: timestamp(occurredAt),
    errorCode: normalizedError,
  };
}
