import { moneyFromDecimal, type Money } from './money.js';

export interface ImportedTrialBalanceRow {
  code: string;
  name: string;
  debit: Money;
  credit: Money;
}

export interface CsvImportResult {
  rows: ImportedTrialBalanceRow[];
  debitTotal: Money;
  creditTotal: Money;
  balanced: boolean;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { cells.push(value.trim()); value = ''; }
    else value += ch;
  }
  cells.push(value.trim());
  return cells;
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseTrialBalanceCsv(csv: string): CsvImportResult {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row');
  const headers = splitCsvLine(lines[0]!).map(normaliseHeader);
  const find = (...candidates: string[]) => headers.findIndex(h => candidates.includes(h));
  const codeIndex = find('account code', 'code', 'nominal code', 'account');
  const nameIndex = find('account name', 'name', 'description', 'nominal description');
  const debitIndex = find('debit', 'debits');
  const creditIndex = find('credit', 'credits');
  if ([codeIndex, nameIndex, debitIndex, creditIndex].some(i => i < 0)) {
    throw new Error('CSV requires account code, account name, debit and credit columns');
  }
  let debitTotal = 0n;
  let creditTotal = 0n;
  const rows = lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const code = cells[codeIndex]?.trim() ?? '';
    const name = cells[nameIndex]?.trim() ?? '';
    if (!code || !name) throw new Error(`Row ${index + 2} requires account code and name`);
    const debit = moneyFromDecimal((cells[debitIndex] || '0').replace(/[£,]/g, ''));
    const credit = moneyFromDecimal((cells[creditIndex] || '0').replace(/[£,]/g, ''));
    if (debit < 0n || credit < 0n) throw new Error(`Row ${index + 2} contains a negative debit or credit`);
    if (debit > 0n && credit > 0n) throw new Error(`Row ${index + 2} cannot contain both debit and credit`);
    debitTotal += debit;
    creditTotal += credit;
    return { code, name, debit, credit };
  });
  return { rows, debitTotal, creditTotal, balanced: debitTotal === creditTotal };
}
