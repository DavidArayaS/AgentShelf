// SPDX-License-Identifier: Apache-2.0
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';
}
export class FetchError extends Error {
  readonly code = 'FETCH_ERROR';
}
export interface HttpResponse {
  url: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}
export interface HttpClient {
  get(url: string, signal?: AbortSignal): Promise<HttpResponse>;
}
export interface FetchLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  minIntervalMs: number;
}
export const DEFAULT_LIMITS: Readonly<FetchLimits> = Object.freeze({
  timeoutMs: 10000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
  minIntervalMs: 250,
});
export type Resolver = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;
export function isPublicAddress(value: string): boolean {
  try {
    const address = ipaddr.parse(value);
    return address.range() === 'unicast';
  } catch {
    return false;
  }
}
/** Syntax and literal-address checks do not substitute for DNS validation at connection time. */
export function validateRemoteUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new UnsafeUrlError('Invalid remote URL', { cause });
  }
  if (
    input.length > 8192 ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new UnsafeUrlError('Only credential-free HTTP(S) URLs are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test') ||
    host.endsWith('.invalid') ||
    host === 'metadata.google.internal' ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new UnsafeUrlError('Nonpublic destination is forbidden');
  if (url.port && !['80', '443'].includes(url.port))
    throw new UnsafeUrlError('Only standard web ports are allowed');
  url.hash = '';
  return url;
}
export async function resolvePublic(
  url: URL,
  resolver: Resolver = (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
): Promise<{ address: string; family: 4 | 6 }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host);
  if (
    !addresses.length ||
    addresses.some(
      (a) =>
        !isPublicAddress(a.address) ||
        ![4, 6].includes(a.family) ||
        isIP(a.address) !== a.family,
    )
  )
    throw new UnsafeUrlError('DNS resolved to a nonpublic or invalid address');
  const selected = addresses[0];
  if (!selected) throw new UnsafeUrlError('No public address');
  return { address: selected.address, family: selected.family as 4 | 6 };
}
/** Native transport pins the previously vetted address; the hostname still controls TLS SNI/certificate checks. */
async function requestPinned(
  url: URL,
  address: { address: string; family: 4 | 6 },
  signal: AbortSignal,
  maxBytes: number,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        agent: false,
        signal,
        headers: {
          'user-agent':
            'AgentShelf/0.1 (+https://github.com/DavidArayaS/AgentShelf)',
          'accept-encoding': 'identity',
          accept: 'text/html, application/json, application/xml, text/plain',
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (response) => {
        const encoding = response.headers['content-encoding'];
        // No decompression means even misleading compressed bombs cannot expand in memory.
        if (encoding && encoding.toLowerCase() !== 'identity') {
          response.destroy();
          reject(
            new FetchError(
              'Compressed responses are unsupported; server must honor identity encoding',
            ),
          );
          return;
        }
        const declared = response.headers['content-length'];
        if (
          declared &&
          (!/^\d+$/.test(declared) || Number(declared) > maxBytes)
        ) {
          response.destroy();
          reject(new FetchError('Response exceeds byte limit'));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            response.destroy(new FetchError('Response exceeds byte limit'));
          } else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers))
            if (value !== undefined)
              headers[key] = Array.isArray(value) ? value.join(', ') : value;
          try {
            resolve({
              url: url.href,
              status: response.statusCode ?? 0,
              headers,
              body: new TextDecoder('utf-8', { fatal: true }).decode(
                Buffer.concat(chunks),
              ),
            });
          } catch (cause) {
            reject(new FetchError('Response is not valid UTF-8', { cause }));
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}
export class SafeHttpClient implements HttpClient {
  readonly limits: Readonly<FetchLimits>;
  #tail: Promise<unknown> = Promise.resolve();
  #lastRequest = 0;
  constructor(limits: Partial<FetchLimits> = {}) {
    this.limits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
    for (const [name, value] of Object.entries(this.limits))
      if (!Number.isSafeInteger(value) || value < 0)
        throw new FetchError(`Invalid limit: ${name}`);
    if (
      this.limits.timeoutMs < 1 ||
      this.limits.maxBytes < 1 ||
      this.limits.maxRedirects > 10
    )
      throw new FetchError('Unsafe fetch limits');
  }
  /** Serial requests enforce a per-client concurrency cap of one and a global start-rate limit. */
  get(input: string, external?: AbortSignal): Promise<HttpResponse> {
    const operation = this.#tail.then(() => this.#get(input, external));
    this.#tail = operation.catch(() => {});
    return operation;
  }
  async #get(input: string, external?: AbortSignal): Promise<HttpResponse> {
    const controller = new AbortController();
    const abort = () => controller.abort(external?.reason);
    external?.addEventListener('abort', abort, { once: true });
    if (external?.aborted) abort();
    const timer = setTimeout(
      () => controller.abort(new FetchError('Request deadline exceeded')),
      this.limits.timeoutMs,
    );
    const signal = controller.signal;
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });
    try {
      signal.throwIfAborted();
      let url = validateRemoteUrl(input);
      const seen = new Set<string>();
      for (let redirects = 0; ; redirects++) {
        if (seen.has(url.href)) throw new FetchError('Redirect cycle');
        seen.add(url.href);
        const delay = Math.max(
          0,
          this.#lastRequest + this.limits.minIntervalMs - Date.now(),
        );
        if (delay)
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, delay)),
            aborted,
          ]);
        const address = await Promise.race([resolvePublic(url), aborted]);
        signal.throwIfAborted();
        this.#lastRequest = Date.now();
        const result = await Promise.race([
          requestPinned(url, address, signal, this.limits.maxBytes),
          aborted,
        ]);
        if ([301, 302, 303, 307, 308].includes(result.status)) {
          if (redirects >= this.limits.maxRedirects)
            throw new FetchError('Redirect limit exceeded');
          if (!result.headers.location)
            throw new FetchError('Redirect has no Location');
          url = validateRemoteUrl(new URL(result.headers.location, url).href);
          continue;
        }
        return result;
      }
    } catch (error) {
      if (external?.aborted) throw error;
      if (error instanceof FetchError || error instanceof UnsafeUrlError)
        throw error;
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
        throw new FetchError('Store hostname could not be resolved', {
          cause: error,
        });
      throw new FetchError(
        'Connection to store failed; check network access and TLS',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    }
  }
}
/** Bound nesting and reject prototype-related keys before consumers traverse hostile JSON. */
export function parseBoundedJson(
  text: string,
  maxBytes = 2 * 1024 * 1024,
  maxDepth = 32,
): unknown {
  if (Buffer.byteLength(text) > maxBytes)
    throw new FetchError('JSON exceeds byte limit');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      depth++;
      if (depth > maxDepth) throw new FetchError('JSON exceeds nesting limit');
    } else if (character === '}' || character === ']') depth--;
  }
  try {
    return JSON.parse(text, (key, value: unknown) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new FetchError('Unsafe JSON property');
      if (
        typeof value === 'string' &&
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          value,
        )
      )
        throw new FetchError('Invalid Unicode');
      return value;
    });
  } catch (cause) {
    throw new FetchError('Malformed or unsafe JSON', { cause });
  }
}
