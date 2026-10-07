// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CatalogSchema } from '@agentshelf/schema';
import {
  exportUcpCatalog,
  validateUcpCatalog,
  UCP_SUPPORT,
  loadOfficialUcpSchema,
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
test('catalog response validates against the exact official pinned UCP schemas', async () => {
  const response = await exportUcpCatalog(catalog);
  assert.equal(await validateUcpCatalog(response), true);
  assert.equal(response.ucp.version, '2026-08-25');
  assert.equal(response.products[0].variants[0].price.amount, 12995);
  assert.equal(UCP_SUPPORT.version, '2026-08-25');
  assert.equal(
    (await loadOfficialUcpSchema('shopping/catalog_search.json')).name,
    'dev.ucp.shopping.catalog.search',
  );
});
test('schema snapshots are immutable and mappings fail instead of inventing required fields', async () => {
  assert.equal(CatalogSchema.safeParse(catalog).success, true);
  assert.equal(source.files.length, 116);
  const digest = createHash('sha256');
  for (const file of source.files) {
    digest.update(file);
    digest.update(
      readFileSync(
        new URL(`../spec/2026-08-25/source/schemas/${file}`, import.meta.url),
      ),
    );
  }
  assert.equal(source.sha256, digest.digest('hex'));
  const noDescription = structuredClone(catalog);
  delete noDescription.products[0].description;
  await assert.rejects(
    exportUcpCatalog(noDescription),
    /requires a product description/,
  );
  const noPrice = structuredClone(catalog);
  noPrice.products[0].offers[0].price = null;
  await assert.rejects(exportUcpCatalog(noPrice), /requires prices/);
  await assert.rejects(loadOfficialUcpSchema('../ucp.json'));
});
test('multiple currencies require an explicit supported selection', async () => {
  const multi = structuredClone(catalog);
  multi.products[0].offers.push({
    ...multi.products[0].offers[0],
    id: 'eur',
    price: { amount: '100', currency: 'EUR' },
  });
  await assert.rejects(exportUcpCatalog(multi), /select one/);
  assert.equal(
    (await exportUcpCatalog(multi, { currency: 'EUR' })).products[0].price_range
      .min.currency,
    'EUR',
  );
});
