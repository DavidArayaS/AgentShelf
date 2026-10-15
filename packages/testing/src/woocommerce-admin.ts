// SPDX-License-Identifier: Apache-2.0
import type { HttpClient } from '@agentshelf/connector-sdk';
export const wooFixtureUrl = 'https://merchant.example/';
export const wooFixtureCredentials = Object.freeze({
  consumerKey: 'fixture-key-do-not-use',
  consumerSecret: 'fixture-secret-do-not-use',
});
/** Fake read-only API, not an alternative network transport for real origins. */
export function createWooAdminFixture(count = 250): HttpClient {
  const base = '/wp-json/wc/v3/';
  const product = (id: number) => ({
    id,
    type: id === 1 ? 'variable' : 'simple',
    name: `Wireless Headphones ${id}`,
    description: '<p>Wireless headphones with active noise cancellation.</p>',
    permalink: `${wooFixtureUrl}products/${id}`,
    sku: `HEAD-${id}`,
    price: '179.99',
    stock_status: 'instock',
    manage_stock: true,
    stock_quantity: 12,
    categories: [{ id: 1, name: 'Audio' }],
    images: [{ src: `${wooFixtureUrl}images/${id}.jpg`, alt: 'Headphones' }],
    attributes: [{ name: 'wireless', options: ['true'] }],
    brands: [{ name: 'Fixture Audio' }],
    variations: id === 1 ? [10001, 10002] : [],
  });
  return {
    async get(input, signal, options) {
      signal?.throwIfAborted();
      const url = new URL(input);
      if (url.origin !== new URL(wooFixtureUrl).origin)
        throw new Error('Outside authorized fixture');
      if (
        options?.authorization !==
        `Basic ${Buffer.from(`${wooFixtureCredentials.consumerKey}:${wooFixtureCredentials.consumerSecret}`).toString('base64')}`
      )
        return { url: input, status: 401, headers: {}, body: '{}' };
      let data: unknown,
        headers: Record<string, string> = {};
      if (url.pathname === `${base}data/currencies/current`)
        data = { code: 'USD' };
      else if (url.pathname === `${base}products`) {
        const page = Number(url.searchParams.get('page'));
        data = Array.from(
          { length: Math.min(100, Math.max(0, count - (page - 1) * 100)) },
          (_, i) => product((page - 1) * 100 + i + 1),
        );
        headers = {
          'x-wp-total': String(count),
          'x-wp-totalpages': String(Math.ceil(count / 100)),
        };
      } else if (url.pathname === `${base}products/1/variations`)
        data = [10001, 10002].map((id, index) => ({
          id,
          sku: `HEAD-1-${index}`,
          price: index === 0 ? '179.99' : '189.99',
          stock_status: index === 0 ? 'instock' : 'outofstock',
          manage_stock: true,
          stock_quantity: index === 0 ? 4 : 0,
          attributes: [
            { name: 'color', option: index === 0 ? 'black' : 'white' },
          ],
          image: { src: `${wooFixtureUrl}images/1.jpg` },
        }));
      else if (new RegExp(`^${base}products/[0-9]+$`).test(url.pathname))
        data = product(Number(url.pathname.split('/').at(-1)));
      else return { url: input, status: 404, headers: {}, body: '{}' };
      return { url: input, status: 200, headers, body: JSON.stringify(data) };
    },
  };
}
