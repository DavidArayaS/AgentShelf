// SPDX-License-Identifier: Apache-2.0
import {
  ProductSchema,
  stableId,
  type Product,
  type Offer,
} from '@agentshelf/schema';
import { parseBoundedJson, validateRemoteUrl } from '@agentshelf/crawler';
import {
  AcquisitionError,
  ProductParseError,
  assertReadableResponse,
  type CommerceConnector,
  type ConnectorContext,
  type StoreTarget,
} from '@agentshelf/connector-sdk';
const connectorId = 'woocommerce-admin';
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
function identity(value: unknown): string {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new ProductParseError('Invalid WooCommerce identity');
  return String(value);
}
function baseUrl(target: StoreTarget): URL {
  const url = validateRemoteUrl(target.url);
  if (url.protocol !== 'https:' || url.search)
    throw new AcquisitionError(
      'ACCESS_RESTRICTED',
      'Authorized WooCommerce requires a credential-free HTTPS store URL without a query',
    );
  // A store installed at /shop/ must retain its WordPress base path.
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
function endpoint(target: StoreTarget, path: string): URL {
  return new URL(`wp-json/wc/v3/${path}`, baseUrl(target));
}
async function read(
  path: string,
  target: StoreTarget,
  context: ConnectorContext,
) {
  context.signal?.throwIfAborted();
  const url = endpoint(target, path);
  try {
    const credential = await context.credentials?.get(connectorId, url.origin);
    if (
      !credential?.consumerKey ||
      !credential.consumerSecret ||
      /[:\r\n]/.test(credential.consumerKey) ||
      /[\r\n]/.test(credential.consumerSecret)
    )
      throw new AcquisitionError(
        'ACCESS_RESTRICTED',
        'Read-only WooCommerce credentials are required',
      );
    const response = await context.http.get(url.href, context.signal, {
      authorization: `Basic ${Buffer.from(`${credential.consumerKey}:${credential.consumerSecret}`).toString('base64')}`,
    });
    assertReadableResponse(response, 'WooCommerce authorized API');
    if (response.url !== url.href)
      throw new AcquisitionError(
        'ACCESS_RESTRICTED',
        'Authenticated redirects are forbidden',
      );
    context.reportEnumeration?.({ authenticated: true });
    return { data: parseBoundedJson(response.body), headers: response.headers };
  } catch (error) {
    if (context.signal?.aborted)
      throw new AcquisitionError(
        'REMOTE_UNAVAILABLE',
        'Authorized acquisition cancelled',
      );
    if (error instanceof AcquisitionError) throw error;
    throw new AcquisitionError(
      'REMOTE_UNAVAILABLE',
      'Authorized WooCommerce request failed',
    );
  }
}
function totalHeader(
  headers: Readonly<Record<string, string>>,
  key: string,
): number | undefined {
  const raw = headers[key];
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new ProductParseError('Invalid WooCommerce pagination totals');
  return Number(raw);
}
interface State {
  currency: string;
  products: Map<string, Record<string, unknown>>;
}
const states = new WeakMap<ConnectorContext, State>();
async function state(
  target: StoreTarget,
  context: ConnectorContext,
): Promise<State> {
  const existing = states.get(context);
  if (existing) return existing;
  const { data } = await read('data/currencies/current', target, context);
  const code = object(data).code;
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code))
    throw new ProductParseError('Store currency is unavailable');
  const created = {
    currency: code,
    products: new Map<string, Record<string, unknown>>(),
  };
  states.set(context, created);
  return created;
}
const plain = (value: unknown): string | undefined =>
  typeof value === 'string' && value
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || undefined
    : undefined;
function identifiers(raw: Record<string, unknown>) {
  return {
    ...(typeof raw.sku === 'string' && raw.sku ? { sku: raw.sku } : {}),
    ...(typeof raw.global_unique_id === 'string' &&
    /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(raw.global_unique_id)
      ? { gtin: raw.global_unique_id }
      : {}),
  };
}
function images(input: unknown) {
  return list(input).map((value) => {
    const image = object(value);
    return {
      url: image.src,
      ...(typeof image.alt === 'string' ? { alt: image.alt } : {}),
    };
  });
}
function offer(
  raw: Record<string, unknown>,
  id: string,
  currency: string,
  observedAt: string,
): Offer {
  // Variable parents expose an aggregate/minimum price; only concrete variation offers are searchable.
  const price =
    raw.price === '' || raw.price === undefined
      ? null
      : { amount: String(raw.price), currency };
  const availability =
    raw.stock_status === 'instock'
      ? 'in_stock'
      : raw.stock_status === 'outofstock'
        ? 'out_of_stock'
        : raw.stock_status === 'onbackorder'
          ? 'backorder'
          : 'unknown';
  return {
    id: stableId(id, 'authorized-offer'),
    price,
    availability,
    ...(raw.manage_stock === true
      ? {
          inventory: {
            quantity:
              typeof raw.stock_quantity === 'number' &&
              Number.isSafeInteger(raw.stock_quantity) &&
              raw.stock_quantity >= 0
                ? raw.stock_quantity
                : null,
            observedAt,
          },
        }
      : {}),
  };
}
export function normalizeAdminProduct(
  raw: Record<string, unknown>,
  variants: Record<string, unknown>[],
  currency: string,
  target: StoreTarget,
  context: ConnectorContext,
): Product {
  const key = identity(raw.id);
  const merchantId = stableId('merchant', baseUrl(target).origin);
  const id = stableId(merchantId, `woocommerce:${key}`);
  const observedAt = context.clock.now().toISOString();
  const brand = plain(object(list(raw.brands)[0]).name);
  const description = plain(raw.description) ?? plain(raw.short_description);
  const result = ProductSchema.safeParse({
    schemaVersion: '1.0',
    id,
    merchantId,
    name: plain(raw.name),
    url: raw.permalink,
    ...(brand ? { brand } : {}),
    ...(description ? { description } : {}),
    identifiers: identifiers(raw),
    categories: list(raw.categories).map((value) => {
      const category = object(value);
      return { id: String(category.id), name: category.name, path: [] };
    }),
    offers:
      raw.type === 'variable' || raw.type === 'grouped'
        ? []
        : [offer(raw, id, currency, observedAt)],
    images: images(raw.images),
    attributes: list(raw.attributes).map((value) => {
      const attribute = object(value);
      return { name: attribute.name, value: attribute.options };
    }),
    variants: variants.map((variant) => {
      const variantId = stableId(id, `variation:${identity(variant.id)}`);
      return {
        id: variantId,
        identifiers: identifiers(variant),
        attributes: list(variant.attributes).map((value) => {
          const attribute = object(value);
          return { name: attribute.name, value: attribute.option };
        }),
        offers: [offer(variant, variantId, currency, observedAt)],
        images: variant.image ? images([variant.image]) : [],
      };
    }),
    ...(typeof raw.average_rating === 'string' &&
    Number.isFinite(Number(raw.average_rating)) &&
    typeof raw.rating_count === 'number'
      ? {
          reviews: {
            rating:
              raw.rating_count > 0
                ? { value: Number(raw.average_rating), best: 5, worst: 0 }
                : null,
            count: raw.rating_count,
          },
        }
      : {}),
    provenance: {
      url: endpoint(target, `products/${key}`).href,
      connector: connectorId,
      observedAt,
      method: 'authorized_api',
      warnings: [],
    },
  });
  if (!result.success)
    throw new ProductParseError(
      'Authorized WooCommerce product violates canonical schema',
    );
  return result.data;
}
export const wooCommerceAdminConnector: CommerceConnector = {
  metadata: {
    id: connectorId,
    version: '0.1.0',
    platforms: ['woocommerce'],
    acquisition: {
      mode: 'authorized_connector',
      authority: 'merchant_authorized',
    },
  },
  async detect(target, context) {
    await state(target, context);
    return {
      platform: 'woocommerce',
      confidence: 1,
      signals: [
        { type: 'url', value: 'wp-json/wc/v3/data/currencies/current' },
      ],
    };
  },
  async *discoverProducts(target, context) {
    const current = await state(target, context);
    let total: number | undefined, totalPages: number | undefined;
    let evidenceConsistent = true;
    const seen = new Set<string>();
    for (let page = 1; page <= Math.ceil(context.limit / 100) + 1; page++) {
      const { data, headers } = await read(
        `products?per_page=100&page=${page}&orderby=id&order=asc&status=any`,
        target,
        context,
      );
      if (!Array.isArray(data) || data.length > 100)
        throw new ProductParseError('Invalid WooCommerce products page');
      const count = totalHeader(headers, 'x-wp-total');
      const pages = totalHeader(headers, 'x-wp-totalpages');
      if (page === 1) {
        total = count;
        totalPages = pages;
      }
      if (count !== total || pages !== totalPages) evidenceConsistent = false;
      if (total !== undefined)
        context.reportEnumeration?.({ expectedProducts: total });
      for (const item of data) {
        const raw = object(item),
          key = identity(raw.id);
        if (seen.has(key)) {
          evidenceConsistent = false;
          continue;
        }
        if (seen.size >= context.limit) return;
        seen.add(key);
        current.products.set(key, raw);
        if (typeof raw.permalink !== 'string')
          throw new ProductParseError('WooCommerce product has no permalink');
        yield { url: raw.permalink, sourceId: key };
      }
      const last =
        totalPages !== undefined ? page >= totalPages : data.length < 100;
      if (last) {
        const consistent =
          evidenceConsistent &&
          total !== undefined &&
          totalPages !== undefined &&
          totalPages === Math.ceil(total / 100) &&
          seen.size === total;
        context.reportEnumeration?.({ paginationExhausted: consistent });
        return;
      }
      if (data.length === 0 || seen.size >= context.limit) return;
    }
  },
  async fetchProduct(reference, target, context) {
    const current = await state(target, context);
    if (!reference.sourceId || !/^[1-9]\d*$/.test(reference.sourceId))
      throw new ProductParseError('Invalid product reference');
    const raw =
      current.products.get(reference.sourceId) ??
      object(
        (await read(`products/${reference.sourceId}`, target, context)).data,
      );
    if (
      identity(raw.id) !== reference.sourceId ||
      raw.permalink !== reference.url
    )
      throw new ProductParseError(
        'Product reference does not match the authorized resource',
      );
    // Release each cached raw product after use so the connector does not retain another catalog.
    current.products.delete(reference.sourceId as string);
    const variantIds = list(raw.variations).map(identity);
    const variants: Record<string, unknown>[] = [];
    if (raw.type === 'variable' && variantIds.length > 0) {
      const seen = new Set<string>();
      for (
        let page = 1;
        page <= Math.ceil(variantIds.length / 100) + 1;
        page++
      ) {
        const { data } = await read(
          `products/${identity(raw.id)}/variations?per_page=100&page=${page}&orderby=id&order=asc`,
          target,
          context,
        );
        if (
          !Array.isArray(data) ||
          data.length > 100 ||
          variants.length + data.length > 10000
        )
          throw new ProductParseError('Invalid variation page');
        for (const item of data) {
          const variant = object(item),
            key = identity(variant.id);
          if (seen.has(key)) throw new ProductParseError('Duplicate variation');
          seen.add(key);
          variants.push(variant);
        }
        if (data.length < 100 || seen.size === variantIds.length) break;
      }
      if (
        seen.size !== variantIds.length ||
        !variantIds.every((id) => seen.has(id))
      )
        throw new ProductParseError('Variation enumeration was incomplete');
    }
    return normalizeAdminProduct(
      raw,
      variants,
      current.currency,
      target,
      context,
    );
  },
};
