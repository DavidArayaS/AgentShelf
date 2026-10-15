# Acquisition and search foundation refactor

## Baseline and inspection

Inspected package/app manifests, sources, tests, package consumer, performance and coverage tooling, CI/release configuration, architecture, connector/query contracts, ScanReport, canonical provenance and Cloud boundary. Baseline on Linux/Node 24: all thirteen requested gates passed; logs are in `/tmp/agentshelf-refactor-baseline` in the task environment. No live merchant credential or live WooCommerce store is available.

## Changes

1. R1–R5: add validated catalog-level acquisition/authority/coverage metadata, optional connector acquisition/evidence contracts, structured access restriction codes and truthful partial reports. Public observation can never prove complete coverage. Preserve `scanStore` as public discovery.
2. R6–R8: introduce a read-only WooCommerce REST v3 authorized connector and explicit `ingestStore`, plus canonical JSON `importCatalog`. Use the existing credential provider with HTTPS-only, origin-bound authorization headers; never serialize credentials. Prove completeness using consistent totals/pages, unique products, variations, no failures or truncation. Imports prove the supplied document, not the entire merchant inventory.
3. R9–R12: CLI ingest/import/search filters and scoped report summaries; strengthen deterministic lexical price parsing and merchant filters; seeded diverse private inventory generation and 10k QueryEngine/REST/MCP/CLI acceptance. Preserve source-independent search and measure construction/query latency and memory at 100/10k/100k.
4. R13–R15: label the web demo's acquisition, authority, coverage and observed readiness; support canonical file import and local search; assert credential confidentiality, transport security and built-package private adapter extensibility.
5. R16: update README, PLAN, architecture/connectors/query/Cloud/testing/release evidence; acquisition/search guides and ADR 0007. Add coordinated changeset. Run all thirteen gates without lowering thresholds.

## Preserved

Existing repository and monorepo layout; working canonical product structure and identities; connector SDK methods (additive extensions); generic/public WooCommerce connectors; crawler SSRF/DNS/TLS/size/cancellation/redirect defenses; validator/scoring rules; memory/SQLite ports; REST/MCP common query engine; pinned ACP/UCP schemas and protocol scope; Apache LICENSE, NOTICE, TRADEMARKS, THIRD_PARTY_NOTICES, DCO and license policy; security and coverage gates.

## Explicit scope

No universal CSV mapper, accounts, hosted OAuth, credential storage, jobs, synchronization, webhooks, analytics, AI/vector services, distributed search, checkout, anti-bot bypass, or private Cloud implementation. No npm publication or release tag. Authenticated enumeration is scoped to the resources exposed to the supplied read-only key at acquisition time, not an atomic transactional inventory snapshot. Local testing uses injected transports without weakening production URL validation.

## Acceptance evidence

Public 250 → unknown; limit100 → partial; blocked403 → ACCESS_RESTRICTED; interrupted429 → partial/RATE_LIMITED. Authorized250/3pages → complete; limit100/errors/inconsistent evidence → partial. Seeded10k → identical engine/REST/MCP candidates and real import/search/serve CLI. Read-only credentials never reach output/error/report/events/provenance and never follow redirects. Private consumer installs only public packed exports and injects private adapters. All thirteen final local gates passed. Detailed evidence, the twelve required product answers and external limitations are recorded in `docs/refactor-acceptance.md`. No live merchant credential, remote OS-matrix certification or npm publication is claimed.
