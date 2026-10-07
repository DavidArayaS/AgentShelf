// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { catalogJsonSchema, ProductSchema } from '@agentshelf/schema';
import { SearchQuerySchema } from '@agentshelf/query-engine';
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: 'object', properties, required });
const array = (items: unknown) => ({ type: 'array', items });
const string = { type: 'string' };
const number = { type: 'number' };
const version = { const: '1.0' };
const envelope = (properties: Record<string, unknown>) =>
  object({ schemaVersion: version, ...properties });
const validationRule = object(
  {
    ruleId: string,
    status: { enum: ['pass', 'fail', 'unknown'] },
    severity: { enum: ['info', 'warning', 'critical'] },
    category: string,
    message: string,
    remediation: string,
    evidence: {},
  },
  ['ruleId', 'status', 'severity', 'category', 'message'],
);
const report = object({
  scanId: string,
  startedAt: { type: 'string', format: 'date-time' },
  durationMs: number,
  platform: object({
    platform: string,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    signals: array(
      object({ type: { enum: ['html', 'header', 'url'] }, value: string }),
    ),
  }),
  pagesFetched: number,
  productsDiscovered: number,
  productsNormalized: number,
  warnings: array(string),
  failures: number,
  catalog: ref('Catalog'),
  score: object({
    scoringVersion: string,
    overall: number,
    categories: { type: 'object', additionalProperties: number },
    counts: object({ pass: number, fail: number, unknown: number }),
    weights: { type: 'object', additionalProperties: number },
  }),
});
const schemas = {
  Catalog: catalogJsonSchema,
  Product: z.toJSONSchema(ProductSchema),
  Error: envelope({
    error: object({ code: string, message: string, requestId: string }),
  }),
  SearchResult: envelope({
    products: array(ref('Product')),
    total: number,
    offset: number,
    limit: number,
  }),
  ScanReport: report,
  ScanRequest: object(
    {
      url: { type: 'string', format: 'uri' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
    },
    ['url'],
  ),
  ValidationResult: envelope({
    catalog: ref('Catalog'),
    products: array(
      object({ productId: string, results: array(validationRule) }),
    ),
  }),
};
const querySchema = z.toJSONSchema(SearchQuerySchema, { io: 'input' });
const queryParameters = Object.entries(querySchema.properties ?? {}).map(
  ([name, schema]) => ({
    name,
    in: 'query',
    required: false,
    schema: ['attributes', 'variantProperties'].includes(name)
      ? { type: 'string', description: 'JSON-encoded object' }
      : schema,
    ...(['brands', 'categories'].includes(name)
      ? { style: 'form', explode: false }
      : {}),
  }),
);
const id = [{ name: 'id', in: 'path', required: true, schema: string }];
const currency = [
  {
    name: 'currency',
    in: 'query',
    required: false,
    schema: { type: 'string', pattern: '^[A-Z]{3}$' },
  },
];
function operation(
  id: string,
  description: string,
  response: unknown,
  options: { status?: number; body?: unknown; parameters?: unknown[] } = {},
) {
  return {
    operationId: id,
    description,
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: options.body } },
          },
        }
      : {}),
    responses: {
      [options.status ?? 200]: {
        description: 'Success',
        content: { 'application/json': { schema: response } },
      },
      ...Object.fromEntries(
        [400, 403, 404, 413, 415, 422, 500, 502].map((status) => [
          status,
          {
            description:
              'Structured error; error.code identifies the domain failure',
            content: { 'application/json': { schema: ref('Error') } },
          },
        ]),
      ),
    },
  };
}
export const openApi = {
  openapi: '3.1.0',
  info: { title: 'AgentShelf local API', version: '0.1.0' },
  servers: [{ url: 'http://127.0.0.1:3001' }],
  paths: {
    '/health': {
      get: operation(
        'health',
        'Local service health',
        envelope({ status: { const: 'ok' } }),
      ),
    },
    '/v1/products': {
      get: operation(
        'listProducts',
        'Search/filter the active catalog',
        ref('SearchResult'),
        { parameters: queryParameters },
      ),
    },
    '/v1/products/search': {
      get: operation(
        'searchProducts',
        'Deterministic search over the active catalog',
        ref('SearchResult'),
        { parameters: queryParameters },
      ),
    },
    '/v1/products/{id}': {
      get: operation(
        'getProduct',
        'Read a canonical product',
        envelope({ product: ref('Product') }),
        { parameters: id },
      ),
    },
    '/v1/catalogs/{id}': {
      get: operation('getCatalog', 'Read a stored catalog', ref('Catalog'), {
        parameters: id,
      }),
    },
    '/v1/scans': {
      post: operation(
        'scanStore',
        'Scan at most 100 products; activate resulting catalog',
        envelope({ scanId: string, report: ref('ScanReport') }),
        { status: 201, body: ref('ScanRequest') },
      ),
    },
    '/v1/scans/{id}': {
      get: operation(
        'getScan',
        'Read a stored scan report',
        envelope({ report: ref('ScanReport') }),
        { parameters: id },
      ),
    },
    '/v1/validate': {
      post: operation(
        'validateCatalog',
        'Validate canonical schema and product readiness',
        ref('ValidationResult'),
        { body: ref('Catalog') },
      ),
    },
    '/v1/exports/json': {
      get: operation(
        'exportJson',
        'Export canonical schema 1.0',
        ref('Catalog'),
      ),
    },
    '/v1/exports/acp': {
      get: operation(
        'exportAcp',
        'ACP 2026-04-17 ProductsResponse. Output is validated by the pinned official schema in @agentshelf/protocol-acp/spec.',
        object({ products: array({ type: 'object' }) }),
        { parameters: currency },
      ),
    },
    '/v1/exports/ucp': {
      get: operation(
        'exportUcp',
        'UCP 2026-08-25 catalog search response. Output is validated by the pinned official schema set in @agentshelf/protocol-ucp/spec.',
        object({
          ucp: object({ version: { const: '2026-08-25' } }),
          products: array({ type: 'object' }),
        }),
        { parameters: currency },
      ),
    },
  },
  components: { schemas },
};
