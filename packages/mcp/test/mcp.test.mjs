// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { MemoryQueryEngine } from '@agentshelf/query-engine';
import { startMcp, MCP_SUPPORT } from '../dist/index.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../examples/sample-catalog/catalog.json', import.meta.url),
    'utf8',
  ),
);
test('official client negotiates pinned MCP revision and tools delegate to the shared query engine', async () => {
  const query = new MemoryQueryEngine(catalog);
  let called = 0;
  const service = await startMcp(
    {
      catalog,
      queryEngine: {
        async searchProducts(input) {
          called++;
          return query.searchProducts(input);
        },
        getProduct: (id) => query.getProduct(id),
      },
    },
    0,
  );
  const client = new Client(
    { name: 'agentshelf-contract-test', version: '0.1.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${service.server.address().port}/mcp`),
      ),
    );
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
    const result = await client.callTool({
      name: 'search_products',
      arguments: { query: 'shoe', maxPrice: 150, currency: 'USD' },
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      result.structuredContent.products[0].name,
      'Waterproof Trail Shoe',
    );
    assert.equal(called, 1);
    const missing = await client.callTool({
      name: 'get_product',
      arguments: { id: 'missing' },
    });
    assert.equal(missing.isError, true);
    assert.equal(MCP_SUPPORT.version, '2026-07-28');
  } finally {
    await client.close();
    await service.close();
  }
});
