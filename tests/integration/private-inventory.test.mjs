// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { importCatalog, ingestStore, validateCatalog } from '@agentshelf/core';
import { MemoryQueryEngine } from '@agentshelf/query-engine';
import { startApi } from '@agentshelf/api';
import { startMcp } from '@agentshelf/mcp';
import {
  generatePrivateCatalog,
  createWooAdminFixture,
  wooFixtureCredentials,
  wooFixtureUrl,
} from '@agentshelf/testing';
import { wooCommerceAdminConnector } from '@agentshelf/connector-woocommerce-admin';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
const exec = promisify(execFile);
const queries = [
  {
    query: 'wireless headphones under $200',
    availability: 'in_stock',
    attributes: { noise_cancellation: true },
  },
  { query: 'running shoes size 10 under $150', availability: 'in_stock' },
  { query: '4K monitor in stock', brands: ['Northstar'] },
  { query: 'mirrorless camera under $2000', availability: 'in_stock' },
  {
    query: 'waterproof hiking shoe',
    attributes: { waterproof: true },
    shippingDestination: 'CR',
  },
  {
    query: '32GB laptop under $1200',
    availability: 'in_stock',
    attributes: { memory: 32 },
  },
];
function params(query) {
  return new URLSearchParams(
    Object.entries(query).map(([name, value]) => [
      name,
      typeof value === 'object'
        ? Array.isArray(value)
          ? value.join(',')
          : JSON.stringify(value)
        : String(value),
    ]),
  );
}
async function verifyInterfaces(catalog, cases) {
  const engine = new MemoryQueryEngine(catalog);
  const api = await startApi({ catalog, queryEngine: engine }, 0);
  const mcp = await startMcp({ catalog, queryEngine: engine }, 0);
  const client = new Client({ name: 'private-inventory', version: '0.1.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${mcp.server.address().port}/mcp`),
      ),
    );
    for (const query of cases) {
      const start = performance.now();
      const direct = await engine.searchProducts(query);
      assert.ok(
        performance.now() - start < 10000,
        'Local 10k query exceeded conservative 10s regression bound',
      );
      assert.ok(direct.total > 0, JSON.stringify(query));
      assert.deepEqual(await engine.searchProducts(query), direct);
      const response = await fetch(
        `http://127.0.0.1:${api.address().port}/v1/products/search?${params(query)}`,
      );
      assert.equal(response.status, 200);
      const rest = await response.json();
      const called = await client.callTool({
        name: 'search_products',
        arguments: query,
      });
      assert.equal(called.isError, undefined);
      assert.deepEqual(rest, direct);
      assert.deepEqual(called.structuredContent, direct);
      for (const product of direct.products) {
        if (query.brands) assert.ok(query.brands.includes(product.brand));
        const offers = query.query.includes('size 10')
          ? product.variants
              .filter((v) =>
                v.attributes.some((a) => a.name === 'size' && a.value === '10'),
              )
              .flatMap((v) => v.offers)
          : [...product.offers, ...product.variants.flatMap((v) => v.offers)];
        const bound = /under \$(\d+)/.exec(query.query);
        assert.ok(
          offers.some(
            (offer) =>
              (!query.availability ||
                offer.availability === query.availability) &&
              (!bound ||
                (offer.price?.currency === 'USD' &&
                  Number(offer.price.amount) <= Number(bound[1]))),
          ),
        );
        for (const [name, value] of Object.entries(query.attributes ?? {}))
          assert.ok(
            product.attributes.some(
              (a) => a.name === name && a.value === value,
            ),
          );
      }
    }
  } finally {
    await client.close();
    await mcp.close();
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
  }
}
test('seeded 10k private import produces identical deterministic engine/REST/MCP candidates', async () => {
  const catalog = generatePrivateCatalog();
  assert.equal(catalog.products.length, 10000);
  assert.deepEqual(generatePrivateCatalog(12), generatePrivateCatalog(12));
  assert.notDeepEqual(
    generatePrivateCatalog(12, 43),
    generatePrivateCatalog(12, 42),
  );
  assert.equal(new Set(catalog.products.map((p) => p.id)).size, 10000);
  assert.ok(catalog.products.some((p) => !p.description));
  const report = await importCatalog(catalog);
  assert.equal(report.acquisition.mode, 'direct_import');
  await verifyInterfaces(report.catalog, queries);
});
test('authorized WooCommerce → canonical → readiness → search → REST/MCP → official protocol exports', async () => {
  const report = await ingestStore(wooFixtureUrl, {
    connector: wooCommerceAdminConnector,
    http: createWooAdminFixture(),
    credentials: {
      async get() {
        return wooFixtureCredentials;
      },
    },
  });
  assert.equal(report.acquisition.coverage.status, 'complete');
  assert.equal(validateCatalog(report.catalog).products.length, 250);
  assert.ok(report.score.overall > 0);
  await verifyInterfaces(report.catalog, [
    {
      query: 'wireless headphones',
      maxPrice: 200,
      currency: 'USD',
      availability: 'in_stock',
    },
  ]);
  const { exportAcpCatalog } = await import('@agentshelf/protocol-acp');
  const { exportUcpCatalog } = await import('@agentshelf/protocol-ucp');
  assert.equal(exportAcpCatalog(report.catalog).products.length, 250);
  assert.equal((await exportUcpCatalog(report.catalog)).products.length, 250);
});
test('real CLI imports, searches and serves 10k private products without any crawl', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentshelf-private-'));
  let child, client;
  try {
    const input = join(directory, 'source.json'),
      output = join(directory, 'catalog.json');
    await writeFile(input, JSON.stringify(generatePrivateCatalog()));
    const cli = ['apps/cli/dist/index.js'];
    const imported = await exec(process.execPath, [
      ...cli,
      'import',
      input,
      '--output',
      output,
    ]);
    assert.match(imported.stdout, /direct_import/);
    const catalog = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(catalog.products.length, 10000);
    assert.equal(catalog.acquisition.mode, 'direct_import');
    const searched = await exec(process.execPath, [
      ...cli,
      '--json',
      'search',
      output,
      'running shoes size 10 under $150',
      '--availability',
      'in_stock',
      '--limit',
      '10',
    ]);
    const expected = new MemoryQueryEngine(catalog);
    assert.deepEqual(
      JSON.parse(searched.stdout),
      await expected.searchProducts({
        query: 'running shoes size 10 under $150',
        availability: 'in_stock',
        limit: 10,
      }),
    );
    child = spawn(
      process.execPath,
      [...cli, '--json', 'serve', output, '--port', '0', '--mcp-port', '0'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const endpoints = await new Promise((resolve, reject) => {
      let stdout = '',
        stderr = '';
      const timer = setTimeout(
        () => reject(new Error(`CLI startup timeout: ${stderr}`)),
        30000,
      );
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`CLI exit ${code}: ${stderr}`));
      });
      child.stdout.on('data', (data) => {
        stdout += data;
        try {
          const result = JSON.parse(stdout);
          clearTimeout(timer);
          resolve(result);
        } catch {
          /* wait for JSON */
        }
      });
    });
    const query = {
      query: 'wireless headphones',
      maxPrice: 200,
      currency: 'USD',
    };
    const rest = await (
      await fetch(`${endpoints.rest}/v1/products/search?${params(query)}`)
    ).json();
    client = new Client({ name: 'private-cli', version: '0.1.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoints.mcp)),
    );
    const mcp = await client.callTool({
      name: 'search_products',
      arguments: query,
    });
    assert.ok(rest.total > 0);
    assert.deepEqual(rest, await expected.searchProducts(query));
    assert.deepEqual(mcp.structuredContent, rest);
  } finally {
    await client?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('real authorized CLI never emits credentials in stdout, stderr, catalog or provenance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentshelf-credential-'));
  try {
    const preload = join(directory, 'fixture.mjs');
    const fixtureModule = new URL(
      '../../packages/testing/dist/woocommerce-admin.js',
      import.meta.url,
    ).href;
    await writeFile(
      preload,
      `
import https from 'node:https';
import dns from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { createWooAdminFixture } from ${JSON.stringify(fixtureModule)};
const fixture = createWooAdminFixture(3);
dns.lookup = async () => [{address:'8.8.8.8',family:4}];
https.request = (url, options, callback) => {
  const req = new EventEmitter();
  req.end = () => { void fixture.get(url.href, options.signal, {authorization:options.headers.authorization}).then(result => {
    const response = Readable.from([Buffer.from(result.body)]);
    response.statusCode = result.status; response.headers = result.headers; callback(response);
  }).catch(error => req.emit('error',error)); };
  return req;
};
syncBuiltinESMExports();
`,
    );
    const output = join(directory, 'catalog.json');
    const args = [
      '--import',
      preload,
      'apps/cli/dist/index.js',
      '--json',
      'ingest',
      wooFixtureUrl,
      '--connector',
      'woocommerce-admin',
      '--output',
      output,
    ];
    const result = await exec(process.execPath, args, {
      env: {
        ...process.env,
        AGENTSHELF_WC_CONSUMER_KEY: wooFixtureCredentials.consumerKey,
        AGENTSHELF_WC_CONSUMER_SECRET: wooFixtureCredentials.consumerSecret,
      },
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.acquisition.coverage.status, 'complete');
    assert.equal(report.productsNormalized, 3);
    const emitted =
      result.stdout + result.stderr + (await readFile(output, 'utf8'));
    for (const value of [
      ...Object.values(wooFixtureCredentials),
      Buffer.from(
        `${wooFixtureCredentials.consumerKey}:${wooFixtureCredentials.consumerSecret}`,
      ).toString('base64'),
    ])
      assert.ok(!emitted.includes(value));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
