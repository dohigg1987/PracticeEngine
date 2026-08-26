export class OrchestrationError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}

export const STAGE_TYPES = new Set(["preparation", "client_input", "internal_review", "approval", "specialist_execution", "completion"]);
export const STAGE_STATUSES = new Set(["not_started", "active", "blocked", "waiting", "review", "completed", "skipped"]);
export const DEPENDENCY_TYPES = new Set(["finish_to_start", "start_to_start", "blocks"]);
export const REVIEW_STATUSES = new Set(["requested", "in_progress", "changes_requested", "approved", "rejected", "completed", "reopened"]);
export const REVIEW_POINT_STATUSES = new Set(["open", "addressed", "cleared", "reopened"]);
export const AUTOMATION_TRIGGERS = new Set(["work.created", "work.status_changed", "stage.completed", "task.completed", "deadline.approaching", "deadline.overdue", "review.requested", "review.approved", "recurring_work.generated", "specialist.event_received"]);
export const CONDITION_FIELDS = new Set(["serviceId", "workStatus", "stageType", "teamId", "assignedMemberId", "specialistModuleKey", "entitlement", "dueWithinDays", "clientLifecycleStatus"]);
export const CONDITION_OPERATORS = new Set(["equals", "not_equals", "in", "exists", "lte", "gte"]);
export const ACTION_TYPES = new Set(["assign_user", "assign_team", "update_status", "create_task", "create_review_point", "request_review", "emit_notification_request", "mark_blocked", "unblock"]);

const transitions: Record<string, ReadonlySet<string>> = {
  not_started: new Set(["active", "blocked", "waiting", "skipped"]),
  active: new Set(["blocked", "waiting", "review", "completed"]),
  blocked: new Set(["active", "waiting"]),
  waiting: new Set(["active", "blocked", "review"]),
  review: new Set(["active", "blocked", "completed"]),
  completed: new Set(), skipped: new Set(),
};
const reviewTransitions:Record<string,ReadonlySet<string>>={requested:new Set(["in_progress","changes_requested","rejected"]),in_progress:new Set(["changes_requested","approved","rejected"]),changes_requested:new Set(["reopened"]),approved:new Set(["completed","reopened"]),rejected:new Set(["reopened"]),reopened:new Set(["in_progress","changes_requested","rejected"]),completed:new Set()};
const reviewPointTransitions:Record<string,ReadonlySet<string>>={open:new Set(["addressed"]),addressed:new Set(["cleared","reopened"]),cleared:new Set(["reopened"]),reopened:new Set(["addressed"])};

export type StageGateContext = {
  mandatoryTasksIncomplete: number;
  approvalRequired: boolean;
  approvalRecorded: boolean;
  predecessorIncomplete: boolean;
  specialistCompletionRequired: boolean;
  specialistCompletionRecorded: boolean;
  manualReleaseRequired: boolean;
  manualReleaseGranted: boolean;
};

export function evaluateStageGates(criteria: Record<string, unknown>, context: StageGateContext): string[] {
  const failures: string[] = [];
  if (criteria.allMandatoryTasksComplete === true && context.mandatoryTasksIncomplete > 0) failures.push("mandatory_tasks_incomplete");
  if ((criteria.requiredApproval === true || context.approvalRequired) && !context.approvalRecorded) failures.push("approval_required");
  if (criteria.predecessorStageComplete === true && context.predecessorIncomplete) failures.push("predecessor_stage_incomplete");
  if ((criteria.specialistCompletion === true || context.specialistCompletionRequired) && !context.specialistCompletionRecorded) failures.push("specialist_completion_required");
  if ((criteria.manualRelease === true || context.manualReleaseRequired) && !context.manualReleaseGranted) failures.push("manual_release_required");
  return failures;
}

export function assertStageTransition(current: string, next: string, skippable: boolean, failures: string[]): void {
  if (!STAGE_STATUSES.has(next) || !transitions[current]?.has(next)) throw new OrchestrationError(409, "INVALID_STAGE_TRANSITION", `Cannot move workflow stage from ${current} to ${next}`);
  if (next === "skipped" && !skippable) throw new OrchestrationError(409, "STAGE_NOT_SKIPPABLE", "This workflow stage cannot be skipped");
  if (next === "completed" && failures.length) throw new OrchestrationError(409, "STAGE_GATES_NOT_MET", `Workflow stage gates are not met: ${failures.join(", ")}`);
}

export function assertReviewTransition(current:string,next:string):void{if(!REVIEW_STATUSES.has(next)||!reviewTransitions[current]?.has(next))throw new OrchestrationError(409,"INVALID_REVIEW_TRANSITION",`Cannot move operational review from ${current} to ${next}`);}
export function assertReviewPointTransition(current:string,next:string):void{if(!REVIEW_POINT_STATUSES.has(next)||!reviewPointTransitions[current]?.has(next))throw new OrchestrationError(409,"INVALID_REVIEW_POINT_TRANSITION",`Cannot move operational review point from ${current} to ${next}`);}

export type DependencyEdge = { predecessor: string; successor: string; resolved?: boolean };
export function wouldCreateDependencyCycle(edges: DependencyEdge[], predecessor: string, successor: string): boolean {
  if (predecessor === successor) return true;
  const graph = new Map<string, string[]>();
  for (const edge of edges) if (!edge.resolved) graph.set(edge.predecessor, [...(graph.get(edge.predecessor) ?? []), edge.successor]);
  graph.set(predecessor, [...(graph.get(predecessor) ?? []), successor]);
  const seen = new Set<string>(), stack = [successor];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === predecessor) return true;
    if (seen.has(current)) continue;
    seen.add(current); stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

export type AutomationCondition = { field: string; operator: string; value?: unknown };
export type AutomationAction = { type: string; [key: string]: unknown };

export function validateAutomationDefinition(trigger: unknown, conditions: unknown, actions: unknown): { conditions: AutomationCondition[]; actions: AutomationAction[] } {
  if (typeof trigger !== "string" || !AUTOMATION_TRIGGERS.has(trigger)) throw new OrchestrationError(400, "INVALID_AUTOMATION_TRIGGER", "Automation trigger is not supported");
  if (!Array.isArray(conditions) || conditions.length > 20) throw new OrchestrationError(400, "INVALID_AUTOMATION_CONDITIONS", "conditions must contain at most 20 structured conditions");
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 20) throw new OrchestrationError(400, "INVALID_AUTOMATION_ACTIONS", "actions must contain between 1 and 20 constrained actions");
  for (const condition of conditions) {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) throw new OrchestrationError(400, "INVALID_AUTOMATION_CONDITIONS", "Each condition must be an object");
    const item = condition as Record<string, unknown>;
    if (typeof item.field !== "string" || !CONDITION_FIELDS.has(item.field) || typeof item.operator !== "string" || !CONDITION_OPERATORS.has(item.operator)) throw new OrchestrationError(400, "INVALID_AUTOMATION_CONDITIONS", "Condition field or operator is not supported");
  }
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action) || typeof (action as Record<string, unknown>).type !== "string" || !ACTION_TYPES.has(String((action as Record<string, unknown>).type))) throw new OrchestrationError(400, "INVALID_AUTOMATION_ACTIONS", "Automation action is not supported");
  }
  return { conditions: conditions as AutomationCondition[], actions: actions as AutomationAction[] };
}

export function automationConditionsMatch(conditions: AutomationCondition[], facts: Record<string, unknown>): boolean {
  return conditions.every(({ field, operator, value }) => {
    const actual = facts[field];
    if (operator === "exists") return value === false ? actual === undefined || actual === null : actual !== undefined && actual !== null;
    if (operator === "equals") return actual === value;
    if (operator === "not_equals") return actual !== value;
    if (operator === "in") return Array.isArray(value) && value.includes(actual);
    if (operator === "lte") return typeof actual === "number" && typeof value === "number" && actual <= value;
    if (operator === "gte") return typeof actual === "number" && typeof value === "number" && actual >= value;
    return false;
  });
}

export function assertAutomationChain(ruleId: string, causationChain: unknown): string[] {
  if (!Array.isArray(causationChain) || causationChain.some((value) => typeof value !== "string")) throw new OrchestrationError(400, "INVALID_CAUSATION_CHAIN", "Automation causation chain is invalid");
  if (causationChain.length >= 8 || causationChain.includes(ruleId)) throw new OrchestrationError(409, "AUTOMATION_LOOP_PREVENTED", "Automation loop or maximum execution depth was prevented");
  return [...causationChain, ruleId];
}

export function boundedReplayRange(from: unknown, to: unknown, maxDays = 93): { from: string; to: string; days: number } {
  if (typeof from !== "string" || typeof to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new OrchestrationError(400, "INVALID_REPLAY_RANGE", "Replay requires ISO from and to dates");
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.floor((end - start) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > maxDays) throw new OrchestrationError(400, "REPLAY_RANGE_EXCEEDED", `Replay must cover between 1 and ${maxDays} days`);
  return { from, to, days };
}
