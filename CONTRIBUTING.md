# Contributing

Use Node 24 LTS and the exact pnpm version in package.json. Run `pnpm install --frozen-lockfile`, then all quality gates in PLAN.md before proposing a change. Add tests for new behavior and document public API changes with a Changeset. Read docs/dependency-policy.md and PLAN.md before adding dependencies or changing package boundaries.

Contributions are submitted under the same Apache-2.0 license as the project. Preserve existing attribution. External contributions require a Developer Certificate of Origin sign-off on each commit: `git commit -s`, producing `Signed-off-by: Your Name <your email>`. Signing certifies the [Developer Certificate of Origin 1.1](https://developercertificate.org/); it is not a transfer of copyright or a custom contributor license agreement. Sign only work you have the right to contribute.

Keep hosted operations, accounts, billing, network intelligence and other Cloud capabilities out of this repository. Report architecture proposals in issues before introducing new public interfaces. Never submit credentials or merchant data in fixtures.
