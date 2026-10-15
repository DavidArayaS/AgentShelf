// SPDX-License-Identifier: Apache-2.0
import {
  AcquisitionMetadataSchema,
  type Catalog,
  type AcquisitionMetadata,
} from '@agentshelf/schema';
import { normalizeCatalog } from './index.js';
import { validateCatalog } from '@agentshelf/validators';
import { scoreResults } from '@agentshelf/scoring';
import type { CatalogRepository } from './scan.js';
export interface ImportOptions {
  clock?: { now(): Date };
  catalogRepository?: CatalogRepository;
}
export interface ImportReport {
  catalog: Catalog;
  acquisition: AcquisitionMetadata;
  score: ReturnType<typeof scoreResults>;
}
/** Canonical JSON import establishes document validity, not the merchant's inventory total. */
export async function importCatalog(
  input: unknown,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const normalized = normalizeCatalog(input);
  const acquisition = AcquisitionMetadataSchema.parse({
    mode: 'direct_import',
    authority: 'merchant_provided',
    connectorId: 'canonical-json',
    authenticated: false,
    acquiredAt: (options.clock?.now() ?? new Date()).toISOString(),
    coverage: {
      status: 'unknown',
      reason:
        'All products in the supplied document were imported; merchant inventory completeness is unknown',
      observedProducts: normalized.products.length,
      limitReached: false,
      truncated: false,
      failures: 0,
    },
  });
  const catalog = { ...normalized, acquisition };
  const validation = validateCatalog(catalog);
  const score = scoreResults(
    validation.products.flatMap((product) => product.results),
  );
  await options.catalogRepository?.save(catalog);
  return { catalog, acquisition, score };
}
