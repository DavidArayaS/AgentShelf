// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPlatform } from '../dist/index.js';
test('recognizes all supported platforms without executing scripts', () => {
  for (const [platform, html] of Object.entries({
    woocommerce: 'wp-content/plugins/woocommerce',
    shopify: 'cdn.shopify.com',
    wix: 'wixstatic.com',
    squarespace: 'static.squarespace.com',
    magento: 'Magento_Catalog',
    bigcommerce: 'cdn.bigcommerce.com',
    vtex: 'vtexassets.com',
    tiendanube: 'nuvemshop',
    prestashop: 'prestashop',
    shopware: 'shopware',
  })) {
    const result = detectPlatform(html);
    assert.equal(result.platform, platform);
    assert.ok(result.signals.length);
    assert.ok(result.confidence > 0 && result.confidence < 1);
  }
  assert.equal(
    detectPlatform('<script>throw new Error("never execute")</script>')
      .platform,
    'unknown',
  );
});
test('distinguishes custom structured commerce, unknown content and header signals', () => {
  assert.equal(
    detectPlatform(
      '<script type="application/ld+json">{"@type":"Product"}</script>',
    ).platform,
    'custom',
  );
  assert.equal(detectPlatform('').confidence, 0);
  assert.equal(
    detectPlatform('', { 'X-Wix-Request-Id': 'abc' }).platform,
    'wix',
  );
});
