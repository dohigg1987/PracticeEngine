import { sumMoney, type Money } from "./money.js";
import type { AccountMapping, CanonicalAccount, CanonicalBalance, TrialBalanceLine } from "./types.js";

export function signedBalance(line: TrialBalanceLine): Money { return line.debit - line.credit; }
export function assertBalanced(lines: TrialBalanceLine[]): void {
  const debit = sumMoney(lines.map((line) => line.debit));
  const credit = sumMoney(lines.map((line) => line.credit));
  if (debit !== credit) throw new Error(`TB_NOT_BALANCED: debit=${debit} credit=${credit} difference=${debit-credit}`);
}
export function mapTrialBalance(lines: TrialBalanceLine[], mappings: AccountMapping[], canonicalAccounts: CanonicalAccount[]): CanonicalBalance[] {
  assertBalanced(lines);
  const mappingBySource = new Map(mappings.map((mapping) => [mapping.sourceAccountId, mapping.canonicalCode]));
  const canonicalByCode = new Map(canonicalAccounts.map((account) => [account.code, account]));
  const result = new Map<string, CanonicalBalance>();
  for (const line of lines) {
    const canonicalCode = mappingBySource.get(line.sourceAccount.id);
    if (!canonicalCode) throw new Error(`UNMAPPED_ACCOUNT:${line.sourceAccount.id}`);
    if (!canonicalByCode.has(canonicalCode)) throw new Error(`UNKNOWN_CANONICAL_ACCOUNT:${canonicalCode}`);
    const existing = result.get(canonicalCode) ?? { canonicalCode, balance: 0n, sourceAccountIds: [] };
    existing.balance += signedBalance(line);
    if (!existing.sourceAccountIds.includes(line.sourceAccount.id)) existing.sourceAccountIds.push(line.sourceAccount.id);
    result.set(canonicalCode, existing);
  }
  return [...result.values()].sort((a,b) => a.canonicalCode.localeCompare(b.canonicalCode));
}
