# Writing a protocol adapter

Implement `ProtocolAdapter<Output>` from `@agentshelf/protocol-sdk`. It exposes `support` metadata and `exportCatalog(catalog, options)`, which may be synchronous or asynchronous. Metadata includes the exact protocol version, implementation version, official documentation URL/source commit, supported and unsupported capabilities.

Research the official specification first. Vendor the exact licensed schemas needed for offline validation, preserve attribution, and record revision/file checksums. Map canonical commerce concepts to the official shape and validate the generated document. A bundle containing only `$defs` is not a response schema: explicitly select the response definition. Relative schema references must retain their official base URI.

Use exact decimal/minor-unit helpers and require a currency selection for ambiguous offers. Refuse missing required fields, excess precision and unsupported capabilities with `ProtocolValidationError`; do not fabricate compliance. Add cases for optional values, variants, multiple offers/currencies, invalid input/output and immutable version metadata. Register CLI reporting from adapter metadata rather than copied strings.

Adapters may depend on canonical schema and protocol SDK packages. They must not depend on platform connectors, SQL or Cloud services. A mapped catalog document does not implement protocol negotiation, checkout, payments or hosted operations.
