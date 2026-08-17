export interface CsvRow {
  rowNo: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  rawRow: Record<string, string>;
}

export interface ParsedCsv {
  rows: CsvRow[];
  debitTotal: string;
  creditTotal: string;
  balanced: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new ApiError(422, 'INVALID_CSV', 'CSV contains an unterminated quoted value');
  values.push(value.trim());
  return values;
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMoney(value: string, rowNo: number): bigint {
  const cleaned = value.trim().replace(/[\u00a3,$]/g, '');
  if (cleaned === '') return 0n;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new ApiError(422, 'INVALID_CSV', `Row ${rowNo} contains an invalid monetary value`);
  return BigInt(match[1]!) * 100n + BigInt(((match[2] ?? '') + '00').slice(0, 2));
}

export function decimal(minorUnits: bigint): string {
  return `${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, '0')}`;
}

export function parseTrialBalanceCsv(csv: string): ParsedCsv {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) throw new ApiError(422, 'INVALID_CSV', 'CSV must contain a header and at least one data row');

  const originalHeaders = splitCsvLine(lines[0]!);
  const headers = originalHeaders.map(normaliseHeader);
  const find = (...candidates: string[]) => headers.findIndex((header) => candidates.includes(header));
  const codeIndex = find('account code', 'code', 'nominal code', 'account');
  const nameIndex = find('account name', 'name', 'description', 'nominal description');
  const debitIndex = find('debit', 'debits');
  const creditIndex = find('credit', 'credits');
  if ([codeIndex, nameIndex, debitIndex, creditIndex].some((index) => index < 0)) {
    throw new ApiError(422, 'INVALID_CSV', 'CSV requires account code, account name, debit and credit columns');
  }

  let debitTotal = 0n;
  let creditTotal = 0n;
  const rows = lines.slice(1).map((line, index): CsvRow => {
    const rowNo = index + 2;
    const values = splitCsvLine(line);
    const accountCode = values[codeIndex]?.trim() ?? '';
    const accountName = values[nameIndex]?.trim() ?? '';
    if (!accountCode || !accountName) throw new ApiError(422, 'INVALID_CSV', `Row ${rowNo} requires account code and name`);
    const debitMinor = parseMoney(values[debitIndex] ?? '', rowNo);
    const creditMinor = parseMoney(values[creditIndex] ?? '', rowNo);
    if (debitMinor > 0n && creditMinor > 0n) throw new ApiError(422, 'INVALID_CSV', `Row ${rowNo} cannot contain both debit and credit`);
    debitTotal += debitMinor;
    creditTotal += creditMinor;
    return {
      rowNo,
      accountCode,
      accountName,
      debit: decimal(debitMinor),
      credit: decimal(creditMinor),
      rawRow: Object.fromEntries(originalHeaders.map((header, column) => [header, values[column] ?? ''])),
    };
  });
  return { rows, debitTotal: decimal(debitTotal), creditTotal: decimal(creditTotal), balanced: debitTotal === creditTotal };
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', 'A JSON object is required');
  return value as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') throw new ApiError(400, 'INVALID_REQUEST', `${field} is required`);
  return value.trim();
}
