import { sumMoney, type Money } from "./money.js";
import type { CanonicalBalance } from "./types.js";

export type JournalState = "DRAFT" | "PREPARED" | "APPROVED" | "POSTED" | "VOIDED";
export type JournalType = "ADJUSTING" | "RECLASSIFICATION" | "CONSOLIDATION" | "ELIMINATION" | "DISCLOSURE_ONLY" | "PRIOR_PERIOD" | "AUDIT" | "CLIENT_POSTED";

export interface JournalLine {
  id: string;
  canonicalCode: string;
  debit: Money;
  credit: Money;
  dimensions?: Record<string, string>;
}

export interface Journal {
  id: string;
  type: JournalType;
  state: JournalState;
  description: string;
  preparedBy: string;
  approvedBy?: string;
  lines: JournalLine[];
}

export interface AdjustedCanonicalBalance extends CanonicalBalance {
  journalIds: string[];
}

const transitions: Record<JournalState, readonly JournalState[]> = {
  DRAFT: ["PREPARED", "VOIDED"],
  PREPARED: ["DRAFT", "APPROVED", "VOIDED"],
  APPROVED: ["POSTED", "VOIDED"],
  POSTED: ["VOIDED"],
  VOIDED: [],
};

export function assertJournalBalanced(journal: Journal): void {
  if (journal.lines.length < 2) throw new Error("JOURNAL_REQUIRES_TWO_LINES");
  if (!journal.description.trim()) throw new Error("JOURNAL_DESCRIPTION_REQUIRED");
  const ids = new Set<string>();
  for (const line of journal.lines) {
    if (!line.id || ids.has(line.id)) throw new Error("JOURNAL_LINE_ID_INVALID");
    ids.add(line.id);
    if (!line.canonicalCode.trim()) throw new Error("JOURNAL_CANONICAL_ACCOUNT_REQUIRED");
    if (line.debit < 0n || line.credit < 0n) throw new Error("JOURNAL_NEGATIVE_AMOUNT");
    if ((line.debit === 0n) === (line.credit === 0n)) throw new Error("JOURNAL_LINE_MUST_HAVE_ONE_SIDE");
  }
  const debit = sumMoney(journal.lines.map((line) => line.debit));
  const credit = sumMoney(journal.lines.map((line) => line.credit));
  if (debit !== credit) throw new Error(`JOURNAL_NOT_BALANCED: debit=${debit} credit=${credit}`);
}

export function transitionJournal(journal: Journal, next: JournalState, actorId: string): Journal {
  if (!transitions[journal.state].includes(next)) throw new Error(`JOURNAL_TRANSITION_NOT_ALLOWED:${journal.state}:${next}`);
  if (next === "APPROVED") {
    assertJournalBalanced(journal);
    if (actorId === journal.preparedBy) throw new Error("JOURNAL_SEGREGATION_OF_DUTIES");
    return { ...journal, state: next, approvedBy: actorId };
  }
  return { ...journal, state: next };
}

export function applyApprovedJournals(balances: CanonicalBalance[], journals: Journal[]): AdjustedCanonicalBalance[] {
  const result = new Map<string, AdjustedCanonicalBalance>(balances.map((balance) => [balance.canonicalCode, { ...balance, sourceAccountIds: [...balance.sourceAccountIds], journalIds: [] }]));
  for (const journal of journals) {
    if (journal.state !== "APPROVED" && journal.state !== "POSTED") continue;
    assertJournalBalanced(journal);
    for (const line of journal.lines) {
      const balance = result.get(line.canonicalCode) ?? { canonicalCode: line.canonicalCode, balance: 0n, sourceAccountIds: [], journalIds: [] };
      balance.balance += line.debit - line.credit;
      if (!balance.journalIds.includes(journal.id)) balance.journalIds.push(journal.id);
      result.set(line.canonicalCode, balance);
    }
  }
  return [...result.values()].sort((a, b) => a.canonicalCode.localeCompare(b.canonicalCode));
}
