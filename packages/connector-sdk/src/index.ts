// SPDX-License-Identifier: Apache-2.0
import {
  ProductSchema,
  UrlSchema,
  type Product,
  type AcquisitionMode,
  type CatalogAuthority,
} from '@agentshelf/schema';
export interface DetectionSignal {
  type: 'html' | 'header' | 'url';
  value: string;
}
export type Platform =
  | 'woocommerce'
  | 'shopify'
  | 'wix'
  | 'squarespace'
  | 'magento'
  | 'bigcommerce'
  | 'vtex'
  | 'tiendanube'
  | 'prestashop'
  | 'shopware'
  | 'custom'
  | 'unknown';
export interface DetectionResult {
  platform: Platform;
  confidence: number;
  signals: DetectionSignal[];
}
export interface StoreTarget {
  url: string;
}
export interface ProductReference {
  url: string;
  sourceId?: string;
}
export interface ConnectorMetadata {
  id: string;
  version: string;
  platforms: readonly Platform[];
  /** Omitted only for compatibility with pre-refactor public connectors. */
  acquisition?: {
    mode: Exclude<AcquisitionMode, 'direct_import'>;
    authority: Exclude<CatalogAuthority, 'merchant_provided'>;
  };
}
export interface Clock {
  now(): Date;
}
export interface Logger {
  log(
    level: 'info' | 'warning' | 'error',
    event: string,
    fields: Readonly<Record<string, string | number | boolean>>,
  ): void;
}
export interface ConnectorCredentialProvider {
  get(
    connectorId: string,
    origin: string,
  ): Promise<Readonly<Record<string, string>> | undefined>;
}
export interface HttpResponse {
  url: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}
export interface HttpRequestOptions {
  /** Only HTTPS; transports must refuse redirects when this is present. */
  authorization?: string;
}
export interface EnumerationEvidence {
  authenticated?: boolean;
  expectedProducts?: number;
  paginationExhausted?: boolean;
  truncated?: boolean;
}
export type AccessFailureCode =
  | 'ROBOTS_DISALLOWED'
  | 'ACCESS_RESTRICTED'
  | 'RATE_LIMITED'
  | 'REMOTE_UNAVAILABLE';
export class AcquisitionError extends Error {
  constructor(
    readonly code: AccessFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'AcquisitionError';
  }
}
/** Do not include remote bodies, URLs, or credentials in errors. */
export function assertReadableResponse(
  response: HttpResponse,
  resource = 'Store',
): void {
  if (response.status >= 200 && response.status < 300) return;
  const code: AccessFailureCode = [401, 403].includes(response.status)
    ? 'ACCESS_RESTRICTED'
    : response.status === 429
      ? 'RATE_LIMITED'
      : 'REMOTE_UNAVAILABLE';
  throw new AcquisitionError(
    code,
    `${resource} returned HTTP ${response.status}`,
  );
}
export interface HttpClient {
  get(
    url: string,
    signal?: AbortSignal,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse>;
}
export interface ConnectorContext {
  http: HttpClient;
  clock: Clock;
  logger: Logger;
  signal?: AbortSignal;
  limit: number;
  maxSitemaps: number;
  maxDepth: number;
  credentials?: ConnectorCredentialProvider;
  reportEnumeration?(evidence: EnumerationEvidence): void;
}
export interface CommerceConnector {
  metadata: ConnectorMetadata;
  detect(
    target: StoreTarget,
    context: ConnectorContext,
  ): Promise<DetectionResult>;
  discoverProducts(
    target: StoreTarget,
    context: ConnectorContext,
  ): AsyncIterable<ProductReference>;
  fetchProduct(
    reference: ProductReference,
    target: StoreTarget,
    context: ConnectorContext,
  ): Promise<Product>;
}
export class ConnectorError extends Error {
  readonly code = 'CONNECTOR_ERROR';
}
export class ProductParseError extends Error {
  readonly code = 'PRODUCT_PARSE_ERROR';
}
export function validateReference(
  reference: ProductReference,
): ProductReference {
  return { ...reference, url: UrlSchema.parse(reference.url) };
}
export function validateConnectorProduct(input: unknown): Product {
  return ProductSchema.parse(input);
}
