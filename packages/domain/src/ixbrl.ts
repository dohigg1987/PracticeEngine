import type { ManifestDependency } from "./accounts-version.js";

export interface IxbrlContext {
  id: string;
  entityIdentifier: string;
  periodStart?: string;
  periodEnd: string;
  instant?: boolean;
  dimensions?: Record<string, string>;
}

export interface IxbrlFact {
  id: string;
  concept: string;
  contextId: string;
  value: string;
  unit?: string;
  decimals?: number;
  nil?: boolean;
  provenance: ManifestDependency[];
}

export interface IxbrlValidationIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  factId?: string;
  message: string;
}

export function validateIxbrlModel(contexts: IxbrlContext[], facts: IxbrlFact[]): IxbrlValidationIssue[] {
  const issues: IxbrlValidationIssue[] = [];
  const contextIds = new Set<string>();
  for (const context of contexts) {
    if (!context.id || contextIds.has(context.id)) issues.push({ code: "IXBRL_CONTEXT_ID", severity: "ERROR", message: `Context ID is missing or duplicated: ${context.id}` });
    contextIds.add(context.id);
    if (context.instant && context.periodStart) issues.push({ code: "IXBRL_CONTEXT_PERIOD", severity: "ERROR", message: `Instant context ${context.id} must not have a period start.` });
    if (!context.instant && !context.periodStart) issues.push({ code: "IXBRL_CONTEXT_PERIOD", severity: "ERROR", message: `Duration context ${context.id} requires a period start.` });
  }
  const factIds = new Set<string>();
  for (const fact of facts) {
    if (!fact.id || factIds.has(fact.id)) issues.push({ code: "IXBRL_FACT_ID", severity: "ERROR", factId: fact.id, message: "Fact ID is missing or duplicated." });
    factIds.add(fact.id);
    if (!contextIds.has(fact.contextId)) issues.push({ code: "IXBRL_CONTEXT_MISSING", severity: "ERROR", factId: fact.id, message: `Unknown context ${fact.contextId}.` });
    if (!fact.concept.includes(":")) issues.push({ code: "IXBRL_CONCEPT_INVALID", severity: "ERROR", factId: fact.id, message: "Concept must be namespace-qualified." });
    if (!fact.provenance.length) issues.push({ code: "IXBRL_PROVENANCE_MISSING", severity: "ERROR", factId: fact.id, message: "Every fact must retain source provenance." });
    if (fact.nil && fact.value !== "") issues.push({ code: "IXBRL_NIL_VALUE", severity: "ERROR", factId: fact.id, message: "A nil fact cannot contain a value." });
  }
  return issues;
}
