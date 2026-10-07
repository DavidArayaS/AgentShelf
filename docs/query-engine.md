# Query engine

`searchProducts(catalog, query)` is a pure deterministic implementation; `MemoryQueryEngine` implements the asynchronous QueryEngine port for consumers. REST and MCP must delegate to this port. A private Cloud index can implement the port without replacing canonical data or changing public filters.

Search supports normalized text, brand/category filters, typed attributes, variant properties, price/currency/availability, sorting and bounded offset/limit pagination. Price filtering requires a currency and uses exact fixed-scale BigInt comparisons, never binary floating-point catalog amounts. Availability and price predicates must match the same offer. Variant predicates must match the same variant. Unknown prices do not satisfy price predicates. Stable ID tie-breaking avoids locale-dependent ordering. Returned products are copies.

Text search is lexical, accent-insensitive and case-insensitive. Explicit structured filters are authoritative; numeric under/above phrases are removed from lexical terms, not converted into inferred price constraints. Clients must supply minPrice/maxPrice. No embeddings, model calls, ranking prediction or remote telemetry are used.
