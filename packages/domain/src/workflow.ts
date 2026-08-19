export type EngagementStatus = "NOT_STARTED" | "IN_PROGRESS" | "PREPARED" | "READY_FOR_REVIEW" | "IN_REVIEW" | "CHANGES_REQUIRED" | "REVIEWED" | "CLIENT_APPROVAL" | "FINAL_APPROVAL" | "READY_TO_FILE" | "FILED" | "CLOSED";
export type WorkflowRole = "PREPARER" | "REVIEWER" | "MANAGER" | "PARTNER" | "FILER";

export interface CompletionState {
  mappingComplete: boolean;
  blockingReconciliations: number;
  blockingReviewPoints: number;
  disclosuresComplete: boolean;
  accountsVersionFrozen: boolean;
  ixbrlBlockingErrors: number;
  clientApproved: boolean;
}

const allowed: Record<EngagementStatus, readonly EngagementStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["PREPARED"],
  PREPARED: ["IN_PROGRESS", "READY_FOR_REVIEW"],
  READY_FOR_REVIEW: ["IN_REVIEW"],
  IN_REVIEW: ["CHANGES_REQUIRED", "REVIEWED"],
  CHANGES_REQUIRED: ["IN_PROGRESS", "READY_FOR_REVIEW"],
  REVIEWED: ["CHANGES_REQUIRED", "CLIENT_APPROVAL", "FINAL_APPROVAL"],
  CLIENT_APPROVAL: ["CHANGES_REQUIRED", "FINAL_APPROVAL"],
  FINAL_APPROVAL: ["CHANGES_REQUIRED", "READY_TO_FILE"],
  READY_TO_FILE: ["CHANGES_REQUIRED", "FILED"],
  FILED: ["CLOSED"],
  CLOSED: [],
};

const roleTransitions: Partial<Record<EngagementStatus, readonly WorkflowRole[]>> = {
  PREPARED: ["PREPARER", "MANAGER"],
  READY_FOR_REVIEW: ["PREPARER", "MANAGER"],
  IN_REVIEW: ["REVIEWER", "MANAGER", "PARTNER"],
  CHANGES_REQUIRED: ["REVIEWER", "MANAGER", "PARTNER"],
  REVIEWED: ["REVIEWER", "MANAGER", "PARTNER"],
  CLIENT_APPROVAL: ["MANAGER", "PARTNER"],
  FINAL_APPROVAL: ["PARTNER"],
  READY_TO_FILE: ["PARTNER", "FILER"],
  FILED: ["FILER"],
  CLOSED: ["MANAGER", "PARTNER"],
};

function assertEntryConditions(next: EngagementStatus, state: CompletionState): void {
  if ((next === "READY_FOR_REVIEW" || next === "IN_REVIEW") && (!state.mappingComplete || state.blockingReconciliations > 0 || !state.disclosuresComplete)) throw new Error("ENGAGEMENT_NOT_READY_FOR_REVIEW");
  if (next === "REVIEWED" && state.blockingReviewPoints > 0) throw new Error("BLOCKING_REVIEW_POINTS_REMAIN");
  if ((next === "FINAL_APPROVAL" || next === "READY_TO_FILE") && (!state.accountsVersionFrozen || state.blockingReviewPoints > 0 || state.ixbrlBlockingErrors > 0)) throw new Error("ACCOUNTS_NOT_READY_FOR_APPROVAL");
  if (next === "FINAL_APPROVAL" && !state.clientApproved) throw new Error("CLIENT_APPROVAL_REQUIRED");
}

export function transitionEngagement(current: EngagementStatus, next: EngagementStatus, role: WorkflowRole, state: CompletionState): EngagementStatus {
  if (!allowed[current].includes(next)) throw new Error(`ENGAGEMENT_TRANSITION_NOT_ALLOWED:${current}:${next}`);
  const roles = roleTransitions[next];
  if (roles && !roles.includes(role)) throw new Error(`ENGAGEMENT_ROLE_NOT_ALLOWED:${role}:${next}`);
  assertEntryConditions(next, state);
  return next;
}

export type CarryForwardPolicy = "UNCHANGED" | "CONFIRM" | "RESET" | "NEVER";
export interface RollForwardItem<T> { key: string; value: T; policy: CarryForwardPolicy; }
export interface RolledForwardItem<T> { key: string; value: T | null; requiresConfirmation: boolean; }

export function rollForward<T>(items: RollForwardItem<T>[]): RolledForwardItem<T>[] {
  return items.filter((item) => item.policy !== "NEVER").map((item) => ({
    key: item.key,
    value: item.policy === "RESET" ? null : item.value,
    requiresConfirmation: item.policy === "CONFIRM",
  }));
}
