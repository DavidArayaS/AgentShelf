// SPDX-License-Identifier: Apache-2.0
import { CatalogSchema, type Catalog, type Product } from '@agentshelf/schema';
const kinds = [
  {
    name: 'Wireless Headphones',
    category: 'Audio',
    base: 79,
    attributes: [
      { name: 'noise_cancellation', value: true },
      { name: 'wireless', value: true },
    ],
  },
  {
    name: 'Running Shoes',
    category: 'Shoes',
    base: 65,
    attributes: [{ name: 'waterproof', value: false }],
  },
  {
    name: '4K Monitor',
    category: 'Displays',
    base: 189,
    attributes: [
      { name: 'resolution', value: '4K' },
      { name: 'refresh_rate', value: 144, unit: 'Hz' },
    ],
  },
  {
    name: 'Mirrorless Camera',
    category: 'Cameras',
    base: 699,
    attributes: [{ name: 'sensor', value: 'APS-C' }],
  },
  {
    name: 'Waterproof Hiking Shoe',
    category: 'Shoes',
    base: 89,
    attributes: [{ name: 'waterproof', value: true }],
  },
  {
    name: '32GB Laptop',
    category: 'Computers',
    base: 799,
    attributes: [
      { name: 'memory', value: 32, unit: 'GB' },
      { name: 'storage', value: 1024, unit: 'GB' },
    ],
  },
];
/** Diverse synthetic inventory. Stable PRNG, timestamps and identities make tests reproducible. */
export function generatePrivateCatalog(size = 10000, seed = 42): Catalog {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100000)
    throw new Error('Fixture size must be 1–100000');
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const observedAt = '2026-10-01T00:00:00Z';
  const shipping = {
    destinations: ['CR', 'US'],
    cost: { amount: '9.99', currency: 'USD' },
    minDays: 3,
    maxDays: 8,
  };
  const returns = {
    accepted: true,
    windowDays: 30,
    url: 'https://inventory.example/returns',
  };
  const products: Product[] = Array.from({ length: size }, (_, index) => {
    const kind = kinds[index % kinds.length];
    if (!kind) throw new Error('Missing fixture kind');
    const id = `private-product-${String(index).padStart(6, '0')}`;
    const currency = ['USD', 'USD', 'USD', 'EUR', 'CRC'][index % 5] ?? 'USD';
    const multiplier = currency === 'CRC' ? 500 : 1;
    const price = {
      amount: (
        (kind.base + Math.floor(random() * kind.base)) * multiplier +
        0.99
      ).toFixed(2),
      currency,
    };
    const availability =
      index % 7 === 0 ? ('out_of_stock' as const) : ('in_stock' as const);
    const quantity =
      availability === 'out_of_stock' ? 0 : 1 + Math.floor(random() * 80);
    const offer = {
      id: `${id}-offer`,
      price,
      availability,
      ...(index % 11 !== 0 ? { inventory: { quantity, observedAt } } : {}),
    };
    const isShoe = index % 6 === 1 || index % 6 === 4;
    const variants = isShoe
      ? ['9', '10', '11'].map((size, position) => ({
          id: `${id}-size-${size}`,
          identifiers: { sku: `${id}-${size}` },
          attributes: [
            { name: 'size', value: size },
            { name: 'color', value: position === 1 ? 'blue' : 'black' },
          ],
          offers: [
            {
              ...offer,
              id: `${id}-offer-${size}`,
              availability:
                position === 0 ? ('out_of_stock' as const) : availability,
              inventory: {
                quantity: position === 0 ? 0 : quantity,
                observedAt,
              },
            },
          ],
          images: [],
        }))
      : [];
    const brand =
      ['Northstar', 'Meridian', 'Summit', 'Harbor'][Math.floor(random() * 4)] ??
      'Northstar';
    return {
      schemaVersion: '1.0',
      id,
      merchantId: 'private-merchant',
      name: `${brand} ${kind.name} ${index}`,
      brand,
      ...(index % 17 !== 0
        ? {
            description: `${kind.name} for everyday use, with detailed specifications and model ${index}.`,
          }
        : {}),
      url: `https://inventory.example/products/${index}`,
      identifiers: { sku: `INV-${index}` },
      categories: [
        {
          id: kind.category.toLowerCase(),
          name: kind.category,
          path: ['Catalog', kind.category],
        },
      ],
      offers: isShoe ? [] : [offer],
      variants,
      images:
        index % 19 === 0
          ? []
          : [
              {
                url: `https://inventory.example/images/${index}.jpg`,
                alt: kind.name,
              },
            ],
      attributes: [
        ...kind.attributes,
        { name: 'color', value: index % 2 === 0 ? 'black' : 'blue' },
      ],
      ...(index % 13 !== 0 ? { shipping, returns } : {}),
      ...(index % 9 !== 0
        ? {
            reviews: {
              rating: {
                value: 3 + Math.floor(random() * 20) / 10,
                best: 5,
                worst: 1,
              },
              count: 1 + (index % 200),
            },
          }
        : {}),
      provenance: {
        url: 'https://inventory.example/catalog.json',
        connector: 'private-fixture',
        method: 'merchant_feed',
        observedAt,
        warnings: [],
      },
    };
  });
  return CatalogSchema.parse({
    schemaVersion: '1.0',
    id: 'private-catalog',
    merchant: {
      id: 'private-merchant',
      name: 'Private Inventory',
      url: 'https://inventory.example',
      shipping,
      returns,
    },
    products,
    generatedAt: observedAt,
  });
}
