// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanSecrets } from '../../scripts/secret-policy.mjs';
test('detects a synthetic GitHub token without returning its content', async () => {
  const synthetic = ['ghp', 'a'.repeat(36)].join('_');
  const result = await scanSecrets(synthetic, 'fixture.txt');
  assert.ok(result.length > 0);
  assert.ok(!JSON.stringify(result).includes(synthetic));
});
test('ordinary public configuration has no findings', async () => {
  assert.deepEqual(
    await scanSecrets('Node 24; license Apache-2.0', 'config.txt'),
    [],
  );
});
