export interface AccountingPeriod {
  start: string;
  end: string;
}

export interface ComparativeVersionLink {
  currentAccountsVersionId: string;
  currentManifestHash: string;
  currentPeriod: AccountingPeriod;
  comparativeAccountsVersionId: string;
  comparativeManifestHash: string;
  comparativePeriod: AccountingPeriod;
}

export interface PeriodReportLine {
  code: string;
  caption: string;
  amountMinor: bigint;
}

export interface ComparativeReportLine {
  code: string;
  caption: string;
  currentAmountMinor: bigint;
  comparativeAmountMinor: bigint | null;
  movementMinor: bigint | null;
  movementPercent: number | null;
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("ACCOUNTING_PERIOD_DATE_INVALID");
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error("ACCOUNTING_PERIOD_DATE_INVALID");
  }
  return parsed;
}

function validatePeriod(period: AccountingPeriod): { start: number; end: number } {
  const start = dateValue(period.start);
  const end = dateValue(period.end);
  if (end < start) throw new Error("ACCOUNTING_PERIOD_ORDER_INVALID");
  return { start, end };
}

export function validateComparativeVersionLink(link: ComparativeVersionLink): ComparativeVersionLink {
  const current = validatePeriod(link.currentPeriod);
  const comparative = validatePeriod(link.comparativePeriod);
  if (!link.currentAccountsVersionId || !link.comparativeAccountsVersionId) {
    throw new Error("COMPARATIVE_VERSION_REQUIRED");
  }
  if (!link.currentManifestHash || !link.comparativeManifestHash) {
    throw new Error("COMPARATIVE_MANIFEST_HASH_REQUIRED");
  }
  if (link.currentAccountsVersionId === link.comparativeAccountsVersionId) {
    throw new Error("COMPARATIVE_VERSION_SELF_REFERENCE");
  }
  if (comparative.end >= current.start) throw new Error("COMPARATIVE_PERIOD_OVERLAPS_CURRENT");
  return link;
}

function indexedLines(lines: readonly PeriodReportLine[], period: "CURRENT" | "COMPARATIVE") {
  const result = new Map<string, PeriodReportLine>();
  for (const line of lines) {
    const code = line.code.trim();
    const caption = line.caption.trim();
    if (!code || !caption) throw new Error(`REPORT_LINE_INVALID:${period}`);
    if (result.has(code)) throw new Error(`REPORT_LINE_DUPLICATE:${period}:${code}`);
    result.set(code, { ...line, code, caption });
  }
  return result;
}

export function buildComparativeReport(
  currentLines: readonly PeriodReportLine[],
  comparativeLines: readonly PeriodReportLine[],
): ComparativeReportLine[] {
  const current = indexedLines(currentLines, "CURRENT");
  const comparative = indexedLines(comparativeLines, "COMPARATIVE");
  const codes = [...new Set([...current.keys(), ...comparative.keys()])].sort((a, b) => a.localeCompare(b));

  return codes.map((code) => {
    const currentLine = current.get(code);
    const comparativeLine = comparative.get(code);
    const currentAmountMinor = currentLine?.amountMinor ?? 0n;
    const comparativeAmountMinor = comparativeLine?.amountMinor ?? null;
    const movementMinor = comparativeAmountMinor === null ? null : currentAmountMinor - comparativeAmountMinor;
    const movementPercent = comparativeAmountMinor === null || comparativeAmountMinor === 0n
      ? null
      : Number((movementMinor! * 10_000n) / (comparativeAmountMinor < 0n ? -comparativeAmountMinor : comparativeAmountMinor)) / 100;

    return {
      code,
      caption: currentLine?.caption ?? comparativeLine!.caption,
      currentAmountMinor,
      comparativeAmountMinor,
      movementMinor,
      movementPercent,
    };
  });
}
