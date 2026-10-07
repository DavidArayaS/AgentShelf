// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  genericWebConnector,
  extractProduct,
  parseSitemap,
} from '../dist/index.js';
const html = readFileSync(
  new URL('../../../examples/demo-store/product.html', import.meta.url),
  'utf8',
);
const target = { url: 'https://demo.example/' };
function context(pages = {}) {
  const requests = [];
  return {
    requests,
    limit: 100,
    maxSitemaps: 10,
    maxDepth: 3,
    clock: { now: () => new Date('2026-10-07T00:00:00Z') },
    logger: { log() {} },
    http: {
      async get(url) {
        requests.push(url);
        const body = pages[url];
        return {
          url,
          status: body === undefined ? 404 : 200,
          headers: {},
          body: body ?? '',
        };
      },
    },
  };
}
test('extracts structured commerce deterministically without executing scripts', () => {
  const ctx = context();
  const product = extractProduct(html, target.url, target, ctx);
  assert.equal(product.name, 'Waterproof Trail Shoe');
  assert.equal(product.offers[0].price.amount, '129.95');
  assert.equal(product.offers[0].availability, 'in_stock');
  assert.equal(product.attributes[0].value, true);
  assert.deepEqual(extractProduct(html, target.url, target, ctx), product);
  const metadata =
    '<meta property="og:type" content="product"><meta property="og:title" content="Fallback">';
  assert.equal(
    extractProduct(metadata, target.url, target, ctx).provenance.method,
    'metadata',
  );
  assert.throws(
    () => extractProduct('<script>throw 1</script>', target.url, target, ctx),
    /No structured product/,
  );
});
test('nested and cyclic sitemaps are bounded, deduplicated and respect robots', async () => {
  const ctx = context({
    'https://demo.example/robots.txt':
      'User-agent: *\nDisallow: /private\nSitemap: https://demo.example/sitemap.xml',
    'https://demo.example/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://demo.example/nested.xml</loc></sitemap></sitemapindex>',
    'https://demo.example/nested.xml':
      '<urlset><url><loc>https://demo.example/products/trail-shoe</loc></url><url><loc>https://demo.example/products/trail-shoe</loc></url><url><loc>https://demo.example/private</loc></url></urlset>',
    'https://demo.example/products/trail-shoe': html,
  });
  const references = await Array.fromAsync(
    genericWebConnector.discoverProducts(target, ctx),
  );
  assert.equal(references.length, 1);
  assert.equal(
    (await genericWebConnector.fetchProduct(references[0], target, ctx)).name,
    'Waterproof Trail Shoe',
  );
  const cyclic = context({
    'https://demo.example/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://demo.example/sitemap.xml</loc></sitemap></sitemapindex>',
  });
  assert.deepEqual(
    await Array.fromAsync(genericWebConnector.discoverProducts(target, cyclic)),
    [],
  );
  assert.equal(cyclic.requests.length, 2);
});
test('discovery rejects cross-origin and private links, XML entities and URL explosions', async () => {
  for (const xml of [
    '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',
    '<x>'.repeat(40) + '</x>'.repeat(40),
    '<unclosed>',
  ])
    assert.throws(() => parseSitemap(xml));
  assert.throws(
    () =>
      parseSitemap(
        '<urlset><url><loc>https://demo.example/1</loc></url><url><loc>https://demo.example/2</loc></url></urlset>',
        1,
      ),
    /entry limit/,
  );
  for (const link of [
    'https://other.example/product',
    'http://127.0.0.1/private',
  ]) {
    const ctx = context({
      'https://demo.example/sitemap.xml': `<urlset><url><loc>${link}</loc></url></urlset>`,
    });
    await assert.rejects(
      Array.fromAsync(genericWebConnector.discoverProducts(target, ctx)),
    );
  }
});
test('malformed, missing, oversized and hostile JSON-LD fails safely', () => {
  for (const json of [
    '{',
    '{"@type":"Product"}',
    '{"@type":"Product","__proto__":{}}',
  ])
    assert.throws(() =>
      extractProduct(
        `<script type="application/ld+json">${json}</script>`,
        target.url,
        target,
        context(),
      ),
    );
  assert.throws(
    () => extractProduct('x'.repeat(2097153), target.url, target, context()),
    /too large/,
  );
});
test('variants have stable identity and multiple currencies survive extraction', () => {
  const node = {
    '@type': 'ProductGroup',
    name: 'Shirt',
    hasVariant: [
      {
        sku: 'RED',
        offers: [
          { price: '10', priceCurrency: 'USD' },
          { price: '9', priceCurrency: 'EUR' },
        ],
      },
    ],
  };
  const markup = `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
  const p = extractProduct(markup, target.url, target, context());
  assert.equal(p.variants.length, 1);
  assert.equal(p.variants[0].offers.length, 2);
  assert.equal(p.variants[0].identifiers.sku, 'RED');
});

// Reusable public contract, also consumed by community connector packages.
import { runConnectorContractTests, fixtureContext } from '@agentshelf/testing';
runConnectorContractTests(genericWebConnector, target, fixtureContext);
