import type { Dashboard } from "./api";

export function submissionStageState(
  filingAttempts?: Dashboard["filingAttempts"],
): "ready" | "attention" | "pending" {
  if (!filingAttempts?.total) return "pending";
  if ((filingAttempts.byStatus.ACCEPTED || 0) > 0) return "ready";
  return "attention";
}
