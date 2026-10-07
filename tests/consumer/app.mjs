// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { scanStore, normalizeCatalog, validateCatalog } from '@agentshelf/core';
import { searchProducts } from '@agentshelf/query-engine';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
import { createDemoHttp, demoUrl } from '@agentshelf/testing';
import { exportAcpCatalog } from '@agentshelf/protocol-acp';
import { exportUcpCatalog } from '@agentshelf/protocol-ucp';
const saved = new Map(),
  events = [];
let credentialReads = 0;
const connector = {
  ...genericWebConnector,
  metadata: { id: 'private-test', version: '1.0.0', platforms: ['custom'] },
  async fetchProduct(ref, target, context) {
    assert.equal(
      (await context.credentials.get('private-test', target.url)).example,
      'fixture',
    );
    return genericWebConnector.fetchProduct(ref, target, context);
  },
};
const report = await scanStore(demoUrl, {
  connectors: [connector],
  http: createDemoHttp(),
  credentials: {
    async get() {
      credentialReads++;
      return { example: 'fixture' };
    },
  },
  eventSink: {
    emit(event) {
      events.push(event.type);
    },
  },
  catalogRepository: {
    async save(catalog) {
      saved.set(catalog.id, catalog);
    },
    async get(id) {
      return saved.get(id);
    },
    async list() {
      return [...saved.values()];
    },
  },
});
const catalog = normalizeCatalog(report.catalog);
assert.equal(validateCatalog(catalog).products.length, 1);
assert.equal(searchProducts(catalog, { query: 'waterproof' }).total, 1);
assert.equal(exportAcpCatalog(catalog).products.length, 1);
assert.equal((await exportUcpCatalog(catalog)).products.length, 1);
assert.equal(credentialReads, 1);
assert.equal(saved.size, 1);
assert.deepEqual(events, ['started', 'product', 'completed']);
await assert.rejects(
  import('@agentshelf/core/src/index.js'),
  (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
console.log(
  'Private consumer imports packaged exports and injects repositories, events, credentials and connectors without patches.',
);
