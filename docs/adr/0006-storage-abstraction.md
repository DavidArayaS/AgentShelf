# Storage abstraction

Status: accepted architecture direction; implementation tracked in PLAN.md.

## Context

Local persistence must not determine proprietary Cloud infrastructure.

## Decision

Use narrow catalog/scan repository ports with memory and SQLite adapters.

## Alternatives considered

Direct SQLite imports in domain functions; a mandatory ORM.

## Consequences

Cloud can supply private storage without modifying OSS; test with fake external adapters.
