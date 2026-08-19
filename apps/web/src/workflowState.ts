import type { FilingAttempt, ReviewPoint } from "./api";

export function engagementResponseIsCurrent(
  requestedEngagementId: string,
  currentEngagementId: string,
): boolean {
  return requestedEngagementId === currentEngagementId;
}

export function submissionStageState(
  filingAttempts: FilingAttempt[] = [],
): "ready" | "attention" | "pending" {
  const latest = filingAttempts.reduce<FilingAttempt | undefined>(
    (candidate, attempt) => {
      if (!candidate) return attempt;
      const candidateTime = Date.parse(candidate.created_at);
      const attemptTime = Date.parse(attempt.created_at);
      if (Number.isFinite(attemptTime) && Number.isFinite(candidateTime)) {
        if (attemptTime !== candidateTime)
          return attemptTime > candidateTime ? attempt : candidate;
      } else if (Number.isFinite(attemptTime)) return attempt;
      else if (Number.isFinite(candidateTime)) return candidate;
      return attempt.attempt_no > candidate.attempt_no ? attempt : candidate;
    },
    undefined,
  );
  if (!latest) return "pending";
  return latest.status === "ACCEPTED" ? "ready" : "attention";
}

export function isOutstandingReviewPoint(
  item: Pick<ReviewPoint, "status">,
): boolean {
  return item.status !== "CLEARED";
}

export function blockingItemsLabel(value: number | undefined): string {
  return value === undefined ? "Not assessed" : `${value} blocking`;
}

export function blockingItemsMessage(value: number | undefined): string {
  if (value === undefined) return "Blocking items have not been assessed.";
  if (value === 0) return "No blocking items are currently reported.";
  return `${value} blocking items must be cleared before approval.`;
}

export function reportBalanceLabel(value: boolean | null): string {
  if (value === null) return "Not assessed";
  return value ? "Balanced" : "Review required";
}
