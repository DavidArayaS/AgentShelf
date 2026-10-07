# Writing a validator

`@agentshelf/validators` exports `ValidationRule`, `ValidationResult`, `rules`, `validateProduct` and `validateCatalog`. A rule must be deterministic and use canonical data only. Keep a stable, namespaced ID, one documented category and severity, a pass/fail/unknown result, and actionable remediation. Unknown means the source did not supply enough evidence; it must not be silently converted to failure or a fabricated fact.

Inspect `packages/validators/src/index.ts` for the current rule signature and registry. Add a rule to the registry with tests for pass, fail and unknown cases, including boundary values. Document its ID and scoring impact in `docs/scoring.md`. Do not call LLMs, infer merchant reputation, execute external scripts or contact a remote service. Validation of data readiness is independent of protocol conformance.

Consumers can compose additional deterministic checks around exported canonical types and validation results without replacing the canonical schema. Private Cloud intelligence and cross-merchant signals must remain private. Changes to existing rule meaning or score weights require a documented version change.
