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
