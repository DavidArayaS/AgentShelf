# Writing a connector

A connector exports a `CommerceConnector` from `@agentshelf/connector-sdk`: stable metadata, `detect(target, context)`, bounded asynchronous `discoverProducts(target, context)`, and `fetchProduct(reference, target, context)` returning canonical products. Register it through `scanStore(url, { connectors: [connector] })`. The scanner evaluates registered connectors and selects a supported detection result by confidence; registration order breaks ties. Include the generic connector last if a fallback is desired. Detection failures propagate rather than silently masking network/security failures.

Use only `context.http.get(url, context.signal)` for remote access. Production supplies SafeHttpClient; tests inject fixtures. Honor cancellation in discovery loops, enforce `context.limit`, keep source and product identities stable, preserve provenance, and avoid inventing missing prices or inventory. Merchant identities should use `stableId('merchant', new URL(target.url).origin)` to match the scanner's catalog ownership. Credentials are an optional injected provider; never log them or require them for the built-in v1 connectors.

The generic connector consumes robots, bounded nested sitemaps, JSON-LD, canonical links and metadata. WooCommerce uses public product surfaces, falling back to generic discovery when the public API is unavailable according to its documented statuses. Neither executes merchant JavaScript. Detection of another platform does not imply a dedicated extraction connector.

The complete [public catalog example](../examples/custom-connector) reads `/catalog.json`, detects support, discovers and fetches products, handles failures/cancellation, and runs the shared toolkit without editing core.

```js
import { runConnectorContractTests } from '@agentshelf/testing';
import { myConnector, fixtureContext } from './your-fixture.js';

runConnectorContractTests(
  myConnector,
  { url: 'https://fixture.example/' },
  fixtureContext,
);
```

`fixtureContext` is a factory returning a fresh ConnectorContext and a deterministic fixture HTTP client. Provide real representative discovery/product responses, including duplicate and paginated surfaces where applicable. The suite verifies detection, bounded unique discovery, stable canonical products, malformed/missing payload rejection, transport failures and cancellation. Add platform-specific variants, pagination, robots and source-format tests alongside it.

Keep protocol fields, Cloud dependencies, SQL and billing out of connectors. Publish only deliberate export-map entry points, compiled artifacts, license/notice and necessary fixtures; use Apache-2.0-compatible dependencies.
