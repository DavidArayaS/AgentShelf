// SPDX-License-Identifier: Apache-2.0
import { performance } from 'node:perf_hooks';
import { generatePrivateCatalog } from '@agentshelf/testing';
import { normalizeCatalog, validateCatalog } from '@agentshelf/core';
import { searchProducts, MemoryQueryEngine } from '@agentshelf/query-engine';
const size = Number(process.argv[2]);
if (![100, 10000, 100000].includes(size))
  throw new Error('Unsupported benchmark size');
const catalog = generatePrivateCatalog(size);
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
    searchProducts(catalog, {
      query: 'running shoes',
      maxPrice: 150,
      currency: 'USD',
      availability: 'in_stock',
    }).total,
);
measure('engineConstruction', () => {
  new MemoryQueryEngine(catalog);
  return size;
});
measure(
  'filteredVariantSearch',
  () =>
    searchProducts(catalog, {
      query: 'running shoes size 10 under $150',
      availability: 'in_stock',
    }).total,
);
measure('serialization', () => Buffer.byteLength(JSON.stringify(catalog)));
console.log(
  JSON.stringify({ size, timings, peakRssKiB: process.resourceUsage().maxRSS }),
);
