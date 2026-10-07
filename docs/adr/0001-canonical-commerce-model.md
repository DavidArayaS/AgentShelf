# Canonical commerce model

Status: accepted architecture direction; implementation tracked in PLAN.md.

## Context

Commerce data must survive vendor/protocol changes.

## Decision

Zod and TypeScript describe a versioned vendor-neutral canonical schema; JSON Schema is generated from the same definition.

## Alternatives considered

Protocol-first storage; connector-specific models.

## Consequences

Adapters must map explicitly; schema breaks require major versions.
