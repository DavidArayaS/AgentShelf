// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const run = (args) =>
  spawnSync(process.execPath, ['dist/index.js', ...args], { encoding: 'utf8' });
test('CLI has useful help, machine-readable validation and failure exit codes', () => {
  assert.match(run(['--help']).stdout, /open commerce layer/);
  const result = run([
    '--json',
    'validate',
    '../../examples/sample-catalog/catalog.json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).catalog.products.length, 1);
  assert.notEqual(run(['scan', 'http://127.0.0.1/']).status, 0);
  assert.match(run(['scan', '--help']).stdout, /limit/);
});

test('protocol reporting derives exact supported versions from implemented adapters', () => {
  const response = run(['protocols']);
  assert.equal(response.status, 0, response.stderr);
  const registry = JSON.parse(response.stdout);
  assert.equal(registry.acp.version, '2026-04-17');
  assert.ok(registry.acp.supportedCapabilities.length);
  assert.equal(registry.ucp.version, '2026-08-25');
  assert.ok(registry.ucp.unsupportedCapabilities.includes('checkout'));
  const unsupported = run([
    'export',
    '../../examples/sample-catalog/catalog.json',
    '--format',
    'unsupported',
  ]);
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /Unsupported export format/);
});

test('import/search require no crawl and explicit structured filters are honored', () => {
  const file = '../../examples/sample-catalog/catalog.json';
  const imported = run(['--json', 'import', file]);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).acquisition.mode, 'direct_import');
  const searched = run([
    '--json',
    'search',
    file,
    'running shoe',
    '--max-price',
    '100',
    '--currency',
    'USD',
  ]);
  assert.equal(searched.status, 0, searched.stderr);
  assert.equal(JSON.parse(searched.stdout).total, 0);
  const natural = run(['search', file, 'running shoe under $150']);
  assert.equal(JSON.parse(natural.stdout).total, 1);
  assert.notEqual(
    run(['ingest', 'https://store.example', '--connector', 'unknown']).status,
    0,
  );
  const missing = run([
    '--json',
    'ingest',
    'https://store.example',
    '--connector',
    'woocommerce-admin',
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ACCESS_RESTRICTED/);
  assert.match(run(['ingest', '--help']).stdout, /merchant-authorized/);
});
