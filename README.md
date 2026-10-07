# AgentShelf

**The open commerce layer for AI agents.** Make ecommerce catalogs discoverable, understandable and queryable by AI.

AgentShelf connects public commerce data to a vendor-neutral catalog, deterministic validation and search, and REST, MCP, ACP and UCP interfaces. Run it on a laptop with no account or API keys. The Agent Commerce Score measures data readiness; it does not predict recommendations or ranking in any agent.

This repository is a pre-release Open Core candidate. Publication and the v1 tag are separate release steps; do not assume the npm name is available until the verified release is published. See [acceptance evidence](docs/v1-readiness.md).

## Quick start

Install Node.js 24 LTS and pnpm 11.19.0. Clone this repository, enter its root directory (the one containing `package.json`), then:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000** and select **Try demo store**. The reserved `https://demo.example/` URL uses bundled fixtures, so this scan works without Internet after dependencies are installed. Enter a real public store URL to use the safe crawler. The local web demo shows scores, products, validation issues and JSON/ACP/UCP downloads. It has no accounts, billing or hosted monitoring.

For CLI use from the repository root:

```bash
pnpm build
node apps/cli/dist/index.js validate examples/sample-catalog/catalog.json
node apps/cli/dist/index.js search examples/sample-catalog/catalog.json "waterproof shoe"
node apps/cli/dist/index.js serve examples/sample-catalog/catalog.json
```

`serve` starts REST at `http://127.0.0.1:3001` and MCP Streamable HTTP at `http://127.0.0.1:3002/mcp`. Visit `/health` or `/v1/products/search?query=waterproof` on the REST server. Press Ctrl+C to stop. Returned data is JSON; the visual interface is started separately with `pnpm dev`.

## Scan and export a store

Replace the URL below with a real store exposing public product data. The default scan limit is 100; robots restrictions are respected and remote scripts are never executed.

```bash
node apps/cli/dist/index.js scan https://your-store.com --limit 100
node apps/cli/dist/index.js export https://your-store.com --format=json --output=catalog.json
node apps/cli/dist/index.js serve catalog.json
```

Export the saved catalog without fetching the merchant again:

```bash
node apps/cli/dist/index.js export catalog.json --format=acp --currency=USD
node apps/cli/dist/index.js export catalog.json --format=ucp --currency=USD
node apps/cli/dist/index.js protocols
```

Every command supports `--help`. Use the global `--json` option for structured scan output and errors. `export` refuses to overwrite existing output files. Missing protocol-required data, ambiguous currencies and unrepresentable offers produce errors instead of fabricated values. The CLI also provides `detect` and `inspect`. Real merchant scans require public network access; the reserved demo domain is simulated only by the web demo and test fixtures.

After an authorized npm release, the equivalent entry point is `npx agentshelf`. Until then use the checked-out build above.

## How it works

```text
public store → safe connector → canonical catalog → validation and score
                                                 → shared query → REST / MCP
                                                 → JSON / ACP / UCP exports
```

The canonical schema owns commerce concepts, not vendor protocols or database structures. Connectors understand source platforms. Protocol adapters consume canonical data. The web application renders API results and contains no scoring, normalization or search logic.

## REST and MCP

REST provides `/openapi.json`, `/health`, `/v1/scans`, `/v1/scans/{id}`, `/v1/catalogs/{id}`, `/v1/products`, `/v1/products/{id}`, `/v1/products/search`, `/v1/validate` and `/v1/exports/{json,acp,ucp}`. Requests and canonical responses are documented in OpenAPI 3.1. Errors carry stable codes and request IDs. JSON request bodies are limited to 1 MiB; local API scans are limited to 100 products.

MCP exposes `search_products`, `get_product`, `check_availability`, `get_shipping_information`, `get_return_policy` and `get_store_information`, using the official SDK and protocol revision **2026-07-28**. REST and MCP share the QueryEngine. In `serve`, a successful API scan updates both interfaces. Injected query engines may support `replaceCatalog`; scanning through the API is rejected if the injected engine cannot activate the resulting catalog.

The servers bind to loopback. Browser origins are rejected by the standalone API unless explicitly configured. The web demo enforces same-origin access and proxies only its local API routes. Availability is a source observation, not a reservation.

## Canonical schema and storage

`@agentshelf/schema` exports Zod schemas, TypeScript types and JSON Schema for version `1.0`. Prices are decimal strings, and product, variant and offer identities remain separate. Unknown availability, inventory, shipping and returns are preserved. [Canonical schema](docs/canonical-schema.md) · [Versioning](docs/schema-versioning.md).

Memory and SQLite repositories implement injectable catalog and scan ports. Local SQLite persistence does not imply hosted synchronization. [Storage](docs/storage.md) · [Query engine](docs/query-engine.md).

## Connectors and extension guides

v1 targets generic structured web pages and public WooCommerce surfaces. Platform detection also recognizes other major ecommerce systems, which can use the generic connector when their public data is compatible. Detection is not a promise of a dedicated connector.

- [Writing a connector and reusable contracts](docs/connectors.md)
- [Complete external connector example](examples/custom-connector)
- [Writing a validator](docs/writing-a-validator.md)
- [Writing a protocol adapter](docs/writing-a-protocol-adapter.md)

## Protocol support

ACP maps the official **2026-04-17 ProductsResponse** feed schema. UCP maps the official **2026-08-25 catalog search response**. Adapters validate generated documents against vendored official schemas and expose exact version/capability metadata. This does not implement checkout, protocol service negotiation, payments or full ACP/UCP compliance. [ACP](docs/protocols/acp.md) · [UCP](docs/protocols/ucp.md) · [MCP](docs/protocols/mcp.md).

## Architecture and commercial boundary

AgentShelf Cloud is a separate private consumer of versioned packages. Accounts, billing, hosted synchronization, AI enrichment, cross-merchant analytics and enterprise controls remain outside this repository. An isolated package-consumer test proves that private repositories, events, credentials and connectors can be injected without patching OSS. [Architecture](docs/architecture.md) · [Cloud boundary](docs/cloud-boundary.md) · [ADRs](docs/adr).

## Development and verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm licenses:check
pnpm security:check
pnpm build
pnpm test:coverage
pnpm packages:check
pnpm sbom:generate
pnpm benchmark
```

For browser acceptance, install Chromium with `pnpm exec playwright-core install chromium`, then run `pnpm test:e2e`. On Linux, `--with-deps` also installs browser system dependencies. `CHROMIUM_EXECUTABLE` can select an existing Chromium executable. Tests and the demo do not depend on live merchants.

[Testing and coverage](docs/testing.md) · [Performance](docs/performance.md) · [Release process](docs/releasing.md) · [Dependency policy](docs/dependency-policy.md).

## Security, license and contribution

Runtime telemetry is disabled: catalog data and scanned URLs are not sent to AgentShelf servers. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). [Crawler security model](docs/security.md).

Code is Apache-2.0. AgentShelf names, logos, domains and trademarks are excluded from the software license; see [TRADEMARKS.md](TRADEMARKS.md). Contributions require DCO sign-off and use Apache-2.0. [Contributing](CONTRIBUTING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md).

## Roadmap

See [PLAN.md](PLAN.md) for milestones and [v1 readiness](docs/v1-readiness.md) for delivered evidence and external release prerequisites. Additional platform connectors can follow v1; commercial hosted operations remain private.
