// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateRemoteUrl,
  resolvePublic,
  SafeHttpClient,
  parseBoundedJson,
  isPublicAddress,
  UnsafeUrlError,
} from '../dist/index.js';
test('rejects loopback, private, link local, metadata, IPv6 and encoded IP destinations', () => {
  for (const host of [
    'localhost',
    'a.localhost',
    '127.1',
    '2130706433',
    '0x7f000001',
    '10.0.0.1',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '[::1]',
    '[::]',
    '[fc00::1]',
    '[fe80::1]',
    '[::ffff:127.0.0.1]',
    'metadata.google.internal',
  ])
    assert.throws(
      () => validateRemoteUrl(`http://${host}/`),
      UnsafeUrlError,
      host,
    );
  for (const value of [
    'file:///etc/passwd',
    'ftp://example.com',
    'https://user:secret@example.com',
    'https://example.com:3000',
    'not a url',
  ])
    assert.throws(() => validateRemoteUrl(value), UnsafeUrlError);
});
test('requires all DNS answers to be public and validates address families', async () => {
  const url = validateRemoteUrl('https://shop.example/');
  for (const answers of [
    [],
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '10.1.1.1', family: 4 },
    ],
    [{ address: '8.8.8.8', family: 6 }],
  ])
    await assert.rejects(
      resolvePublic(url, async () => answers),
      UnsafeUrlError,
    );
  assert.deepEqual(
    await resolvePublic(url, async () => [{ address: '8.8.8.8', family: 4 }]),
    { address: '8.8.8.8', family: 4 },
  );
  assert.equal(isPublicAddress('garbage'), false);
});
test('redirect target validation rejects redirect-to-private and credential URLs', () => {
  for (const location of [
    '//127.0.0.1/admin',
    'http://[::1]/',
    'https://user:pass@shop.example/',
  ])
    assert.throws(
      () => validateRemoteUrl(new URL(location, 'https://shop.example').href),
      UnsafeUrlError,
    );
});
test('native client cannot request a local fixture, even through shorthand IPv4', async () => {
  const client = new SafeHttpClient({ minIntervalMs: 0 });
  await assert.rejects(client.get('http://127.1/'), UnsafeUrlError);
  await assert.rejects(
    client.get(
      'https://example.com',
      AbortSignal.abort(new Error('cancelled')),
    ),
    /cancelled/,
  );
  for (const limits of [
    { maxBytes: 0 },
    { timeoutMs: 0 },
    { maxRedirects: 11 },
    { minIntervalMs: -1 },
  ])
    assert.throws(() => new SafeHttpClient(limits));
});
test('bounded JSON handles malformed, excessive nesting, Unicode and prototype injection', () => {
  for (const text of [
    '{',
    '{"__proto__":{}}',
    '{"constructor":{}}',
    '["\\ud800"]',
    `${'['.repeat(40)}0${']'.repeat(40)}`,
  ])
    assert.throws(() => parseBoundedJson(text));
  assert.throws(() => parseBoundedJson('"long"', 3));
  assert.deepEqual(parseBoundedJson('{"name":"shoe","nested":[1,true,null]}'), {
    name: 'shoe',
    nested: [1, true, null],
  });
  assert.equal(parseBoundedJson('"{[\\""'), '{["');
});
