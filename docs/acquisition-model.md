# Acquisition, authority and coverage

AgentShelf adapts existing systems into the canonical catalog. Merchants continue using their store, ERP or PIM to manage products; they do not maintain a second hand-edited AgentShelf catalog. Acquisition, search and protocol export are separate responsibilities.

| Mode                   | Authority             | Entry point                                             | Coverage                                                                     |
| ---------------------- | --------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `public_discovery`     | `public_observation`  | `scanStore`, CLI `scan`                                 | `unknown`, or `partial` after limits/errors; never `complete`                |
| `authorized_connector` | `merchant_authorized` | `ingestStore` with explicitly selected connector        | `complete` only with authenticated enumeration evidence, otherwise `partial` |
| `direct_import`        | `merchant_provided`   | `importCatalog`, CLI `import`, local REST `/v1/imports` | `unknown` merchant coverage, even when every supplied record was imported    |

`AcquisitionMetadataSchema` in the schema package validates mode, authority, connector ID, authentication flag, acquisition timestamp and coverage. Coverage contains a reason, observed count, optional expected count/pagination evidence, limit/truncation flags and failure count. It lives on reports and optionally on Catalog, never inside Product. Catalog schema validates the observed count against the product array. Products retain their own source provenance, including `authorized_api` and `merchant_feed`; import preserves original observation provenance instead of inventing new product observation times.

`unknown` means merchant completeness cannot be determined. `partial` means acquisition was interrupted, deliberately bounded, failed normalization or could not prove the authorized enumeration. `complete` requires an authorized connector, actual successful authentication, pagination exhaustion, matching authoritative expected/unique normalized counts and no failures, limit or truncation. Fully traversed public sitemaps are still `unknown`. Merely possessing a key proves nothing about coverage.

The read-only WooCommerce connector compares stable `X-WP-Total`/`X-WP-TotalPages` across pages, unique product counts and variation enumeration. Completeness is scoped to resources exposed by the supplied key and source endpoint at acquisition time. It is not a transactional snapshot; inventory can change immediately afterward. Multiple currencies, private metadata or plugin-specific fields not exposed by that endpoint are not inferred. Missing totals, changed totals, duplicate IDs, missing variations, timeouts, failed pages or limits prevent a completeness claim.

A public 403 yields `ACCESS_RESTRICTED`; 429 yields `RATE_LIMITED`; robots restrictions yield `ROBOTS_DISALLOWED`; other upstream failures yield `REMOTE_UNAVAILABLE`. If discovery fails after some products were normalized, those products remain in a partial report with issues. Public product reads stop on an explicit access/rate restriction. Unsafe destinations and caller cancellation still abort. If acquisition cannot start, the error is returned without a fabricated successful catalog. No anti-bot bypass is implemented.

Readiness is **Observed Catalog Readiness** unless coverage is proven complete. Scores describe acquired data quality, not unseen products, merchant recommendation likelihood or inventory reservations. Search consumes canonical products regardless of how they were acquired.

Existing schema-1.0 catalogs without acquisition metadata still load. Imports assign fresh document-acquisition metadata with unknown merchant coverage. Connector acquisition metadata and the enumeration callback are additive SDK contracts; older public connectors are treated as public observations. Private authorized adapters must opt in and be selected through `ingestStore`. Public detection excludes them so public scanning never probes an admin API.
