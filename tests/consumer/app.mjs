// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
  ingestStore,
  importCatalog,
  normalizeCatalog,
  validateCatalog,
} from '@agentshelf/core';
import { MemoryQueryEngine } from '@agentshelf/query-engine';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
import {
  createDemoHttp,
  demoUrl,
  createWooAdminFixture,
  wooFixtureCredentials,
  wooFixtureUrl,
} from '@agentshelf/testing';
import { wooCommerceAdminConnector } from '@agentshelf/connector-woocommerce-admin';
import { exportAcpCatalog } from '@agentshelf/protocol-acp';
import { exportUcpCatalog } from '@agentshelf/protocol-ucp';
// Test doubles of private implementations: no encrypted storage or Postgres is implemented in OSS.
class PrivateEncryptedCredentialProvider {
  reads = 0;
  async get() {
    this.reads++;
    return { example: 'fixture' };
  }
}
class PrivatePostgresCatalogRepository {
  saved = new Map();
  async save(catalog) {
    this.saved.set(catalog.id, catalog);
  }
  async get(id) {
    return this.saved.get(id);
  }
  async list() {
    return [...this.saved.values()];
  }
}
class PrivateEventSink {
  events = [];
  emit(event) {
    this.events.push(event.type);
  }
}
class PrivateConnector {
  metadata = {
    id: 'private-test',
    version: '1.0.0',
    platforms: ['custom'],
    acquisition: {
      mode: 'authorized_connector',
      authority: 'merchant_authorized',
    },
  };
  detect = genericWebConnector.detect;
  async *discoverProducts(target, context) {
    yield* genericWebConnector.discoverProducts(target, context);
    context.reportEnumeration({
      expectedProducts: 1,
      authenticated: true,
      paginationExhausted: true,
    });
  }
  async fetchProduct(ref, target, context) {
    assert.equal(
      (
        await context.credentials.get(
          'private-test',
          new URL(target.url).origin,
        )
      ).example,
      'fixture',
    );
    return genericWebConnector.fetchProduct(ref, target, context);
  }
}
const repository = new PrivatePostgresCatalogRepository(),
  events = new PrivateEventSink(),
  credentials = new PrivateEncryptedCredentialProvider();
const report = await ingestStore(demoUrl, {
  connector: new PrivateConnector(),
  http: createDemoHttp(),
  credentials,
  eventSink: events,
  catalogRepository: repository,
});
const catalog = normalizeCatalog(report.catalog);
assert.equal(report.acquisition.coverage.status, 'complete');
assert.equal(validateCatalog(catalog).products.length, 1);
assert.equal(
  (await new MemoryQueryEngine(catalog).searchProducts({ query: 'waterproof' }))
    .total,
  1,
);
assert.equal((await importCatalog(catalog)).acquisition.mode, 'direct_import');
assert.equal(exportAcpCatalog(catalog).products.length, 1);
assert.equal((await exportUcpCatalog(catalog)).products.length, 1);
assert.equal(credentials.reads, 1);
assert.equal(repository.saved.size, 1);
assert.deepEqual(events.events, ['started', 'product', 'completed']);
const authorized = await ingestStore(wooFixtureUrl, {
  connector: wooCommerceAdminConnector,
  http: createWooAdminFixture(3),
  credentials: {
    async get() {
      return wooFixtureCredentials;
    },
  },
});
assert.equal(authorized.productsNormalized, 3);
assert.equal(authorized.acquisition.coverage.status, 'complete');
await assert.rejects(
  import('@agentshelf/core/src/index.js'),
  (e) => e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
console.log(
  'Private consumer uses packaged exports and injects private credential, repository, event and connector adapters without patches.',
);
