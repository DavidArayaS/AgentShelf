# Connectors

A connector implements the `Connector` contract from `@agentshelf/connector-sdk`: it declares stable metadata, identifies supported stores from evidence, discovers product URLs within an explicit limit, and extracts source records into the canonical model. Connector methods receive the injected `SafeHttpClient`, cancellation signal, and logger through `ConnectorContext`; they do not create their own network client.

`@agentshelf/connector-generic-web` reads product JSON-LD and bounded sitemaps from ordinary public pages. `@agentshelf/connector-woocommerce` detects public WooCommerce stores and consumes public product surfaces. Platform detection returns ranked evidence and leaves unknown stores available to the generic connector. Neither connector runs store JavaScript or needs credentials.

Every discovered URL remains untrusted. The crawler enforces HTTP(S), public DNS, redirect revalidation, bounded response sizes and timeouts, and robots rules. Fixture transports are injected in tests only. A connector should preserve source URLs, avoid fabricating missing values, and return provenance so a later validator can explain each result.

Third-party authors can implement the same exported contract and reuse the SDK's exported reference validation. See `examples/custom-connector` for the small package shape. Its test demonstrates SDK reuse; reusable conformance helpers remain a follow-up. Real connectors should also test bounded discovery, malformed source data, cancellation, and failure behavior.
