// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startWeb } from '../dist/index.js';
test('local demo serves assets, scans offline, exports and rejects cross-origin writes', async () => {
  const app = await startWeb(0);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Is your store ready/);
    assert.match(
      page.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    );
    const scan = await fetch(`${base}/v1/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://demo.example/' }),
    });
    assert.equal(scan.status, 201);
    assert.equal((await scan.json()).report.productsNormalized, 1);
    for (const format of ['json', 'acp', 'ucp']) {
      const response = await fetch(`${base}/v1/exports/${format}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).products.length, 1);
    }
    assert.equal(
      (
        await fetch(`${base}/v1/scans`, {
          method: 'POST',
          headers: { origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
  } finally {
    await app.close();
  }
});
