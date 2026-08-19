export type WorkspaceStatus = "ACTIVE" | "SUSPENDED" | "CLOSURE_REQUESTED" | "CLOSED";
export type ExportStatus = "REQUESTED" | "GENERATING" | "READY" | "FAILED" | "EXPIRED";

export interface WorkspaceLifecycleState {
  status: WorkspaceStatus;
  reason?: string;
}

export interface WorkspaceExportState {
  status: ExportStatus;
  requestedBy: string;
  contentHash?: string;
  byteSize?: number;
  expiresAt?: string;
  errorCode?: string;
}

export function transitionWorkspace(
  state: WorkspaceLifecycleState,
  next: WorkspaceStatus,
  reason?: string,
): WorkspaceLifecycleState {
  const allowed: Record<WorkspaceStatus, readonly WorkspaceStatus[]> = {
    ACTIVE: ["SUSPENDED", "CLOSURE_REQUESTED"],
    SUSPENDED: ["ACTIVE", "CLOSURE_REQUESTED"],
    CLOSURE_REQUESTED: ["ACTIVE", "CLOSED"],
    CLOSED: [],
  };
  if (!allowed[state.status].includes(next)) throw new Error(`WORKSPACE_TRANSITION_NOT_ALLOWED:${state.status}:${next}`);
  const normalized = reason?.trim();
  if ((next === "SUSPENDED" || next === "CLOSURE_REQUESTED" || next === "CLOSED") && !normalized) {
    throw new Error("WORKSPACE_TRANSITION_REASON_REQUIRED");
  }
  return { status: next, reason: normalized };
}

export function transitionWorkspaceExport(
  state: WorkspaceExportState,
  next: ExportStatus,
  detail: { contentHash?: string; byteSize?: number; expiresAt?: string; errorCode?: string } = {},
): WorkspaceExportState {
  const allowed: Record<ExportStatus, readonly ExportStatus[]> = {
    REQUESTED: ["GENERATING", "FAILED"],
    GENERATING: ["READY", "FAILED"],
    READY: ["EXPIRED"],
    FAILED: [],
    EXPIRED: [],
  };
  if (!allowed[state.status].includes(next)) throw new Error(`WORKSPACE_EXPORT_TRANSITION_NOT_ALLOWED:${state.status}:${next}`);
  if (next === "READY") {
    if (!/^[a-f0-9]{64}$/.test(detail.contentHash ?? "")) throw new Error("WORKSPACE_EXPORT_HASH_REQUIRED");
    if (!Number.isInteger(detail.byteSize) || detail.byteSize! < 1) throw new Error("WORKSPACE_EXPORT_SIZE_REQUIRED");
    const expiry = new Date(detail.expiresAt ?? "");
    if (!Number.isFinite(expiry.valueOf())) throw new Error("WORKSPACE_EXPORT_EXPIRY_REQUIRED");
    return {
      ...state,
      status: "READY",
      contentHash: detail.contentHash,
      byteSize: detail.byteSize,
      expiresAt: expiry.toISOString(),
      errorCode: undefined,
    };
  }
  if (next === "FAILED") {
    const errorCode = detail.errorCode?.trim().slice(0, 120);
    if (!errorCode) throw new Error("WORKSPACE_EXPORT_FAILURE_CODE_REQUIRED");
    return { ...state, status: "FAILED", errorCode };
  }
  return { ...state, status: next };
}
