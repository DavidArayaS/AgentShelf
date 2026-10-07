// SPDX-License-Identifier: Apache-2.0
import { createServer, type Server } from 'node:http';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { CatalogSchema, type Catalog } from '@agentshelf/schema';
import {
  MemoryQueryEngine,
  SearchQuerySchema,
  type QueryEngine,
} from '@agentshelf/query-engine';
export const MCP_SUPPORT = {
  protocol: 'mcp',
  version: '2026-07-28',
  sdkVersion: '2.3.1',
  implementationVersion: '0.1.0',
  supportedCapabilities: ['tools', 'streamable-http'],
  unsupportedCapabilities: ['checkout', 'payments', 'remote-authentication'],
} as const;
export interface McpOptions {
  catalog: Catalog;
  queryEngine?: QueryEngine;
}
function result(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}
export function createMcpServer(options: McpOptions): McpServer {
  const catalog = CatalogSchema.parse(options.catalog);
  const query = options.queryEngine ?? new MemoryQueryEngine(catalog);
  const server = new McpServer({ name: 'agentshelf', version: '0.1.0' });
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  server.registerTool(
    'search_products',
    {
      description:
        'Search normalized commerce products using explicit filters; prices require currency.',
      inputSchema: SearchQuerySchema,
      annotations,
    },
    async (input) => result({ ...(await query.searchProducts(input)) }),
  );
  const productInput = z.object({ id: z.string().min(1).max(512) });
  server.registerTool(
    'get_product',
    {
      description: 'Get a canonical product by stable ID.',
      inputSchema: productInput,
      annotations,
    },
    async ({ id }) => {
      const product = await query.getProduct(id);
      return product
        ? result({ schemaVersion: '1.0', product })
        : {
            ...result({
              error: {
                code: 'PRODUCT_NOT_FOUND',
                message: 'Product not found',
              },
            }),
            isError: true,
          };
    },
  );
  server.registerTool(
    'check_availability',
    {
      description:
        'Return observed availability, not a reservation or stock guarantee.',
      inputSchema: productInput,
      annotations,
    },
    async ({ id }) => {
      const product = await query.getProduct(id);
      return product
        ? result({
            schemaVersion: '1.0',
            offers: product.offers,
            variants: product.variants.map((variant) => ({
              id: variant.id,
              offers: variant.offers,
            })),
            observedAt: product.provenance.observedAt,
          })
        : {
            ...result({
              error: {
                code: 'PRODUCT_NOT_FOUND',
                message: 'Product not found',
              },
            }),
            isError: true,
          };
    },
  );
  for (const [name, field] of [
    ['get_shipping_information', 'shipping'],
    ['get_return_policy', 'returns'],
  ] as const) {
    server.registerTool(
      name,
      {
        description: `Get observed ${field} information; null means unknown.`,
        inputSchema: z.object({ id: z.string().min(1).max(512).optional() }),
        annotations,
      },
      async ({ id }) => {
        const product = id ? await query.getProduct(id) : undefined;
        if (id && !product)
          return {
            ...result({
              error: {
                code: 'PRODUCT_NOT_FOUND',
                message: 'Product not found',
              },
            }),
            isError: true,
          };
        return result({
          schemaVersion: '1.0',
          [field]:
            product?.[field] ??
            ((await query.getMerchant?.()) ?? catalog.merchant)[field] ??
            null,
        });
      },
    );
  }
  server.registerTool(
    'get_store_information',
    {
      description: 'Get source merchant information.',
      inputSchema: z.object({}),
      annotations,
    },
    async () =>
      result({
        schemaVersion: '1.0',
        merchant: (await query.getMerchant?.()) ?? catalog.merchant,
      }),
  );
  return server;
}
export async function startMcp(
  options: McpOptions,
  port = 3002,
): Promise<{ server: Server; close(): Promise<void> }> {
  const handler = createMcpHandler(() => createMcpServer(options));
  const node = toNodeHandler(handler, { maxRequestBodySize: 1024 * 1024 });
  const server = createServer(
    { maxHeaderSize: 16384, requestTimeout: 15000 },
    (request, response) => {
      if (
        request.headers.origin ||
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
          request.headers.host ?? '',
        )
      ) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') {
        response.writeHead(404);
        response.end();
        return;
      }
      void node(
        {
          method: request.method ?? 'GET',
          url: request.url ?? '/mcp',
          headers: request.headers,
          [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
        },
        response,
      ).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    server,
    async close() {
      await handler.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
