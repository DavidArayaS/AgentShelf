// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProductSchema, CatalogSchema } from '@agentshelf/schema';
import type {
  CommerceConnector,
  ConnectorContext,
  HttpClient,
  StoreTarget,
} from '@agentshelf/connector-sdk';
import sample from './catalog.json' with { type: 'json' };
export const demoCatalog = CatalogSchema.parse(sample);
export const demoUrl = 'https://demo.example/';
const html =
  '<!doctype html>\n<html lang="en">\n  <head>\n    <title>Waterproof Trail Shoe</title>\n    <link rel="canonical" href="https://demo.example/products/trail-shoe" />\n    <script type="application/ld+json">\n      {\n        "@context": "https://schema.org",\n        "@type": "Product",\n        "name": "Waterproof Trail Shoe",\n        "description": "A lightweight waterproof running shoe",\n        "sku": "TRAIL-1",\n        "brand": { "@type": "Brand", "name": "Example" },\n        "image": "https://demo.example/trail.jpg",\n        "category": "Shoes",\n        "offers": {\n          "@type": "Offer",\n          "price": "129.95",\n          "priceCurrency": "USD",\n          "availability": "https://schema.org/InStock"\n        },\n        "additionalProperty": [{ "name": "waterproof", "value": true }]\n      }\n    </script>\n  </head>\n  <body>\n    <h1>Waterproof Trail Shoe</h1>\n  </body>\n</html>\n';
/** Only this reserved example origin is simulated; unknown URLs fail closed. */
export function createDemoHttp(): HttpClient {
  const pages: Record<string, string> = {
    [demoUrl]: html,
    [`${demoUrl}robots.txt`]: 'User-agent: *\nAllow: /',
    [`${demoUrl}sitemap.xml`]:
      '<urlset><url><loc>https://demo.example/products/trail-shoe</loc></url></urlset>',
    [`${demoUrl}products/trail-shoe`]: html,
  };
  return {
    async get(url, signal) {
      signal?.throwIfAborted();
      if (new URL(url).origin !== new URL(demoUrl).origin)
        throw new Error('URL is outside the offline fixture');
      return {
        url,
        status: pages[url] === undefined ? 404 : 200,
        headers: {},
        body: pages[url] ?? '',
      };
    },
  };
}
export function fixtureContext(
  http: HttpClient = createDemoHttp(),
): ConnectorContext {
  return {
    http,
    clock: { now: () => new Date('2026-10-07T00:00:00Z') },
    logger: { log() {} },
    limit: 100,
    maxSitemaps: 10,
    maxDepth: 3,
  };
}
/** Authors supply representative fixtures; tests exercise the actual connector contract. */
export function runConnectorContractTests(
  connector: CommerceConnector,
  target: StoreTarget,
  createContext: () => ConnectorContext,
): void {
  test(`${connector.metadata.id}: detection and bounded unique discovery`, async () => {
    const context = createContext();
    const detection = await connector.detect(target, context);
    assert.ok(detection.confidence >= 0 && detection.confidence <= 1);
    assert.ok(Array.isArray(detection.signals));
    const refs = await collect(
      connector.discoverProducts(target, { ...context, limit: 1 }),
    );
    assert.equal(refs.length, 1);
    assert.equal(new Set(refs.map((ref) => ref.url)).size, refs.length);
  });
  test(`${connector.metadata.id}: canonical normalization and stable identity`, async () => {
    const context = createContext();
    const refs = await collect(connector.discoverProducts(target, context));
    assert.ok(refs.length > 0);
    for (const ref of refs) {
      const first = ProductSchema.parse(
        await connector.fetchProduct(ref, target, context),
      );
      const second = await connector.fetchProduct(ref, target, context);
      assert.equal(first.id, second.id);
      assert.deepEqual(
        first.variants.map((v) => v.id),
        second.variants.map((v) => v.id),
      );
      assert.ok(first.provenance.url);
    }
  });
  test(`${connector.metadata.id}: malformed or incomplete products are rejected`, async () => {
    const context = createContext();
    const references = await collect(
      connector.discoverProducts(target, context),
    );
    const reference = references[0];
    assert.ok(reference);
    for (const body of ['{', '{}']) {
      const broken = {
        ...context,
        http: {
          async get(url: string) {
            return { url, status: 200, headers: {}, body };
          },
        },
      };
      await assert.rejects(connector.fetchProduct(reference, target, broken));
    }
  });
  test(`${connector.metadata.id}: transport failures propagate`, async () => {
    const context = createContext();
    context.http = {
      async get() {
        throw new Error('fixture timeout');
      },
    };
    await assert.rejects(
      collect(connector.discoverProducts(target, context)),
      /fixture timeout/,
    );
  });
  test(`${connector.metadata.id}: cancellation stops discovery`, async () => {
    const context = createContext();
    context.signal = AbortSignal.abort(new Error('fixture cancelled'));
    const http = context.http;
    context.http = {
      async get(url, signal) {
        context.signal?.throwIfAborted();
        return http.get(url, signal);
      },
    };
    await assert.rejects(
      collect(connector.discoverProducts(target, context)),
      /fixture cancelled/,
    );
  });
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of items) result.push(item);
  return result;
}
