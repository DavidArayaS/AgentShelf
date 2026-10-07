// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  CatalogSchema,
  AvailabilitySchema,
  type Catalog,
  type Merchant,
  type Product,
  type ProductAttribute,
} from '@agentshelf/schema';
const decimal = z
  .union([z.string(), z.number().finite().nonnegative()])
  .transform(String)
  .refine(
    (value) => /^(0|[1-9]\d{0,14})(\.\d{1,6})?$/.test(value),
    'Expected nonnegative decimal with at most six fractional digits',
  );
const properties = z.record(
  z.string().min(1).max(200),
  z.union([z.string().max(1000), z.number().finite(), z.boolean()]),
);
export const SearchQuerySchema = z
  .strictObject({
    query: z.string().max(2000).optional(),
    minPrice: decimal.optional(),
    maxPrice: decimal.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    availability: AvailabilitySchema.optional(),
    categories: z.array(z.string().max(200)).max(100).optional(),
    brands: z.array(z.string().max(200)).max(100).optional(),
    attributes: properties.optional(),
    variantProperties: properties.optional(),
    sort: z
      .enum(['relevance', 'name', 'price_asc', 'price_desc'])
      .default('relevance'),
    offset: z.number().int().nonnegative().max(100000).default(0),
    limit: z.number().int().min(1).max(1000).default(50),
  })
  .superRefine((query, ctx) => {
    if (
      (query.minPrice !== undefined ||
        query.maxPrice !== undefined ||
        query.sort.startsWith('price_')) &&
      !query.currency
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Currency is required for price filters or sorting',
      });
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      amount(query.minPrice) > amount(query.maxPrice)
    )
      ctx.addIssue({ code: 'custom', message: 'minPrice exceeds maxPrice' });
  });
export type SearchQuery = z.input<typeof SearchQuerySchema>;
export interface SearchResult {
  schemaVersion: '1.0';
  products: Product[];
  total: number;
  offset: number;
  limit: number;
}
export interface QueryEngine {
  replaceCatalog?(catalog: Catalog): Promise<void>;
  getMerchant?(): Promise<Merchant>;
  searchProducts(query: SearchQuery): Promise<SearchResult>;
  getProduct(id: string): Promise<Product | undefined>;
}
function amount(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
const fold = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
function matchesProperties(
  attributes: ProductAttribute[],
  requested: Record<string, string | number | boolean> | undefined,
): boolean {
  return (
    !requested ||
    Object.entries(requested).every(([name, value]) =>
      attributes.some(
        (attribute) =>
          fold(attribute.name) === fold(name) &&
          (Array.isArray(attribute.value)
            ? attribute.value.some(
                (v) => typeof value === 'string' && fold(v) === fold(value),
              )
            : typeof value === 'string' && typeof attribute.value === 'string'
              ? fold(attribute.value) === fold(value)
              : attribute.value === value),
      ),
    )
  );
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Pure deterministic search. Related availability and price filters must match the same offer. */
export function searchProducts(
  catalog: Catalog,
  input: SearchQuery = {},
): SearchResult {
  const query = SearchQuerySchema.parse(input);
  const normalized = fold(query.query ?? '').replace(
    /\b(?:under|below|over|above)\s*\$?\d+(?:\.\d+)?/g,
    '',
  );
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const rows: { product: Product; relevance: number; price: bigint | null }[] =
    [];
  for (const product of catalog.products) {
    if (
      query.brands?.length &&
      !query.brands.some((brand) => fold(brand) === fold(product.brand ?? ''))
    )
      continue;
    if (
      query.categories?.length &&
      !query.categories.some((category) =>
        product.categories.some(
          (c) => fold(c.name) === fold(category) || c.id === category,
        ),
      )
    )
      continue;
    if (!matchesProperties(product.attributes, query.attributes)) continue;
    const variants = product.variants.filter((variant) =>
      matchesProperties(variant.attributes, query.variantProperties),
    );
    if (query.variantProperties && variants.length === 0) continue;
    const offers = [
      ...(query.variantProperties ? [] : product.offers),
      ...variants.flatMap((variant) => variant.offers),
    ];
    const matched = offers.filter(
      (offer) =>
        (!query.currency || offer.price?.currency === query.currency) &&
        (!query.availability || offer.availability === query.availability) &&
        (query.minPrice === undefined ||
          Boolean(
            offer.price && amount(offer.price.amount) >= amount(query.minPrice),
          )) &&
        (query.maxPrice === undefined ||
          Boolean(
            offer.price && amount(offer.price.amount) <= amount(query.maxPrice),
          )),
    );
    if (
      (query.currency ||
        query.availability ||
        query.minPrice !== undefined ||
        query.maxPrice !== undefined) &&
      !matched.length
    )
      continue;
    const searchable = fold(
      [
        product.name,
        product.description,
        product.brand,
        ...product.categories.map((c) => c.name),
        ...product.attributes.map((a) => `${a.name} ${a.value}`),
      ].join(' '),
    );
    if (!tokens.every((token) => searchable.includes(token))) continue;
    const prices = matched.flatMap((offer) =>
      offer.price ? [amount(offer.price.amount)] : [],
    );
    rows.push({
      product,
      relevance: tokens.reduce(
        (score, token) => score + (fold(product.name).includes(token) ? 3 : 1),
        0,
      ),
      price: prices.length
        ? prices.reduce((min, value) => (value < min ? value : min))
        : null,
    });
  }
  rows.sort((a, b) => {
    let order = 0;
    if (query.sort === 'name')
      order = compare(fold(a.product.name), fold(b.product.name));
    else if (query.sort.startsWith('price_')) {
      if (a.price === null) order = b.price === null ? 0 : 1;
      else if (b.price === null) order = -1;
      else
        order =
          (a.price < b.price ? -1 : a.price > b.price ? 1 : 0) *
          (query.sort === 'price_desc' ? -1 : 1);
    } else order = b.relevance - a.relevance;
    return order || compare(a.product.id, b.product.id);
  });
  return {
    schemaVersion: '1.0',
    products: rows
      .slice(query.offset, query.offset + query.limit)
      .map((row) => structuredClone(row.product)),
    total: rows.length,
    offset: query.offset,
    limit: query.limit,
  };
}
export class MemoryQueryEngine implements QueryEngine {
  #catalog: Catalog;
  constructor(catalog: Catalog) {
    this.#catalog = CatalogSchema.parse(catalog);
  }
  async replaceCatalog(catalog: Catalog): Promise<void> {
    this.#catalog = CatalogSchema.parse(catalog);
  }
  async getMerchant(): Promise<Merchant> {
    return structuredClone(this.#catalog.merchant);
  }
  async searchProducts(query: SearchQuery): Promise<SearchResult> {
    return searchProducts(this.#catalog, query);
  }
  async getProduct(id: string): Promise<Product | undefined> {
    const product = this.#catalog.products.find(
      (candidate) => candidate.id === id,
    );
    return product ? structuredClone(product) : undefined;
  }
}
