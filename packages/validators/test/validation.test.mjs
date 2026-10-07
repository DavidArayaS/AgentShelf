// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateCatalog,
  validateProduct,
  validGtin,
  rules,
  CATEGORIES,
} from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('stable rules cover every category and distinguish unknown from failure', () => {
  const results = validateProduct(catalog.products[0]);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  assert.deepEqual(
    new Set(results.map((r) => r.category)),
    new Set(CATEGORIES),
  );
  assert.equal(
    results.find((r) => r.ruleId === 'product.identity.gtin').status,
    'unknown',
  );
  assert.equal(validateCatalog(catalog).products.length, 1);
  assert.deepEqual(validateProduct(catalog.products[0]), results);
});
test('validates GTIN checksum and never invents identifiers', () => {
  assert.equal(validGtin('4006381333931'), true);
  assert.equal(validGtin('4006381333932'), false);
  assert.equal(validGtin('abc'), false);
  const product = structuredClone(catalog.products[0]);
  product.identifiers.gtin = '4006381333932';
  assert.equal(
    validateProduct(product).find((r) => r.ruleId === 'product.identity.gtin')
      .status,
    'fail',
  );
});
test('freshness is deterministic relative to source observation and rejects future inventory', () => {
  const product = structuredClone(catalog.products[0]);
  product.offers[0].inventory = {
    quantity: 2,
    observedAt: '2026-10-08T00:00:00Z',
  };
  assert.equal(
    validateProduct(product).find(
      (r) => r.ruleId === 'product.inventory.freshness',
    ).status,
    'fail',
  );
  assert.throws(() => validateProduct(product, [rules[0]]), /Duplicate/);
});
