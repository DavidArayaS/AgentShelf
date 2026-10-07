// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SqliteCatalogRepository } from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('repository saves, replaces, lists and isolates caller mutations', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    await repository.save(catalog);
    const read = await repository.get(catalog.id);
    read.products[0].name = 'changed';
    assert.equal(
      (await repository.get(catalog.id)).products[0].name,
      'Waterproof Trail Shoe',
    );
    assert.equal(await repository.get("' OR 1=1 --"), undefined);
    assert.equal((await repository.list()).length, 1);
    await assert.rejects(repository.save({}));
  } finally {
    repository.close?.();
  }
});
