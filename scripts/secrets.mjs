// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { scanSecrets } from './secret-policy.mjs';
const paths = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
let count = 0;
for (const path of new Set(paths)) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      continue;
    throw error;
  }
  if (!stat.isFile()) continue;
  const findings = await scanSecrets(readFileSync(path, 'utf8'), path);
  for (const finding of findings)
    console.error(
      `${path}:${finding.line}: ${finding.ruleId} secret pattern detected`,
    );
  count += findings.length;
}
console.log(
  `Scanned ${paths.length} tracked and unignored working-tree paths; ${count} findings.`,
);
if (count) process.exitCode = 1;
