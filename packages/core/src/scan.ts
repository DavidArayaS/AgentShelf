// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import {
  CatalogSchema,
  AcquisitionMetadataSchema,
  stableId,
  type AcquisitionMetadata,
  type Catalog,
} from '@agentshelf/schema';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
import { wooCommerceConnector } from '@agentshelf/connector-woocommerce';
import {
  SafeHttpClient,
  validateRemoteUrl,
  UnsafeUrlError,
} from '@agentshelf/crawler';
import { validateCatalog } from '@agentshelf/validators';
import { scoreResults, type Score } from '@agentshelf/scoring';
import { AcquisitionError } from '@agentshelf/connector-sdk';
import type {
  EnumerationEvidence,
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
  acquisition: AcquisitionMetadata;
  issues: { code: string; message: string }[];
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
function accessMessage(code: string): string {
  return (
    (
      {
        ACCESS_RESTRICTED:
          'The store restricted access; use a merchant-authorized connector or import',
        RATE_LIMITED: 'The store rate limited acquisition',
        ROBOTS_DISALLOWED: 'The public resource is disallowed by robots.txt',
        REMOTE_UNAVAILABLE: 'The remote store is unavailable',
      } as Record<string, string>
    )[code] ?? 'Acquisition failed'
  );
}
function safeAcquisitionError(error: unknown): unknown {
  if (error instanceof AcquisitionError)
    return new AcquisitionError(error.code, accessMessage(error.code));
  return error;
}
const noOpLogger: Logger = { log() {} };
export async function scanStore(
  input: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  return acquireStore(input, options, false);
}
/** Explicit selection prevents credentialed connectors from participating in public detection. */
export async function ingestStore(
  input: string,
  options: ScanOptions & { connector: CommerceConnector },
): Promise<ScanReport> {
  if (
    options.connector.metadata.acquisition?.mode !== 'authorized_connector' ||
    options.connector.metadata.acquisition.authority !== 'merchant_authorized'
  )
    throw new Error('Ingest requires an authorized connector');
  return acquireStore(
    input,
    {
      ...options,
      limit: options.limit ?? 100000,
      connectors: [options.connector],
    },
    true,
  );
}
async function acquireStore(
  input: string,
  options: ScanOptions,
  authorized: boolean,
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
  let evidence: EnumerationEvidence = {};
  const context: ConnectorContext = {
    limit,
    maxSitemaps: 100,
    maxDepth: 5,
    clock,
    logger,
    http: {
      async get(target, signal, requestOptions) {
        pagesFetched++;
        return transport.get(target, signal, requestOptions);
      },
    },
    reportEnumeration(update) {
      evidence = { ...evidence, ...update };
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
    if (
      (candidate.metadata.acquisition?.mode === 'authorized_connector') !==
      authorized
    )
      continue;
    let detected: DetectionResult;
    try {
      detected = await candidate.detect(target, context);
    } catch (error) {
      if (authorized && !(error instanceof UnsafeUrlError))
        throw new AcquisitionError(
          error instanceof AcquisitionError ? error.code : 'REMOTE_UNAVAILABLE',
          'Authorized source could not be read',
        );
      throw error;
    }
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
  let interrupted = false;
  const issues: ScanReport['issues'] = [];
  const recordFailure = (error: unknown) => {
    if (options.signal?.aborted || error instanceof UnsafeUrlError) throw error;
    failures++;
    const code =
      error instanceof AcquisitionError ? error.code : 'REMOTE_UNAVAILABLE';
    // Private adapters can throw arbitrary errors, including secrets. Never serialize them.
    if (issues.length < 100)
      issues.push({
        code,
        message:
          error instanceof AcquisitionError
            ? accessMessage(error.code)
            : 'Product data could not be acquired',
      });
    if (warnings.length < 100) warnings.push(code);
  };
  try {
    for await (const reference of connector.discoverProducts(target, context)) {
      options.signal?.throwIfAborted();
      if (productsDiscovered >= limit) break;
      if (references.has(reference.url)) continue;
      references.add(reference.url);
      productsDiscovered++;
      try {
        const product = await connector.fetchProduct(
          reference,
          target,
          context,
        );
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        products.push(product);
        await options.eventSink?.emit({
          scanId,
          type: 'product',
          productsNormalized: products.length,
        });
      } catch (error) {
        recordFailure(error);
        if (error instanceof AcquisitionError) {
          interrupted = true;
          break;
        }
        logger.log('warning', 'scan.product_failed', {
          scanId,
          productsDiscovered,
        });
      }
    }
  } catch (error) {
    if (products.length === 0) {
      if (authorized && !(error instanceof UnsafeUrlError))
        throw new AcquisitionError(
          error instanceof AcquisitionError ? error.code : 'REMOTE_UNAVAILABLE',
          'Authorized source could not be read',
        );
      throw safeAcquisitionError(error);
    }
    recordFailure(error);
    interrupted = true;
  }
  const expected = evidence.expectedProducts;
  const exhausted = evidence.paginationExhausted === true;
  const proved =
    authorized &&
    evidence.authenticated === true &&
    exhausted &&
    expected === products.length &&
    failures === 0 &&
    !interrupted &&
    !evidence.truncated;
  const limitReached = productsDiscovered >= limit && !proved;
  const partial =
    interrupted ||
    evidence.truncated === true ||
    failures > 0 ||
    limitReached ||
    (authorized && !proved);
  const acquisition = AcquisitionMetadataSchema.parse({
    mode: authorized ? 'authorized_connector' : 'public_discovery',
    authority: authorized ? 'merchant_authorized' : 'public_observation',
    connectorId: connector.metadata.id,
    authenticated: authorized && evidence.authenticated === true,
    acquiredAt: started.toISOString(),
    coverage: {
      status: partial ? 'partial' : proved ? 'complete' : 'unknown',
      reason: partial
        ? limitReached
          ? 'Product limit reached'
          : 'Enumeration or normalization was incomplete or could not be proven'
        : proved
          ? 'Authoritative total and unique normalized products agree; pagination exhausted'
          : 'Public observation cannot prove catalog completeness',
      observedProducts: products.length,
      ...(expected !== undefined ? { expectedProducts: expected } : {}),
      ...(evidence.paginationExhausted !== undefined
        ? { paginationExhausted: exhausted }
        : {}),
      limitReached,
      truncated: partial,
      failures,
    },
  });
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
    acquisition,
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
    acquisition,
    issues,
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
