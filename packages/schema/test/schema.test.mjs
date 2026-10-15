// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CatalogSchema,
  PriceSchema,
  RatingSchema,
  ShippingInformationSchema,
  catalogJsonSchema,
  UrlSchema,
} from '../dist/index.js';
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('valid canonical catalog round trips without lost supported fields', () => {
  assert.deepEqual(
    CatalogSchema.parse(JSON.parse(JSON.stringify(fixture))),
    fixture,
  );
  assert.equal(
    catalogJsonSchema.$schema,
    'https://json-schema.org/draft/2020-12/schema',
  );
});
test('prices reject negatives, floating numbers, exponent notation and invalid currencies', () => {
  for (const amount of ['-1', 'NaN', '1e3', '01', '1.0000001', 1.2])
    assert.equal(
      PriceSchema.safeParse({ amount, currency: 'USD' }).success,
      false,
    );
  for (const currency of ['usd', 'US', ''])
    assert.equal(
      PriceSchema.safeParse({ amount: '1', currency }).success,
      false,
    );
});
test('decimal amounts preserve exact nonnegative values over generated examples', () => {
  for (let cents = 0; cents < 2000; cents += 7) {
    const amount =
      (BigInt(cents) / 100n).toString() +
      '.' +
      (cents % 100).toString().padStart(2, '0');
    assert.equal(PriceSchema.parse({ amount, currency: 'USD' }).amount, amount);
  }
});
test('enforces catalog identity and schema version', () => {
  for (const mutate of [
    (c) => c.products.push(c.products[0]),
    (c) => {
      c.products[0].merchantId = 'other';
    },
    (c) => {
      c.schemaVersion = '2.0';
    },
    (c) => {
      c.products[0].offers.push(c.products[0].offers[0]);
    },
  ]) {
    const c = structuredClone(fixture);
    mutate(c);
    assert.equal(CatalogSchema.safeParse(c).success, false);
  }
});
test('rejects unsafe URL forms and contradictory rating/shipping ranges', () => {
  for (const value of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pass@example.com/',
  ])
    assert.equal(UrlSchema.safeParse(value).success, false);
  assert.equal(
    RatingSchema.safeParse({ value: 6, best: 5, worst: 1 }).success,
    false,
  );
  assert.equal(
    ShippingInformationSchema.safeParse({
      destinations: ['US'],
      cost: null,
      minDays: 4,
      maxDays: 2,
    }).success,
    false,
  );
});

test('stable IDs are deterministic, scoped and insensitive to Unicode normalization', async () => {
  const { stableId } = await import('../dist/index.js');
  assert.equal(
    stableId('merchant', 'https://example.com'),
    stableId('merchant', 'https://example.com'),
  );
  assert.notEqual(stableId('merchant', 'one'), stableId('product', 'one'));
  assert.notEqual(stableId('product', 'one'), stableId('product', 'two'));
});

test('identity normalization preserves canonical Unicode and rejects empty keys', async () => {
  const { stableId } = await import('../dist/index.js');
  assert.equal(stableId('product', 'café'), stableId('product', 'cafe\u0301'));
  assert.throws(() => stableId('', 'key'));
  assert.throws(() => stableId('product', ' '));
});

test('acquisition claims require matching authority, counts and evidence; public completeness is forbidden', async () => {
  const { AcquisitionMetadataSchema, CatalogSchema } =
    await import('../dist/index.js');
  const complete = {
    mode: 'authorized_connector',
    authority: 'merchant_authorized',
    connectorId: 'fixture',
    authenticated: true,
    acquiredAt: '2026-10-01T00:00:00Z',
    coverage: {
      status: 'complete',
      reason: 'All authorized resources enumerated',
      observedProducts: 2,
      expectedProducts: 2,
      paginationExhausted: true,
      limitReached: false,
      truncated: false,
      failures: 0,
    },
  };
  assert.ok(AcquisitionMetadataSchema.safeParse(complete).success);
  for (const update of [
    { expectedProducts: 3 },
    { failures: 1 },
    { limitReached: true },
    { truncated: true },
    { paginationExhausted: false },
  ])
    assert.equal(
      AcquisitionMetadataSchema.safeParse({
        ...complete,
        coverage: { ...complete.coverage, ...update },
      }).success,
      false,
    );
  assert.equal(
    AcquisitionMetadataSchema.safeParse({
      ...complete,
      mode: 'public_discovery',
      authority: 'public_observation',
      authenticated: false,
    }).success,
    false,
  );
  assert.equal(
    AcquisitionMetadataSchema.safeParse({
      ...complete,
      authority: 'merchant_provided',
    }).success,
    false,
  );
  assert.equal(
    AcquisitionMetadataSchema.safeParse({
      ...complete,
      mode: 'direct_import',
      authenticated: true,
    }).success,
    false,
  );
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    CatalogSchema.safeParse({ ...sample, acquisition: complete }).success,
    false,
  );
});
