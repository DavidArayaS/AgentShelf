// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  wooCommerceAdminConnector,
  normalizeAdminProduct,
} from '../dist/index.js';
import {
  runConnectorContractTests,
  fixtureContext,
  createWooAdminFixture,
  wooFixtureUrl,
  wooFixtureCredentials,
} from '@agentshelf/testing';
const target = { url: wooFixtureUrl };
const context = () => ({
  ...fixtureContext(createWooAdminFixture()),
  credentials: {
    async get(id, origin) {
      assert.equal(id, 'woocommerce-admin');
      assert.equal(origin, 'https://merchant.example');
      return wooFixtureCredentials;
    },
  },
});
test('authenticated adapter uses scoped HTTPS headers, current currency and stable normalized variants', async () => {
  const c = context();
  assert.equal(
    (await wooCommerceAdminConnector.detect(target, c)).platform,
    'woocommerce',
  );
  const refs = [];
  for await (const ref of wooCommerceAdminConnector.discoverProducts(target, c))
    refs.push(ref);
  assert.equal(refs.length, 100);
  const first = await wooCommerceAdminConnector.fetchProduct(
    refs[0],
    target,
    c,
  );
  assert.equal(first.provenance.method, 'authorized_api');
  assert.equal(first.offers.length, 0);
  assert.equal(first.variants[0].offers[0].price.amount, '179.99');
  assert.equal(first.variants[1].offers[0].availability, 'out_of_stock');
  assert.equal(first.variants[0].offers[0].inventory.quantity, 4);
  assert.equal(
    first.description,
    'Wireless headphones with active noise cancellation.',
  );
});
test('requires credentials and HTTPS; ignores remote error bodies; refuses apparent redirects', async () => {
  await assert.rejects(
    wooCommerceAdminConnector.detect(
      { url: 'http://merchant.example' },
      context(),
    ),
    (e) => e.code === 'ACCESS_RESTRICTED',
  );
  await assert.rejects(
    wooCommerceAdminConnector.detect(
      target,
      fixtureContext(createWooAdminFixture()),
    ),
    (e) => e.code === 'ACCESS_RESTRICTED',
  );
  for (const status of [401, 403, 429, 503]) {
    const c = context();
    c.http = {
      async get(url) {
        return {
          url,
          status,
          headers: {},
          body: JSON.stringify(wooFixtureCredentials),
        };
      },
    };
    await assert.rejects(
      wooCommerceAdminConnector.detect(target, c),
      (e) =>
        !e.message.includes('fixture') &&
        ['ACCESS_RESTRICTED', 'RATE_LIMITED', 'REMOTE_UNAVAILABLE'].includes(
          e.code,
        ),
    );
  }
  const c = context();
  c.http = {
    async get() {
      return {
        url: 'https://another.example',
        status: 200,
        headers: {},
        body: '{"code":"USD"}',
      };
    },
  };
  await assert.rejects(
    wooCommerceAdminConnector.detect(target, c),
    /redirects/,
  );
});
test('missing price/inventory stay unknown; malformed price and invalid identities fail', () => {
  const c = context();
  const raw = {
    id: 2,
    name: 'Item',
    permalink: `${wooFixtureUrl}item`,
    price: '',
    stock_status: 'unknown',
    attributes: [],
    images: [],
  };
  const normalized = normalizeAdminProduct(raw, [], 'USD', target, c);
  assert.equal(normalized.offers[0].price, null);
  assert.equal(normalized.offers[0].availability, 'unknown');
  assert.equal(normalized.offers[0].inventory, undefined);
  assert.throws(() =>
    normalizeAdminProduct({ ...raw, price: '-10' }, [], 'USD', target, c),
  );
  assert.throws(() =>
    normalizeAdminProduct({ ...raw, id: '2' }, [], 'USD', target, c),
  );
});

runConnectorContractTests(wooCommerceAdminConnector, target, context);
