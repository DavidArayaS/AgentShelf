// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const SCHEMA_VERSION = '1.0' as const;
const id = z.string().min(1).max(512);
const text = z.string().trim().min(1).max(1000);
export const UrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  );
}, 'Expected an HTTP(S) URL without credentials');
const timestamp = z.iso.datetime({ offset: true });
export const PriceSchema = z.object({
  amount: z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,6})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const AvailabilitySchema = z.enum([
  'in_stock',
  'out_of_stock',
  'preorder',
  'backorder',
  'limited_stock',
  'discontinued',
  'unknown',
]);
export const InventorySchema = z.object({
  quantity: z.number().int().nonnegative().safe().nullable(),
  observedAt: timestamp,
});
export const ProductIdentifierSchema = z.object({
  sku: text.optional(),
  gtin: z
    .string()
    .regex(/^(\d{8}|\d{12}|\d{13}|\d{14})$/)
    .optional(),
  mpn: text.optional(),
});
export const ProductImageSchema = z.object({
  url: UrlSchema,
  alt: z.string().max(2000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export const CategorySchema = z.object({
  id,
  name: text,
  path: z.array(text).max(32).default([]),
});
export const ProductAttributeSchema = z.object({
  name: text,
  value: z.union([
    z.string().max(5000),
    z.number().finite(),
    z.boolean(),
    z.array(text).max(100),
  ]),
  unit: text.optional(),
});
export const ShippingInformationSchema = z
  .object({
    destinations: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
    cost: PriceSchema.nullable(),
    minDays: z.number().int().nonnegative().nullable(),
    maxDays: z.number().int().nonnegative().nullable(),
    url: UrlSchema.optional(),
  })
  .refine(
    (v) => v.minDays === null || v.maxDays === null || v.minDays <= v.maxDays,
    'Shipping minimum must not exceed maximum',
  );
export const ReturnPolicySchema = z.object({
  accepted: z.boolean().nullable(),
  windowDays: z.number().int().nonnegative().nullable(),
  url: UrlSchema.optional(),
  description: z.string().max(10000).optional(),
});
export const RatingSchema = z
  .object({
    value: z.number().finite(),
    best: z.number().finite(),
    worst: z.number().finite(),
  })
  .refine(
    (v) => v.best > v.worst && v.value >= v.worst && v.value <= v.best,
    'Invalid rating scale',
  );
export const ReviewSummarySchema = z.object({
  rating: RatingSchema.nullable(),
  count: z.number().int().nonnegative().safe(),
});
export const SourceProvenanceSchema = z.object({
  url: UrlSchema,
  connector: text,
  observedAt: timestamp,
  method: z.enum(['structured_data', 'public_api', 'metadata', 'import']),
  warnings: z.array(z.string().max(2000)).max(100).default([]),
});
export const OfferSchema = z
  .object({
    id,
    price: PriceSchema.nullable(),
    availability: AvailabilitySchema,
    inventory: InventorySchema.optional(),
    url: UrlSchema.optional(),
    sellerId: id.optional(),
    validFrom: timestamp.optional(),
    validThrough: timestamp.optional(),
  })
  .refine(
    (v) =>
      !v.validFrom ||
      !v.validThrough ||
      Date.parse(v.validFrom) <= Date.parse(v.validThrough),
    'Invalid offer validity range',
  );
export const ProductVariantSchema = z.object({
  id,
  name: text.optional(),
  identifiers: ProductIdentifierSchema,
  attributes: z.array(ProductAttributeSchema).max(100),
  offers: z.array(OfferSchema).max(100),
  images: z.array(ProductImageSchema).max(100),
});
export const MerchantSchema = z.object({
  id,
  name: text,
  url: UrlSchema,
  description: z.string().max(10000).optional(),
  shipping: ShippingInformationSchema.optional(),
  returns: ReturnPolicySchema.optional(),
});
export const ProductSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id,
    merchantId: id,
    name: text,
    description: z.string().max(100000).optional(),
    url: UrlSchema,
    brand: text.optional(),
    manufacturer: text.optional(),
    identifiers: ProductIdentifierSchema,
    categories: z.array(CategorySchema).max(100),
    offers: z.array(OfferSchema).max(100),
    images: z.array(ProductImageSchema).max(100),
    variants: z.array(ProductVariantSchema).max(10000),
    attributes: z.array(ProductAttributeSchema).max(100),
    shipping: ShippingInformationSchema.optional(),
    returns: ReturnPolicySchema.optional(),
    reviews: ReviewSummarySchema.optional(),
    provenance: SourceProvenanceSchema,
    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
  })
  .superRefine((product, context) => {
    for (const [name, values] of [
      ['variants', product.variants],
      ['offers', product.offers],
    ] as const) {
      if (new Set(values.map((value) => value.id)).size !== values.length)
        context.addIssue({
          code: 'custom',
          path: [name],
          message: 'Duplicate identities',
        });
    }
    for (const [index, variant] of product.variants.entries()) {
      if (
        new Set(variant.offers.map((offer) => offer.id)).size !==
        variant.offers.length
      )
        context.addIssue({
          code: 'custom',
          path: ['variants', index, 'offers'],
          message: 'Duplicate offer identities',
        });
    }
  });
export const CatalogSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id,
    merchant: MerchantSchema,
    products: z.array(ProductSchema).max(100000),
    generatedAt: timestamp,
  })
  .superRefine((catalog, context) => {
    if (
      new Set(catalog.products.map((product) => product.id)).size !==
      catalog.products.length
    )
      context.addIssue({
        code: 'custom',
        path: ['products'],
        message: 'Duplicate product identities',
      });
    for (const [index, product] of catalog.products.entries())
      if (product.merchantId !== catalog.merchant.id)
        context.addIssue({
          code: 'custom',
          path: ['products', index, 'merchantId'],
          message: 'Product belongs to another merchant',
        });
  });
export type Price = z.infer<typeof PriceSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type Inventory = z.infer<typeof InventorySchema>;
export type ProductIdentifier = z.infer<typeof ProductIdentifierSchema>;
export type ProductImage = z.infer<typeof ProductImageSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type ProductAttribute = z.infer<typeof ProductAttributeSchema>;
export type ShippingInformation = z.infer<typeof ShippingInformationSchema>;
export type ReturnPolicy = z.infer<typeof ReturnPolicySchema>;
export type Rating = z.infer<typeof RatingSchema>;
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type ProductVariant = z.infer<typeof ProductVariantSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Merchant = z.infer<typeof MerchantSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
/** Structural JSON Schema; cross-record identity refinements also require CatalogSchema.parse. */
export const catalogJsonSchema = z.toJSONSchema(CatalogSchema, {
  target: 'draft-2020-12',
});

export { stableId } from './identity.js';
