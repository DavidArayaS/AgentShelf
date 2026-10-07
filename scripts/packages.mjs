// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const root = process.cwd();
const output = resolve('reports/packages');
mkdirSync(output, { recursive: true });
/** @type {Record<string,string>} */
const dependencies = {};
for (const parent of ['packages', 'apps'])
  for (const name of readdirSync(parent)) {
    const directory = join(parent, name);
    const manifest = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    );
    if (manifest.private) continue;
    const pack = JSON.parse(
      execFileSync(pnpm, ['pack', '--json', '--pack-destination', output], {
        cwd: directory,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }),
    );
    const files = pack.files.map(/** @param {{path:string}} f */ (f) => f.path);
    for (const required of ['LICENSE', 'NOTICE', 'dist/index.js'])
      assert.ok(
        files.includes(required),
        `${manifest.name}: missing ${required}`,
      );
    assert.ok(
      !files.some(
        /** @param {string} file */ (file) =>
          file.startsWith('src/') ||
          file.startsWith('test/') ||
          file.includes('node_modules/'),
      ),
      `${manifest.name}: private files packed`,
    );
    dependencies[manifest.name] = `file:${pack.filename.replaceAll('\\', '/')}`;
  }
const consumer = mkdtempSync(join(tmpdir(), 'agentshelf-consumer-'));
try {
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'private-cloud-consumer',
      private: true,
      type: 'module',
      dependencies,
    }),
  );
  writeFileSync(
    join(consumer, 'pnpm-workspace.yaml'),
    JSON.stringify({ packages: ['.'], overrides: dependencies }),
  );
  execFileSync(pnpm, ['install', '--offline', '--ignore-scripts'], {
    cwd: consumer,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  writeFileSync(
    join(consumer, 'app.mjs'),
    readFileSync('tests/consumer/app.mjs'),
  );
  execFileSync(process.execPath, ['app.mjs'], {
    cwd: consumer,
    stdio: 'inherit',
  });
  const help = execFileSync(pnpm, ['exec', 'agentshelf', '--help'], {
    cwd: consumer,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.match(help, /open commerce layer/);
  writeFileSync(
    join(output, 'manifest.json'),
    `${JSON.stringify(
      { packages: Object.keys(dependencies), consumer: 'passed' },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Packed and verified ${Object.keys(dependencies).length} packages in an isolated consumer.`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
assert.equal(process.cwd(), root);
