# Protocol adapter boundary

Status: accepted architecture direction; implementation tracked in PLAN.md.

## Context

Protocol revisions evolve separately from commerce identity.

## Decision

Map canonical data in dedicated adapters with pinned official versions and explicit unsupported capabilities.

## Alternatives considered

Place ACP/UCP fields directly in products.

## Consequences

Mapping may fail when required data is absent; no fabricated compliance.
