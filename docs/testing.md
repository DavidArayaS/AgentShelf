# Testing

Run the eight gates in PLAN.md at every milestone. Current tests use Node's built-in test runner against compiled package entry points. Root tests exercise license-policy failure cases and secret scanning with synthetic inputs; integration tests verify the real maintained pnpm scanner includes direct and transitive dependencies. Package tests cover canonical schema boundaries, decimal preservation, identity invariants and pure normalization.

These checks do not yet prove the final application acceptance scenario. Connector, crawler security, protocol contract, REST/MCP E2E, coverage thresholds and package-consumer tests must be added with the corresponding implementations. CI must never replace these with zero-test placeholders. Live merchant sites must not be CI dependencies.

Generated reports live in reports/. Always distinguish tests actually executed from planned suites. Platform CI configuration is not evidence of a completed remote CI run.
