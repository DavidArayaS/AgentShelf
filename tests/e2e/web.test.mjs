// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { startWeb } from '../../apps/web/dist/index.js';
test('browser scans offline demo, renders validation and downloads supported protocols', async () => {
  const app = await startWeb(0);
  const executablePath =
    process.env.CHROMIUM_EXECUTABLE ??
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);
    await page.getByRole('button', { name: 'Try demo store' }).click();
    await page.locator('#results').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#count').textContent(), '1');
    assert.match(
      await page.locator('#products').textContent(),
      /Waterproof Trail Shoe/,
    );
    assert.match(await page.locator('#categories').textContent(), /pricing/);
    assert.match(
      await page.locator('#acquisition').textContent(),
      /Public discovery/,
    );
    assert.match(await page.locator('#coverage').textContent(), /UNKNOWN/);
    await page
      .locator('#catalog-file')
      .setInputFiles('examples/sample-catalog/catalog.json');
    await page
      .getByRole('button', { name: 'Import catalog', exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('#acquisition')
        .textContent.includes('Direct import'),
    );
    await page.locator('#search-query').fill('running shoe under $150');
    await page
      .getByRole('button', { name: 'Search products', exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('#search-status')
        .textContent.includes('1 matching'),
    );
    assert.match(
      await page.locator('#search-products').textContent(),
      /Waterproof Trail Shoe/,
    );
    for (const format of ['JSON', 'ACP', 'UCP']) {
      const download = page.waitForEvent('download');
      await page
        .getByRole('button', { name: `Download ${format}`, exact: true })
        .click();
      assert.equal(
        (await download).suggestedFilename(),
        `agentshelf-${format.toLowerCase()}.json`,
      );
    }
    await mkdir('reports', { recursive: true });
    await page.screenshot({ path: 'reports/web-demo.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator('#store-url').fill('http://127.0.0.1/');
    await page.getByRole('button', { name: 'Scan store' }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('#status')
        .textContent.includes('Could not complete scan'),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await app.close();
  }
});
