// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test, mock, afterEach } from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import https from 'node:https';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { SafeHttpClient } from '../dist/index.js';

afterEach(() => {
  mock.restoreAll();
  syncBuiltinESMExports();
});
function fakeNetwork(responses) {
  const seen = [];
  mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mock.method(https, 'request', (url, options, callback) => {
    seen.push({ url, options });
    const req = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        const fixture = responses.shift();
        if (!fixture) return;
        const response = Readable.from(
          fixture.chunks ?? [Buffer.from(fixture.body ?? 'ok')],
        );
        response.statusCode = fixture.status ?? 200;
        response.headers = fixture.headers ?? {};
        callback(response);
      });
    options.signal.addEventListener(
      'abort',
      () => req.emit('error', options.signal.reason),
      { once: true },
    );
    return req;
  });
  syncBuiltinESMExports();
  return seen;
}
test('pins the vetted DNS answer without changing original TLS hostname', async () => {
  const seen = fakeNetwork([
    { body: 'hello', headers: { 'content-type': 'text/plain' } },
  ]);
  const result = await new SafeHttpClient({ minIntervalMs: 0 }).get(
    'https://shop.example/product',
  );
  assert.equal(result.body, 'hello');
  assert.equal(seen[0].url.hostname, 'shop.example');
  assert.equal(seen[0].options.agent, false);
  seen[0].options.lookup('shop.example', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '8.8.8.8');
    assert.equal(family, 4);
  });
  seen[0].options.lookup('shop.example', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
  });
  assert.equal(seen[0].options.headers['accept-encoding'], 'identity');
});
test('revalidates redirect targets before a second connection', async () => {
  const seen = fakeNetwork([
    {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    },
  ]);
  await assert.rejects(
    new SafeHttpClient({ minIntervalMs: 0 }).get('https://shop.example/'),
    /Nonpublic/,
  );
  assert.equal(seen.length, 1);
});
test('bounds chains and rejects cycles and incomplete redirects', async () => {
  for (const [responses, pattern] of [
    [
      [
        { status: 302, headers: { location: '/next' } },
        { status: 302, headers: { location: '/more' } },
      ],
      /Redirect limit/,
    ],
    [[{ status: 302, headers: { location: '/' } }], /Redirect cycle/],
    [[{ status: 302 }], /no Location/],
  ]) {
    mock.restoreAll();
    fakeNetwork(responses);
    await assert.rejects(
      new SafeHttpClient({ minIntervalMs: 0, maxRedirects: 1 }).get(
        'https://shop.example/',
      ),
      pattern,
    );
  }
});
test('rejects compressed bombs, declared and streamed oversized bodies, malformed UTF-8', async () => {
  for (const fixture of [
    { headers: { 'content-encoding': 'gzip' }, body: 'compressed bomb' },
    { headers: { 'content-length': '9999' } },
    { headers: { 'content-length': 'NaN' } },
    { chunks: [Buffer.alloc(12)] },
    { chunks: [Buffer.from([0xff, 0xfe])] },
  ]) {
    mock.restoreAll();
    fakeNetwork([fixture]);
    await assert.rejects(
      new SafeHttpClient({ minIntervalMs: 0, maxBytes: 10 }).get(
        'https://shop.example/',
      ),
    );
  }
});
test('request deadline terminates an unresponsive transport', async () => {
  fakeNetwork([]);
  await assert.rejects(
    new SafeHttpClient({ minIntervalMs: 0, timeoutMs: 10 }).get(
      'https://shop.example/',
    ),
    /deadline/,
  );
});
test('DNS deadline and mixed DNS rebinding answers fail closed', async () => {
  fakeNetwork([]);
  mock.method(dns, 'lookup', async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  syncBuiltinESMExports();
  await assert.rejects(
    new SafeHttpClient({ minIntervalMs: 0 }).get('https://shop.example/'),
    /DNS resolved/,
  );
  mock.method(dns, 'lookup', () => new Promise(() => {}));
  syncBuiltinESMExports();
  await assert.rejects(
    new SafeHttpClient({ minIntervalMs: 0, timeoutMs: 10 }).get(
      'https://shop.example/',
    ),
    /deadline/,
  );
});
