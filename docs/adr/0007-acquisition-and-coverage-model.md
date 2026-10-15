# ADR 0007: Acquisition, catalog authority and coverage

Status: accepted

## Context

Public websites can restrict enumeration and hide inventory. A crawl-only story cannot establish merchant catalog completeness or prove search usefulness on private inventory. Existing connectors, canonical schema, query engine, protocol adapters and injected infrastructure are useful and must remain intact.

## Decision

Support three input modes: public discovery, explicitly selected merchant-authorized connectors and canonical direct imports. Attach validated acquisition metadata to catalog/report, independently of product provenance. Treat source authority and enumeration coverage as separate concepts. Public discovery can never claim complete. Authorized coverage requires successful authentication and consistent totals/pagination/unique normalized product evidence without failures or truncation. Imports establish the supplied document, not merchant inventory completeness.

Preserve CommerceConnector methods, adding optional acquisition metadata and an enumeration-evidence callback. `scanStore` excludes authorized adapters; `ingestStore` requires explicit authorized selection. Add one read-only WooCommerce REST v3 adapter using injected origin-bound credentials, HTTPS headers and no authenticated redirects. Preserve crawler protections and report access restrictions instead of bypassing them.

All input modes converge into canonical commerce, readiness and the existing source-independent QueryEngine. REST and MCP delegate to that same port. A seeded diverse private 10k inventory and real CLI/import/serve acceptance prove search independently of public crawling.

## Consequences

Existing canonical JSON remains compatible. Completeness claims become stricter and reproducible, but do not imply atomic inventory snapshots or access to hidden resources. Local credentials are ephemeral developer inputs; Cloud-owned secret management and synchronization remain private adapters consuming built public packages. No merchant migration, second catalog editor, hosted OAuth, model dependency or distributed services are introduced.
