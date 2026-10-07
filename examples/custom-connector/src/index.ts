// SPDX-License-Identifier: Apache-2.0
import { parseBoundedJson } from '@agentshelf/crawler';
import { CatalogSchema, stableId } from '@agentshelf/schema';
import {
  ConnectorError,
  type CommerceConnector,
  type ConnectorContext,
  type StoreTarget,
} from '@agentshelf/connector-sdk';
/** Example for a merchant publishing a canonical catalog at /catalog.json. */
async function load(target: StoreTarget, context: ConnectorContext) {
  context.signal?.throwIfAborted();
  const response = await context.http.get(
    new URL('/catalog.json', target.url).href,
    context.signal,
  );
  if (response.status !== 200)
    throw new ConnectorError('Public catalog is unavailable');
  return CatalogSchema.parse(parseBoundedJson(response.body));
}
export const catalogConnector: CommerceConnector = {
  metadata: { id: 'example-catalog', version: '0.1.0', platforms: ['custom'] },
  async detect(target, context) {
    await load(target, context);
    return {
      platform: 'custom',
      confidence: 1,
      signals: [{ type: 'url', value: '/catalog.json' }],
    };
  },
  async *discoverProducts(target, context) {
    const catalog = await load(target, context);
    for (const product of catalog.products.slice(0, context.limit)) {
      context.signal?.throwIfAborted();
      yield { url: product.url, sourceId: product.id };
    }
  },
  async fetchProduct(reference, target, context) {
    const catalog = await load(target, context);
    const product = catalog.products.find(
      (p) => p.id === reference.sourceId && p.url === reference.url,
    );
    if (!product)
      throw new ConnectorError('Product no longer exists in catalog');
    return {
      ...product,
      merchantId: stableId('merchant', new URL(target.url).origin),
    };
  },
};
