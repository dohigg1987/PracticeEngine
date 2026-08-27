export type RecurrenceFrequency = "weekly" | "monthly" | "quarterly" | "annually" | "month_day" | "period_end_relative";
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  dayOfMonth?: number;
  month?: number;
  day?: number;
  offsetDays?: number;
}
export interface Occurrence { occurrenceDate: string; periodStart: string; periodEnd: string }
export interface DeadlineRule { type: "days_after_period_end" | "days_before_date" | "fixed_calendar_day" | "months_after_period_end" | "months_plus_days" | "explicit_date" | "configurable"; days?: number; months?: number; day?: number; date?: string; baseDate?: string }
export interface DeadlineResult { date: string; provenance: { rule: DeadlineRule; inputs: Record<string, string>; calculatedAt: string } }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function date(value: string): Date {
  if (!ISO.test(value)) throw new Error(`Invalid ISO date: ${value}`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.valueOf()) || result.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ISO date: ${value}`);
  return result;
}
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function databaseDate(value: unknown): string {
  if (value instanceof Date) return iso(value);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}
export function addDays(value: string, days: number): string { const result = date(value); result.setUTCDate(result.getUTCDate() + days); return iso(result); }
export function addMonths(value: string, months: number, preferredDay?: number): string {
  const source = date(value), day = preferredDay ?? source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last)); return iso(result);
}
export function dateInTimeZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("Could not resolve tenant-local date");
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateRecurrenceRule(rule: RecurrenceRule): RecurrenceRule {
  if (!["weekly","monthly","quarterly","annually","month_day","period_end_relative"].includes(rule.frequency)) throw new Error("Unsupported recurrence frequency");
  if (rule.interval !== undefined && (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 120)) throw new Error("Recurrence interval must be 1-120");
  if (rule.dayOfMonth !== undefined && (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31)) throw new Error("dayOfMonth must be 1-31");
  if (rule.frequency === "month_day" && (!Number.isInteger(rule.month) || rule.month! < 1 || rule.month! > 12 || !Number.isInteger(rule.day) || rule.day! < 1 || rule.day! > 31)) throw new Error("month_day requires month and day");
  if (rule.offsetDays !== undefined && (!Number.isInteger(rule.offsetDays) || Math.abs(rule.offsetDays) > 366)) throw new Error("offsetDays is out of range");
  return rule;
}

export function evaluateRecurrence(ruleInput: RecurrenceRule, effectiveFrom: string, throughDate: string, effectiveTo?: string | null, maxOccurrences = 120): Occurrence[] {
  const rule = validateRecurrenceRule(ruleInput), boundary = effectiveTo && effectiveTo < throughDate ? effectiveTo : throughDate;
  date(effectiveFrom); date(boundary);
  const results: Occurrence[] = [], interval = rule.interval ?? 1;
  let cursor = effectiveFrom;
  for (let guard = 0; guard < 2400 && results.length < maxOccurrences; guard++) {
    let occurrence = cursor, periodMonths = 0, periodDays = 0;
    if (rule.frequency === "weekly") periodDays = 7 * interval;
    else if (rule.frequency === "monthly") periodMonths = interval;
    else if (rule.frequency === "quarterly") periodMonths = 3 * interval;
    else if (rule.frequency === "annually" || rule.frequency === "month_day") periodMonths = 12 * interval;
    else periodMonths = interval;
    if (rule.frequency === "month_day") {
      const year = date(cursor).getUTCFullYear(), monthStart = `${year}-${String(rule.month).padStart(2,"0")}-01`;
      occurrence = addMonths(monthStart, 0, rule.day);
      if (occurrence < cursor) occurrence = addMonths(occurrence, 12 * interval, rule.day);
    } else if (rule.dayOfMonth) occurrence = addMonths(cursor.slice(0, 8) + "01", 0, rule.dayOfMonth);
    if (rule.frequency === "period_end_relative") occurrence = addDays(occurrence, rule.offsetDays ?? 0);
    const periodStart = cursor;
    const next = periodDays ? addDays(cursor, periodDays) : addMonths(cursor, periodMonths, date(effectiveFrom).getUTCDate());
    const periodEnd = addDays(next, -1);
    if (occurrence >= effectiveFrom && occurrence <= boundary) results.push({ occurrenceDate: occurrence, periodStart, periodEnd });
    cursor = next;
    if (cursor > boundary && occurrence > boundary) break;
  }
  return results;
}

export function calculateDeadline(rule: DeadlineRule, inputs: { periodEnd: string; referenceDate?: string }, calculatedAt = new Date().toISOString()): DeadlineResult {
  date(inputs.periodEnd); if (inputs.referenceDate) date(inputs.referenceDate);
  let result: string;
  switch (rule.type) {
    case "days_after_period_end": result = addDays(inputs.periodEnd, rule.days ?? 0); break;
    case "days_before_date": result = addDays(rule.baseDate ?? inputs.referenceDate ?? inputs.periodEnd, -(rule.days ?? 0)); break;
    case "fixed_calendar_day": result = addMonths(inputs.periodEnd.slice(0, 8) + "01", 1, rule.day ?? 1); break;
    case "months_after_period_end": result = addMonths(inputs.periodEnd, rule.months ?? 0); break;
    case "months_plus_days": result = addDays(addMonths(inputs.periodEnd, rule.months ?? 0), rule.days ?? 0); break;
    case "explicit_date": if (!rule.date) throw new Error("explicit_date requires date"); date(rule.date); result = rule.date; break;
    case "configurable": result = addDays(addMonths(inputs.periodEnd, rule.months ?? 0), rule.days ?? 0); break;
    default: throw new Error("Unsupported deadline rule");
  }
  return { date: result, provenance: { rule, inputs: { periodEnd: inputs.periodEnd, ...(inputs.referenceDate ? { referenceDate: inputs.referenceDate } : {}) }, calculatedAt } };
}
