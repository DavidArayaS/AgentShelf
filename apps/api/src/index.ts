// SPDX-License-Identifier: Apache-2.0
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  CatalogSchema,
  catalogJsonSchema,
  type Catalog,
} from '@agentshelf/schema';
import {
  MemoryQueryEngine,
  SearchQuerySchema,
  type QueryEngine,
} from '@agentshelf/query-engine';
import {
  MemoryCatalogRepository,
  MemoryScanRepository,
} from '@agentshelf/storage-memory';
import {
  scanStore,
  validateCatalog,
  type ScanOptions,
  type CatalogRepository,
  type ScanRepository,
} from '@agentshelf/core';
import { parseBoundedJson } from '@agentshelf/crawler';
import { exportAcpCatalog } from '@agentshelf/protocol-acp';
import { exportUcpCatalog } from '@agentshelf/protocol-ucp';
export interface ApiOptions {
  catalog: Catalog;
  queryEngine?: QueryEngine;
  catalogRepository?: CatalogRepository;
  scanRepository?: ScanRepository;
  scanOptions?: ScanOptions;
  browserOrigin?: string;
}
class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
};
export const openApi: Readonly<Record<string, unknown>> = {
  openapi: '3.1.0',
  info: { title: 'AgentShelf local API', version: '0.1.0' },
  paths: Object.fromEntries(
    [
      ['/v1/products', 'get'],
      ['/v1/products/search', 'get'],
      ['/v1/products/{id}', 'get'],
      ['/v1/catalogs/{id}', 'get'],
      ['/v1/scans', 'post'],
      ['/v1/scans/{id}', 'get'],
      ['/v1/validate', 'post'],
      ['/v1/exports/json', 'get'],
      ['/v1/exports/acp', 'get'],
      ['/v1/exports/ucp', 'get'],
    ].map(([path, method]) => [
      path,
      {
        [method ?? 'get']: {
          ...(path?.includes('{id}')
            ? {
                parameters: [
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                  },
                ],
              }
            : {}),
          responses: {
            '200': { description: 'Version 1.0 JSON response' },
            '400': {
              description: 'Invalid request',
              content: { 'application/json': { schema: errorSchema } },
            },
            '404': {
              description: 'Resource not found',
              content: { 'application/json': { schema: errorSchema } },
            },
          },
        },
      },
    ]),
  ),
  components: { schemas: { Catalog: catalogJsonSchema, Error: errorSchema } },
};
async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Use application/json', 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > 1024 * 1024)
      throw new ApiError('BODY_TOO_LARGE', 'Request body exceeds 1 MiB', 413);
    chunks.push(data);
  }
  return parseBoundedJson(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    1024 * 1024,
  );
}
function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}
export async function createApi(options: ApiOptions): Promise<Server> {
  const catalog = CatalogSchema.parse(options.catalog);
  let activeCatalog = catalog;
  let engine = options.queryEngine ?? new MemoryQueryEngine(catalog);
  const catalogs = options.catalogRepository ?? new MemoryCatalogRepository();
  const scans = options.scanRepository ?? new MemoryScanRepository();
  await catalogs.save(catalog);
  const server = createServer(
    { maxHeaderSize: 16384, requestTimeout: 15000 },
    (request, response) => {
      const requestId = randomUUID();
      response.setHeader('x-request-id', requestId);
      void (async () => {
        const origin = request.headers.origin;
        if (origin && origin !== options.browserOrigin)
          throw new ApiError(
            'ORIGIN_FORBIDDEN',
            'Browser origin is not allowed',
            403,
          );
        if (origin) response.setHeader('access-control-allow-origin', origin);
        const host = request.headers.host ?? '';
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
          throw new ApiError(
            'HOST_FORBIDDEN',
            'This is a local developer API',
            403,
          );
        const url = new URL(request.url ?? '/', 'http://localhost');
        const path = url.pathname;
        if (request.method === 'OPTIONS' && origin === options.browserOrigin) {
          response.writeHead(204, {
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
            'access-control-max-age': '300',
            vary: 'Origin',
          });
          response.end();
          return;
        }
        if (request.method === 'OPTIONS')
          throw new ApiError(
            'ORIGIN_FORBIDDEN',
            'Preflight origin is not allowed',
            403,
          );
        if (request.method === 'GET' && path === '/health') {
          send(response, 200, { status: 'ok', schemaVersion: '1.0' });
          return;
        }
        if (request.method === 'GET' && path === '/openapi.json') {
          send(response, 200, openApi);
          return;
        }
        if (
          request.method === 'GET' &&
          (path === '/v1/products' || path === '/v1/products/search')
        ) {
          const raw: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams) {
            if (key in raw)
              throw new ApiError(
                'INVALID_QUERY',
                'Duplicate query parameter',
                400,
              );
            raw[key] = ['offset', 'limit'].includes(key)
              ? Number(value)
              : ['brands', 'categories'].includes(key)
                ? value.split(',')
                : ['attributes', 'variantProperties'].includes(key)
                  ? parseBoundedJson(value, 8192)
                  : value;
          }
          send(
            response,
            200,
            await engine.searchProducts(SearchQuerySchema.parse(raw)),
          );
          return;
        }
        if (request.method === 'GET' && path.startsWith('/v1/products/')) {
          const product = await engine.getProduct(
            decodeURIComponent(path.slice('/v1/products/'.length)),
          );
          if (!product)
            throw new ApiError('PRODUCT_NOT_FOUND', 'Product not found', 404);
          send(response, 200, { schemaVersion: '1.0', product });
          return;
        }
        if (request.method === 'GET' && path.startsWith('/v1/catalogs/')) {
          const value = await catalogs.get(
            decodeURIComponent(path.slice('/v1/catalogs/'.length)),
          );
          if (!value)
            throw new ApiError('CATALOG_NOT_FOUND', 'Catalog not found', 404);
          send(response, 200, value);
          return;
        }
        if (request.method === 'GET' && path.startsWith('/v1/scans/')) {
          const report = await scans.get(
            decodeURIComponent(path.slice('/v1/scans/'.length)),
          );
          if (!report)
            throw new ApiError('SCAN_NOT_FOUND', 'Scan not found', 404);
          send(response, 200, { schemaVersion: '1.0', report });
          return;
        }
        if (request.method === 'POST' && path === '/v1/scans') {
          const input = await readBody(request);
          if (
            !input ||
            typeof input !== 'object' ||
            Array.isArray(input) ||
            !('url' in input) ||
            typeof input.url !== 'string'
          )
            throw new ApiError('INVALID_SCAN', 'Expected a URL', 400);
          const limit = 'limit' in input ? input.limit : 100;
          if (
            typeof limit !== 'number' ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
          )
            throw new ApiError(
              'INVALID_SCAN',
              'Local API scan limit is 1–100',
              400,
            );
          const report = await scanStore(input.url, {
            ...options.scanOptions,
            limit,
            catalogRepository: catalogs,
            scanRepository: scans,
          });
          activeCatalog = report.catalog;
          engine = new MemoryQueryEngine(report.catalog);
          send(response, 201, {
            schemaVersion: '1.0',
            scanId: report.scanId,
            report,
          });
          return;
        }
        if (request.method === 'POST' && path === '/v1/validate') {
          send(response, 200, {
            schemaVersion: '1.0',
            ...validateCatalog(await readBody(request)),
          });
          return;
        }
        if (request.method === 'GET' && path === '/v1/exports/json') {
          send(response, 200, activeCatalog);
          return;
        }
        if (request.method === 'GET' && path === '/v1/exports/acp') {
          const currency = url.searchParams.get('currency');
          send(
            response,
            200,
            exportAcpCatalog(activeCatalog, currency ? { currency } : {}),
          );
          return;
        }
        if (request.method === 'GET' && path === '/v1/exports/ucp') {
          const currency = url.searchParams.get('currency');
          send(
            response,
            200,
            await exportUcpCatalog(activeCatalog, currency ? { currency } : {}),
          );
          return;
        }
        throw new ApiError('NOT_FOUND', 'Route not found', 404);
      })().catch((error: unknown) => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const known = error instanceof ApiError;
        send(response, known ? error.status : 400, {
          error: {
            code: known ? error.code : 'INVALID_REQUEST',
            message: known ? error.message : 'Request could not be processed',
            requestId,
          },
        });
      });
    },
  );
  server.headersTimeout = 10000;
  return server;
}
export async function startApi(
  options: ApiOptions,
  port = 3001,
): Promise<Server> {
  const server = await createApi(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}
