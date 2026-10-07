// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
const packages = [
  'schema',
  'validators',
  'scoring',
  'crawler',
  'query-engine',
  'protocol-acp',
  'protocol-ucp',
  'protocol-sdk',
];
mkdirSync('reports/coverage', { recursive: true });
for (const name of packages) {
  const cwd = `packages/${name}`;
  const tests = readdirSync(`${cwd}/test`)
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => `test/${file}`);
  if (!tests.length) throw new Error(`No coverage tests for ${name}`);
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-test-coverage',
      '--test-coverage-include=dist/*.js',
      '--test-coverage-lines=90',
      '--test-coverage-branches=80',
      '--test-coverage-functions=80',
      '--test',
      ...tests,
    ],
    { cwd, encoding: 'utf8' },
  );
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(`reports/coverage/${name}.txt`, output);
  console.log(
    `${name}: ${result.status === 0 ? 'passed' : 'FAILED'} (90% lines / 80% branches / 80% functions)`,
  );
  if (result.status !== 0) {
    console.error(output);
    process.exitCode = 1;
  }
}
