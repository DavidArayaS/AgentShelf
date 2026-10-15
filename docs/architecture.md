# Architecture

Read PLAN.md for the dependency graph and implementation sequence. Domain data flows from connectors through canonical normalization, validation, score/query and protocol adapters into CLI/REST/MCP/web interfaces. Package imports point toward shared contracts. No transport or SQL dependencies belong in schema; no protocols belong in connectors; MCP and REST share query behavior.

Public package exports point to compiled JavaScript and declarations. Test application behavior against built packages so workspace source aliases cannot hide publication defects. Normalize exact decimal strings and preserve explicit unknowns rather than inventing product facts. No AgentShelf account or remote telemetry is required. Public discovery/import/search work without store keys; authorized connectors use merchant credentials.

Architecture decisions are recorded in docs/adr. Package 0.x interfaces are pre-release; do not claim v1 stability or production readiness until the acceptance gates are completed.

The acquisition layer has three explicit entry points: public `scanStore`, authorized `ingestStore` and canonical `importCatalog`. All produce the same canonical data used by normalization, readiness and the source-independent query-engine package. Public observations never imply complete inventory. Catalog acquisition/authority/coverage are validated independently of product provenance. See [acquisition model](acquisition-model.md), [search](search.md) and [ADR 0007](adr/0007-acquisition-and-coverage-model.md).

The merchant continues to operate the existing retail stack. Open Core adapts public surfaces, read-only merchant APIs, imports and injected private connectors. REST/MCP share QueryEngine behavior on every source; protocol adapters consume canonical data downstream. Search is useful even when no crawler is invoked. No accounts, secret store, recurring sync, semantic services or distributed infrastructure are required or implemented here.
