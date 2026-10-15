# Acquisition and search foundation acceptance

This maps the supplied master refactor requirements to implemented paths and repeatable evidence. It is not a published release or a live merchant deployment certification.

| Requirement                                                         | Evidence                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing retail stack; no merchant migration                        | Canonical adaptation behind public `scanStore`, authorized `ingestStore`, canonical `importCatalog`; README/acquisition guide/ADR 0007                              |
| Three modes, independent authority/coverage, catalog-level metadata | `AcquisitionMetadataSchema`, `ScanReport.acquisition`, `Catalog.acquisition`; schema invariant tests                                                                |
| Public discovery remains useful but never complete                  | Core fixture 250 → unknown, limit 100 → partial; generic/public WooCommerce preserved                                                                               |
| Restrictions reported without bypass                                | AcquisitionError codes; 403/429/robots/503 tests; partial products retained; native crawler protections unchanged                                                   |
| One real authorized connector                                       | `@agentshelf/connector-woocommerce-admin`; official REST v3 docs research; HTTPS Basic read-only requests, currency/products/variation mapping                      |
| Proven completeness                                                 | 250 products/3pages → complete; limit/missing/changing/duplicate/failure/variation evidence → partial                                                               |
| Direct import and source-independent search                         | Canonical import operation + CLI/web/REST path; generated private inventory and real import/search/serve subprocess acceptance                                      |
| Local deterministic filters                                         | QueryEngine text, exact prices/currency, availability, brands/categories, attributes/variants, merchant, shipping, sorting/pagination; small explicit query grammar |
| 10k realistic private inventory                                     | Seeded categories/brands/prices/currencies/variants/inventory/shipping/returns/reviews/missing fields; six query families checked against constraints               |
| Common REST/MCP semantics                                           | Identical complete search responses through QueryEngine, REST and official MCP client on private 10k and authorized catalogs                                        |
| Authorized end to end                                               | Fixture → acquisition → readiness → query → REST/MCP → official ACP/UCP catalog export validation                                                                   |
| Credential confidentiality                                          | Fixed safe errors, origin-bound provider, no persisted credentials; actual CLI stdout/stderr/catalog/provenance checks plus logs/events/error/report checks         |
| Credential transport safety                                         | Auth only on HTTPS, no authenticated redirects (same origin or cross origin), normal SSRF/DNS/TLS/byte/rate tests retained                                          |
| Cloud without fork                                                  | 20 public packed packages; injected named private adapter test doubles; blocked internal imports; actual packaged CLI smoke                                         |
| Benchmarks                                                          | Diverse seeded100/10k/100k, normalization/validation/search/variant search/construction/serialization latency and memory                                            |
| Product UI                                                          | Public discovery limitations and acquisition/authority/coverage labels; import/search; observed readiness; Chromium/mobile/export acceptance                        |
| Boundary/licensing                                                  | Apache/DCO/policies unchanged; no new external dependency; no SaaS or anti-bot capabilities introduced                                                              |

## Required product answers

| Question                                                    | Answer                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Must a merchant migrate or rebuild the store?               | No. Existing systems remain authoritative.                                                       |
| Can AgentShelf consume public commerce data?                | Yes, subject to source availability and access restrictions.                                     |
| Can public discovery claim a complete catalog?              | No.                                                                                              |
| Can merchants authorize existing systems?                   | Yes; local WooCommerce REST v3 proves the capability, with private/community adapters supported. |
| Can developers import a private catalog?                    | Yes; canonical JSON, including the seeded 10k acceptance catalog.                                |
| Does every input converge into canonical commerce?          | Yes.                                                                                             |
| Can search work without crawling?                           | Yes; private import acceptance proves this.                                                      |
| Do REST and MCP share the same engine/catalog?              | Yes in CLI serve, including API catalog replacement.                                             |
| Can blocked public access be bypassed?                      | No bypass feature is provided.                                                                   |
| Can Cloud privately manage credentials and synchronization? | Yes, through injected ports; those services are not implemented here.                            |
| Can Cloud own large-scale search/intelligence?              | Yes, as a private QueryEngine consumer and commercial service.                                   |
| Can Cloud consume OSS without a fork?                       | Yes; packed-consumer acceptance proves exported adapter contracts.                               |

## Verification record

The pre-change baseline passed all thirteen specified gates on Linux/Node 24. Final refactor validation on Linux/Node 24.19.0 passed all thirteen gates: `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:coverage`, `licenses:check`, `security:check`, `build`, `packages:check`, `sbom:generate` and `benchmark`. Integration executed seven tests, Chromium acceptance executed one full browser scenario, and the packed consumer verified all 20 public packages. License auditing retained 124 external dependencies; vulnerability and secret scans reported zero findings. Reports are generated in `reports/` and uploaded by CI, not committed as fabricated evidence. Coverage floors remain 90% lines /80% branches /80% functions for the eight existing critical packages. No test or crawler protection was disabled.

## External checks

No merchant credentials were supplied, so WooCommerce behavior is verified with official-contract fixtures and real CLI/native transport tests, not a live store. Merchant permission/hosting/plugin behavior must be checked on deployment. Current GitHub Linux/macOS/Windows/CodeQL results, npm ownership/trusted publishing, security/trademark contacts and actual publication/tag/install verification remain release operations. No hosted Cloud service, release tag or npm publication is implied.
