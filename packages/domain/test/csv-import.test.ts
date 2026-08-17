import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrialBalanceCsv } from '../src/csv-import.js';
import { moneyToDecimal } from '../src/money.js';

test('imports a balanced trial balance CSV', () => {
  const result = parseTrialBalanceCsv('Account Code,Account Name,Debit,Credit\n1000,Bank,125000,0\n4000,Service income,0,150000\n7000,Operating expenses,25000,0');
  assert.equal(result.rows.length, 3);
  assert.equal(result.balanced, true);
  assert.equal(moneyToDecimal(result.debitTotal), '150000.00');
  assert.equal(moneyToDecimal(result.creditTotal), '150000.00');
});

test('rejects rows with both debit and credit values', () => {
  assert.throws(() => parseTrialBalanceCsv('Code,Name,Debit,Credit\n1000,Bank,10,10'), /both debit and credit/);
});

test('detects an unbalanced trial balance without destroying import detail', () => {
  const result = parseTrialBalanceCsv('Code,Name,Debit,Credit\n1000,Bank,100,0\n4000,Income,0,90');
  assert.equal(result.balanced, false);
  assert.equal(result.rows.length, 2);
});
