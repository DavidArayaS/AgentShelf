// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditLicenses } from '../../scripts/license-policy.mjs';

test('pnpm produces a nonempty transitive license inventory for installed tooling', () => {
  const output = execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['licenses', 'list', '--json'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  const dependencies = auditLicenses(JSON.parse(output));
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    if (version.startsWith('workspace:')) continue;
    assert.ok(
      dependencies.some((dependency) => dependency.name === name),
      `Missing direct dependency ${name}`,
    );
  }
  assert.ok(
    dependencies.length > Object.keys(manifest.devDependencies).length,
    'Transitive dependencies must be inventoried',
  );
});
