import type {
  AccountsVersion,
  Journal,
  Reconciliation,
  TrialBalanceLine,
  WorkflowTask,
} from "./api";

export type WorkflowStageState = "ready" | "attention" | "pending";

const terminalJournalStatuses = new Set<Journal["status"]>([
  "POSTED",
  "VOIDED",
]);
const terminalReconciliationStatuses = new Set<Reconciliation["status"]>([
  "RECONCILED",
  "REVIEWED",
]);
const terminalTaskStatuses = new Set<WorkflowTask["status"]>([
  "COMPLETE",
  "CANCELLED",
]);
const approvedAccountsVersionStatuses = new Set<AccountsVersion["status"]>([
  "APPROVED",
  "FINAL",
  "FILED",
]);

export function isMappedTrialBalanceLine(
  line: Pick<TrialBalanceLine, "canonical_account_id">,
): boolean {
  return Boolean(line.canonical_account_id);
}

export function mappingPopulation(lines: TrialBalanceLine[]): {
  mapped: number;
  unmapped: number;
} {
  const mapped = lines.filter(isMappedTrialBalanceLine).length;
  return { mapped, unmapped: lines.length - mapped };
}

export function isOutstandingReconciliation(
  reconciliation: Pick<Reconciliation, "status">,
): boolean {
  return !terminalReconciliationStatuses.has(reconciliation.status);
}

export function isOpenWorkflowTask(
  task: Pick<WorkflowTask, "status">,
): boolean {
  return !terminalTaskStatuses.has(task.status);
}

export function taskProgress(tasks: WorkflowTask[]): {
  completedTasks: number;
  totalTasks: number;
  openTasks: number;
  percent: number;
} {
  const activeTasks = tasks.filter((task) => task.status !== "CANCELLED");
  const completedTasks = activeTasks.filter(
    (task) => task.status === "COMPLETE",
  ).length;
  const totalTasks = activeTasks.length;
  return {
    completedTasks,
    totalTasks,
    openTasks: totalTasks - completedTasks,
    percent: totalTasks ? Math.round((completedTasks * 100) / totalTasks) : 0,
  };
}

export function adjustmentsStageState(
  journals: Journal[],
  reconciliations: Reconciliation[],
): WorkflowStageState {
  if (!journals.length && !reconciliations.length) return "pending";
  if (
    journals.some((journal) => !terminalJournalStatuses.has(journal.status)) ||
    reconciliations.some(isOutstandingReconciliation)
  )
    return "attention";
  return "ready";
}

export function reviewApprovalStageState(
  hasOutstandingReviewPoints: boolean,
  accountsVersions: AccountsVersion[],
): WorkflowStageState {
  if (hasOutstandingReviewPoints) return "attention";
  if (!accountsVersions.length) return "pending";
  const latest = accountsVersions.reduce((candidate, version) =>
    version.version > candidate.version ? version : candidate,
  );
  return approvedAccountsVersionStatuses.has(latest.status)
    ? "ready"
    : "attention";
}
