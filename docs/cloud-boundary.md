# Open Core and Cloud boundary

OSS owns portable commerce schemas, normalization, connectors, validation, readiness scoring, deterministic query, protocol adapters, local interfaces and local storage. Its value must be useful without any AgentShelf account, API key or remote telemetry.

Cloud will live in a separate private repository. Accounts, teams, merchant authentication, commercial secrets management, continuous hosted synchronization, scheduled jobs, large-scale crawling, AI enrichment, network reputation, historical and competitive analytics, query telemetry aggregation, attribution, ranking intelligence, benchmarks across merchants, billing and enterprise controls stay private. Do not add placeholder implementations of these capabilities here.

Dependency direction is Cloud → published Open Core packages. Open Core must have no private package imports. Public ports allow consumers to inject repository, clock, logger, event sink and connector credential implementations where current use cases require them. Domain types contain no infrastructure/vendor-specific fields. Cloud must not copy files, fork packages or replace canonical schemas or validators.

Apache-2.0 permits commercial use subject to its conditions; dependency review, attribution and trademark policy still apply. A passing policy report is not legal advice. Before v1, run the built-package consumer acceptance test with fake private adapters and independently review the final dependency/license report.
