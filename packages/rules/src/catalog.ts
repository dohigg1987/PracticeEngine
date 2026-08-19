import type { Scalar } from "./engine.js";

export type ComparisonOperator = "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE" | "IN" | "PRESENT";
export type Predicate =
  | { field: string; operator: ComparisonOperator; value?: Scalar | Scalar[] }
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export interface ComplianceRule {
  id: string;
  framework: string;
  sector?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceReference: string;
  priority: number;
  condition: Predicate;
  outcome: { type: "REQUIRE" | "RECOMMEND" | "PROHIBIT" | "WARN"; target: string; message: string };
}

export interface ComplianceResult {
  ruleId: string;
  target: string;
  type: ComplianceRule["outcome"]["type"];
  message: string;
  sourceReference: string;
  priority: number;
}

export interface ComplianceContext {
  framework: string;
  sector?: string;
  periodStart: string;
  facts: Record<string, Scalar | Scalar[]>;
}

function compare(actual: Scalar | Scalar[] | undefined, operator: ComparisonOperator, expected?: Scalar | Scalar[]): boolean {
  if (operator === "PRESENT") return actual !== undefined && actual !== null && actual !== "";
  if (operator === "IN") return Array.isArray(expected) && expected.includes(actual as Scalar);
  if (Array.isArray(actual) || Array.isArray(expected)) return operator === "EQ" && JSON.stringify(actual) === JSON.stringify(expected);
  switch (operator) {
    case "EQ": return actual === expected;
    case "NE": return actual !== expected;
    case "GT": return Number(actual) > Number(expected);
    case "GTE": return Number(actual) >= Number(expected);
    case "LT": return Number(actual) < Number(expected);
    case "LTE": return Number(actual) <= Number(expected);
  }
}

export function evaluatePredicate(predicate: Predicate, facts: ComplianceContext["facts"]): boolean {
  if ("all" in predicate) return predicate.all.every((item) => evaluatePredicate(item, facts));
  if ("any" in predicate) return predicate.any.some((item) => evaluatePredicate(item, facts));
  if ("not" in predicate) return !evaluatePredicate(predicate.not, facts);
  return compare(facts[predicate.field], predicate.operator, predicate.value);
}

export function evaluateCatalogue(rules: ComplianceRule[], context: ComplianceContext): ComplianceResult[] {
  const applicable = rules.filter((rule) => rule.framework === context.framework && (!rule.sector || rule.sector === context.sector) && rule.effectiveFrom <= context.periodStart && (!rule.effectiveTo || rule.effectiveTo >= context.periodStart) && evaluatePredicate(rule.condition, context.facts));
  const strongest = new Map<string, ComplianceResult>();
  for (const rule of applicable.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (!strongest.has(rule.outcome.target)) strongest.set(rule.outcome.target, {
      ruleId: rule.id,
      target: rule.outcome.target,
      type: rule.outcome.type,
      message: rule.outcome.message,
      sourceReference: rule.sourceReference,
      priority: rule.priority,
    });
  }
  return [...strongest.values()].sort((a, b) => a.target.localeCompare(b.target));
}
