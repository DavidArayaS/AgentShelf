# Dependency policy

Default approved SPDX licenses: Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0. Every other license requires explicit maintainer review before use. This includes GPL, AGPL, LGPL, SSPL, BUSL/BSL, Commons Clause, PolyForm, Elastic License, MPL, EPL, CDDL, unknown, custom and missing licenses. No exceptions are currently approved.

`pnpm licenses:check` uses the maintained, pinned pnpm license inventory across direct and transitive dependencies, including development tooling. The policy checker fails closed on inferred identifiers and unreviewed SPDX expressions; it never assumes a license from a package name. Simple OR expressions composed entirely of default-approved identifiers are accepted (for example, Biome’s MIT OR Apache-2.0); retain the distributed notices. Other compound expressions require explicit review. Scanner failures and empty inventories fail the gate. The JSON report is written even when review is required.

Prefer maintained dependencies with narrow responsibilities. Pin direct dependencies and commit the lockfile. Review install scripts, provenance, maintenance and vulnerabilities alongside license metadata. A metadata audit cannot prove every file is correctly licensed; review distributed notices and vendored material before releases. Releases must preserve attribution and include an SBOM.

Cloud may consume approved packages commercially under their licenses and implement proprietary adapters without importing Cloud code into OSS. This policy report is an engineering control, not legal advice or a blanket legal guarantee.
