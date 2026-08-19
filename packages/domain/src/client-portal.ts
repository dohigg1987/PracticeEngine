export type PortalActorKind = "STAFF" | "CLIENT";
export type DocumentRequestStatus = "OPEN" | "RESPONDED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface PortalActor {
  id: string;
  kind: PortalActorKind;
}

export interface DocumentRequestState {
  status: DocumentRequestStatus;
  responseVersion: number;
  responseContentHash?: string;
  respondedBy?: string;
  decidedBy?: string;
  decisionReason?: string;
}

function cleanHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("CLIENT_RESPONSE_HASH_INVALID");
  return normalized;
}

export function recordClientResponse(
  state: DocumentRequestState,
  actor: PortalActor,
  contentHash: string,
): DocumentRequestState {
  if (actor.kind !== "CLIENT") throw new Error("CLIENT_RESPONSE_ACTOR_REQUIRED");
  if (!actor.id.trim()) throw new Error("CLIENT_RESPONSE_ACTOR_REQUIRED");
  if (!(["OPEN", "REJECTED"] as DocumentRequestStatus[]).includes(state.status)) {
    throw new Error(`CLIENT_RESPONSE_NOT_ALLOWED:${state.status}`);
  }
  return {
    status: "RESPONDED",
    responseVersion: state.responseVersion + 1,
    responseContentHash: cleanHash(contentHash),
    respondedBy: actor.id,
  };
}

export function decideClientResponse(
  state: DocumentRequestState,
  actor: PortalActor,
  decision: "APPROVED" | "REJECTED",
  reason?: string,
): DocumentRequestState {
  if (state.status !== "RESPONDED" || !state.responseContentHash || !state.respondedBy) {
    throw new Error("CLIENT_RESPONSE_DECISION_NOT_ALLOWED");
  }
  if (actor.kind !== "STAFF" || !actor.id.trim()) throw new Error("CLIENT_DECISION_STAFF_REQUIRED");
  if (actor.id === state.respondedBy) throw new Error("CLIENT_RESPONSE_SEGREGATION_REQUIRED");
  const normalizedReason = reason?.trim();
  if (decision === "REJECTED" && !normalizedReason) throw new Error("CLIENT_REJECTION_REASON_REQUIRED");
  return {
    ...state,
    status: decision,
    decidedBy: actor.id,
    decisionReason: normalizedReason,
  };
}

export function cancelDocumentRequest(state: DocumentRequestState, actor: PortalActor): DocumentRequestState {
  if (actor.kind !== "STAFF" || !actor.id.trim()) throw new Error("CLIENT_REQUEST_CANCEL_STAFF_REQUIRED");
  if (!(["OPEN", "REJECTED"] as DocumentRequestStatus[]).includes(state.status)) {
    throw new Error(`CLIENT_REQUEST_CANCEL_NOT_ALLOWED:${state.status}`);
  }
  return { ...state, status: "CANCELLED", decidedBy: actor.id };
}
