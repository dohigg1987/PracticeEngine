import type { Money } from "./money.js";

export interface SourceAccount { id: string; code: string; name: string; }
export interface TrialBalanceLine { sourceAccount: SourceAccount; debit: Money; credit: Money; dimensions?: Record<string, string>; }
export interface CanonicalAccount { code: string; name: string; reportLine: string; normalBalance: "DEBIT" | "CREDIT"; }
export interface AccountMapping { sourceAccountId: string; canonicalCode: string; }
export interface CanonicalBalance { canonicalCode: string; balance: Money; sourceAccountIds: string[]; }
export interface ReportLine { code: string; caption: string; balance: Money; canonicalCodes: string[]; sourceAccountIds: string[]; }
