import type { Money } from "./money.js";

export type ReconciliationStatus = "NOT_STARTED" | "IN_PROGRESS" | "RECONCILED" | "EXCEPTION" | "REVIEWED";

export interface Reconciliation {
  id: string;
  type: "BANK" | "DEBTORS" | "CREDITORS" | "VAT" | "PAYROLL" | "FIXED_ASSETS" | "LOANS" | "PENSIONS" | "INTERCOMPANY" | "FUNDS" | "OTHER";
  ledgerBalance: Money;
  supportingBalance: Money;
  tolerance: Money;
  status: ReconciliationStatus;
  preparedBy?: string;
  reviewedBy?: string;
}

export interface ReconciliationResult {
  difference: Money;
  withinTolerance: boolean;
  nextStatus: ReconciliationStatus;
}

export function evaluateReconciliation(reconciliation: Reconciliation): ReconciliationResult {
  if (reconciliation.tolerance < 0n) throw new Error("RECONCILIATION_TOLERANCE_NEGATIVE");
  const difference = reconciliation.ledgerBalance - reconciliation.supportingBalance;
  const absolute = difference < 0n ? -difference : difference;
  const withinTolerance = absolute <= reconciliation.tolerance;
  return { difference, withinTolerance, nextStatus: withinTolerance ? "RECONCILED" : "EXCEPTION" };
}

export function reviewReconciliation(reconciliation: Reconciliation, reviewerId: string): Reconciliation {
  if (reconciliation.status !== "RECONCILED") throw new Error("RECONCILIATION_NOT_READY_FOR_REVIEW");
  if (!reconciliation.preparedBy) throw new Error("RECONCILIATION_PREPARER_REQUIRED");
  if (reviewerId === reconciliation.preparedBy) throw new Error("RECONCILIATION_SEGREGATION_OF_DUTIES");
  return { ...reconciliation, status: "REVIEWED", reviewedBy: reviewerId };
}
