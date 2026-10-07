// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  normalizeCatalog,
  stableId,
  canonicalUrl,
  CatalogValidationError,
} from '../dist/index.js';
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('normalization is pure, idempotent, and does not invent observations', () => {
  const before = structuredClone(fixture);
  const result = normalizeCatalog(fixture);
  assert.deepEqual(fixture, before);
  assert.deepEqual(normalizeCatalog(result), result);
  assert.equal(result.generatedAt, fixture.generatedAt);
});
test('identities are deterministic and namespace delimited', () => {
  for (let i = 0; i < 1000; i++) {
    assert.equal(
      stableId('merchant', String(i)),
      stableId('merchant', String(i)),
    );
    assert.notEqual(
      stableId('merchant', String(i)),
      stableId('variant', String(i)),
    );
  }
  assert.notEqual(stableId('ab', 'c'), stableId('a', 'bc'));
  assert.throws(() => stableId('', 'x'), /must not be empty/);
});
test('normalization rejects malformed canonical data with preserved cause', () => {
  assert.throws(
    () => normalizeCatalog({}),
    (error) => error instanceof CatalogValidationError && Boolean(error.cause),
  );
});
test('source URL normalization removes fragments but preserves meaningful query parameters', () => {
  assert.equal(
    canonicalUrl('https://STORE.example/a?variant=1#top'),
    'https://store.example/a?variant=1',
  );
  assert.throws(
    () => canonicalUrl('file:///etc/passwd'),
    CatalogValidationError,
  );
});
