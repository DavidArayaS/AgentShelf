// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES } from '@agentshelf/validators';
import { scoreResults, DEFAULT_WEIGHTS } from '../dist/index.js';
const checks = (status) =>
  CATEGORIES.map((category) => ({
    category,
    status,
    ruleId: category,
    severity: 'info',
    message: 'test',
  }));
test('score is deterministic, bounded, versioned and explainable', () => {
  assert.equal(scoreResults(checks('pass')).overall, 100);
  assert.equal(scoreResults(checks('unknown')).overall, 0);
  assert.equal(scoreResults(checks('fail')).overall, 0);
  assert.deepEqual(scoreResults(checks('pass')), scoreResults(checks('pass')));
  assert.equal(scoreResults(checks('pass')).scoringVersion, '1.0.0');
});
test('invalid weights fail and unknown remains separately counted', () => {
  assert.throws(() => scoreResults([], { ...DEFAULT_WEIGHTS, pricing: -1 }));
  assert.throws(() =>
    scoreResults([], Object.fromEntries(CATEGORIES.map((c) => [c, 0]))),
  );
  assert.equal(
    scoreResults(checks('unknown')).counts.unknown,
    CATEGORIES.length,
  );
});
