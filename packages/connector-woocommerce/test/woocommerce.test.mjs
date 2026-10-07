// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeWooProduct, wooCommerceConnector } from '../dist/index.js';
const target = { url: 'https://demo.example/' };
const product = {
  id: 12,
  name: 'Trail Shoe',
  permalink: 'https://demo.example/p/12',
  sku: 'SHOE',
  prices: { price: '12995', currency_minor_unit: 2, currency_code: 'USD' },
  is_in_stock: true,
  categories: [],
  images: [],
  attributes: [],
  variations: [{ id: 13, attributes: [{ name: 'Size', value: '10' }] }],
};
const ctx = {
  limit: 100,
  maxSitemaps: 10,
  maxDepth: 3,
  clock: { now: () => new Date('2026-10-07T00:00:00Z') },
  logger: { log() {} },
  http: {
    async get(url) {
      return {
        url,
        status: 200,
        headers: {},
        body: url.endsWith('/robots.txt')
          ? ''
          : JSON.stringify(url.includes('?') ? [product, product] : product),
      };
    },
  },
};
test('normalizes exact currency minor units, variants, availability and stable identity', () => {
  const normalized = normalizeWooProduct(product, target, ctx);
  assert.equal(normalized.offers[0].price.amount, '129.95');
  assert.equal(normalized.variants.length, 1);
  assert.equal(normalized.offers[0].availability, 'in_stock');
  const yen = normalizeWooProduct(
    {
      ...product,
      prices: { price: '100', currency_minor_unit: 0, currency_code: 'JPY' },
    },
    target,
    ctx,
  );
  assert.equal(yen.offers[0].price.amount, '100');
  assert.equal(yen.id, normalized.id);
  assert.throws(() =>
    normalizeWooProduct(
      {
        ...product,
        prices: { price: '-1', currency_minor_unit: 2, currency_code: 'USD' },
      },
      target,
      ctx,
    ),
  );
});
test('public API discovery deduplicates and fetches canonical products without credentials', async () => {
  const references = await Array.fromAsync(
    wooCommerceConnector.discoverProducts(target, ctx),
  );
  assert.equal(references.length, 1);
  assert.equal(
    (await wooCommerceConnector.fetchProduct(references[0], target, ctx)).name,
    'Trail Shoe',
  );
});
test('malformed products, missing fields and API timeouts propagate meaningful failures', async () => {
  assert.throws(() => normalizeWooProduct({}, target, ctx));
  await assert.rejects(
    Array.fromAsync(
      wooCommerceConnector.discoverProducts(target, {
        ...ctx,
        http: {
          get: async () => {
            throw new Error('timeout');
          },
        },
      }),
    ),
    /timeout/,
  );
});
