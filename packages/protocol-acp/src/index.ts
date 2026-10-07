// SPDX-License-Identifier: Apache-2.0
import officialFeedSchema from '../spec/2026-04-17/json-schema/schema.feed.json' with { type: 'json' };
import {
  CatalogSchema,
  type Catalog,
  type Product,
  type Offer,
} from '@agentshelf/schema';
import {
  ProtocolValidationError,
  selectedCurrency,
  minorUnits,
  type ProtocolAdapter,
  type ProtocolSupport,
  createJsonSchemaValidator,
  type ProtocolOptions,
} from '@agentshelf/protocol-sdk';
export const ACP_SUPPORT: ProtocolSupport = {
  protocol: 'acp',
  version: '2026-04-17',
  implementationVersion: '0.1.0',
  documentationUrl:
    'https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/spec/2026-04-17',
  sourceCommit: '7fdd78df677a94dce04c770644b0fbbb1401272b',
  supportedCapabilities: [
    'catalog-feed-products',
    'feed-price-in-minor-units',
    'product-variants',
  ],
  unsupportedCapabilities: [
    'checkout',
    'cart',
    'orders',
    'payments',
    'authentication',
    'feed-service',
    'real-time-synchronization',
  ],
};
const validator = createJsonSchemaValidator([], {
  ...officialFeedSchema,
  ...officialFeedSchema.$defs.ProductsResponse,
});
export type AcpFeed = { products: AcpProduct[] };
export interface AcpProduct {
  id: string;
  title?: string;
  description?: { plain: string };
  url?: string;
  media?: {
    type: 'image';
    url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }[];
  variants: AcpVariant[];
}
export interface AcpVariant {
  id: string;
  title: string;
  description?: { plain: string };
  url?: string;
  barcodes?: { type: string; value: string }[];
  price?: { amount: number; currency: string };
  availability?: { available?: boolean; status?: string };
  categories?: { value: string; taxonomy: 'merchant' }[];
  variant_options?: { name: string; value: string }[];
  media?: {
    type: 'image';
    url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }[];
}
function offers(product: Product) {
  return [
    ...product.offers,
    ...product.variants.flatMap((variant) => variant.offers),
  ]
    .filter((offer) => offer.price)
    .map((offer) => ({ offer, currency: offer.price?.currency ?? '' }));
}
function mapVariant(
  product: Product,
  id: string,
  title: string,
  offer: Offer | undefined,
  currency: string | undefined,
  images = product.images,
  attributes = product.attributes,
  identifiers = product.identifiers,
  url = product.url,
) {
  const price = offer?.price;
  const barcodes = identifiers.gtin
    ? [{ type: 'GTIN', value: identifiers.gtin }]
    : [];
  const availability =
    offer && offer.availability !== 'unknown'
      ? {
          available:
            offer.availability === 'in_stock' ||
            offer.availability === 'limited_stock' ||
            offer.availability === 'preorder' ||
            offer.availability === 'backorder',
          status: offer.availability,
        }
      : undefined;
  const selectedPrice =
    price && price.currency === currency
      ? {
          amount: minorUnits(price.amount, price.currency),
          currency: price.currency,
        }
      : undefined;
  return {
    id,
    title,
    ...(product.description
      ? { description: { plain: product.description } }
      : {}),
    ...(url ? { url } : {}),
    ...(barcodes.length ? { barcodes } : {}),
    ...(selectedPrice ? { price: selectedPrice } : {}),
    ...(availability ? { availability } : {}),
    ...(product.categories.length
      ? {
          categories: product.categories.map((category) => ({
            value: category.path.length
              ? category.path.join(' > ')
              : category.name,
            taxonomy: 'merchant' as const,
          })),
        }
      : {}),
    ...(attributes.length
      ? {
          variant_options: attributes
            .filter(
              (a) =>
                typeof a.value === 'string' ||
                typeof a.value === 'number' ||
                typeof a.value === 'boolean',
            )
            .map((a) => ({ name: a.name, value: String(a.value) })),
        }
      : {}),
    ...(images.length
      ? {
          media: images.map((image) => ({
            type: 'image' as const,
            url: image.url,
            ...(image.alt ? { alt_text: image.alt } : {}),
            ...(image.width ? { width: image.width } : {}),
            ...(image.height ? { height: image.height } : {}),
          })),
        }
      : {}),
  };
}
export function exportAcpCatalog(
  input: unknown,
  options: ProtocolOptions = {},
): AcpFeed {
  const catalog = CatalogSchema.parse(input);
  const knownOffers = catalog.products.flatMap((product) => offers(product));
  const currency = selectedCurrency(
    knownOffers.map((value) => value.currency),
    options.currency,
  );
  const products = AcpFeedBuilder(catalog, currency);
  if (!validator(products)) {
    const errors =
      validator.errors
        ?.map((error) => `${error.instancePath} ${error.message}`)
        .join('; ') ?? 'Unknown official schema error';
    throw new ProtocolValidationError(
      `ACP 2026-04-17 validation failed: ${errors}`,
    );
  }
  return products as AcpFeed;
}
function AcpFeedBuilder(
  catalog: Catalog,
  currency: string | undefined,
): AcpFeed {
  const products = catalog.products.map((product) => {
    const mapped: AcpVariant[] = [];
    if (product.variants.length) {
      for (const variant of product.variants) {
        const candidates = variant.offers.filter(
          (offer) => offer.price && offer.price.currency === currency,
        );
        const other = variant.offers.filter(
          (offer) => offer.price && offer.price.currency !== currency,
        );
        if (other.length && currency === undefined)
          throw new ProtocolValidationError(
            'Select a currency to export multiple offer currencies',
          );
        if (candidates.length > 1)
          throw new ProtocolValidationError(
            'ACP feed supports one selected price per variant; multiple seller offers cannot be merged',
          );
        const offer =
          candidates[0] ??
          variant.offers.find((o) => o.availability !== 'unknown');
        mapped.push(
          mapVariant(
            product,
            variant.id,
            variant.name ?? product.name,
            offer,
            currency,
            variant.images.length ? variant.images : product.images,
            variant.attributes,
            variant.identifiers,
            offer?.url ?? product.url,
          ),
        );
      }
    } else {
      const candidates = product.offers.filter(
        (offer) => offer.price && offer.price.currency === currency,
      );
      if (candidates.length > 1)
        throw new ProtocolValidationError(
          'ACP feed supports one selected price per product',
        );
      const offer =
        candidates[0] ??
        product.offers.find((o) => o.availability !== 'unknown');
      mapped.push(
        mapVariant(product, product.id, product.name, offer, currency),
      );
    }
    return {
      id: product.id,
      ...(product.name ? { title: product.name } : {}),
      ...(product.description
        ? { description: { plain: product.description } }
        : {}),
      ...(product.url ? { url: product.url } : {}),
      ...(product.images.length
        ? {
            media: product.images.map((image) => ({
              type: 'image' as const,
              url: image.url,
              ...(image.alt ? { alt_text: image.alt } : {}),
              ...(image.width ? { width: image.width } : {}),
              ...(image.height ? { height: image.height } : {}),
            })),
          }
        : {}),
      variants: mapped,
    };
  });
  return { products };
}
export const acpAdapter: ProtocolAdapter<AcpFeed> = {
  support: ACP_SUPPORT,
  exportCatalog: exportAcpCatalog,
};
export function validateAcpFeed(value: unknown): boolean {
  return Boolean(validator(value));
}
