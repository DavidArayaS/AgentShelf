# Agent Commerce Score

Scoring version 1.0.0 measures observed commerce data readiness and quality. It does not predict ranking or selection by ChatGPT, Gemini or any other agent. It is not merchant reputation scoring.

Each category's score is the fraction of passing checks, multiplied by 100. Failures and unknown observations earn zero readiness credit, but remain separately counted. An unobserved category scores zero; an empty catalog cannot earn a perfect score. The overall score is the weighted mean of unrounded category scores, rounded once. Results include the exact weights and scoringVersion.

Default weights are centralized in `@agentshelf/scoring`: discovery 5, machine-readability 10, identity 10, semantic completeness 10, pricing 15, availability 10, inventory 5, variants 5, images 5, shipping 8, returns 7, reviews 3, provenance/trust 2, protocol-readiness 5. Callers may supply finite nonnegative weights with a positive total. Source timestamps, not the current wall clock, determine inventory freshness.

The exported validator rule registry defines stable IDs, categories, severity, messages and remediation. Discovery checks a source URL, not search-engine indexing. Protocol-readiness checks basic fields, not ACP/UCP conformance. Missing variants are unknown rather than an assertion that no variants exist. Policy changes require a scoring version change and documented migration rationale.
