# AgentShelf Open Core implementation plan

Status: pre-release implementation; no v1 or protocol compliance claim until all gates pass.

First-commit status: workspace and local CLI/API/MCP product paths, canonical model, memory/SQLite storage, safe crawler, generic/WooCommerce connectors, validators/scoring, search, and version-pinned ACP/UCP adapters are implemented. The eight local quality gates pass in the current Node 24 environment. ACP/UCP claims apply only to the mapped feed/catalog schemas; they do not imply complete protocol conformance. Remaining v1 work includes the local web demo, reusable third-party connector conformance package, benchmark and branch-coverage targets, cross-platform CI evidence, built-package consumer verification, release SBOM/provenance, and the final acceptance review. This first commit is a useful pre-release foundation, not a v1 release.

## Architecture and public boundaries

AgentShelf represents, validates, queries, and connects commerce data locally. Cloud is a separate private consumer of versioned Apache-2.0 packages. Dependency direction is always Cloud → Open Core. No accounts, billing, hosted synchronization, analytics aggregation, AI enrichment, checkout, or enterprise infrastructure belong here.

The package graph follows consumer → dependency:

- schema → Zod; vendor-neutral domain types and versioned JSON Schema.
- connector-sdk → schema; target, context, discovery and extraction contracts.
- crawler → transport and parsers; bounded, SSRF-resistant remote access.
- platform-detection → connector-sdk; deterministic evidence-based detection.
- connector-generic-web / connector-woocommerce → connector-sdk, crawler, schema.
- validators → schema; stable rule IDs and evidence.
- scoring → validators; configurable, versioned deterministic weights.
- query-engine → schema; one search/filter/sort implementation shared by REST and MCP.
- storage-memory / storage-sqlite → storage → schema; infrastructure stays outside domain logic.
- core → the above ports; normalization and scan orchestration, with injectable dependencies.
- protocol-json / protocol-acp / protocol-ucp → protocol-sdk → schema.
- apps/cli, apps/api, apps/mcp, apps/web → public package entry points only.
- testing → connector-sdk; reusable third-party conformance tests.

Create packages only when their first real implementation exists. Export maps expose deliberate entry points, never internal source trees. Packages build to JavaScript with declaration files; Cloud must import built artifacts without source aliases or patches.

## Canonical schema design

Version 1.0 describes Merchant, Catalog, Product, ProductVariant, identifiers, decimal prices and ISO currencies, nullable availability/inventory, images, categories, typed attributes, offers, shipping, returns, reviews, and provenance. Distinguish unknown data from absence or zero. Keep variant identity and offer identity separate. Derive deterministic IDs from merchant identity and source identity, excluding volatile prices and timestamps. Preserve source URLs and observation times. No ACP/UCP/platform fields in canonical types. Validate serialization and publish JSON Schema derived from the same Zod definitions. Breaking changes require schema major versions and explicit migration policy.

## Connectors and crawling

The connector context injects safe HTTP, clock, logging, cancellation and optional credential provider. Discovery is bounded and asynchronous. Generic web consumes robots, bounded nested sitemaps, JSON-LD, canonical links and metadata. WooCommerce uses public product surfaces and falls back only according to documented behavior. No remote JavaScript execution. Connector authors can implement the public contract without editing core and reuse conformance tests.

Every URL and redirect is untrusted. Reject credentials, unsafe schemes, nonpublic IPv4/IPv6 and metadata endpoints. Resolve and validate DNS, pin the vetted address through connection establishment, revalidate redirects, bound compressed and decompressed bytes, timeouts, nesting, recursion, products, concurrency and request rates. Local test fixtures use an explicit injected test transport; never introduce a production private-network bypass.

## Protocol architecture and research

Research official MCP, ACP, UCP and Schema.org sources before implementation. Record exact specification/SDK versions, immutable source revisions, dates, mappings and gaps under docs/protocols. Do not infer catalog support from a protocol's checkout specification. Unsupported capabilities return explicit errors and metadata. MCP uses the official maintained SDK and delegates to the shared query engine. REST uses versioned OpenAPI and structured domain errors. CLI protocol output derives from the registry.

## Storage and Cloud extension points

Small CatalogRepository and ScanRepository ports support local memory and SQLite adapters. Inject EventSink, Logger, Clock and ConnectorCredentialProvider where scanning currently needs them. No SQL assumptions in canonical or query types. A test-only private repository/event/credential implementation must prove consumption without patching OSS. Local persistence is allowed; hosted operations and network intelligence remain private.

## Licensing and dependencies

Preserve the official Apache-2.0 license text. Add notices, trademark exclusions, DCO contribution policy and attribution. Approve only Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD and CC0-1.0 by default. Audit all installed transitive production and development dependencies with a maintained scanner; fail missing, unknown, forbidden or unreviewed licenses. SPDX expressions require all obligations in AND expressions to be allowed and a permitted branch in OR expressions. No undocumented exceptions. Record exact evidence in a generated report. Do not advance beyond M0 until this gate works. Commercial compatibility reports are technical policy checks, not legal advice.

## Test matrix and quality gates

Every milestone runs format:check, lint, typecheck, test, test:integration, licenses:check, security:check and build. Foundation tests exercise actual tooling and package policy; a zero-test run is not validation. Add domain/unit, property, connector/protocol contract, malicious input/security and offline integration suites as implementations land. Core coverage thresholds must include branch coverage. Canonical acceptance: fixture scan → JSON export → serve → REST search and MCP search yield the same product. Verify built package contents and CLI behavior on Linux, macOS and Windows with supported Node LTS releases. No live merchant dependency in CI.

## Release strategy

Use Node 24 LTS, strict TypeScript, pinned pnpm, workspaces and Turborepo. Start at 0.1.0 with coordinated Changesets releases to simplify compatibility. Publish only deliberate dist files and required notices, with provenance and release SBOM. Do not publish packages or claim npx availability until release authorization and registry ownership exist. GitHub Actions enforces tests, licenses, vulnerabilities, secret scanning, CodeQL and artifact checks. No production stability guarantee before an explicit v1 review.

## Sequential milestones

- M0: repository foundation, policies, tooling, working license/security audit, CI and release tooling.
- M1: canonical schema and round-trip/property tests.
- M2: pure normalization and stable IDs.
- M3: secure crawler and adversarial tests.
- M4: modular platform detection.
- M5: generic web extraction and connector contracts.
- M6: WooCommerce public connector.
- M7: validators and scoring, documented rule IDs/weights.
- M8: CLI, useful errors and first useful pre-release candidate.
- M9: shared deterministic query engine.
- M10: local REST API and OpenAPI.
- M11: official MCP SDK server and compatibility tests.
- M12: explicitly versioned ACP adapter.
- M13: explicitly versioned UCP adapter.
- M14: local web demo without business logic.
- M15: connector SDK hardening and external plugin example.
- M16: security, coverage and 100/10k/100k-product benchmarks.
- M17: documentation, package consumer test and complete v1 acceptance review.

## Risks and unresolved questions

Official specifications may not expose a stable catalog protocol matching the requested exports; do not invent it. Network restrictions can prevent authoritative research or audit services. Current dependency versions may introduce nonapproved transitive licenses; replace them or stop for a narrowly scoped maintainer decision. DNS pinning and decompression limits need transport-level tests. SQLite distribution and Node support require cross-platform checks. Package namespace ownership and publication credentials are release prerequisites, not local development prerequisites. Trademark ownership and security contact details must be confirmed by maintainers before release.

## Commercial boundary review

- Does Cloud require a fork? No: all consumers use exported packages and injected ports; prove this in a built-package consumer test.
- Does any dependency create licensing risk? Dependencies remain unapproved until the transitive audit passes; no implicit allowlist exceptions.
- Are commercial differentiators implemented publicly? No: hosted operations, proprietary intelligence and enterprise control are excluded.
- Do vendor protocols leak into the model? No: adapters depend on canonical data, never the reverse.

Any failing gate blocks advancement. Record actual progress and blockers without relabeling partial implementation as v1.
