# Community connector package example

This directory shows the shape of a separately versioned connector package. Depend on `@agentshelf/connector-sdk`, implement and export the public contract, then run the reusable helpers from `@agentshelf/connector-testing` against representative fixtures. This minimal smoke test verifies that a consumer can import the SDK without reaching into AgentShelf source files.

A production connector must supply real bounded discovery and extraction tests, use only the injected safe HTTP client, and declare its supported platforms and evidence. This example intentionally performs no network requests.
