// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { CatalogSchema, stableId, type Catalog } from '@agentshelf/schema';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
import { wooCommerceConnector } from '@agentshelf/connector-woocommerce';
import { SafeHttpClient, validateRemoteUrl } from '@agentshelf/crawler';
import { validateCatalog } from '@agentshelf/validators';
import { scoreResults, type Score } from '@agentshelf/scoring';
import type {
  CommerceConnector,
  ConnectorContext,
  Clock,
  Logger,
  HttpClient,
  ConnectorCredentialProvider,
  DetectionResult,
} from '@agentshelf/connector-sdk';
export interface ScanEvent {
  scanId: string;
  type: 'started' | 'product' | 'completed';
  productsNormalized: number;
}
export interface EventSink {
  emit(event: ScanEvent): void | Promise<void>;
}
export interface CatalogRepository {
  save(catalog: Catalog): Promise<void>;
  get(id: string): Promise<Catalog | undefined>;
  list(): Promise<Catalog[]>;
}
export interface ScanReport {
  scanId: string;
  startedAt: string;
  durationMs: number;
  platform: DetectionResult;
  pagesFetched: number;
  productsDiscovered: number;
  productsNormalized: number;
  warnings: string[];
  failures: number;
  catalog: Catalog;
  score: Score;
}
export interface ScanRepository {
  save(report: ScanReport): Promise<void>;
  get(id: string): Promise<ScanReport | undefined>;
}
export interface ScanOptions {
  limit?: number;
  http?: HttpClient;
  clock?: Clock;
  logger?: Logger;
  eventSink?: EventSink;
  credentials?: ConnectorCredentialProvider;
  connectors?: readonly CommerceConnector[];
  catalogRepository?: CatalogRepository;
  scanRepository?: ScanRepository;
  signal?: AbortSignal;
}
const noOpLogger: Logger = { log() {} };
export async function scanStore(
  input: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  const url = validateRemoteUrl(input).href;
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000)
    throw new Error('Product limit must be an integer between 1 and 100000');
  const clock = options.clock ?? { now: () => new Date() };
  const started = clock.now();
  const scanId = randomUUID();
  const logger = options.logger ?? noOpLogger;
  const transport = options.http ?? new SafeHttpClient();
  let pagesFetched = 0;
  const context: ConnectorContext = {
    limit,
    maxSitemaps: 100,
    maxDepth: 5,
    clock,
    logger,
    http: {
      async get(target, signal) {
        pagesFetched++;
        return transport.get(target, signal);
      },
    },
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {}),
  };
  const target = { url };
  await options.eventSink?.emit({
    scanId,
    type: 'started',
    productsNormalized: 0,
  });
  logger.log('info', 'scan.started', { scanId });
  const connectors = options.connectors ?? [
    wooCommerceConnector,
    genericWebConnector,
  ];
  let platform: DetectionResult = {
    platform: 'unknown',
    confidence: 0,
    signals: [],
  };
  let connector: CommerceConnector | undefined;
  for (const candidate of connectors) {
    const detected = await candidate.detect(target, context);
    if (
      detected.confidence >= platform.confidence &&
      (!connector || detected.confidence > platform.confidence)
    ) {
      if (
        candidate.metadata.platforms.includes(detected.platform) ||
        candidate.metadata.id === 'generic-web'
      ) {
        platform = detected;
        connector = candidate;
      }
    }
  }
  if (!connector)
    throw new Error(`No connector registered for ${platform.platform}`);
  const products: Catalog['products'] = [];
  const seen = new Set<string>();
  const references = new Set<string>();
  const warnings: string[] = [];
  let productsDiscovered = 0;
  let failures = 0;
  for await (const reference of connector.discoverProducts(target, context)) {
    options.signal?.throwIfAborted();
    if (productsDiscovered >= limit) break;
    if (references.has(reference.url)) continue;
    references.add(reference.url);
    productsDiscovered++;
    try {
      const product = await connector.fetchProduct(reference, target, context);
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
      await options.eventSink?.emit({
        scanId,
        type: 'product',
        productsNormalized: products.length,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      failures++;
      if (warnings.length < 100)
        warnings.push(
          error instanceof Error ? error.name : 'Product extraction failed',
        );
      logger.log('warning', 'scan.product_failed', {
        scanId,
        productsDiscovered,
      });
    }
  }
  const merchantId = stableId('merchant', new URL(url).origin);
  const catalog = CatalogSchema.parse({
    schemaVersion: '1.0',
    id: stableId('catalog', new URL(url).origin),
    merchant: {
      id: merchantId,
      name: new URL(url).hostname,
      url: new URL(url).origin,
    },
    products,
    generatedAt: started.toISOString(),
  });
  const validation = validateCatalog(catalog);
  const report: ScanReport = {
    scanId,
    startedAt: started.toISOString(),
    durationMs: Math.max(0, clock.now().getTime() - started.getTime()),
    platform,
    pagesFetched,
    productsDiscovered,
    productsNormalized: products.length,
    warnings,
    failures,
    catalog,
    score: scoreResults(
      validation.products.flatMap((product) => product.results),
    ),
  };
  await options.catalogRepository?.save(catalog);
  await options.scanRepository?.save(report);
  await options.eventSink?.emit({
    scanId,
    type: 'completed',
    productsNormalized: products.length,
  });
  logger.log('info', 'scan.completed', {
    scanId,
    durationMs: report.durationMs,
    productsNormalized: products.length,
    failures,
  });
  return report;
}
