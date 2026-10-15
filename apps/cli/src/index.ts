#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Command } from 'commander';
import { acpAdapter } from '@agentshelf/protocol-acp';
import { ucpAdapter } from '@agentshelf/protocol-ucp';
import { startApi } from '@agentshelf/api';
import { startMcp, MCP_SUPPORT } from '@agentshelf/mcp';
import { CatalogSchema } from '@agentshelf/schema';
import { searchProducts, MemoryQueryEngine } from '@agentshelf/query-engine';
import {
  scanStore,
  ingestStore,
  importCatalog,
  validateCatalog,
} from '@agentshelf/core';
import { SafeHttpClient, parseBoundedJson } from '@agentshelf/crawler';
import { wooCommerceAdminConnector } from '@agentshelf/connector-woocommerce-admin';
import type { ScanReport } from '@agentshelf/core';
import { genericWebConnector } from '@agentshelf/connector-generic-web';
const program = new Command()
  .name('agentshelf')
  .version('0.1.0')
  .description('The open commerce layer for AI agents')
  .option('--json', 'Machine-readable output');
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const context = {
  http: new SafeHttpClient(),
  clock: { now: () => new Date() },
  logger: { log() {} },
  limit: 100,
  maxSitemaps: 100,
  maxDepth: 5,
};
async function readInput(input: string): Promise<unknown> {
  if (/^https?:\/\//.test(input)) {
    const response = await context.http.get(input);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    return parseBoundedJson(response.body);
  }
  if ((await stat(input)).size > 32 * 1024 * 1024)
    throw new Error('Catalog file exceeds 32 MiB');
  return parseBoundedJson(await readFile(input, 'utf8'), 32 * 1024 * 1024);
}
program
  .command('detect <url>')
  .description('Detect platform from public HTML and headers')
  .action(async (url) =>
    output(await genericWebConnector.detect({ url }, context)),
  );
program
  .command('scan <url>')
  .description('Public discovery; catalog completeness is never guaranteed')
  .option('--limit <count>', 'Maximum products', '100')
  .action(async (url, options) => {
    const report = await scanStore(url, {
      limit: Number(options.limit),
      eventSink: {
        emit(event) {
          if (
            !program.opts().json &&
            event.type === 'product' &&
            (event.productsNormalized === 1 ||
              event.productsNormalized % 10 === 0)
          )
            console.error(`Scanned ${event.productsNormalized} products…`);
        },
      },
    });
    if (program.opts().json) output(report);
    else {
      printReport(report);
      for (const [category, score] of Object.entries(report.score.categories))
        console.log(`${category.padEnd(24)} ${score}`);
      if (report.failures)
        console.error(`${report.failures} product extractions failed.`);
    }
  });
function printReport(
  report: Pick<ScanReport, 'acquisition' | 'score'> &
    Partial<Pick<ScanReport, 'platform' | 'issues'>>,
): void {
  const { acquisition, score } = report;
  const coverage = acquisition.coverage;
  console.log(
    `AgentShelf\n\n${report.platform ? `Platform: ${report.platform.platform}\n` : ''}Acquisition: ${acquisition.mode}\nAuthority: ${acquisition.authority}\nProducts observed: ${coverage.observedProducts}\nExpected products: ${coverage.expectedProducts ?? 'unknown'}\nCoverage: ${coverage.status.toUpperCase()}\nFailures: ${coverage.failures}\n${coverage.reason}\n${coverage.status === 'complete' ? 'Catalog Readiness' : 'Observed Catalog Readiness'}: ${score.overall} / 100`,
  );
  for (const issue of report.issues ?? [])
    console.error(`${issue.code}: ${issue.message}`);
}
program
  .command('ingest <url>')
  .description(
    'Read an existing store using merchant-authorized read-only access',
  )
  .requiredOption(
    '--connector <id>',
    'Authorized connector (woocommerce-admin)',
  )
  .option(
    '--limit <count>',
    'Maximum products (local safety cap 100000)',
    '100000',
  )
  .option('--output <file>', 'Write canonical catalog JSON without credentials')
  .action(async (url, options) => {
    if (options.connector !== 'woocommerce-admin')
      throw new Error('Unknown authorized connector');
    const report = await ingestStore(url, {
      connector: wooCommerceAdminConnector,
      limit: Number(options.limit),
      credentials: {
        async get(id, origin) {
          if (id !== 'woocommerce-admin' || origin !== new URL(url).origin)
            return undefined;
          const consumerKey = process.env.AGENTSHELF_WC_CONSUMER_KEY;
          const consumerSecret = process.env.AGENTSHELF_WC_CONSUMER_SECRET;
          return consumerKey && consumerSecret
            ? { consumerKey, consumerSecret }
            : undefined;
        },
      },
    });
    if (options.output)
      await writeFile(
        options.output,
        `${JSON.stringify(report.catalog, null, 2)}\n`,
        { flag: 'wx' },
      );
    if (program.opts().json) output(report);
    else printReport(report);
  });
program
  .command('import <catalog>')
  .description(
    'Validate and import a local canonical JSON document; no crawling',
  )
  .option('--output <file>', 'Write normalized canonical JSON to a new file')
  .action(async (input, options) => {
    if (/^https?:\/\//.test(input))
      throw new Error('Import expects a local canonical JSON file');
    const report = await importCatalog(await readInput(input));
    if (options.output)
      await writeFile(
        options.output,
        `${JSON.stringify(report.catalog, null, 2)}\n`,
        { flag: 'wx' },
      );
    if (program.opts().json) output(report);
    else printReport(report);
  });
program
  .command('inspect <url>')
  .description('Extract a single product page')
  .action(async (url) =>
    output(await genericWebConnector.fetchProduct({ url }, { url }, context)),
  );
program
  .command('validate <file-or-url>')
  .description('Validate a canonical JSON catalog')
  .action(async (input) => output(validateCatalog(await readInput(input))));
program
  .command('export <url>')
  .description(
    'Scan a store or read a local catalog and export JSON, ACP or UCP',
  )
  .option('--format <format>', 'Export format', 'json')
  .option('--output <file>', 'Write output file')
  .option(
    '--currency <currency>',
    'Select an offer currency for protocol export',
  )
  .option('--limit <count>', 'Maximum products', '100')
  .action(async (url, options) => {
    if (!['json', 'acp', 'ucp'].includes(options.format))
      throw new Error(`Unsupported export format: ${options.format}`);
    const catalog = /^https?:\/\//.test(url)
      ? (await scanStore(url, { limit: Number(options.limit) })).catalog
      : CatalogSchema.parse(await readInput(url));
    const adapter = options.format === 'acp' ? acpAdapter : ucpAdapter;
    const document =
      options.format === 'json'
        ? catalog
        : await adapter.exportCatalog(
            catalog,
            options.currency ? { currency: options.currency } : {},
          );
    const json = `${JSON.stringify(document, null, 2)}\n`;
    if (options.output) await writeFile(options.output, json, { flag: 'wx' });
    else process.stdout.write(json);
  });
program
  .command('search <catalog> <query>')
  .description(
    'Search any canonical catalog, independently of its acquisition source',
  )
  .option('--min-price <amount>', 'Minimum offer price')
  .option('--max-price <amount>', 'Maximum offer price')
  .option(
    '--currency <code>',
    'ISO currency; required for structured price filters',
  )
  .option('--availability <status>', 'Availability status')
  .option('--brand <name>', 'Brand')
  .option('--category <name>', 'Category name or ID')
  .option('--merchant <id>', 'Merchant ID')
  .option('--attributes <json>', 'Product attributes as a JSON object')
  .option('--variants <json>', 'Variant properties as a JSON object')
  .option('--shipping-destination <country>', 'ISO shipping destination')
  .option(
    '--sort <order>',
    'relevance, name, price_asc, price_desc',
    'relevance',
  )
  .option('--limit <count>', 'Result limit', '50')
  .option('--offset <count>', 'Result offset', '0')
  .action(async (catalog, query, options) => {
    const filters: Record<string, unknown> = {
      query,
      sort: options.sort,
      limit: Number(options.limit),
      offset: Number(options.offset),
    };
    for (const name of [
      'minPrice',
      'maxPrice',
      'currency',
      'availability',
      'shippingDestination',
    ])
      if (options[name] !== undefined) filters[name] = options[name];
    if (options.brand) filters.brands = [options.brand];
    if (options.category) filters.categories = [options.category];
    if (options.merchant) filters.merchantId = options.merchant;
    if (options.attributes)
      filters.attributes = parseBoundedJson(options.attributes, 8192);
    if (options.variants)
      filters.variantProperties = parseBoundedJson(options.variants, 8192);
    output(
      searchProducts(CatalogSchema.parse(await readInput(catalog)), filters),
    );
  });
program
  .command('serve <catalog>')
  .description('Serve a local catalog over REST and MCP')
  .option('--port <port>', 'REST port', '3001')
  .option('--mcp-port <port>', 'MCP port', '3002')
  .action(async (input, options) => {
    const catalog = CatalogSchema.parse(await readInput(input));
    const queryEngine = new MemoryQueryEngine(catalog);
    const server = await startApi(
      { catalog, queryEngine },
      Number(options.port),
    );
    let mcp: Awaited<ReturnType<typeof startMcp>>;
    try {
      mcp = await startMcp({ catalog, queryEngine }, Number(options.mcpPort));
    } catch (error) {
      server.closeAllConnections();
      server.close();
      throw error;
    }
    const apiAddress = server.address();
    const mcpAddress = mcp.server.address();
    if (
      !apiAddress ||
      typeof apiAddress === 'string' ||
      !mcpAddress ||
      typeof mcpAddress === 'string'
    )
      throw new Error('Local servers did not bind');
    const endpoints = {
      rest: `http://127.0.0.1:${apiAddress.port}`,
      mcp: `http://127.0.0.1:${mcpAddress.port}/mcp`,
    };
    if (program.opts().json)
      output({
        schemaVersion: '1.0',
        products: catalog.products.length,
        ...endpoints,
      });
    else
      console.log(
        `AgentShelf\n\nCatalog loaded: ${catalog.products.length} products\nREST: ${endpoints.rest}\nMCP: ${endpoints.mcp}`,
      );
    const close = () => {
      void mcp.close();
      server.closeAllConnections();
      server.close();
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
program
  .command('protocols')
  .description('Report implemented protocol capabilities')
  .action(() =>
    output({
      json: { version: '1.0', supported: ['catalog'] },
      acp: acpAdapter.support,
      ucp: ucpAdapter.support,
      mcp: MCP_SUPPORT,
    }),
  );
try {
  await program.parseAsync();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unexpected failure';
  console.error(
    program.opts().json
      ? JSON.stringify({
          error: {
            code:
              error && typeof error === 'object' && 'code' in error
                ? error.code
                : 'COMMAND_FAILED',
            message,
          },
        })
      : `AgentShelf: ${message}`,
  );
  process.exitCode = 1;
}
