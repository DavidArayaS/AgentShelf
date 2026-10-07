# Testing and acceptance

The eight baseline gates are `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `licenses:check`, `security:check` and `build`. CI additionally runs coverage, packed-consumer checks and SBOM generation on Linux, macOS and Windows. Chromium acceptance and performance benchmarks run on Linux. Remote CI must pass before release; a local Linux pass does not certify Windows or macOS.

`pnpm test` builds package dependencies and runs Node's test runner on compiled exports. Suites cover schema/identity and generated decimal invariants, normalization, validators, scoring, platform detection, discovery/extraction, shared search, storage, MCP negotiation, official protocol mappings, HTTP bounds and malicious input. Native transport tests replace DNS and sockets with explicit mocks and verify address pinning, redirect revalidation, cancellation and byte limits. They do not introduce a production private-address override.

`@agentshelf/testing` publishes deterministic HTTP fixtures and `runConnectorContractTests`. Built-in and example connectors run the same detection, bounded discovery, canonical output, stable identity, transport failure, malformed input and cancellation checks. Platform-specific suites exercise duplicate URLs, nested/cyclic sitemaps, multiple currencies, pagination and variants. Authors must supply representative fixtures; a generic suite cannot prove every merchant layout.

`pnpm test:integration` performs the canonical acceptance chain: safe fixture transport → scan → normalization/validation/scoring → CLI JSON/ACP/UCP exports → REST and official MCP client search. Both interfaces must return the same expected product. Another assertion verifies metadata remains current after an API scan. The fixture transport is injected through the public HTTP port, so no DNS or SSRF rule is weakened.

`pnpm test:e2e` uses actual Chromium to click the local demo, render results, download all three formats, check mobile layout, and reject a private target. Install Chromium first with `pnpm exec playwright-core install chromium` or specify `CHROMIUM_EXECUTABLE`. The test fails on browser errors and produces `reports/web-demo.png`.

`pnpm test:coverage` bypasses Turbo test caching and measures native V8 coverage per critical package: schema, validators, scoring, crawler, query-engine, ACP, UCP and protocol-sdk. Each must reach **90% lines, 80% branches and 80% functions**. A package failure blocks CI; there is no ignored coverage regression allowance below those floors. Reports are written to `reports/coverage/`. These thresholds do not claim coverage for the entire workspace.

`pnpm packages:check` packs every public package, checks required notices/export artifacts and excluded source/test directories, installs tarballs into a fresh private consumer using the offline dependency cache, and executes imports and injected private repositories/events/credentials/connectors. It verifies protocol schemas are actually available after installation and internal source imports are denied. No source aliases or workspace links are used in that consumer.

Official schema snapshots are excluded from automatic formatting. `.gitattributes` preserves LF endings so checksum tests run consistently across operating systems. Updating a protocol revision requires a reviewed source revision, inventory checksum and compatibility tests.

License, SBOM, package, coverage and browser artifacts live in `reports/`. Performance measurements are described separately in [performance.md](performance.md). A green suite proves the tested fixtures and contracts, not universal extraction from every real merchant.
