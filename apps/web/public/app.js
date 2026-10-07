// SPDX-License-Identifier: Apache-2.0
const element = (id) => document.getElementById(id);
const status = element('status');
let busy = false;
async function jsonRequest(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}
function text(tag, value, parent) {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}
async function scan(url) {
  if (busy) return;
  busy = true;
  element('scan-button').disabled = true;
  element('demo-button').disabled = true;
  element('results').hidden = true;
  status.textContent = 'Scanning store… Larger stores may take a few minutes.';
  try {
    const { report } = await jsonRequest('/v1/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, limit: 100 }),
    });
    const validation = await jsonRequest('/v1/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report.catalog),
    });
    const issues = validation.products
      .flatMap((product) => product.results)
      .filter((rule) => rule.status !== 'pass');
    element('score').textContent = `${report.score.overall} / 100`;
    element('count').textContent = report.productsNormalized;
    element('critical').textContent = issues.filter(
      (rule) => rule.severity === 'critical',
    ).length;
    element('warnings').textContent = issues.filter(
      (rule) => rule.severity === 'warning',
    ).length;
    element('platform').textContent =
      `Platform: ${report.platform.platform} · ${Math.round(report.platform.confidence * 100)}% detection confidence`;
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
    status.textContent = report.productsNormalized
      ? `Scan complete. ${report.failures} extraction failures.`
      : 'No products discovered. Check whether the store exposes public product data and a sitemap.';
  } catch (error) {
    status.textContent = `Could not complete scan: ${error.message}`;
  } finally {
    busy = false;
    element('scan-button').disabled = false;
    element('demo-button').disabled = false;
  }
}
element('scan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void scan(element('store-url').value);
});
element('demo-button').addEventListener('click', () => {
  element('store-url').value = 'https://demo.example/';
  void scan('https://demo.example/');
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
