// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { searchProducts, MemoryQueryEngine } from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('combines deterministic text, price, currency, attributes, brand and category filters', () => {
  assert.equal(
    searchProducts(catalog, {
      query: 'running shoe under $150',
      maxPrice: 150,
      currency: 'USD',
      availability: 'in_stock',
      attributes: { waterproof: true },
      brands: ['example'],
      categories: ['shoes'],
    }).total,
    1,
  );
  assert.equal(
    searchProducts(catalog, { maxPrice: 100, currency: 'USD' }).total,
    0,
  );
  assert.throws(() => searchProducts(catalog, { maxPrice: 100 }), /Currency/);
  assert.throws(() =>
    searchProducts(catalog, { minPrice: 10, maxPrice: 1, currency: 'USD' }),
  );
});
test('price and availability must match the same offer; variant filters must match same variant', () => {
  const c = structuredClone(catalog);
  c.products[0].offers = [
    {
      id: 'cheap',
      price: { amount: '10', currency: 'USD' },
      availability: 'out_of_stock',
    },
    {
      id: 'expensive',
      price: { amount: '100', currency: 'USD' },
      availability: 'in_stock',
    },
  ];
  assert.equal(
    searchProducts(c, {
      currency: 'USD',
      maxPrice: 20,
      availability: 'in_stock',
    }).total,
    0,
  );
  assert.equal(
    searchProducts(c, { variantProperties: { size: '10' } }).total,
    0,
  );
});
test('sorting, pagination, decimal comparison and immutable results are stable', async () => {
  const c = structuredClone(catalog);
  c.products.push({
    ...structuredClone(c.products[0]),
    id: 'second',
    name: 'Another shoe',
    offers: [
      {
        id: 'second-offer',
        price: { amount: '9.999999', currency: 'USD' },
        availability: 'in_stock',
      },
    ],
  });
  assert.equal(
    searchProducts(c, { sort: 'price_asc', currency: 'USD', limit: 1 })
      .products[0].id,
    'second',
  );
  assert.equal(
    searchProducts(c, { sort: 'name', offset: 1 }).products.length,
    1,
  );
  const engine = new MemoryQueryEngine(c);
  const p = await engine.getProduct('second');
  p.name = 'changed';
  assert.equal((await engine.getProduct('second')).name, 'Another shoe');
  assert.equal(await engine.getProduct('missing'), undefined);
  assert.equal((await engine.searchProducts({})).total, 2);
});

test('variant properties, no-price offers and descending prices preserve filter semantics', () => {
  const c = structuredClone(catalog);
  const p = c.products[0];
  p.variants = [
    {
      id: 'v',
      identifiers: {},
      images: [],
      attributes: [{ name: 'size', value: '10' }],
      offers: [
        {
          id: 'v-offer',
          price: { amount: '80', currency: 'USD' },
          availability: 'in_stock',
        },
      ],
    },
  ];
  assert.equal(
    searchProducts(c, {
      variantProperties: { size: '10' },
      minPrice: 70,
      maxPrice: 90,
      currency: 'USD',
    }).total,
    1,
  );
  assert.equal(
    searchProducts(c, { variantProperties: { size: '9' } }).total,
    0,
  );
  assert.equal(searchProducts(c, { brands: ['absent'] }).total, 0);
  assert.equal(searchProducts(c, { categories: ['absent'] }).total, 0);
  assert.equal(searchProducts(c, { attributes: { absent: true } }).total, 0);
  c.products.push({
    ...structuredClone(p),
    id: 'no-price',
    name: 'Unpriced',
    variants: [],
    offers: [{ id: 'empty', price: null, availability: 'unknown' }],
  });
  assert.equal(
    searchProducts(c, { sort: 'price_desc', currency: 'USD' }).products[0].id,
    p.id,
  );
  assert.equal(searchProducts(c, { currency: 'EUR' }).total, 0);
  assert.equal(searchProducts(c, { query: 'no-matching-product' }).total, 0);
});

test('catalog replacement updates products and merchant atomically and isolates metadata', async () => {
  const engine = new MemoryQueryEngine(catalog);
  const updated = structuredClone(catalog);
  updated.merchant.name = 'Updated store';
  updated.products[0].name = 'Updated item';
  await engine.replaceCatalog(updated);
  assert.equal((await engine.searchProducts({ query: 'updated' })).total, 1);
  const merchant = await engine.getMerchant();
  merchant.name = 'mutated';
  assert.equal((await engine.getMerchant()).name, 'Updated store');
  await assert.rejects(engine.replaceCatalog({}));
  assert.equal((await engine.searchProducts({ query: 'updated' })).total, 1);
});
