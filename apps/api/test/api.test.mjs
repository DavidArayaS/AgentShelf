// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startApi } from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('local API performs real search, export, validation and structured failures', async () => {
  const server = await startApi({ catalog }, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const search = await fetch(
      `${base}/v1/products/search?query=shoe&maxPrice=150&currency=USD`,
    );
    assert.equal(search.status, 200);
    assert.equal(
      (await search.json()).products[0].name,
      'Waterproof Trail Shoe',
    );
    const missing = await fetch(`${base}/v1/products/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'PRODUCT_NOT_FOUND');
    assert.equal((await fetch(`${base}/v1/products?maxPrice=10`)).status, 400);
    const validation = await fetch(`${base}/v1/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(catalog),
    });
    assert.equal(validation.status, 200);
    assert.equal(
      (
        await fetch(`${base}/v1/products`, {
          headers: { origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await (await fetch(`${base}/v1/exports/json`)).json()).schemaVersion,
      '1.0',
    );
    const acp = await fetch(`${base}/v1/exports/acp`);
    assert.equal(acp.status, 200);
    assert.equal((await acp.json()).products.length, 1);
    const ucp = await fetch(`${base}/v1/exports/ucp`);
    assert.equal(ucp.status, 200);
    assert.equal((await ucp.json()).ucp.version, '2026-08-25');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('local API enables only the configured browser origin and answers preflight', async () => {
  const origin = 'http://127.0.0.1:5173';
  const server = await startApi({ catalog, browserOrigin: origin }, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const allowed = await fetch(`${base}/v1/products`, {
      headers: { origin },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
    const preflight = await fetch(`${base}/v1/products`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods'), /GET/);
    assert.equal(
      (
        await fetch(`${base}/v1/products`, {
          headers: { origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
