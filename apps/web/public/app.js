// SPDX-License-Identifier: Apache-2.0
const element = (id) => document.getElementById(id);
const status = element('status');
let busy = false;
async function jsonRequest(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `${data.error?.code ?? 'REQUEST_FAILED'}: ${data.error?.message ?? 'Request failed'}`,
    );
  return data;
}
function text(tag, value, parent) {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}
async function acquire(url, catalog) {
  if (busy) return;
  busy = true;
  element('scan-button').disabled = true;
  element('demo-button').disabled = true;
  element('import-button').disabled = true;
  element('results').hidden = true;
  status.textContent = catalog
    ? 'Importing catalog…'
    : 'Observing public store data… Larger stores may take a few minutes.';
  try {
    const { report } = await jsonRequest(
      catalog ? '/v1/imports' : '/v1/scans',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(catalog ?? { url, limit: 100 }),
      },
    );
    const validation = await jsonRequest('/v1/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report.catalog),
    });
    const issues = validation.products
      .flatMap((product) => product.results)
      .filter((rule) => rule.status !== 'pass');
    element('score').textContent = `${report.score.overall} / 100`;
    element('count').textContent = report.acquisition.coverage.observedProducts;
    element('critical').textContent = issues.filter(
      (rule) => rule.severity === 'critical',
    ).length;
    element('warnings').textContent = issues.filter(
      (rule) => rule.severity === 'warning',
    ).length;
    element('platform').textContent = report.platform
      ? `Platform: ${report.platform.platform} · ${Math.round(report.platform.confidence * 100)}% detection confidence`
      : 'Source: merchant-provided canonical JSON';
    const modes = {
      public_discovery: 'Public discovery',
      authorized_connector: 'Authorized connector',
      direct_import: 'Direct import',
    };
    const authorities = {
      public_observation: 'Public observation',
      merchant_authorized: 'Merchant authorized',
      merchant_provided: 'Merchant provided',
    };
    element('acquisition').textContent =
      `Acquisition: ${modes[report.acquisition.mode]} · Authority: ${authorities[report.acquisition.authority]}`;
    const coverage = report.acquisition.coverage;
    element('coverage').textContent =
      `Coverage: ${coverage.status.toUpperCase()} — ${coverage.reason}`;
    element('readiness-label').textContent =
      coverage.status === 'complete'
        ? 'Catalog Readiness'
        : 'Observed Catalog Readiness';
    element('search-products').replaceChildren();
    element('search-status').textContent = '';
    const categories = element('categories');
    categories.replaceChildren();
    for (const [name, score] of Object.entries(report.score.categories)) {
      const card = text('div', '', categories);
      text('span', name.replaceAll('-', ' '), card);
      text('strong', `${score} / 100`, card);
    }
    const products = element('products');
    products.replaceChildren();
    for (const product of report.catalog.products) {
      const card = text('article', '', products);
      text('h4', product.name, card);
      text('p', product.description ?? 'Description unavailable', card);
      const rules =
        validation.products.find((result) => result.productId === product.id)
          ?.results ?? [];
      const list = text('ul', '', card);
      for (const rule of rules.filter((rule) => rule.status !== 'pass'))
        text(
          'li',
          `${rule.status === 'unknown' ? 'Unknown' : 'Issue'} — ${rule.message}${rule.remediation ? `: ${rule.remediation}` : ''}`,
          list,
        );
      if (!list.children.length)
        text('p', 'All current validation checks passed.', card);
    }
    element('results').hidden = false;
    status.textContent = coverage.observedProducts
      ? `${coverage.observedProducts} products acquired. ${coverage.failures} acquisition failures. ${(report.issues ?? []).map((issue) => issue.code).join(', ')}`
      : `No products observed. ${(report.issues ?? []).map((issue) => issue.code).join(', ')} Try a merchant-authorized connector or import a canonical catalog.`;
  } catch (error) {
    status.textContent = `${catalog ? 'Could not import catalog' : 'Could not complete scan'}: ${error.message}`;
  } finally {
    busy = false;
    element('scan-button').disabled = false;
    element('demo-button').disabled = false;
    element('import-button').disabled = false;
  }
}
element('scan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void acquire(element('store-url').value);
});
element('demo-button').addEventListener('click', () => {
  element('store-url').value = 'https://demo.example/';
  void acquire('https://demo.example/');
});
for (const button of document.querySelectorAll('[data-format]'))
  button.addEventListener('click', async () => {
    try {
      const format = button.dataset.format;
      const currency = element('currency').value.trim().toUpperCase();
      const data = await jsonRequest(
        `/v1/exports/${format}${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `agentshelf-${format}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      status.textContent = `Export unavailable: ${error.message}`;
    }
  });

element('import-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const file = element('catalog-file').files[0];
    if (!file || file.size > 1024 * 1024)
      throw new Error(
        'Choose a canonical JSON file up to 1 MiB. Use the CLI for larger files.',
      );
    await acquire(undefined, JSON.parse(await file.text()));
  } catch (error) {
    status.textContent = `Could not import catalog: ${error.message}`;
  }
});
element('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await jsonRequest(
      `/v1/products/search?query=${encodeURIComponent(element('search-query').value)}&limit=20`,
    );
    element('search-status').textContent = `${result.total} matching products`;
    const container = element('search-products');
    container.replaceChildren();
    for (const product of result.products) {
      const card = text('article', '', container);
      text('h4', product.name, card);
      text('p', product.description ?? 'Description unavailable', card);
    }
  } catch (error) {
    element('search-status').textContent = `Search failed: ${error.message}`;
  }
});
