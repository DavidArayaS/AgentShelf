// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { startApi } from '@agentshelf/api';
import { SafeHttpClient } from '@agentshelf/crawler';
import { createDemoHttp, demoCatalog, demoUrl } from '@agentshelf/testing';
/** Local demo. Only demo.example is simulated; real stores retain the safe HTTP transport. */
export async function startWeb(port = 3000) {
  const demo = createDemoHttp();
  const safe = new SafeHttpClient();
  const api = await startApi(
    {
      catalog: demoCatalog,
      scanOptions: {
        http: {
          get(url, signal) {
            return new URL(url).origin === new URL(demoUrl).origin
              ? demo.get(url, signal)
              : safe.get(url, signal);
          },
        },
      },
    },
    0,
  );
  const address = api.address();
  if (!address || typeof address === 'string')
    throw new Error('API did not bind');
  const apiBase = `http://127.0.0.1:${address.port}`;
  const assets: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html'],
    '/app.js': ['app.js', 'text/javascript'],
    '/style.css': ['style.css', 'text/css'],
  };
  const server = createServer(
    { requestTimeout: 15000, maxHeaderSize: 16384 },
    (request, response) => {
      void (async () => {
        const current = server.address();
        const localPort =
          current && typeof current !== 'string' ? current.port : port;
        const hosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
        if (
          !hosts.includes(request.headers.host ?? '') ||
          (request.headers.origin &&
            request.headers.origin !== `http://${request.headers.host}`)
        ) {
          response.writeHead(403);
          response.end('Forbidden origin');
          return;
        }
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader(
          'content-security-policy',
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        );
        response.setHeader('cache-control', 'no-store');
        const path = request.url ?? '/';
        if (
          path.startsWith('/v1/') ||
          path === '/health' ||
          path === '/openapi.json'
        ) {
          if (!['GET', 'POST'].includes(request.method ?? '')) {
            response.writeHead(405);
            response.end();
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of request) {
            const buffer = Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > 1024 * 1024) {
              response.writeHead(413);
              response.end('Body too large');
              return;
            }
            chunks.push(buffer);
          }
          const upstream = await fetch(apiBase + path, {
            method: request.method ?? 'GET',
            headers: { 'content-type': 'application/json' },
            ...(request.method === 'POST'
              ? { body: Buffer.concat(chunks) }
              : {}),
            signal: AbortSignal.timeout(120000),
          });
          response.writeHead(upstream.status, {
            'content-type': 'application/json; charset=utf-8',
          });
          response.end(await upstream.text());
          return;
        }
        const asset = assets[path];
        if (!asset || request.method !== 'GET') {
          response.writeHead(404);
          response.end('Not found');
          return;
        }
        response.writeHead(200, {
          'content-type': `${asset[1]}; charset=utf-8`,
        });
        response.end(
          await readFile(new URL(`../public/${asset[0]}`, import.meta.url)),
        );
      })().catch(() => {
        if (!response.headersSent)
          response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ error: { message: 'Local request failed' } }),
        );
      });
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    api.closeAllConnections();
    api.close();
    throw error;
  }
  return {
    server,
    async close() {
      server.closeAllConnections();
      api.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => api.close(() => resolve())),
      ]);
    },
  };
}
