// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { scanStore } from '@agentshelf/core';
import { MemoryQueryEngine } from '@agentshelf/query-engine';
import { startApi } from '@agentshelf/api';
import { startMcp } from '@agentshelf/mcp';
import { createDemoHttp, demoUrl } from '@agentshelf/testing';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
const exec = promisify(execFile);
test('offline crawl → normalize → validate/score → CLI export → REST/MCP search', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentshelf-e2e-'));
  let api, mcp, client;
  try {
    const report = await scanStore(demoUrl, { http: createDemoHttp() });
    assert.equal(report.failures, 0);
    assert.equal(report.productsNormalized, 1);
    assert.ok(report.score.overall > 0);
    const input = join(directory, 'input.json');
    const output = join(directory, 'catalog.json');
    await writeFile(input, JSON.stringify(report.catalog));
    await exec(process.execPath, [
      'apps/cli/dist/index.js',
      'export',
      input,
      '--output',
      output,
    ]);
    const catalog = JSON.parse(await readFile(output, 'utf8'));
    for (const format of ['acp', 'ucp']) {
      const { stdout } = await exec(process.execPath, [
        'apps/cli/dist/index.js',
        'export',
        input,
        '--format',
        format,
      ]);
      assert.equal(JSON.parse(stdout).products.length, 1);
    }
    const queryEngine = new MemoryQueryEngine(catalog);
    api = await startApi(
      { catalog, queryEngine, scanOptions: { http: createDemoHttp() } },
      0,
    );
    mcp = await startMcp({ catalog, queryEngine }, 0);
    const response = await fetch(
      `http://127.0.0.1:${api.address().port}/v1/products/search?query=waterproof`,
    );
    assert.equal(response.status, 200);
    const rest = await response.json();
    client = new Client({ name: 'acceptance', version: '0.1.0' });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${mcp.server.address().port}/mcp`),
      ),
    );
    const result = await client.callTool({
      name: 'search_products',
      arguments: { query: 'waterproof' },
    });
    assert.equal(result.isError, undefined);
    assert.equal(rest.products[0].name, 'Waterproof Trail Shoe');
    assert.deepEqual(result.structuredContent.products, rest.products);
    const scanned = await fetch(
      `http://127.0.0.1:${api.address().port}/v1/scans`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: demoUrl }),
      },
    );
    assert.equal(scanned.status, 201);
    const fresh = await client.callTool({
      name: 'get_store_information',
      arguments: {},
    });
    assert.equal(fresh.structuredContent.merchant.name, 'demo.example');
  } finally {
    await client?.close();
    await mcp?.close();
    if (api) {
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('actual CLI serve starts REST and MCP and reports usable ephemeral endpoints', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(
    process.execPath,
    [
      'apps/cli/dist/index.js',
      '--json',
      'serve',
      'examples/sample-catalog/catalog.json',
      '--port',
      '0',
      '--mcp-port',
      '0',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let client;
  try {
    const endpoints = await new Promise((resolve, reject) => {
      let stdout = '',
        stderr = '';
      const timer = setTimeout(
        () => reject(new Error(`CLI startup timed out: ${stderr}`)),
        10000,
      );
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`CLI exited ${code}: ${stderr}`));
      });
      child.stdout.on('data', (data) => {
        stdout += data;
        try {
          const value = JSON.parse(stdout);
          clearTimeout(timer);
          resolve(value);
        } catch {
          /* Wait for a complete JSON response. */
        }
      });
    });
    const rest = await (
      await fetch(`${endpoints.rest}/v1/products/search?query=waterproof`)
    ).json();
    client = new Client({ name: 'cli-acceptance', version: '0.1.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoints.mcp)),
    );
    const result = await client.callTool({
      name: 'search_products',
      arguments: { query: 'waterproof' },
    });
    assert.equal(rest.products[0].name, 'Waterproof Trail Shoe');
    assert.deepEqual(result.structuredContent.products, rest.products);
  } finally {
    await client?.close();
    child.kill('SIGTERM');
  }
});
