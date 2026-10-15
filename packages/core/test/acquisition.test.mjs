// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanStore, ingestStore, importCatalog } from '../dist/index.js';
import { wooCommerceAdminConnector } from '@agentshelf/connector-woocommerce-admin';
import {
  createDemoHttp,
  demoCatalog,
  demoUrl,
  createWooAdminFixture,
  wooFixtureCredentials,
  wooFixtureUrl,
} from '@agentshelf/testing';
const clock = { now: () => new Date('2026-10-01T00:00:00Z') };
const credentials = {
  async get() {
    return wooFixtureCredentials;
  },
};
async function publicFixture(failAfter = Infinity) {
  const html = (await createDemoHttp().get(demoUrl)).body;
  let fetched = 0;
  return {
    async get(url) {
      const path = new URL(url).pathname;
      const body =
        path === '/robots.txt'
          ? 'User-agent: *\nAllow: /'
          : path === '/sitemap.xml'
            ? `<urlset>${Array.from({ length: 250 }, (_, i) => `<url><loc>${demoUrl}products/${i}</loc></url>`).join('')}</urlset>`
            : html
                .replaceAll('products/trail-shoe', path.slice(1))
                .replaceAll('TRAIL-1', `SKU-${path}`);
      return {
        url,
        status:
          path.startsWith('/products/') && ++fetched > failAfter ? 429 : 200,
        headers: {},
        body,
      };
    },
  };
}
test('250 public products never imply complete; explicit limit is partial', async () => {
  const full = await scanStore(demoUrl, {
    http: await publicFixture(),
    limit: 300,
    clock,
  });
  assert.equal(full.productsNormalized, 250);
  assert.equal(full.acquisition.mode, 'public_discovery');
  assert.equal(full.acquisition.authority, 'public_observation');
  assert.equal(full.acquisition.coverage.status, 'unknown');
  const limited = await scanStore(demoUrl, {
    http: await publicFixture(),
    limit: 100,
    clock,
  });
  assert.equal(limited.productsNormalized, 100);
  assert.equal(limited.acquisition.coverage.status, 'partial');
  assert.equal(limited.acquisition.coverage.limitReached, true);
});
test('public denial has a stable code; rate limiting retains observed products', async () => {
  await assert.rejects(
    scanStore(demoUrl, {
      http: {
        async get(url) {
          return {
            url,
            status: 403,
            body: 'private server details',
            headers: {},
          };
        },
      },
    }),
    (e) => e.code === 'ACCESS_RESTRICTED' && !e.message.includes('private'),
  );
  const partial = await scanStore(demoUrl, {
    http: await publicFixture(2),
    limit: 300,
  });
  assert.equal(partial.productsNormalized, 2);
  assert.equal(partial.acquisition.coverage.status, 'partial');
  assert.ok(partial.issues.some((issue) => issue.code === 'RATE_LIMITED'));
});
test('authorized totals and exhausted pages prove 250; limit100 remains partial', async () => {
  const full = await ingestStore(wooFixtureUrl, {
    connector: wooCommerceAdminConnector,
    http: createWooAdminFixture(),
    credentials,
    clock,
  });
  assert.equal(full.productsNormalized, 250);
  assert.equal(full.acquisition.mode, 'authorized_connector');
  assert.equal(full.acquisition.authority, 'merchant_authorized');
  assert.equal(full.acquisition.authenticated, true);
  assert.equal(full.acquisition.coverage.status, 'complete');
  assert.equal(full.acquisition.coverage.expectedProducts, 250);
  assert.equal(full.acquisition.coverage.paginationExhausted, true);
  assert.equal(full.catalog.products[0].variants.length, 2);
  const limited = await ingestStore(wooFixtureUrl, {
    connector: wooCommerceAdminConnector,
    http: createWooAdminFixture(),
    credentials,
    limit: 100,
  });
  assert.equal(limited.productsNormalized, 100);
  assert.equal(limited.acquisition.coverage.status, 'partial');
  assert.equal(limited.acquisition.coverage.limitReached, true);
});
test('interrupted, missing, changing and duplicated authoritative evidence cannot claim complete', async () => {
  for (const failure of [
    'rate',
    'network',
    'missing',
    'changing',
    'duplicate',
    'variation',
  ]) {
    const fixture = createWooAdminFixture();
    const report = await ingestStore(wooFixtureUrl, {
      connector: wooCommerceAdminConnector,
      credentials,
      http: {
        async get(url, signal, options) {
          if (url.includes('page=2') && url.includes('/products?')) {
            if (failure === 'rate')
              return { url, status: 429, headers: {}, body: '{}' };
            if (failure === 'network')
              throw new Error('fixture connection failed');
          }
          const response = await fixture.get(url, signal, options);
          if (failure === 'missing') response.headers = {};
          if (failure === 'changing' && url.includes('page=2'))
            response.headers['x-wp-total'] = '251';
          if (
            failure === 'duplicate' &&
            url.includes('/products?') &&
            url.includes('page=2')
          ) {
            const products = JSON.parse(response.body);
            products[0] = { ...products[0], id: 1 };
            response.body = JSON.stringify(products);
          }
          if (failure === 'variation' && url.includes('/variations?'))
            response.body = '[]';
          return response;
        },
      },
    });
    assert.equal(report.acquisition.coverage.status, 'partial', failure);
    if (failure === 'rate') assert.equal(report.issues[0].code, 'RATE_LIMITED');
    if (failure === 'variation') assert.equal(report.productsNormalized, 249);
  }
});
test('canonical import is independent of transport and replaces incoming acquisition claims', async () => {
  const saved = [];
  const report = await importCatalog(demoCatalog, {
    clock,
    catalogRepository: {
      async save(c) {
        saved.push(c);
      },
    },
  });
  assert.equal(report.acquisition.mode, 'direct_import');
  assert.equal(report.acquisition.authority, 'merchant_provided');
  assert.equal(report.acquisition.coverage.status, 'unknown');
  assert.equal(report.catalog.products.length, 1);
  assert.ok(report.score.overall > 0);
  assert.equal(saved.length, 1);
  await assert.rejects(importCatalog({}));
});
test('public scan ignores authorized connectors and credentials; private failures never leak', async () => {
  let reads = 0;
  const secret = 'fixture-secret-do-not-use';
  await assert.rejects(
    scanStore(wooFixtureUrl, {
      connectors: [wooCommerceAdminConnector],
      credentials: {
        async get() {
          reads++;
          return wooFixtureCredentials;
        },
      },
    }),
  );
  assert.equal(reads, 0);
  for (const failing of ['provider', 'transport']) {
    const logs = [],
      events = [];
    await assert.rejects(
      ingestStore(wooFixtureUrl, {
        connector: wooCommerceAdminConnector,
        credentials: {
          async get() {
            if (failing === 'provider') throw new Error(secret);
            return wooFixtureCredentials;
          },
        },
        http: {
          async get() {
            throw new Error(secret);
          },
        },
        logger: {
          log(...args) {
            logs.push(args);
          },
        },
        eventSink: {
          emit(event) {
            events.push(event);
          },
        },
      }),
      (e) =>
        !JSON.stringify({
          message: e.message,
          cause: e.cause,
          logs,
          events,
        }).includes(secret),
    );
  }
  const logs = [],
    events = [];
  const report = await ingestStore(wooFixtureUrl, {
    connector: wooCommerceAdminConnector,
    credentials,
    http: createWooAdminFixture(),
    logger: {
      log(...args) {
        logs.push(args);
      },
    },
    eventSink: {
      emit(event) {
        events.push(event);
      },
    },
  });
  for (const value of Object.values(wooFixtureCredentials))
    assert.ok(!JSON.stringify({ report, logs, events }).includes(value));
});

test('known sitemap depth truncation is partial rather than unknown', async () => {
  const base = await publicFixture();
  const report = await scanStore(demoUrl, {
    http: {
      async get(url) {
        if (new URL(url).pathname.startsWith('/sitemap')) {
          const level = Number(/sitemap(\d+)/.exec(url)?.[1] ?? 0);
          return {
            url,
            status: 200,
            headers: {},
            body: `<sitemapindex><sitemap><loc>${demoUrl}sitemap${level + 1}.xml</loc></sitemap></sitemapindex>`,
          };
        }
        return base.get(url);
      },
    },
  });
  assert.equal(report.acquisition.coverage.status, 'partial');
  assert.equal(report.acquisition.coverage.truncated, true);
});
