# Model Context Protocol

Target specification: **2026-07-28**. Implementation date: 2026-10-07. Official stable TypeScript server/client SDK: **2.3.1**. Node middleware is pinned separately in the package manifest. Source: https://github.com/modelcontextprotocol/typescript-sdk at `b022522089a0c8b632595c6e7b536453945ed5a9`, whose README explicitly identifies v2 as stable for this specification. The older `@modelcontextprotocol/sdk` 1.x package was researched but is not used.

The local Streamable HTTP endpoint exposes search_products, get_product, check_availability, get_shipping_information, get_return_policy and get_store_information. Tools use the shared QueryEngine; no separate search implementation exists. Responses include structured content and JSON text. Missing products are tool errors; absent policy data is explicitly null. Availability is an observation, not a stock reservation.

Contract tests use the official client pinned to the exact protocol revision, list the tools, search a fixture and verify missing-product behavior. The SDK handles discovery, negotiation and envelopes. No checkout, payments, remote authentication, sampling, model API keys or telemetry are implemented. Host and Origin checks and loopback binding restrict the endpoint to local developer use.
