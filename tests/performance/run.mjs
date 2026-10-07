// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
const results = [];
for (const size of [100, 10000, 100000]) {
  const output = execFileSync(
    process.execPath,
    ['--expose-gc', 'tests/performance/worker.mjs', String(size)],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(output);
  results.push(result);
  console.log(`${size} products: ${JSON.stringify(result.timings)}`);
}
mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/benchmarks.json',
  `${JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      cpu: cpus()[0]?.model,
      totalMemoryBytes: totalmem(),
      results,
    },
    null,
    2,
  )}\n`,
);
