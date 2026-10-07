// SPDX-License-Identifier: Apache-2.0
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { normalizeCatalog, validateCatalog } from '@agentshelf/core';
import { searchProducts } from '@agentshelf/query-engine';
const size = Number(process.argv[2]);
if (![100, 10000, 100000].includes(size))
  throw new Error('Unsupported benchmark size');
const source = JSON.parse(
  readFileSync(
    new URL('../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
const catalog = {
  ...source,
  products: Array.from({ length: size }, (_, i) => ({
    ...source.products[0],
    id: `product-${i}`,
    name: `Trail shoe ${i}`,
  })),
};
const timings = {};
function measure(name, action) {
  globalThis.gc?.();
  const start = performance.now();
  const result = action();
  timings[name] = {
    ms: Math.round((performance.now() - start) * 100) / 100,
    heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    result,
  };
}
measure('normalization', () => normalizeCatalog(catalog).products.length);
measure('validation', () => validateCatalog(catalog).products.length);
measure(
  'search',
  () =>
    searchProducts(catalog, { query: 'shoe', maxPrice: 150, currency: 'USD' })
      .total,
);
measure('serialization', () => Buffer.byteLength(JSON.stringify(catalog)));
console.log(
  JSON.stringify({ size, timings, peakRssKiB: process.resourceUsage().maxRSS }),
);
