import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, parseTrialBalanceCsv, requiredString } from '../src/core.ts';

test('parses a balanced trial balance and preserves raw values', () => {
  const result = parseTrialBalanceCsv('Account Code,Account Name,Debit,Credit\n1000,Bank,"1,250.00",0\n4000,Income,0,1250');
  assert.equal(result.balanced, true);
  assert.equal(result.debitTotal, '1250.00');
  assert.deepEqual(result.rows[0]?.rawRow, { 'Account Code': '1000', 'Account Name': 'Bank', Debit: '1,250.00', Credit: '0' });
});

test('rejects invalid double-sided rows', () => {
  assert.throws(
    () => parseTrialBalanceCsv('Code,Name,Debit,Credit\n1000,Bank,10,10'),
    (error: unknown) => error instanceof ApiError && error.status === 422 && error.code === 'INVALID_CSV',
  );
});

test('validates required command fields', () => {
  assert.equal(requiredString({ framework: ' FRS102 ' }, 'framework'), 'FRS102');
  assert.throws(() => requiredString({}, 'framework'), /framework is required/);
});
