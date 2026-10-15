# Connectors for existing commerce systems

Connectors adapt source systems into canonical commerce; they do not contain agent-protocol fields. Built-ins include public generic web, public WooCommerce Store API and authorized WooCommerce REST v3. Other detected platforms use compatible generic public surfaces until a dedicated connector is supplied. Detection does not promise complete extraction.

## Merchant-authorized WooCommerce

Official source reviewed before implementation: [WooCommerce REST API v3 docs](https://woocommerce.github.io/woocommerce-rest-api-docs/), repository revision `09431ca9a114289d298fd2a5d5b604ea50f6d197`. Relevant official source: [authentication](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/09431ca9a114289d298fd2a5d5b604ea50f6d197/source/includes/wp-api-v3/_authentication.md), [pagination](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/09431ca9a114289d298fd2a5d5b604ea50f6d197/source/includes/wp-api-v3/_introduction.md), [products](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/09431ca9a114289d298fd2a5d5b604ea50f6d197/source/includes/wp-api-v3/_products.md), [variations](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/09431ca9a114289d298fd2a5d5b604ea50f6d197/source/includes/wp-api-v3/_product-variations.md) and [currency](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/09431ca9a114289d298fd2a5d5b604ea50f6d197/source/includes/wp-api-v3/_data.md).

Create a WooCommerce REST API key with **Read** permission through the merchant's existing WooCommerce settings. Locally supply `AGENTSHELF_WC_CONSUMER_KEY` / `AGENTSHELF_WC_CONSUMER_SECRET` through your shell's secure environment mechanism. Never put real values in arguments, URLs, screenshots or Git. There is no AgentShelf-hosted credential storage or authorization callback.

```bash
node apps/cli/dist/index.js ingest https://your-store.com/ --connector woocommerce-admin --output=catalog.json
node apps/cli/dist/index.js serve catalog.json
```

Use the WordPress store base URL (including its installation subdirectory if any), not a category/product URL. The adapter reads `wp-json/wc/v3/data/currencies/current`, ordered `products?per_page=100&page=N&status=any` and concrete product variations. It uses Basic authorization headers over validated HTTPS, never query-string credentials, and rejects every authenticated redirect. It makes no writes. Some hosting configurations strip authorization headers; correct the merchant's server configuration instead of moving secrets into URLs. Keys must have permission to read these endpoints.

Read currency from the source; never assume USD. Map product/variant identities, SKU/GTIN when present, categories/brands/images/attributes, plain descriptions, exact decimal prices, stock status/quantity and reviews. Variable parents do not get an invented sellable offer; concrete variations carry their own price/availability. Missing inventory remains unknown. Shipping promises, return rules, plugin-specific multicurrency and arbitrary private metadata are not fabricated. See [coverage rules](acquisition-model.md). Tests use the official response contracts through deterministic fixtures; a real merchant credential/server check remains deployment-specific.

## Extension contract

`CommerceConnector` remains `metadata`, `detect(target, context)`, bounded asynchronous `discoverProducts(target, context)` and `fetchProduct(reference, target, context)`. Public metadata declares `{ mode: 'public_discovery', authority: 'public_observation' }`. Authorized metadata declares `{ mode: 'authorized_connector', authority: 'merchant_authorized' }`.

Register public adapters with `scanStore(url, { connectors: [...] })`; selection uses supported detection confidence with registration order breaking ties. Authorized adapters are excluded from public detection. Explicitly select them using `ingestStore(url, { connector, credentials, ...ports })`. There is no implicit admin probe/fallback to public scanning when authorized access fails.

Use `context.http.get(url, context.signal, options)` for remote access. Optional `options.authorization` requires HTTPS and prohibits redirects in SafeHttpClient. Production retains DNS validation/pinning, byte/time/rate bounds, URL validation and TLS verification; tests inject fixtures. Pass the signal, enforce limits, bound pagination and keep stable identities. Merchant ID is `stableId('merchant', new URL(target.url).origin)`. Never log provider values or serialize raw exceptions/response bodies. Built-in authorized errors are fixed safe diagnostics; orchestration sanitizes arbitrary private-adapter failures.

Optional `context.reportEnumeration({ authenticated, expectedProducts, paginationExhausted })` records source evidence. Report exhaustion only after validating totals, unique identities and page termination. Core also checks normalized counts and failures before assigning coverage. Legacy connectors without acquisition metadata retain public-observation semantics. Product provenance describes each observation; catalog acquisition metadata describes coverage.

The complete [public catalog example](../examples/custom-connector) illustrates a connector outside core. Community/private connectors can use:

```js
import { runConnectorContractTests } from '@agentshelf/testing';
import { myConnector, fixtureContext } from './your-fixture.js';
runConnectorContractTests(
  myConnector,
  { url: 'https://fixture.example/' },
  fixtureContext,
);
```

The factory supplies representative HTTP/context fixtures. Shared tests verify detection, bounded discovery, normalization, stable identities, malformed payloads, failures and cancellation. Authorized failures may expose a safe error code instead of the injected raw transport message. Add source-specific totals/pagination/variants/credential tests. The packaged private consumer injects a private connector, credential provider, repository and event sink without copying or patching core.
