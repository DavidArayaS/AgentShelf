// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReference, validateConnectorProduct } from '../dist/index.js';
test('reference validation rejects non-web URLs and preserves source identity', () => {
  assert.deepEqual(
    validateReference({ url: 'https://shop.example/p', sourceId: '123' }),
    { url: 'https://shop.example/p', sourceId: '123' },
  );
  assert.throws(() => validateReference({ url: 'file:///tmp/private' }));
});
test('connector validation cannot pass arbitrary product payloads', () => {
  assert.throws(() =>
    validateConnectorProduct({ name: 'missing canonical fields' }),
  );
});
