# Open core and Cloud boundary

Status: accepted architecture direction; implementation tracked in PLAN.md.

## Context

Commercial value includes private hosted operations and network intelligence.

## Decision

Cloud imports versioned public packages and implements private ports; OSS never imports Cloud.

## Alternatives considered

Shared private modules; proprietary forks.

## Consequences

Keep accounts, billing, hosted workers, aggregated analytics and AI enrichment outside OSS.
