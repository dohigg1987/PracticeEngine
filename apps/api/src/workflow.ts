import { ApiError, requireObject, requiredString } from "./core.ts";

export const JOURNAL_TYPES = [
  "ADJUSTING",
  "RECLASSIFICATION",
  "CONSOLIDATION",
  "ELIMINATION",
  "DISCLOSURE_ONLY",
  "PRIOR_PERIOD",
  "AUDIT",
  "CLIENT_POSTED",
] as const;
export const JOURNAL_STATUSES = [
  "DRAFT",
  "PREPARED",
  "APPROVED",
  "POSTED",
  "VOIDED",
] as const;
export const RECONCILIATION_TYPES = [
  "BANK",
  "DEBTORS",
  "CREDITORS",
  "VAT",
  "PAYROLL",
  "FIXED_ASSETS",
  "LOANS",
  "PENSIONS",
  "INTERCOMPANY",
  "FUNDS",
  "OTHER",
] as const;
export const RECONCILIATION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "RECONCILED",
  "EXCEPTION",
  "REVIEWED",
] as const;
export const TASK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETE",
  "CANCELLED",
] as const;
export const REVIEW_POINT_STATUSES = [
  "OPEN",
  "RESPONDED",
  "CLEARED",
  "REOPENED",
] as const;
export const WORKING_PAPER_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PREPARED",
  "REVIEWED",
  "SUPERSEDED",
] as const;
export const WORKING_PAPER_CATEGORIES = [
  "ACCEPTANCE",
  "PLANNING",
  "RECORDS",
  "INCOME",
  "EXPENDITURE",
  "ASSETS",
  "LIABILITIES",
  "FUNDS",
  "REPORTING",
  "COMPLETION",
] as const;
export const DISCLOSURE_APPLICABILITY = [
  "UNASSESSED",
  "REQUIRED",
  "RECOMMENDED",
  "NOT_APPLICABLE",
  "PROHIBITED",
] as const;
export const DISCLOSURE_STATUSES = [
  "OPEN",
  "COMPLETE",
  "REVIEWED",
  "SUPERSEDED",
] as const;
export const ACCOUNTS_VERSION_STATUSES = [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
  "FINAL",
  "FILED",
  "SUPERSEDED",
] as const;
export const SIGNOFF_TYPES = [
  "PREPARED",
  "REVIEWED",
  "CLIENT_APPROVED",
  "PARTNER_APPROVED",
  "FILING_AUTHORISED",
] as const;
export const FILING_REGULATORS = [
  "COMPANIES_HOUSE",
  "HMRC",
  "CCEW",
  "OSCR",
  "CCNI",
  "DFE",
] as const;
export const FILING_STATUSES = [
  "PREPARED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "FAILED",
  "WITHDRAWN",
] as const;
export type JournalStatus =
  | "DRAFT"
  | "PREPARED"
  | "APPROVED"
  | "POSTED"
  | "VOIDED";
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ReviewPointStatus = (typeof REVIEW_POINT_STATUSES)[number];
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];
export type WorkingPaperStatus = (typeof WORKING_PAPER_STATUSES)[number];
export type DisclosureStatus = (typeof DISCLOSURE_STATUSES)[number];
export type AccountsVersionStatus = (typeof ACCOUNTS_VERSION_STATUSES)[number];
export type SignoffType = (typeof SIGNOFF_TYPES)[number];
export type FilingStatus = (typeof FILING_STATUSES)[number];

const journalTransitions: Record<JournalStatus, readonly JournalStatus[]> = {
  DRAFT: ["PREPARED", "VOIDED"],
  PREPARED: ["APPROVED", "DRAFT", "VOIDED"],
  APPROVED: ["POSTED", "VOIDED"],
  POSTED: [],
  VOIDED: [],
};
const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  OPEN: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "COMPLETE", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETE: [],
  CANCELLED: [],
};
const reviewPointTransitions: Record<
  ReviewPointStatus,
  readonly ReviewPointStatus[]
> = {
  OPEN: ["RESPONDED"],
  RESPONDED: ["CLEARED", "REOPENED"],
  CLEARED: ["REOPENED"],
  REOPENED: ["RESPONDED"],
};
const reconciliationTransitions: Record<
  ReconciliationStatus,
  readonly ReconciliationStatus[]
> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RECONCILED", "EXCEPTION"],
  RECONCILED: ["IN_PROGRESS", "REVIEWED"],
  EXCEPTION: ["IN_PROGRESS", "RECONCILED"],
  REVIEWED: [],
};
const workingPaperTransitions: Record<
  WorkingPaperStatus,
  readonly WorkingPaperStatus[]
> = {
  NOT_STARTED: ["IN_PROGRESS", "SUPERSEDED"],
  IN_PROGRESS: ["PREPARED", "SUPERSEDED"],
  PREPARED: ["IN_PROGRESS", "REVIEWED", "SUPERSEDED"],
  REVIEWED: ["IN_PROGRESS", "SUPERSEDED"],
  SUPERSEDED: [],
};
const disclosureTransitions: Record<
  DisclosureStatus,
  readonly DisclosureStatus[]
> = {
  OPEN: ["COMPLETE", "SUPERSEDED"],
  COMPLETE: ["OPEN", "REVIEWED", "SUPERSEDED"],
  REVIEWED: ["OPEN", "SUPERSEDED"],
  SUPERSEDED: [],
};
const accountsVersionTransitions: Record<
  AccountsVersionStatus,
  readonly AccountsVersionStatus[]
> = {
  DRAFT: ["REVIEWED", "SUPERSEDED"],
  REVIEWED: ["APPROVED", "DRAFT", "SUPERSEDED"],
  APPROVED: ["FINAL", "SUPERSEDED"],
  FINAL: ["FILED", "SUPERSEDED"],
  FILED: [],
  SUPERSEDED: [],
};
const filingTransitions: Record<FilingStatus, readonly FilingStatus[]> = {
  PREPARED: ["SUBMITTED", "FAILED", "WITHDRAWN"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "FAILED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  FAILED: [],
  WITHDRAWN: [],
};

export function enumValue<const T extends readonly string[]>(
  body: Record<string, unknown>,
  field: string,
  values: T,
  fallback?: T[number],
): T[number] {
  const raw = body[field] ?? fallback;
  if (typeof raw !== "string" || !values.includes(raw as T[number]))
    throw new ApiError(400, "INVALID_REQUEST", `${field} is invalid`);
  return raw as T[number];
}
export function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string")
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be a string or null`,
    );
  return raw.trim() || null;
}
export function optionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean")
    throw new ApiError(400, "INVALID_REQUEST", `${field} must be a boolean`);
  return raw;
}
export function money(
  body: Record<string, unknown>,
  field: string,
  fallback?: string,
): string {
  const raw = body[field] ?? fallback;
  if (typeof raw !== "string" && typeof raw !== "number")
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be a monetary value`,
    );
  const text = String(raw);
  const match = /^-?(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must have at most two decimal places`,
    );
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return `${negative ? "-" : ""}${whole}.${(fraction + "00").slice(0, 2)}`;
}
export function assertTransition<T extends string>(
  current: T,
  next: T,
  transitions: Record<T, readonly T[]>,
  object: string,
): void {
  if (!transitions[current]?.includes(next))
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      `${object} cannot transition from ${current} to ${next}`,
    );
}
export function assertJournalTransition(
  current: JournalStatus,
  next: JournalStatus,
  actorId: string,
  preparedBy: string,
  balanced: boolean,
): void {
  assertTransition(current, next, journalTransitions, "Journal");
  if (["PREPARED", "APPROVED", "POSTED"].includes(next) && !balanced)
    throw new ApiError(
      409,
      "JOURNAL_NOT_BALANCED",
      "Journal debits and credits must balance",
    );
  if (next === "PREPARED" && actorId !== preparedBy)
    throw new ApiError(
      403,
      "SEGREGATION_REQUIRED",
      "Only the journal preparer can mark it prepared",
    );
  if (next === "APPROVED" && actorId === preparedBy)
    throw new ApiError(
      409,
      "SEGREGATION_REQUIRED",
      "Journal approver must differ from preparer",
    );
}
export function assertTaskTransition(
  current: TaskStatus,
  next: TaskStatus,
): void {
  assertTransition(current, next, taskTransitions, "Task");
}
export function assertReconciliationTransition(
  current: ReconciliationStatus,
  next: ReconciliationStatus,
): void {
  assertTransition(current, next, reconciliationTransitions, "Reconciliation");
}
export function assertReviewPointTransition(
  current: ReviewPointStatus,
  next: ReviewPointStatus,
  response: string | null,
  actorId: string,
  raisedBy: string,
): void {
  assertTransition(current, next, reviewPointTransitions, "Review point");
  if (next === "RESPONDED" && !response)
    throw new ApiError(400, "RESPONSE_REQUIRED", "A response is required");
  if (next === "CLEARED" && actorId === raisedBy)
    throw new ApiError(
      409,
      "SEGREGATION_REQUIRED",
      "Review point clearer must differ from raiser",
    );
}
export function assertWorkingPaperTransition(
  current: WorkingPaperStatus,
  next: WorkingPaperStatus,
  actorId: string,
  preparedBy: string | null,
): void {
  assertTransition(current, next, workingPaperTransitions, "Working paper");
  if (next === "REVIEWED" && (!preparedBy || preparedBy === actorId))
    throw new ApiError(
      409,
      "SEGREGATION_REQUIRED",
      "Working-paper reviewer must differ from preparer",
    );
}
export function assertDisclosureTransition(
  current: DisclosureStatus,
  next: DisclosureStatus,
): void {
  assertTransition(current, next, disclosureTransitions, "Disclosure");
}
export function assertAccountsVersionTransition(
  current: AccountsVersionStatus,
  next: AccountsVersionStatus,
): void {
  assertTransition(
    current,
    next,
    accountsVersionTransitions,
    "Accounts version",
  );
}
export function assertFilingTransition(
  current: FilingStatus,
  next: FilingStatus,
): void {
  assertTransition(current, next, filingTransitions, "Filing attempt");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new ApiError(400, "INVALID_REQUEST", "JSON values must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new ApiError(400, "INVALID_REQUEST", "Value is not valid JSON");
}

export interface JournalLineInput {
  canonicalAccountId: string;
  debit: string;
  credit: string;
  dimensions: Record<string, unknown>;
  narrative: string | null;
}
export function journalLines(body: Record<string, unknown>): {
  lines: JournalLineInput[];
  balanced: boolean;
} {
  if (
    !Array.isArray(body.lines) ||
    body.lines.length < 2 ||
    body.lines.length > 500
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "lines must contain between 2 and 500 entries",
    );
  let debits = 0n,
    credits = 0n;
  const lines = body.lines.map((raw): JournalLineInput => {
    const line = requireObject(raw);
    const debit = money(line, "debit", "0");
    const credit = money(line, "credit", "0");
    const d = BigInt(debit.replace(".", "")),
      c = BigInt(credit.replace(".", ""));
    if (d > 0n === c > 0n)
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Each journal line must contain exactly one positive debit or credit",
      );
    debits += d;
    credits += c;
    const dimensions =
      line.dimensions === undefined ? {} : requireObject(line.dimensions);
    return {
      canonicalAccountId: requiredString(line, "canonicalAccountId"),
      debit,
      credit,
      dimensions,
      narrative: optionalString(line, "narrative") ?? null,
    };
  });
  return { lines, balanced: debits === credits };
}
