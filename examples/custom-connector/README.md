# Public catalog connector example

This complete connector reads a merchant's canonical `/catalog.json` endpoint through the injected safe HTTP client, detects the catalog, discovers products up to the caller's limit, and retrieves validated products by identity. It preserves cancellation and rejects invalid or missing records. It does not open sockets or read credentials itself.

Build from the repository root with `pnpm build`, then run `pnpm --filter @example/agentshelf-custom-connector test`. Tests consume the published entry point of `@agentshelf/testing`, using the same conformance suite as the built-in connectors. To create a publishable package, copy this example into your own repository, choose your own package name, remove `private`, replace workspace dependencies with published compatible versions, and add representative merchant fixtures. Do not copy core implementation files.

Register it through `scanStore(url, { connectors: [catalogConnector] })`. Real merchant transport remains the default safe HTTP client. The test transport is injected only by tests.
