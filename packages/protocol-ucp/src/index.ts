// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CatalogSchema, type Product, type Offer } from '@agentshelf/schema';
import {
  ProtocolValidationError,
  createJsonSchemaValidator,
  type JsonSchemaValidator,
  selectedCurrency,
  minorUnits,
  type ProtocolAdapter,
  type ProtocolOptions,
  type ProtocolSupport,
} from '@agentshelf/protocol-sdk';
export const UCP_SUPPORT: ProtocolSupport = {
  protocol: 'ucp',
  version: '2026-08-25',
  implementationVersion: '0.1.0',
  documentationUrl:
    'https://github.com/Universal-Commerce-Protocol/ucp/tree/v2026-08-25/docs/specification/shopping/catalog',
  sourceCommit: 'cd78fb38e819de77d9b527d110476eccb876f1bd',
  supportedCapabilities: [
    'dev.ucp.shopping.catalog.search',
    'dev.ucp.shopping.catalog.lookup',
    'version-pinned-product-and-variant-mapping',
  ],
  unsupportedCapabilities: [
    'checkout',
    'orders',
    'payment-handlers',
    'cart',
    'pagination',
    'seller-links',
    'unit-prices',
    'taxonomies',
    'content-sanitization',
  ],
};
export interface UcpProduct {
  id: string;
  title: string;
  description: { plain: string };
  url?: string;
  categories?: { value: string; taxonomy?: string }[];
  price_range: {
    min: { amount: number; currency: string };
    max: { amount: number; currency: string };
  };
  media?: {
    type: 'image';
    url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }[];
  variants: UcpVariant[];
}
export interface UcpVariant {
  id: string;
  title: string;
  description: { plain: string };
  url?: string;
  sku?: string;
  barcodes?: { type: string; value: string }[];
  price: { amount: number; currency: string };
  availability?: { available: boolean; status: string };
  options?: { name: string; label: string }[];
  media?: {
    type: 'image';
    url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }[];
}
export interface UcpCatalogResponse {
  ucp: { version: '2026-08-25' };
  products: UcpProduct[];
}
const schemasDirectory = fileURLToPath(
  new URL('../spec/2026-08-25/source/schemas/', import.meta.url),
);
async function schemaFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await schemaFiles(path)));
    else if (entry.name.endsWith('.json')) found.push(path);
  }
  return found.sort();
}
let validatorPromise: Promise<JsonSchemaValidator> | undefined;
async function schemaValidator() {
  const references: object[] = [];
  for (const path of await schemaFiles(schemasDirectory)) {
    const schema = JSON.parse(await readFile(path, 'utf8'));
    references.push(schema);
  }
  const root = JSON.parse(
    await readFile(`${schemasDirectory}/shopping/catalog_search.json`, 'utf8'),
  );
  const responseSchema = root.$defs.search_response;
  const responseWithBase = { ...responseSchema, $id: root.$id };
  const otherSchemas = references.filter(
    (schema) => (schema as { $id?: string }).$id !== root.$id,
  );
  return createJsonSchemaValidator(otherSchemas, responseWithBase);
}
function price(offer: Offer, currency: string) {
  if (!offer.price || offer.price.currency !== currency)
    throw new ProtocolValidationError(
      'UCP requires one priced offer in the selected currency',
    );
  return { amount: minorUnits(offer.price.amount, currency), currency };
}
const media = (product: Product) =>
  product.images.map((image) => ({
    type: 'image' as const,
    url: image.url,
    ...(image.alt ? { alt_text: image.alt } : {}),
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
  }));
function mapProduct(product: Product, currency: string): UcpProduct {
  if (!product.description)
    throw new ProtocolValidationError(
      `UCP requires a product description: ${product.id}`,
    );
  const sourceVariants = product.variants.length
    ? product.variants.map((variant) => ({
        id: variant.id,
        title: variant.name ?? product.name,
        description: product.description as string,
        url: product.url,
        sku: variant.identifiers.sku,
        identifiers: variant.identifiers,
        images: variant.images.length ? variant.images : product.images,
        attributes: variant.attributes,
        offers: variant.offers,
      }))
    : [
        {
          id: product.id,
          title: product.name,
          description: product.description,
          url: product.url,
          sku: product.identifiers.sku,
          identifiers: product.identifiers,
          images: product.images,
          attributes: product.attributes,
          offers: product.offers,
        },
      ];
  if (!sourceVariants.length)
    throw new ProtocolValidationError(
      `UCP requires at least one priced variant: ${product.id}`,
    );
  const variants: UcpVariant[] = sourceVariants.map((variant) => {
    const priced = variant.offers.filter(
      (offer) => offer.price?.currency === currency,
    );
    if (priced.length !== 1)
      throw new ProtocolValidationError(
        `UCP needs exactly one ${currency} price per variant: ${variant.id}`,
      );
    const offer = priced[0] as Offer;
    const selectedPrice = price(offer, currency);
    if (!variant.description.trim())
      throw new ProtocolValidationError(
        `UCP requires a variant description: ${variant.id}`,
      );
    const barcodes = variant.identifiers.gtin
      ? [{ type: 'GTIN', value: variant.identifiers.gtin }]
      : [];
    const availability =
      offer.availability === 'unknown'
        ? undefined
        : {
            available: [
              'in_stock',
              'limited_stock',
              'preorder',
              'backorder',
            ].includes(offer.availability),
            status: offer.availability,
          };
    const options = variant.attributes
      .filter(
        (attribute) =>
          typeof attribute.value === 'string' ||
          typeof attribute.value === 'number' ||
          typeof attribute.value === 'boolean',
      )
      .map((attribute) => ({
        name: attribute.name,
        label: String(attribute.value),
      }));
    return {
      id: variant.id,
      title: variant.title,
      description: { plain: variant.description },
      ...(variant.url ? { url: variant.url } : {}),
      ...(variant.sku ? { sku: variant.sku } : {}),
      ...(barcodes.length ? { barcodes } : {}),
      price: selectedPrice,
      ...(availability ? { availability } : {}),
      ...(options.length ? { options } : {}),
      ...(variant.images.length
        ? {
            media: variant.images.map((image) => ({
              type: 'image' as const,
              url: image.url,
              ...(image.alt ? { alt_text: image.alt } : {}),
              ...(image.width ? { width: image.width } : {}),
              ...(image.height ? { height: image.height } : {}),
            })),
          }
        : {}),
    };
  });
  const amounts = variants.map((variant) => variant.price.amount);
  const min = Math.min(...amounts),
    max = Math.max(...amounts);
  return {
    id: product.id,
    title: product.name,
    description: { plain: product.description },
    url: product.url,
    ...(product.categories.length
      ? {
          categories: product.categories.map((category) => ({
            value: category.path.length
              ? category.path.join(' > ')
              : category.name,
            taxonomy: 'merchant',
          })),
        }
      : {}),
    price_range: {
      min: { amount: min, currency },
      max: { amount: max, currency },
    },
    ...(product.images.length ? { media: media(product) } : {}),
    variants,
  };
}
export async function validateUcpCatalog(response: unknown): Promise<boolean> {
  if (!validatorPromise) validatorPromise = schemaValidator();
  const validator = await validatorPromise;
  return Boolean(validator(response));
}
export async function exportUcpCatalog(
  input: unknown,
  options: ProtocolOptions = {},
): Promise<UcpCatalogResponse> {
  const catalog = CatalogSchema.parse(input);
  const currencies = catalog.products.flatMap((product) =>
    [...product.offers, ...product.variants.flatMap((v) => v.offers)].flatMap(
      (offer) => (offer.price ? [offer.price.currency] : []),
    ),
  );
  const currency = selectedCurrency(currencies, options.currency);
  if (!catalog.products.length)
    throw new ProtocolValidationError(
      'UCP search responses need at least one catalog product',
    );
  if (!currency)
    throw new ProtocolValidationError('UCP requires prices and a currency');
  const response: UcpCatalogResponse = {
    ucp: { version: '2026-08-25' },
    products: catalog.products.map((product) => mapProduct(product, currency)),
  };
  if (!validatorPromise) validatorPromise = schemaValidator();
  const validator = await validatorPromise;
  const valid = validator(response);
  if (!valid)
    throw new ProtocolValidationError(
      `UCP 2026-08-25 schema rejected the catalog: ${JSON.stringify(validator.errors?.map((error) => ({ path: error.instancePath, message: error.message })))}`,
    );
  return response;
}
export const ucpAdapter: ProtocolAdapter<Promise<UcpCatalogResponse>> = {
  support: UCP_SUPPORT,
  exportCatalog: (catalog, options) => exportUcpCatalog(catalog, options),
};
export async function loadOfficialUcpSchema(
  relativePath: string,
): Promise<unknown> {
  if (
    relativePath.startsWith('/') ||
    relativePath.split('/').includes('..') ||
    !relativePath.endsWith('.json')
  )
    throw new ProtocolValidationError('Invalid official schema path');
  return JSON.parse(
    await readFile(`${schemasDirectory}/${relativePath}`, 'utf8'),
  );
}
