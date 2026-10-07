// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from 'node:sqlite';
import { CatalogSchema, type Catalog } from '@agentshelf/schema';
import type { CatalogRepository } from '@agentshelf/core';
/** Local storage adapter; no SQLite types escape the CatalogRepository port. */
export class SqliteCatalogRepository implements CatalogRepository {
  readonly #db: DatabaseSync;
  constructor(filename: string) {
    this.#db = new DatabaseSync(filename);
    this.#db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS catalogs (id TEXT PRIMARY KEY, document TEXT NOT NULL)',
    );
  }
  async save(catalog: Catalog): Promise<void> {
    const parsed = CatalogSchema.parse(catalog);
    this.#db
      .prepare(
        'INSERT INTO catalogs(id,document) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',
      )
      .run(parsed.id, JSON.stringify(parsed));
  }
  async get(id: string): Promise<Catalog | undefined> {
    const row = this.#db
      .prepare('SELECT document FROM catalogs WHERE id=?')
      .get(id);
    return row
      ? CatalogSchema.parse(JSON.parse(String(row.document)))
      : undefined;
  }
  async list(): Promise<Catalog[]> {
    return this.#db
      .prepare('SELECT document FROM catalogs ORDER BY id')
      .all()
      .map((row) => CatalogSchema.parse(JSON.parse(String(row.document))));
  }
  close(): void {
    this.#db.close();
  }
}
