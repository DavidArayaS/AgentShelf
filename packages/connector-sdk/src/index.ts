// SPDX-License-Identifier: Apache-2.0
import { ProductSchema, UrlSchema, type Product } from '@agentshelf/schema';
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
export interface HttpClient {
  get(url: string, signal?: AbortSignal): Promise<HttpResponse>;
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
