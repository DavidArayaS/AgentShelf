# Performance

Run `pnpm benchmark`. Every size uses a fresh Node process and explicit garbage collection before each measured operation. The deterministic seeded fixture now varies categories, brands, currencies, exact prices, variants/sizes/colors, inventory, reviews, shipping, returns and missing fields. It no longer repeats one sample product. Input generation is outside the operation timings.

One Linux / Node 24.19.0 run on an Intel Xeon Platinum 8573C:

| Products | Normalize | Validate | Search | Variant search | Engine construction | Serialize |
| -------- | --------: | -------: | -----: | -------------: | ------------------: | --------: |
| 100      |        13 |        7 |      3 |              2 |                   6 |         1 |
| 10,000   |       527 |      330 |     20 |             18 |                 166 |        53 |
| 100,000  |     5,046 |    3,392 |    196 |            195 |               1,695 |       637 |

Measurements vary by hardware, scheduling, garbage collection, field sizes and variant counts. They are synthetic local observations, not a live merchant or latency SLA. The full generated `reports/benchmarks.json` records exact elapsed times, observed post-operation heap, peak process RSS, Node/platform/CPU and serialized bytes. Search uses structured price/currency/availability filters; variant search includes parsed size and price constraints. Engine construction includes canonical validation/copying, not a persistent index build.

The 100k run reached approximately 1,323 MiB peak process RSS. The 10k fixture serializes to approximately 14.8 MB and fits the 32 MiB CLI bound. The 100k fixture serializes to approximately 149 MB, so that benchmark intentionally exercises package APIs directly; it does not demonstrate loading that file through the 32 MiB CLI or 1 MiB REST import. Normalization/validation construct copies and dominate memory/time. The reference search scans and sorts matching rows. These limits remain explicit rather than silently being disabled for tests.

CI records 100/10k/100k without brittle hardware-specific timings. Integration includes a conservative 10-second per-query regression guard in addition to exact correctness and stable ordering checks. Distributed indexes, millions of SKUs, cross-merchant retrieval and semantic ranking remain Cloud-owned infrastructure behind the exported QueryEngine contract.
