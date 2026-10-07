// SPDX-License-Identifier: Apache-2.0
import { CatalogSchema, type Catalog } from '@agentshelf/schema';
import type {
  CatalogRepository,
  ScanRepository,
  ScanReport,
} from '@agentshelf/core';
export class MemoryCatalogRepository implements CatalogRepository {
  readonly #catalogs = new Map<string, Catalog>();
  async save(catalog: Catalog): Promise<void> {
    const validated = CatalogSchema.parse(catalog);
    this.#catalogs.set(validated.id, validated);
  }
  async get(id: string): Promise<Catalog | undefined> {
    const catalog = this.#catalogs.get(id);
    return catalog ? structuredClone(catalog) : undefined;
  }
  async list(): Promise<Catalog[]> {
    return structuredClone([...this.#catalogs.values()]);
  }
}
export class MemoryScanRepository implements ScanRepository {
  readonly #scans = new Map<string, ScanReport>();
  async save(report: ScanReport): Promise<void> {
    CatalogSchema.parse(report.catalog);
    this.#scans.set(report.scanId, structuredClone(report));
  }
  async get(id: string): Promise<ScanReport | undefined> {
    const report = this.#scans.get(id);
    return report ? structuredClone(report) : undefined;
  }
}
