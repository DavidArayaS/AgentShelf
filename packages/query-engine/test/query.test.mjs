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

test('small query grammar enforces price constraints and preserves explicit filters', async () => {
  const { interpretSearchQuery } = await import('../dist/index.js');
  assert.deepEqual(interpretSearchQuery({ query: 'headphones under $200' }), {
    query: 'headphones',
    maxPrice: '200',
    currency: 'USD',
  });
  assert.equal(
    interpretSearchQuery({ query: 'shoe above $100' }).minPrice,
    '100',
  );
  assert.equal(
    interpretSearchQuery({ query: 'shoe below 150', currency: 'EUR' }).maxPrice,
    '150',
  );
  assert.equal(
    interpretSearchQuery({ query: 'shoe below 150' }).query,
    'shoe below 150',
  );
  assert.equal(
    interpretSearchQuery({
      query: 'shoe under $150',
      maxPrice: 100,
      currency: 'EUR',
    }).maxPrice,
    100,
  );
  assert.equal(
    interpretSearchQuery({
      query: 'shoe in stock',
      availability: 'out_of_stock',
    }).availability,
    'out_of_stock',
  );
  assert.equal(
    interpretSearchQuery({
      query: 'shoe size 10',
      variantProperties: { size: '9' },
    }).variantProperties.size,
    '9',
  );
  assert.equal(interpretSearchQuery({}).query, '');
  assert.equal(
    searchProducts(catalog, { query: 'running shoe under $100' }).total,
    0,
  );
  assert.equal(
    searchProducts(catalog, { query: 'running shoe under $150' }).total,
    1,
  );
  assert.equal(
    searchProducts(catalog, { query: 'running shoe over $150' }).total,
    0,
  );
  assert.equal(
    searchProducts(catalog, { query: 'running shoe in stock' }).total,
    1,
  );
  assert.equal(searchProducts(catalog, { merchantId: 'other' }).total, 0);
  assert.equal(
    searchProducts(catalog, { merchantId: catalog.merchant.id }).total,
    1,
  );
  assert.equal(searchProducts(catalog, { shippingDestination: 'CR' }).total, 0);
  const withShipping = structuredClone(catalog);
  withShipping.merchant.shipping = {
    destinations: ['CR'],
    cost: null,
    minDays: null,
    maxDays: null,
  };
  assert.equal(
    searchProducts(withShipping, { shippingDestination: 'CR' }).total,
    1,
  );
});
