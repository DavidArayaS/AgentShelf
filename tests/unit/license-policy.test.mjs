// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditLicenses,
  isApprovedLicense,
  approvedLicenses,
} from '../../scripts/license-policy.mjs';

test('accepts only the explicit default approved licenses', () => {
  for (const license of approvedLicenses)
    assert.equal(isApprovedLicense(license), true);
});
test('fails closed on missing, forbidden, custom, inferred and unreviewed expressions', () => {
  for (const license of [
    undefined,
    null,
    '',
    'UNKNOWN',
    'UNLICENSED',
    'GPL-3.0',
    'AGPL-3.0',
    'LGPL-3.0',
    'BUSL-1.1',
    'MPL-2.0',
    'EPL-2.0',
    'CDDL-1.0',
    'MIT*',
    'MIT AND GPL-3.0',
    '(MIT OR Apache-2.0)',
  ]) {
    assert.equal(isApprovedLicense(license), false, String(license));
  }
});
test('retains every transitive inventory entry and flags forbidden entries', () => {
  const result = auditLicenses({
    MIT: [
      { name: 'direct', versions: ['1.0.0'] },
      { name: 'transitive', versions: ['2.0.0'] },
    ],
    UNKNOWN: [{ name: 'missing', versions: ['1.0.0'] }],
  });
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.filter((x) => !x.approved).map((x) => x.name),
    ['missing'],
  );
});
test('rejects missing and malformed inventories rather than passing zero packages', () => {
  for (const input of [null, [], {}, { MIT: {} }, { MIT: [{}] }])
    assert.throws(() => auditLicenses(input));
});

test('accepts explicit OR choices of approved identifiers and rejects mixed obligations', () => {
  assert.equal(isApprovedLicense('MIT OR Apache-2.0'), true);
  assert.equal(isApprovedLicense('MIT OR GPL-3.0'), false);
});
