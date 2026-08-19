import type { CanonicalBalance, ReportLine } from "../../domain/src/types.js";
import { buildReport, type ReportLineDefinition } from "./report.js";

export type ReportingFramework = "FRS_101" | "FRS_102" | "FRS_102_1A" | "FRS_105";
export type SectorOverlay = "NONE" | "CHARITIES_SORP_2026" | "ACADEMIES_2026" | "LLP_SORP_2026";

export interface StatementDefinition {
  code: string;
  caption: string;
  lines: ReportLineDefinition[];
}

export interface FrameworkPack {
  id: string;
  framework: ReportingFramework;
  sector: SectorOverlay;
  effectiveFrom: string;
  effectiveTo?: string;
  statements: StatementDefinition[];
  requiredDisclosures: string[];
}

export interface BuiltStatement {
  code: string;
  caption: string;
  lines: ReportLine[];
}

export function selectFrameworkPack(packs: FrameworkPack[], framework: ReportingFramework, sector: SectorOverlay, periodStart: string): FrameworkPack {
  const eligible = packs.filter((pack) => pack.framework === framework && pack.sector === sector && pack.effectiveFrom <= periodStart && (!pack.effectiveTo || pack.effectiveTo >= periodStart));
  eligible.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (!eligible.length) throw new Error(`FRAMEWORK_PACK_NOT_FOUND:${framework}:${sector}:${periodStart}`);
  return eligible[0]!;
}

export function buildFrameworkStatements(balances: CanonicalBalance[], pack: FrameworkPack): BuiltStatement[] {
  return pack.statements.map((statement) => ({ code: statement.code, caption: statement.caption, lines: buildReport(balances, statement.lines) }));
}
