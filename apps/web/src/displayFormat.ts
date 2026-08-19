const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value?: string | null, fallback = "Not recorded"): string {
  const parsed = validDate(value);
  return parsed ? dateFormatter.format(parsed) : fallback;
}

export function formatDateTime(value?: string | null, fallback = "Not recorded"): string {
  const parsed = validDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : fallback;
}

export function formatPeriodYear(value?: string | null, fallback = "Date unavailable"): string {
  const parsed = validDate(value);
  return parsed ? String(parsed.getUTCFullYear()) : fallback;
}

export function actorDisplayLabel(actorId?: string | null): string {
  const actor = actorId?.trim().toUpperCase();
  if (actor === "SYSTEM" || actor?.startsWith("SYSTEM_") || actor?.startsWith("SERVICE_")) {
    return "System process";
  }
  return "Team member";
}

export function mappingSummaryLabel(total: number, unmapped: number): string {
  if (total === 0) return "No accounts imported";
  return unmapped > 0 ? `${unmapped} to review` : "All mapped";
}

const mojibakeReplacements: ReadonlyArray<readonly [string, string]> = [
  ["â€™", "’"],
  ["â€˜", "‘"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["Â·", "·"],
  ["Â£", "£"],
];

export function normalizeDisplayText(value: string): string {
  return mojibakeReplacements.reduce(
    (text, [encoded, corrected]) => text.replaceAll(encoded, corrected),
    value,
  );
}
