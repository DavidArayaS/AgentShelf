# Schema versioning

The initial canonical wire schema is `1.0`. Its major/minor identifier is independent of npm package SemVer (`0.1.0` during development). Breaking field/meaning changes require a new major schema version and explicit migration utilities. Additive optional fields may use a minor version, but a reader must advertise exact accepted versions; this release accepts only `1.0`. Do not silently relabel an unknown version.

Before package 1.0, public API changes require documented Changesets. At 1.0, breaking changes to canonical data, connector/protocol SDKs, query contracts, REST or CLI require package major versions. No migration function is invented before a second schema actually exists.
