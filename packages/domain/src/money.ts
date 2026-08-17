export type Money = bigint;

export function moneyFromDecimal(input: string): Money {
  const value = input.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid monetary value: ${input}`);
  const [, sign, whole, fraction = ""] = match;
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return sign === "-" ? -minor : minor;
}

export function moneyToDecimal(value: Money): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}
