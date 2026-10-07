# AgentShelf

**The open commerce layer for AI agents.** Make ecommerce catalogs discoverable, understandable and queryable by AI.

AgentShelf connects public commerce data to one vendor-neutral catalog, deterministic checks and shared product search. The repository is an early, pre-release open core. It does not predict AI rankings, provide hosted cloud services, execute store JavaScript or send telemetry.

## Quick start

Requirements: Node.js 24 LTS and pnpm 11.19.0.

```bash
pnpm install --frozen-lockfile
pnpm --filter agentshelf build
pnpm --filter agentshelf exec agentshelf protocols
```

The package can also be run locally with `pnpm --filter agentshelf exec agentshelf --help` after building.

To scan the deterministic offline demo, run the commands from the repository root:

```bash
pnpm --filter agentshelf exec agentshelf validate examples/sample-catalog/catalog.json
```

The fixture connector is exercised in tests; the sample product catalog can be queried or served offline:

```bash
pnpm --filter agentshelf exec agentshelf validate examples/sample-catalog/catalog.json
pnpm --filter agentshelf exec agentshelf search examples/sample-catalog/catalog.json "waterproof shoe"
pnpm --filter agentshelf exec agentshelf serve examples/sample-catalog/catalog.json
```

REST is served on `127.0.0.1:3001`; MCP Streamable HTTP is served on `127.0.0.1:3002/mcp`. Processes stay local. Press Ctrl+C to stop. ACP and UCP feed/catalog documents can be exported with an explicit currency when needed. Their exact release versions and gaps are listed by `agentshelf protocols`.

## How it works

```text
public store → safe connector → canonical catalog → validation and score → shared query → CLI, REST, MCP, protocol documents
```

Node.js 24 and the checked in pnpm lockfile pin the build environment. Remote-store checks need ordinary public HTTP(S) access and honor robots exclusions. The offline catalog validation, query and protocol fixture tests do not call merchant websites.

## CLI

`agentshelf --help` lists the current commands. Implemented commands include `detect`, `scan`, `inspect`, `validate`, `search`, `export`, `serve` and `protocols`. Pass `--json` for structured scan/errors. Unknown protocol documents and invalid arguments fail with non-zero exit codes; no checkout or account operation is offered.

A scan defaults to 100 products and never requires a merchant credential. `--limit` is bounded. Scans report discovery evidence, product validation and a versioned data-readiness score; the score does not predict recommendations or ranking in any agent.

## REST

The local API uses OpenAPI 3.1 and versioned JSON: `/openapi.json`, `/health`, `/v1/scans`, `/v1/scans/{id}`, `/v1/catalogs/{id}`, `/v1/products`, `/v1/products/{id}`, `/v1/products/search`, `/v1/validate`, and `/v1/exports/json`. The local API also provides ACP and UCP catalog documents only when their exact protocol requirements are met. Errors carry stable codes and request IDs.

There are no accounts, authentication or payment endpoints. Bind only to loopback. Browser origins are rejected by default; the demo opts into its exact loopback UI origin only.

## MCP

The local MCP server uses the official `@modelcontextprotocol/server` v2.3.1 for protocol revision `2026-07-28`. It exposes `search_products`, `get_product`, `check_availability`, `get_shipping_information`, `get_return_policy` and `get_store_information`. MCP and REST call the same deterministic QueryEngine. Availability is a source observation, not a reservation.

## Canonical commerce schema

`@agentshelf/schema` provides Zod 4 schemas, TypeScript types and generated JSON Schema 2020-12 for schema version `1.0`. Prices use exact decimal strings and ISO currency codes; a product, variant and offer have separate identities. Unknown availability, inventory, shipping, returns and ratings stay explicit. See [canonical schema](docs/canonical-schema.md) and [versioning](docs/schema-versioning.md).

## Connectors

Current implementations are the generic structured web connector and a public WooCommerce connector. Both use bounded HTTP, reject private and loopback DNS results, respect robots rules and do not run remote scripts. See [connector documentation](docs/connectors.md). Connector SDK consumers can use the conformance contract in `packages/connector-sdk/test`.

## ACP and UCP

The ACP adapter maps the official **2026-04-17** feed schema and validates generated feed documents. The UCP adapter maps the official **2026-08-25** catalog search response and validates against that pinned schema set. Both refuse ambiguous currencies, unrepresentable offers, and missing protocol-required fields. A catalog schema-valid document is a partial catalog capability; neither package implements full checkout, feed-service, payment or account conformance. See [ACP mapping](docs/protocols/acp.md), [UCP mapping](docs/protocols/ucp.md), and [MCP mapping](docs/protocols/mcp.md).

## Architecture

Dependencies point from adapters toward the canonical model. Storage, event, clock, connector and query implementations are injectable. The private AgentShelf Cloud repository consumes published packages and implements its own infrastructure. Accounts, billing, hosted synchronization, AI enrichment and cross-merchant analytics remain private. See [architecture](docs/architecture.md), [Cloud boundary](docs/cloud-boundary.md) and [ADRs](docs/adr).

## Developer workflow

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm licenses:check
pnpm security:check
pnpm build
```

See [test scope and acceptance status](docs/testing.md), [dependency policy](docs/dependency-policy.md), [security model](docs/security.md), [scoring](docs/scoring.md) and [storage](docs/storage.md).

## Security

Report vulnerabilities through the repository's private vulnerability reporting when available, or contact a maintainer privately. See [SECURITY.md](SECURITY.md).

## License and contribution

Code is Apache-2.0. AgentShelf names, logos, domains and trademarks are excluded from the software license; see [TRADEMARKS.md](TRADEMARKS.md). Contributions require a Developer Certificate of Origin sign-off and are offered under Apache-2.0. Read [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

The implementation plan tracks platform support, deeper crawler hardening, connector conformance, protocol test expansion, REST/MCP acceptance, packaging, supply-chain verification and v1 review. See [PLAN.md](PLAN.md).
