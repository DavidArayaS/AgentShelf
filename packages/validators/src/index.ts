// SPDX-License-Identifier: Apache-2.0
import {
  CatalogSchema,
  ProductSchema,
  type Product,
  type Catalog,
} from '@agentshelf/schema';
export const CATEGORIES = [
  'discovery',
  'machine-readability',
  'product-identity',
  'semantic-completeness',
  'pricing',
  'availability',
  'inventory',
  'variants',
  'images',
  'shipping',
  'returns',
  'reviews',
  'trust',
  'protocol-readiness',
] as const;
export type ValidationCategory = (typeof CATEGORIES)[number];
export interface ValidationResult {
  ruleId: string;
  status: 'pass' | 'fail' | 'unknown';
  severity: 'info' | 'warning' | 'critical';
  category: ValidationCategory;
  message: string;
  remediation?: string;
  evidence?: unknown;
}
export interface ValidationRule {
  id: string;
  category: ValidationCategory;
  severity: ValidationResult['severity'];
  message: string;
  remediation: string;
  evaluate(product: Product): boolean | null;
}
export function validGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  for (const [index, digit] of digits.reverse().entries())
    sum += digit * (index % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === check;
}
const known = (condition: unknown): true | null => (condition ? true : null);
export const rules: readonly ValidationRule[] = [
  {
    id: 'product.discovery.url',
    category: 'discovery',
    severity: 'critical',
    message: 'Product has a web URL',
    remediation: 'Provide a canonical product URL.',
    evaluate: (p) => Boolean(p.url),
  },
  {
    id: 'product.machine.structured',
    category: 'machine-readability',
    severity: 'warning',
    message: 'Source offers structured product data',
    remediation: 'Publish Schema.org Product JSON-LD or a public product API.',
    evaluate: (p) => p.provenance.method !== 'metadata',
  },
  {
    id: 'product.identity.gtin',
    category: 'product-identity',
    severity: 'warning',
    message: 'GTIN has a valid check digit',
    remediation: 'Supply a real assigned GTIN when applicable.',
    evaluate: (p) =>
      p.identifiers.gtin ? validGtin(p.identifiers.gtin) : null,
  },
  {
    id: 'product.semantic.description',
    category: 'semantic-completeness',
    severity: 'warning',
    message: 'Product description is available',
    remediation: 'Describe product properties and intended use.',
    evaluate: (p) => known(p.description?.trim()),
  },
  {
    id: 'product.price.present',
    category: 'pricing',
    severity: 'critical',
    message: 'A priced offer is available',
    remediation: 'Publish an exact price and currency.',
    evaluate: (p) =>
      known(
        [...p.offers, ...p.variants.flatMap((v) => v.offers)].some(
          (o) => o.price,
        ),
      ),
  },
  {
    id: 'product.availability.known',
    category: 'availability',
    severity: 'critical',
    message: 'Offer availability is known',
    remediation: 'Publish availability for every offer.',
    evaluate: (p) =>
      p.offers.length
        ? p.offers.every((o) => o.availability !== 'unknown')
        : null,
  },
  {
    id: 'product.inventory.freshness',
    category: 'inventory',
    severity: 'warning',
    message: 'Inventory observation is within 24 hours of source observation',
    remediation: 'Publish inventory quantities with recent timestamps.',
    evaluate: (p) => {
      const inventories = p.offers.flatMap((o) =>
        o.inventory ? [o.inventory] : [],
      );
      if (!inventories.length) return null;
      return inventories.every(
        (i) =>
          i.quantity !== null &&
          Date.parse(p.provenance.observedAt) - Date.parse(i.observedAt) >= 0 &&
          Date.parse(p.provenance.observedAt) - Date.parse(i.observedAt) <=
            86400000,
      );
    },
  },
  {
    id: 'product.variants.identity',
    category: 'variants',
    severity: 'warning',
    message: 'Observed variants have identifiers and option attributes',
    remediation: 'Publish SKU/GTIN/MPN and properties for each variant.',
    evaluate: (p) =>
      p.variants.length
        ? p.variants.every(
            (v) =>
              Object.keys(v.identifiers).length > 0 && v.attributes.length > 0,
          )
        : null,
  },
  {
    id: 'product.images.present',
    category: 'images',
    severity: 'warning',
    message: 'Product image is available',
    remediation: 'Publish a representative image URL.',
    evaluate: (p) => known(p.images.length),
  },
  {
    id: 'product.shipping.discoverable',
    category: 'shipping',
    severity: 'warning',
    message: 'Shipping destinations and costs are known',
    remediation: 'Publish destinations, costs and delivery ranges.',
    evaluate: (p) =>
      p.shipping
        ? p.shipping.destinations.length > 0 && p.shipping.cost !== null
        : null,
  },
  {
    id: 'product.returns.discoverable',
    category: 'returns',
    severity: 'warning',
    message: 'Return acceptance is known',
    remediation: 'Publish whether returns are accepted and applicable terms.',
    evaluate: (p) => (p.returns ? p.returns.accepted !== null : null),
  },
  {
    id: 'product.reviews.summary',
    category: 'reviews',
    severity: 'info',
    message: 'Review summary is available',
    remediation:
      'Publish authentic review totals and rating scale when available.',
    evaluate: (p) => known(p.reviews),
  },
  {
    id: 'product.provenance.present',
    category: 'trust',
    severity: 'info',
    message:
      'Source and observation time are recorded; merchant trust is not assessed',
    remediation: 'Retain original source URL and observation time.',
    evaluate: (p) => Boolean(p.provenance.url && p.provenance.observedAt),
  },
  {
    id: 'product.protocol.base',
    category: 'protocol-readiness',
    severity: 'warning',
    message:
      'Basic product data for protocol mapping is available; this is not compliance',
    remediation:
      'Publish a name, image, identifier and priced offer before attempting protocol export.',
    evaluate: (p) =>
      known(
        p.name &&
          p.images.length &&
          Object.keys(p.identifiers).length &&
          p.offers.some((o) => o.price),
      ),
  },
];
export function validateProduct(
  input: unknown,
  additionalRules: readonly ValidationRule[] = [],
): ValidationResult[] {
  const product = ProductSchema.parse(input);
  const selected = [...rules, ...additionalRules];
  if (new Set(selected.map((rule) => rule.id)).size !== selected.length)
    throw new Error('Duplicate validation rule IDs');
  return selected.map((rule) => {
    const value = rule.evaluate(product);
    return {
      ruleId: rule.id,
      status: value === null ? 'unknown' : value ? 'pass' : 'fail',
      severity: rule.severity,
      category: rule.category,
      message: rule.message,
      ...(value === true ? {} : { remediation: rule.remediation }),
    };
  });
}
export function validateCatalog(input: unknown): {
  catalog: Catalog;
  products: { productId: string; results: ValidationResult[] }[];
} {
  const catalog = CatalogSchema.parse(input);
  return {
    catalog,
    products: catalog.products.map((product) => ({
      productId: product.id,
      results: validateProduct(product),
    })),
  };
}
