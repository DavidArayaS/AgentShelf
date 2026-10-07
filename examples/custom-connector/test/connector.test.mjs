// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReference } from '@agentshelf/connector-sdk';

test('community connector packages can reuse the exported SDK boundary', () => {
  assert.equal(
    validateReference({ url: 'https://store.example/items/1' }).url,
    'https://store.example/items/1',
  );
});
