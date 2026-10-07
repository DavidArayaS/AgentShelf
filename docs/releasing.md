# Releases and package consumption

Public packages use coordinated Changesets versions. The fixed package group in `.changeset/config.json` keeps public interfaces on a common release train; private demo/example apps are not published. Add a Changeset for public behavior changes, run `pnpm release:version`, review generated versions/changelogs and commit the result before tagging. Use `v0.x.x` during pre-release development. Do not label a version `v1.0.0` until the acceptance checklist and remote CI pass.

## Local release verification

Run the eight baseline gates, then `pnpm test:coverage`, `pnpm test:e2e`, `pnpm packages:check`, `pnpm benchmark` and `pnpm sbom:generate`. Browser acceptance requires installed Chromium. Package checks produce tarballs and install them into an isolated temporary consumer using the dependency cache; no registry publication occurs.

pnpm generates `reports/sbom.json` in CycloneDX 1.6 format from the installed dependency graph. The license audit includes transitive and development dependencies and precedes SBOM generation. Package tarballs include their Apache license and notice, deliberate exports and required protocol schemas. The consumer test proves that private adapters can use the packaged APIs without a fork or source aliases.

## GitHub release workflow

`Release artifacts` is manually dispatched. Its default is **artifact generation only**. It reruns verification, browser acceptance and package-consumer checks, then uploads tarballs, SBOM and reports. Publishing is a separate boolean input and requires dispatching from a `v<version>` tag matching the CLI package version.

Before the first publication, maintainers must establish ownership of the `agentshelf` npm name and `@agentshelf` scope, configure npm trusted publishing for each public package and this repository's `release.yml` workflow, and configure the `npm-release` GitHub environment with the desired approval policy. Some registries require an initial authorized package creation before configuring trust. These are external maintainer prerequisites, not credentials to commit to this repository.

The publishing step uses npm trusted identity and `--provenance` with GitHub OIDC. No npm token is stored in source. It publishes the verified tarballs; an existing version cannot be overwritten, and partial registry failures must be investigated before retrying. Inspect the generated SBOM and npm provenance and attach artifacts to the reviewed release.

The repository's local tests do not prove npm namespace ownership, successful publication, remote matrix checks, or a working public `npx agentshelf` installation. Only claim those after checking the actual release. No publish or tag is performed by ordinary PR CI.
