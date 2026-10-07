# Connector plugin contract

Status: accepted architecture direction; implementation tracked in PLAN.md.

## Context

Community integrations must not patch core.

## Decision

Connectors implement detection, asynchronous discovery and canonical extraction through an injected safe HTTP context.

## Alternatives considered

Hard-code all integrations in the orchestration package.

## Consequences

Conformance tests and explicit capabilities become public API; remote scripts never execute.
