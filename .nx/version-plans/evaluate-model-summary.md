---
host: minor
mcp: minor
---

`evaluate_model` returns a `summary` of the default view's mesh, in Tau and over `tau mcp`: its axis-aligned `bounds` in millimetres in the model's frame, `componentCount` (the mesh nodes it draws), and its `triangles` and `vertices`. Where the host runs `test_model` on its native GeoSpec engine, `summary.admission` estimates from that mesh what a whole-model `loadModel` would ask that engine to admit (72 bytes per triangle) against the limits the engine's `initialize` configuration reports, with a `warning` naming each estimate over its limit, so an agent learns before any `test_model` run that such a load would be refused and its claims left undecided at this capacity. A kernel can export a finer subject than it displays, so an estimate near a limit is uncertain; STEP and region loads are not estimated.
