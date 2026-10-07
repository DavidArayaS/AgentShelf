// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;
if (
  !base ||
  !head ||
  !/^[a-f0-9]{40}$/.test(base) ||
  !/^[a-f0-9]{40}$/.test(head)
)
  throw new Error('Expected validated base/head commit SHAs');
const commits = execFileSync('git', ['rev-list', `${base}..${head}`], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
if (!commits.length) throw new Error('No contribution commits found');
for (const commit of commits) {
  const message = execFileSync('git', ['show', '-s', '--format=%B', commit], {
    encoding: 'utf8',
  });
  if (!/^Signed-off-by: .+ <[^\s<>]+@[^\s<>]+>\s*$/im.test(message))
    throw new Error(`Missing DCO sign-off: ${commit}`);
}
