// SPDX-License-Identifier: Apache-2.0
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { createRequire } from 'node:module';
const robotsParser = createRequire(import.meta.url)(
  'robots-parser',
) as typeof import('robots-parser').default;
import {
  ProductSchema,
  stableId as identity,
  type Product,
} from '@agentshelf/schema';
import { parseBoundedJson, validateRemoteUrl } from '@agentshelf/crawler';
import { detectPlatform } from '@agentshelf/platform-detection';
import {
  ConnectorError,
  ProductParseError,
  type CommerceConnector,
  type ConnectorContext,
  type StoreTarget,
  type ProductReference,
} from '@agentshelf/connector-sdk';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];
const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
function sameOrigin(input: string, base: string): string {
  const url = validateRemoteUrl(new URL(input, base).href);
  if (url.origin !== new URL(base).origin)
    throw new ConnectorError('Cross-origin discovery URL rejected');
  return url.href;
}
export function parseSitemap(
  xml: string,
  maxEntries = 1000,
): { sitemaps: string[]; products: string[] } {
  if (Buffer.byteLength(xml) > 2 * 1024 * 1024)
    throw new ConnectorError('Sitemap too large');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new ConnectorError('Sitemap DOCTYPE/entities are forbidden');
  const parser = new XMLParser({
    maxNestedTags: 32,
    parseTagValue: false,
    ignoreAttributes: true,
    removeNSPrefix: true,
  });
  const parsed = object(parser.parse(xml, true));
  const result: { sitemaps: string[]; products: string[] } = {
    sitemaps: [],
    products: [],
  };
  for (const [root, child, destination] of [
    ['sitemapindex', 'sitemap', 'sitemaps'],
    ['urlset', 'url', 'products'],
  ] as const) {
    for (const entry of array(object(parsed[root])[child])) {
      const url = string(object(entry).loc);
      if (!url) throw new ConnectorError('Missing sitemap location');
      if (url.length > 8192) throw new ConnectorError('Sitemap URL too long');
      if (result.sitemaps.length + result.products.length >= maxEntries)
        throw new ConnectorError('Sitemap entry limit');
      result[destination].push(url);
    }
  }
  return result;
}

function structuredNodes(value: unknown): Record<string, unknown>[] {
  const queue = [...array(value)];
  const result: Record<string, unknown>[] = [];
  for (let index = 0; index < queue.length; index++) {
    if (index > 10000) throw new ProductParseError('JSON-LD node limit');
    const node = object(queue[index]);
    result.push(node);
    if (node['@graph']) queue.push(...array(node['@graph']));
  }
  return result;
}
function offers(value: unknown, productId: string, base: string) {
  const output: unknown[] = [];
  for (const [index, raw] of array(value).entries()) {
    const entry = object(raw);
    if (entry.offers) {
      output.push(...offers(entry.offers, productId, base));
      continue;
    }
    const amount =
      typeof entry.price === 'number'
        ? String(entry.price)
        : string(entry.price);
    const currency = string(entry.priceCurrency);
    const availability = String(entry.availability ?? '')
      .split('/')
      .at(-1)
      ?.toLowerCase();
    const states: Record<string, string> = {
      instock: 'in_stock',
      outofstock: 'out_of_stock',
      preorder: 'preorder',
      backorder: 'backorder',
      limitedavailability: 'limited_stock',
      discontinued: 'discontinued',
    };
    output.push({
      id: identity(productId, `offer:${index}`),
      price: amount && currency ? { amount, currency } : null,
      availability: states[availability ?? ''] ?? 'unknown',
      ...(typeof entry.url === 'string'
        ? { url: new URL(entry.url, base).href }
        : {}),
    });
  }
  return output;
}
/** Extraction never evaluates script content; JSON-LD is bounded data only. */
export function extractProduct(
  html: string,
  pageUrl: string,
  target: StoreTarget,
  context: ConnectorContext,
): Product {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024)
    throw new ProductParseError('HTML too large');
  const $ = load(html);
  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      nodes.push(...structuredNodes(parseBoundedJson($(element).text())));
    } catch {
      context.logger.log('warning', 'invalid_jsonld', { url: pageUrl });
    }
  });
  const kind = (node: Record<string, unknown>, type: string) =>
    array(node['@type']).includes(type);
  let node = nodes.find(
    (value) => kind(value, 'Product') || kind(value, 'ProductGroup'),
  );
  let method = 'structured_data';
  if (!node) {
    const meta = (name: string) =>
      $(`meta[property="${name}"],meta[name="${name}"]`)
        .first()
        .attr('content');
    if (meta('og:type') !== 'product' && !meta('product:price:amount'))
      throw new ProductParseError(
        'No structured product or product metadata found',
      );
    node = {
      name: meta('og:title') ?? $('title').text(),
      description: meta('og:description') ?? meta('description'),
      image: meta('og:image'),
      offers: {
        price: meta('product:price:amount'),
        priceCurrency: meta('product:price:currency'),
      },
    };
    method = 'metadata';
  }
  const canonical = sameOrigin(
    $('link[rel="canonical"]').first().attr('href') ?? pageUrl,
    target.url,
  );
  const merchantId = identity('merchant', new URL(target.url).origin);
  const productId = identity(merchantId, string(node.productID) ?? canonical);
  const images = (value: unknown) =>
    array(value).flatMap((item) => {
      const url =
        string(item) ??
        string(object(item).url) ??
        string(object(item).contentUrl);
      return url ? [{ url: new URL(url, pageUrl).href }] : [];
    });
  const identifiers = (value: Record<string, unknown>) => ({
    ...(string(value.sku) ? { sku: value.sku } : {}),
    ...(string(value.mpn) ? { mpn: value.mpn } : {}),
    ...((string(value.gtin) ??
    string(value.gtin13) ??
    string(value.gtin12) ??
    string(value.gtin14))
      ? {
          gtin:
            string(value.gtin) ??
            string(value.gtin13) ??
            string(value.gtin12) ??
            string(value.gtin14),
        }
      : {}),
  });
  const attributes = (value: unknown) =>
    array(value).flatMap((raw) => {
      const property = object(raw);
      return string(property.name) &&
        ['string', 'number', 'boolean'].includes(typeof property.value)
        ? [{ name: property.name, value: property.value }]
        : [];
    });
  const variants = array(node.hasVariant).map((raw, index) => {
    const variant = object(raw);
    const variantId = identity(
      productId,
      string(variant.sku) ??
        string(variant.productID) ??
        string(variant['@id']) ??
        `variant:${index}`,
    );
    return {
      id: variantId,
      ...(string(variant.name) ? { name: variant.name } : {}),
      identifiers: identifiers(variant),
      attributes: attributes(variant.additionalProperty),
      images: images(variant.image),
      offers: offers(variant.offers, variantId, pageUrl),
    };
  });
  const candidate = {
    schemaVersion: '1.0',
    id: productId,
    merchantId,
    name: node.name,
    url: canonical,
    ...(string(node.description) ? { description: node.description } : {}),
    ...((string(node.brand) ?? string(object(node.brand).name))
      ? { brand: string(node.brand) ?? string(object(node.brand).name) }
      : {}),
    identifiers: identifiers(node),
    categories: array(node.category).flatMap((category) =>
      typeof category === 'string'
        ? [{ id: identity('category', category), name: category, path: [] }]
        : [],
    ),
    offers: offers(node.offers, productId, pageUrl),
    images: images(node.image),
    variants,
    attributes: attributes(node.additionalProperty),
    provenance: {
      url: pageUrl,
      connector: 'generic-web',
      observedAt: context.clock.now().toISOString(),
      method,
      warnings: [],
    },
  };
  const parsed = ProductSchema.safeParse(candidate);
  if (!parsed.success)
    throw new ProductParseError('Extracted product violates canonical schema', {
      cause: parsed.error,
    });
  return parsed.data;
}
async function robots(target: StoreTarget, context: ConnectorContext) {
  const url = new URL('/robots.txt', target.url).href;
  const response = await context.http.get(url, context.signal);
  if (
    response.status !== 404 &&
    response.status !== 410 &&
    (response.status < 200 || response.status >= 300)
  )
    throw new ConnectorError(`robots.txt unavailable (${response.status})`);
  return robotsParser(url, response.status === 200 ? response.body : '');
}
export const genericWebConnector: CommerceConnector = {
  metadata: {
    id: 'generic-web',
    version: '0.1.0',
    platforms: ['custom', 'unknown'],
  },
  async detect(target, context) {
    const response = await context.http.get(target.url, context.signal);
    if (response.status !== 200)
      throw new ConnectorError(`Store returned HTTP ${response.status}`);
    return detectPlatform(response.body, response.headers);
  },
  async *discoverProducts(target, context) {
    const policy = await robots(target, context);
    const queue = (
      policy.getSitemaps().length
        ? policy.getSitemaps()
        : [new URL('/sitemap.xml', target.url).href]
    ).map((url) => ({ url, depth: 0 }));
    const visited = new Set<string>();
    const products = new Set<string>();
    for (
      let index = 0;
      index < queue.length && visited.size < context.maxSitemaps;
      index++
    ) {
      context.signal?.throwIfAborted();
      const item = queue[index];
      if (!item || item.depth > context.maxDepth) continue;
      const url = sameOrigin(item.url, target.url);
      if (visited.has(url) || policy.isAllowed(url, 'AgentShelf') === false)
        continue;
      visited.add(url);
      const response = await context.http.get(url, context.signal);
      if (response.status === 404) continue;
      if (response.status !== 200)
        throw new ConnectorError(`Sitemap returned HTTP ${response.status}`);
      const map = parseSitemap(response.body, 10000);
      for (const nested of map.sitemaps) {
        if (queue.length >= context.maxSitemaps * 2) break;
        queue.push({
          url: sameOrigin(nested, target.url),
          depth: item.depth + 1,
        });
      }
      for (const raw of map.products) {
        const product = sameOrigin(raw, target.url);
        if (
          products.has(product) ||
          policy.isAllowed(product, 'AgentShelf') === false
        )
          continue;
        products.add(product);
        yield { url: product };
        if (products.size >= context.limit) return;
      }
    }
  },
  async fetchProduct(reference: ProductReference, target, context) {
    const url = sameOrigin(reference.url, target.url);
    const policy = await robots(target, context);
    if (policy.isAllowed(url, 'AgentShelf') === false)
      throw new ConnectorError('Product is disallowed by robots.txt');
    const response = await context.http.get(url, context.signal);
    if (response.status !== 200)
      throw new ConnectorError(`Product returned HTTP ${response.status}`);
    return extractProduct(response.body, response.url, target, context);
  },
};
