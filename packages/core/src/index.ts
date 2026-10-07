// SPDX-License-Identifier: Apache-2.0
import {
  CatalogSchema,
  ProductSchema,
  type Catalog,
  type Product,
} from '@agentshelf/schema';

export class AgentShelfError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
export class CatalogValidationError extends AgentShelfError {
  constructor(message: string, cause?: unknown) {
    super('CATALOG_VALIDATION_ERROR', message, { cause });
  }
}
export { stableId } from '@agentshelf/schema';
export function canonicalUrl(input: string): string {
  const url = new URL(input);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new CatalogValidationError(
      'Expected HTTP(S) source URL without credentials',
    );
  url.hash = '';
  return url.href;
}
export function normalizeProduct(input: unknown): Product {
  const result = ProductSchema.safeParse(input);
  if (!result.success)
    throw new CatalogValidationError(
      'Product does not match canonical schema 1.0',
      result.error,
    );
  const product = result.data;
  return {
    ...product,
    name: product.name.normalize('NFC').trim(),
    url: canonicalUrl(product.url),
  };
}
/** Pure, order-preserving normalization; never invents observation timestamps or missing facts. */
export function normalizeCatalog(input: unknown): Catalog {
  const result = CatalogSchema.safeParse(input);
  if (!result.success)
    throw new CatalogValidationError(
      'Catalog does not match canonical schema 1.0',
      result.error,
    );
  return CatalogSchema.parse({
    ...result.data,
    products: result.data.products.map(normalizeProduct),
  });
}

export { validateCatalog } from '@agentshelf/validators';
export { scanStore } from './scan.js';
export type {
  ScanOptions,
  ScanReport,
  ScanRepository,
  CatalogRepository,
  EventSink,
  ScanEvent,
} from './scan.js';
