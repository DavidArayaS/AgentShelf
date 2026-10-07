// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minorUnits, selectedCurrency, exactMajorUnit } from '../dist/index.js';
test('exact ISO minor-unit conversion round trips generated values without rounding', () => {
  for (const currency of ['USD', 'JPY', 'KWD'])
    for (let value = 0; value < 5000; value += 137) {
      const decimal = exactMajorUnit(value, currency);
      assert.equal(minorUnits(decimal, currency), value);
    }
  assert.throws(() => minorUnits('1.001', 'USD'));
  assert.throws(() => minorUnits('-1', 'USD'));
  assert.throws(() => minorUnits('9007199254740992', 'JPY'));
  assert.throws(() => exactMajorUnit(-1, 'USD'));
  assert.equal(selectedCurrency(['USD', 'USD']), 'USD');
  assert.equal(selectedCurrency([]), undefined);
  assert.equal(selectedCurrency(['USD', 'EUR'], 'EUR'), 'EUR');
  assert.throws(() => selectedCurrency(['USD', 'EUR']));
  assert.throws(() => selectedCurrency(['USD'], 'EUR'));
});

test('public helpers reject malformed currencies and schemas validate nested references', async () => {
  const { createJsonSchemaValidator } = await import('../dist/index.js');
  for (const input of ['', '01', '1e2', 'NaN', '-0', '1'.repeat(129)])
    assert.throws(() => minorUnits(input, 'USD'));
  assert.throws(() => minorUnits('1', 'US'));
  assert.throws(() => exactMajorUnit(1, 'invalid'));
  assert.throws(() => exactMajorUnit(0.1, 'USD'));
  const validate = createJsonSchemaValidator(
    [{ $id: 'https://example.test/price', type: 'integer', minimum: 0 }],
    {
      type: 'object',
      required: ['amount'],
      properties: { amount: { $ref: 'https://example.test/price' } },
    },
  );
  assert.equal(validate({ amount: 1 }), true);
  assert.equal(validate({ amount: -1 }), false);
  assert.ok(validate.errors.length > 0);
});
