// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  runConnectorContractTests,
  fixtureContext,
  demoCatalog,
  demoUrl,
} from '@agentshelf/testing';
import { catalogConnector } from '../dist/index.js';
const context = () =>
  fixtureContext({
    async get(url, signal) {
      signal?.throwIfAborted();
      return {
        url,
        status: 200,
        headers: {},
        body: JSON.stringify(demoCatalog),
      };
    },
  });
runConnectorContractTests(catalogConnector, { url: demoUrl }, context);
test('example rejects malformed catalogs and missing product references', async () => {
  await assert.rejects(
    catalogConnector.fetchProduct(
      { url: demoUrl, sourceId: 'missing' },
      { url: demoUrl },
      context(),
    ),
    /no longer exists/,
  );
  const malformed = fixtureContext({
    async get(url) {
      return { url, status: 200, headers: {}, body: '{"products":[]}' };
    },
  });
  await assert.rejects(
    Array.fromAsync(
      catalogConnector.discoverProducts({ url: demoUrl }, malformed),
    ),
  );
});
