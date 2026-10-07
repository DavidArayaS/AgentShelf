# Architecture

Read PLAN.md for the dependency graph and implementation sequence. Domain data flows from connectors through canonical normalization, validation, score/query and protocol adapters into CLI/REST/MCP/web interfaces. Package imports point toward shared contracts. No transport or SQL dependencies belong in schema; no protocols belong in connectors; MCP and REST share query behavior.

Public package exports point to compiled JavaScript and declarations. Test application behavior against built packages so workspace source aliases cannot hide publication defects. Normalize exact decimal strings and preserve explicit unknowns rather than inventing product facts. No accounts, API keys or remote telemetry are needed for local use.

Architecture decisions are recorded in docs/adr. Package 0.x interfaces are pre-release; do not claim v1 stability or production readiness until the acceptance gates are completed.
