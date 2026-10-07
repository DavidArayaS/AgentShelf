// SPDX-License-Identifier: Apache-2.0
import { createRequire } from 'node:module';
import { ProductSchema, stableId, type Product } from '@agentshelf/schema';
import { parseBoundedJson, validateRemoteUrl } from '@agentshelf/crawler';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
import {
  ConnectorError,
  ProductParseError,
  type CommerceConnector,
  type ConnectorContext,
  type StoreTarget,
} from '@agentshelf/connector-sdk';
const robotsParser = createRequire(import.meta.url)(
  'robots-parser',
) as typeof import('robots-parser').default;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
function sourceId(value: unknown): string {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+$/.test(String(value))
  )
    throw new ProductParseError('Invalid WooCommerce product ID');
  return String(value);
}
async function fetchPublic(
  url: string,
  target: StoreTarget,
  context: ConnectorContext,
) {
  validateRemoteUrl(url);
  if (new URL(url).origin !== new URL(target.url).origin)
    throw new ConnectorError('Cross-origin WooCommerce API rejected');
  const robotsUrl = new URL('/robots.txt', target.url).href;
  const response = await context.http.get(robotsUrl, context.signal);
  if (![200, 404, 410].includes(response.status))
    throw new ConnectorError('robots.txt unavailable');
  const policy = robotsParser(
    robotsUrl,
    response.status === 200 ? response.body : '',
  );
  if (policy.isAllowed(url, 'AgentShelf') === false)
    throw new ConnectorError('API disallowed by robots.txt');
  return context.http.get(url, context.signal);
}
export function normalizeWooProduct(
  input: unknown,
  target: StoreTarget,
  context: ConnectorContext,
): Product {
  const raw = object(input);
  const key = sourceId(raw.id);
  const merchantId = stableId('merchant', new URL(target.url).origin);
  const id = stableId(merchantId, `woocommerce:${key}`);
  const prices = object(raw.prices);
  let price = null;
  if (prices.price !== undefined) {
    const minor = prices.currency_minor_unit;
    const amount = prices.price;
    if (
      typeof minor !== 'number' ||
      !Number.isInteger(minor) ||
      minor < 0 ||
      minor > 6 ||
      typeof amount !== 'string' ||
      !/^\d+$/.test(amount)
    )
      throw new ProductParseError('Invalid WooCommerce minor-unit price');
    const digits = BigInt(amount)
      .toString()
      .padStart(minor + 1, '0');
    price = {
      amount: minor
        ? `${digits.slice(0, -minor)}.${digits.slice(-minor)}`
        : digits,
      currency: prices.currency_code,
    };
  }
  const result = ProductSchema.safeParse({
    schemaVersion: '1.0',
    id,
    merchantId,
    name: raw.name,
    url: raw.permalink,
    identifiers: typeof raw.sku === 'string' && raw.sku ? { sku: raw.sku } : {},
    categories: list(raw.categories).map((value) => {
      const category = object(value);
      return { id: String(category.id), name: category.name, path: [] };
    }),
    offers: [
      {
        id: stableId(id, 'public-offer'),
        price,
        availability:
          raw.is_in_stock === true
            ? 'in_stock'
            : raw.is_in_stock === false
              ? 'out_of_stock'
              : 'unknown',
      },
    ],
    images: list(raw.images).map((value) => {
      const image = object(value);
      return {
        url: image.src,
        ...(typeof image.alt === 'string' ? { alt: image.alt } : {}),
      };
    }),
    attributes: list(raw.attributes).map((value) => {
      const attribute = object(value);
      return {
        name: attribute.name,
        value: list(attribute.terms).map((term) => object(term).name),
      };
    }),
    variants: list(raw.variations).map((value) => {
      const variant = object(value);
      return {
        id: stableId(id, `variation:${sourceId(variant.id)}`),
        identifiers: {},
        offers: [],
        images: [],
        attributes: list(variant.attributes).map((a) => {
          const attribute = object(a);
          return { name: attribute.name, value: attribute.value };
        }),
      };
    }),
    provenance: {
      url: new URL(`/wp-json/wc/store/v1/products/${key}`, target.url).href,
      connector: 'woocommerce',
      observedAt: context.clock.now().toISOString(),
      method: 'public_api',
      warnings: [],
    },
  });
  if (!result.success)
    throw new ProductParseError(
      'WooCommerce product violates canonical schema',
      { cause: result.error },
    );
  return result.data;
}
export const wooCommerceConnector: CommerceConnector = {
  metadata: { id: 'woocommerce', version: '0.1.0', platforms: ['woocommerce'] },
  detect: genericWebConnector.detect,
  async *discoverProducts(target, context) {
    const seen = new Set<string>();
    for (let page = 1; page <= Math.ceil(context.limit / 100) + 1; page++) {
      context.signal?.throwIfAborted();
      const url = new URL('/wp-json/wc/store/v1/products', target.url);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      const response = await fetchPublic(url.href, target, context);
      if (page === 1 && [401, 403, 404].includes(response.status)) {
        yield* genericWebConnector.discoverProducts(target, context);
        return;
      }
      if (response.status !== 200)
        throw new ConnectorError(
          `WooCommerce returned HTTP ${response.status}`,
        );
      const products = parseBoundedJson(response.body);
      if (!Array.isArray(products))
        throw new ProductParseError(
          'WooCommerce product page must be an array',
        );
      for (const value of products) {
        const raw = object(value);
        const key = sourceId(raw.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (typeof raw.permalink !== 'string')
          throw new ProductParseError('WooCommerce product has no permalink');
        yield { url: raw.permalink, sourceId: key };
        if (seen.size >= context.limit) return;
      }
      if (products.length < 100) return;
    }
  },
  async fetchProduct(reference, target, context) {
    if (!reference.sourceId)
      return genericWebConnector.fetchProduct(reference, target, context);
    const key = sourceId(reference.sourceId);
    const response = await fetchPublic(
      new URL(`/wp-json/wc/store/v1/products/${key}`, target.url).href,
      target,
      context,
    );
    if (response.status !== 200)
      throw new ConnectorError(
        `WooCommerce product returned HTTP ${response.status}`,
      );
    return normalizeWooProduct(
      parseBoundedJson(response.body),
      target,
      context,
    );
  },
};
