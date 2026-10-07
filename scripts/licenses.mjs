// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { auditLicenses } from './license-policy.mjs';

// pnpm is the maintained scanner. Include development and transitive dependencies.
const raw = execFileSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['licenses', 'list', '--json'],
  {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32',
  },
);
const dependencies = auditLicenses(JSON.parse(raw));
mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/licenses.json',
  `${JSON.stringify({ scanner: 'pnpm licenses list', dependencies }, null, 2)}\n`,
);
const rejected = dependencies.filter((dependency) => !dependency.approved);
console.log(
  `Audited ${dependencies.length} dependencies (including transitive and development dependencies).`,
);
for (const dependency of rejected)
  console.error(
    `${dependency.name}@${dependency.version}: ${dependency.license} requires maintainer review`,
  );
if (rejected.length) process.exitCode = 1;
