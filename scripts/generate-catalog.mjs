// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generatePrivateCatalog } from '@agentshelf/testing';
const target = process.argv[2] ?? 'reports/private-catalog.json';
const size = Number(process.argv[3] ?? 10000);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(generatePrivateCatalog(size))}\n`, {
  flag: 'wx',
});
console.log(`Wrote ${size} synthetic products to ${target}`);
