# Official protocol research

Checked 2026-10-07. Documentation websites returned proxy HTTP 403 in this environment. Research therefore uses official source repositories, accessed through the platform Git proxy, rather than blogs. No adapters are implemented yet. Pin fixtures and implementation metadata before claiming support.

| Source                                                                                              | Observed release                                              | Immutable evidence                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [MCP specification](https://github.com/modelcontextprotocol/specification)                          | 2026-07-28, explicitly marked current in the versioning guide | `0a11bf68c7ec4473526ec15589f592afcd12d1e8`, `docs/docs/2026-07-28/learn/versioning.mdx` and `schema/2026-07-28` |
| [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)               | npm `@modelcontextprotocol/sdk` 1.32.1, MIT                   | npm registry metadata; compatibility with selected spec still requires tests                                    |
| [Agentic Commerce Protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) | 2026-04-17, README identifies latest stable                   | `7fdd78df677a94dce04c770644b0fbbb1401272b`, `spec/2026-04-17/json-schema/schema.feed.json`                      |
| [Universal Commerce Protocol](https://github.com/Universal-Commerce-Protocol/ucp)                   | 2026-08-25 release tag                                        | `cd78fb38e819de77d9b527d110476eccb876f1bd`, tag `v2026-08-25`; mkdocs release variable confirms date            |
| [Schema.org](https://github.com/schemaorg/schemaorg)                                                | 30.1                                                          | `8adb51c91fc12adb271fc787a26cfab204e9d105`, versions.json                                                       |

MCP 2026-07-28 changes negotiation to per-request metadata and mandatory server/discover. Do not assume older SDK initialization examples demonstrate current compatibility. Confirm the SDK's implemented revisions and transport tests before M11.

ACP's dated release includes a feed schema with Product/Variant data. Price uses integer ISO currency minor units; canonical mapping must not silently multiply all currencies by 100. Feed support does not imply checkout, payments, orders, authentication or cart support.

UCP main is explicitly draft. Implementations must use the dated tag, not main. The release contains catalog search/lookup and product schemas; confirm the exact scope and required envelope before claiming a standalone catalog export is interoperable.

Schema.org Product extraction must handle offers, variants, identifiers and graph references without executing scripts. Structured data denotes claims from a source, not independently verified merchant facts. Read Product, Offer, ProductGroup, AggregateOffer, MerchantReturnPolicy and shipping definitions when implementing the generic connector.
