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
