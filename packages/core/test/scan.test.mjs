// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { scanStore } from '../dist/index.js';
const html = readFileSync(
  new URL('../../../examples/demo-store/product.html', import.meta.url),
  'utf8',
);
const pages = {
  'https://demo.example/': html,
  'https://demo.example/robots.txt': 'User-agent: *\nAllow: /',
  'https://demo.example/sitemap.xml':
    '<urlset><url><loc>https://demo.example/products/trail-shoe</loc></url></urlset>',
  'https://demo.example/products/trail-shoe': html,
};
test('fixture crawl normalizes, validates, scores and allows private consumers to inject ports', async () => {
  const events = [];
  const catalogs = new Map();
  const scans = new Map();
  let credentialsUsed = false;
  const report = await scanStore('https://demo.example/', {
    http: {
      async get(url) {
        return {
          url,
          status: pages[url] ? 200 : 404,
          body: pages[url] ?? '',
          headers: {},
        };
      },
    },
    clock: { now: () => new Date('2026-10-07T00:00:00Z') },
    eventSink: {
      emit(event) {
        events.push(event.type);
      },
    },
    catalogRepository: {
      async save(c) {
        catalogs.set(c.id, c);
      },
      async get(id) {
        return catalogs.get(id);
      },
      async list() {
        return [...catalogs.values()];
      },
    },
    scanRepository: {
      async save(r) {
        scans.set(r.scanId, r);
      },
      async get(id) {
        return scans.get(id);
      },
    },
    credentials: {
      async get() {
        credentialsUsed = true;
        return undefined;
      },
    },
  });
  assert.equal(report.productsNormalized, 1);
  assert.equal(report.catalog.products[0].name, 'Waterproof Trail Shoe');
  assert.equal(report.failures, 0);
  assert.ok(report.score.overall > 0);
  assert.deepEqual(events, ['started', 'product', 'completed']);
  assert.equal(catalogs.size, 1);
  assert.equal(scans.size, 1);
  assert.equal(credentialsUsed, false);
});
test('invalid limits and unsafe targets fail before fetching', async () => {
  await assert.rejects(scanStore('http://127.0.0.1/'));
  await assert.rejects(
    scanStore('https://demo.example', { limit: 0 }),
    /limit/,
  );
});
