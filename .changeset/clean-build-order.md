---
'agentshelf': patch
---

Build workspace packages before checking root tooling so fresh checkouts and upgrades do not resolve missing or stale package declarations. Apply the same prerequisite order to type checking.
