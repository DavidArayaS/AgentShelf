// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoHttp, demoUrl } from '../dist/index.js';
test('offline transport is bounded to its reserved origin and supports cancellation', async () => {
  const http = createDemoHttp();
  assert.equal((await http.get(demoUrl)).status, 200);
  assert.equal((await http.get(`${demoUrl}missing`)).status, 404);
  await assert.rejects(http.get('https://example.com/'));
  await assert.rejects(http.get(demoUrl, AbortSignal.abort()));
});
