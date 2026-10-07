# Performance

Run `pnpm benchmark` after installation. Each catalog size runs in a fresh Node process with explicit garbage collection before each operation. Fixtures repeat the sample product with unique identities. The report records elapsed milliseconds, observed heap after each operation, peak process RSS, Node/platform/CPU and input size. It is not a live-store crawl or a latency SLA.

Initial Linux / Node 24 measurement (one run, 2026-10-07):

| Products | Normalize | Validate | Search | Serialize |
| -------- | --------: | -------: | -----: | --------: |
| 100      |     18 ms |     6 ms |   4 ms |     <1 ms |
| 10,000   |    351 ms |   187 ms |  40 ms |     22 ms |
| 100,000  |  2,822 ms | 1,770 ms | 242 ms |    235 ms |

The 100,000-product process reached approximately 731 MiB peak RSS. Its serialized catalog was about 70 MB. Measurements vary with hardware, garbage collection, source field sizes and variant counts; repeated fixture values do not model the full diversity of merchant data. The complete latest run is `reports/benchmarks.json`, uploaded by CI.

Normalization and validation allocate validated copies; search scans the in-memory catalog and sorts matching results. These are the main scaling costs. The domain schema caps a catalog at 100,000 products, but the CLI also imposes a 32 MiB file-input bound and the REST API a 1 MiB JSON request bound. The benchmark directly exercises package APIs and does not bypass those interface limits. Split larger inputs or supply an alternative query/repository adapter where appropriate.

CI records benchmarks on Linux without brittle wall-clock thresholds across shared runners. Branch coverage and deterministic correctness are required gates. Optimize only after comparing repeatable measurements; distributed indexes and hosted crawling belong to private Cloud infrastructure.
