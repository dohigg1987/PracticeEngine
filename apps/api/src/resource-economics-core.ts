export type IsoDate = string;

export interface WorkingPattern {
  effectiveFrom: IsoDate;
  effectiveTo?: IsoDate | null;
  mondayMinutes: number;
  tuesdayMinutes: number;
  wednesdayMinutes: number;
  thursdayMinutes: number;
  fridayMinutes: number;
  saturdayMinutes: number;
  sundayMinutes: number;
}

export interface AvailabilityAdjustment {
  startsOn: IsoDate;
  endsOn: IsoDate;
  capacityDeltaMinutes: number;
}

export interface CapacityCommitment {
  id: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
  minutes: number;
  source: "generated" | "forecast";
}

export interface CapacityDay {
  date: IsoDate;
  availableMinutes: number;
  adjustmentMinutes: number;
  committedMinutes: number;
  forecastMinutes: number;
  remainingMinutes: number;
  forecastRemainingMinutes: number;
  utilisationPercent: number | null;
  overallocated: boolean;
  forecastOverallocated: boolean;
}

export interface CapacityPeriod extends Omit<CapacityDay, "date"> {
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: IsoDate): Date {
  if (!DATE.test(value)) throw new Error(`Invalid ISO date: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid ISO date: ${value}`);
  return parsed;
}

const iso = (value: Date) => value.toISOString().slice(0, 10);

function addDays(value: IsoDate, amount: number): IsoDate {
  const result = parseDate(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return iso(result);
}

function eachDate(from: IsoDate, to: IsoDate): IsoDate[] {
  parseDate(from);
  parseDate(to);
  if (to < from) throw new Error("Period end must not precede period start");
  const values: IsoDate[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) values.push(cursor);
  return values;
}

const patternKeys = [
  "sundayMinutes",
  "mondayMinutes",
  "tuesdayMinutes",
  "wednesdayMinutes",
  "thursdayMinutes",
  "fridayMinutes",
  "saturdayMinutes",
] as const;

function patternFor(patterns: readonly WorkingPattern[], day: IsoDate): WorkingPattern | undefined {
  const matches = patterns.filter((pattern) => pattern.effectiveFrom <= day && (!pattern.effectiveTo || pattern.effectiveTo >= day));
  if (matches.length > 1) throw new Error(`Overlapping working patterns on ${day}`);
  return matches[0];
}

function spreadMinutes(commitment: CapacityCommitment): Map<IsoDate, number> {
  if (!Number.isInteger(commitment.minutes) || commitment.minutes < 0) throw new Error("Commitment minutes must be a non-negative integer");
  const days = eachDate(commitment.startsOn, commitment.endsOn);
  const quotient = Math.floor(commitment.minutes / days.length), remainder = commitment.minutes % days.length;
  return new Map(days.map((day, index) => [day, quotient + (index < remainder ? 1 : 0)]));
}

/**
 * Builds an explainable daily capacity ledger. A work-level commitment is the
 * ownership boundary: callers must supply either its work estimate or its task
 * roll-up, never both. Forecast minutes remain separately labelled.
 */
export function calculateDailyCapacity(
  from: IsoDate,
  to: IsoDate,
  patterns: readonly WorkingPattern[],
  adjustments: readonly AvailabilityAdjustment[],
  commitments: readonly CapacityCommitment[],
): CapacityDay[] {
  const dates = eachDate(from, to);
  const spread = commitments.map((item) => ({ item, days: spreadMinutes(item) }));
  return dates.map((day) => {
    const pattern = patternFor(patterns, day);
    const base = pattern ? pattern[patternKeys[parseDate(day).getUTCDay()]] : 0;
    const adjustmentMinutes = adjustments
      .filter((item) => item.startsOn <= day && item.endsOn >= day)
      .reduce((sum, item) => sum + item.capacityDeltaMinutes, 0);
    const availableMinutes = Math.max(0, base + adjustmentMinutes);
    let committedMinutes = 0, forecastMinutes = 0;
    for (const { item, days } of spread) {
      const minutes = days.get(day) ?? 0;
      if (item.source === "forecast") forecastMinutes += minutes;
      else committedMinutes += minutes;
    }
    const totalLoad = committedMinutes + forecastMinutes;
    return {
      date: day,
      availableMinutes,
      adjustmentMinutes,
      committedMinutes,
      forecastMinutes,
      remainingMinutes: availableMinutes - committedMinutes,
      forecastRemainingMinutes: availableMinutes - totalLoad,
      utilisationPercent: availableMinutes === 0 ? (committedMinutes === 0 ? 0 : null) : round((committedMinutes / availableMinutes) * 100, 2),
      overallocated: committedMinutes > availableMinutes,
      forecastOverallocated: totalLoad > availableMinutes,
    };
  });
}

function mondayOf(value: IsoDate): IsoDate {
  const weekday = parseDate(value).getUTCDay();
  return addDays(value, -(weekday === 0 ? 6 : weekday - 1));
}

function monthStart(value: IsoDate): IsoDate { return `${value.slice(0, 7)}-01`; }

export function rollupCapacity(days: readonly CapacityDay[], grain: "day" | "week" | "month"): CapacityDay[] | CapacityPeriod[] {
  if (grain === "day") return [...days];
  const groups = new Map<string, CapacityDay[]>();
  for (const day of days) {
    const key = grain === "week" ? mondayOf(day.date) : monthStart(day.date);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].map(([periodStart, values]) => {
    const availableMinutes = sum(values, "availableMinutes"), committedMinutes = sum(values, "committedMinutes");
    const forecastMinutes = sum(values, "forecastMinutes"), totalLoad = committedMinutes + forecastMinutes;
    return {
      periodStart,
      periodEnd: values.at(-1)!.date,
      availableMinutes,
      adjustmentMinutes: sum(values, "adjustmentMinutes"),
      committedMinutes,
      forecastMinutes,
      remainingMinutes: availableMinutes - committedMinutes,
      forecastRemainingMinutes: availableMinutes - totalLoad,
      utilisationPercent: availableMinutes === 0 ? (committedMinutes === 0 ? 0 : null) : round((committedMinutes / availableMinutes) * 100, 2),
      overallocated: committedMinutes > availableMinutes,
      forecastOverallocated: totalLoad > availableMinutes,
    };
  });
}

function sum<T extends Record<K, number>, K extends keyof T>(items: readonly T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}

export function selectWorkEstimate(workMinutes: number | null | undefined, taskMinutes: readonly (number | null | undefined)[]): { minutes: number; provenance: "task_rollup" | "work" | "unavailable" } {
  if (workMinutes !== null && workMinutes !== undefined) return { minutes: workMinutes, provenance: "work" };
  const presentTasks = taskMinutes.filter((value): value is number => value !== null && value !== undefined);
  if (presentTasks.length) return { minutes: presentTasks.reduce((total, value) => total + value, 0), provenance: "task_rollup" };
  return { minutes: 0, provenance: "unavailable" };
}

export interface CostSnapshot {
  durationMinutes: number;
  rate: number;
  basis: "hourly" | "daily";
  dailyMinutes: number;
  amount: number;
  currency: string;
}

export function calculateCostSnapshot(durationMinutes: number, rate: number, basis: "hourly" | "daily", currency: string, dailyMinutes = 450): CostSnapshot {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error("Duration must be a positive whole number of minutes");
  if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be non-negative");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be an uppercase ISO-style code");
  if (!Number.isInteger(dailyMinutes) || dailyMinutes <= 0) throw new Error("Daily minutes must be positive");
  const divisor = basis === "hourly" ? 60 : dailyMinutes;
  return { durationMinutes, rate, basis, dailyMinutes, amount: round((durationMinutes / divisor) * rate, 4), currency };
}

export interface EconomicInput {
  actualMinutes: number;
  internalCost: number | null;
  billableValue?: number | null;
  acceptedRevenue?: number | null;
  billedAmount?: number | null;
  recoveredAmount?: number | null;
}

export interface EconomicPosition extends EconomicInput {
  billableValue: number | null;
  acceptedRevenue: number | null;
  billedAmount: number | null;
  recoveredAmount: number | null;
  wipBalance: number | null;
  contribution: number | null;
  marginPercent: number | null;
  status: { cost: "calculated" | "unavailable"; revenue: "known" | "unavailable"; billing: "known" | "unavailable"; wip: "calculated" | "unavailable" };
}

export function calculateEconomicPosition(input: EconomicInput): EconomicPosition {
  const acceptedRevenue = input.acceptedRevenue ?? null, billedAmount = input.billedAmount ?? null;
  const recoveredAmount = input.recoveredAmount ?? null, billableValue = input.billableValue ?? null;
  const contribution = acceptedRevenue === null || input.internalCost === null ? null : round(acceptedRevenue - input.internalCost, 4);
  return {
    ...input,
    acceptedRevenue,
    billedAmount,
    recoveredAmount,
    billableValue,
    wipBalance: billableValue === null || billedAmount === null ? null : round(billableValue - billedAmount, 4),
    contribution,
    marginPercent: contribution === null || acceptedRevenue === null || acceptedRevenue === 0 ? null : round((contribution / acceptedRevenue) * 100, 2),
    status: {
      cost: input.internalCost === null ? "unavailable" : "calculated",
      revenue: acceptedRevenue === null ? "unavailable" : "known",
      billing: billedAmount === null && recoveredAmount === null ? "unavailable" : "known",
      wip: billableValue === null || billedAmount === null ? "unavailable" : "calculated",
    },
  };
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
