// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CatalogSchema } from '@agentshelf/schema';
import { createJsonSchemaValidator } from '@agentshelf/protocol-sdk';
import {
  exportAcpCatalog,
  validateAcpFeed,
  ACP_SUPPORT,
} from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
const source = JSON.parse(
  readFileSync(new URL('../spec/SOURCE.json', import.meta.url), 'utf8'),
);
const official = JSON.parse(
  readFileSync(
    new URL('../spec/2026-04-17/json-schema/schema.feed.json', import.meta.url),
    'utf8',
  ),
);
test('generated output conforms to the pinned official ACP feed schema and preserves exact currency minor units', () => {
  const validate = createJsonSchemaValidator([], {
    ...official,
    ...official.$defs.ProductsResponse,
  });
  const output = exportAcpCatalog(catalog);
  assert.equal(validate(output), true, JSON.stringify(validate.errors));
  assert.equal(output.products[0].variants[0].price.amount, 12995);
  assert.equal(validateAcpFeed(output), true);
  assert.equal(ACP_SUPPORT.version, '2026-04-17');
});
test('currency ambiguity, unsupported precision and unrepresented multiple offers fail explicitly', () => {
  const multi = structuredClone(catalog);
  multi.products[0].offers.push({
    ...multi.products[0].offers[0],
    id: 'eur',
    price: { amount: '129.95', currency: 'EUR' },
  });
  assert.throws(() => exportAcpCatalog(multi), /multiple currencies/);
  assert.equal(
    exportAcpCatalog(multi, { currency: 'EUR' }).products[0].variants[0].price
      .currency,
    'EUR',
  );
  const fractional = structuredClone(catalog);
  fractional.products[0].offers[0].price.amount = '1.001';
  assert.throws(() => exportAcpCatalog(fractional), /minor-unit/);
  const duplicate = structuredClone(catalog);
  duplicate.products[0].offers.push({
    ...duplicate.products[0].offers[0],
    id: 'offer2',
  });
  assert.throws(() => exportAcpCatalog(duplicate), /one selected price/);
});
test('refuses invalid generated documents and preserves the immutable official schema snapshot', () => {
  assert.equal(CatalogSchema.safeParse(catalog).success, true);
  const digest = createHash('sha256');
  for (const file of source.files.sort()) {
    digest.update(file);
    digest.update(
      readFileSync(
        new URL(`../spec/2026-04-17/json-schema/${file}`, import.meta.url),
      ),
    );
  }
  assert.equal(source.sha256, digest.digest('hex'));
  assert.equal(validateAcpFeed(null), false);
});

test('variants and optional catalog fields remain valid across generated combinations', () => {
  for (let mask = 0; mask < 32; mask++) {
    const input = structuredClone(catalog);
    const product = input.products[0];
    if (mask & 1) delete product.description;
    if (mask & 2) product.images = [];
    else product.images[0] = { ...product.images[0], width: 640, height: 480 };
    if (mask & 4) product.categories = [];
    if (mask & 8) product.offers[0].availability = 'unknown';
    product.variants = [
      {
        id: 'variant-one',
        name: 'Blue / Small',
        identifiers: { gtin: '4006381333931' },
        images: mask & 16 ? [] : product.images,
        attributes: [
          { name: 'size', value: 'Small' },
          { name: 'quantity', value: 1 },
          { name: 'waterproof', value: true },
        ],
        offers: structuredClone(product.offers),
      },
    ];
    const output = exportAcpCatalog(input);
    assert.equal(validateAcpFeed(output), true);
    assert.equal(output.products[0].variants[0].id, 'variant-one');
    assert.equal(output.products[0].variants[0].price.amount, 12995);
  }
  const duplicate = structuredClone(catalog);
  const p = duplicate.products[0];
  p.variants = [
    {
      id: 'v',
      identifiers: {},
      images: [],
      attributes: [],
      offers: [p.offers[0], { ...p.offers[0], id: 'another' }],
    },
  ];
  assert.throws(() => exportAcpCatalog(duplicate), /multiple seller offers/);
});

test('unknown prices and empty optional fields remain unknown rather than fabricated', () => {
  const input = structuredClone(catalog);
  const p = input.products[0];
  p.images = [];
  p.attributes = [];
  p.categories = [];
  delete p.description;
  p.offers = [{ id: 'unknown', price: null, availability: 'unknown' }];
  p.variants = [
    { id: 'v', identifiers: {}, offers: [], images: [], attributes: [] },
  ];
  const variant = exportAcpCatalog(input).products[0].variants[0];
  assert.equal(variant.price, undefined);
  assert.equal(variant.title, p.name);
  p.variants = [];
  assert.equal(
    exportAcpCatalog(input).products[0].variants[0].availability,
    undefined,
  );
  input.products = [];
  assert.deepEqual(exportAcpCatalog(input), { products: [] });
});
