---
host: minor
mcp: minor
---

`export_model` reports what the exported files say about themselves, and `tau mcp` tells the agent when a model is done.

- `export_model` returns `validation` read from the exported bytes: `{ units: 'm', triangles, watertight }` for a GLB, `{ triangles, watertight }` over every file of a per-part STL export, and `{ units, solids }` for STEP, such as `{ units: 'mm', solids: 11 }`. `watertight` is `true` when every mesh is closed, each edge shared by exactly two triangles once coincident vertices are merged. Other formats return no `validation`.
- The `initialize` instructions state the acceptance loop: a static part is done when `evaluate_model` is ready, its `summary` bounds and `componentCount` fit the brief, and the whole `test_model` suite reports `runStatus` `passed`, with inconclusive, unsupported and not-run requirements undecided rather than passed; a moving assembly also needs `evaluate_model`'s `mechanism` declared and admitted, and a file the person asked for its `export_model` validation. The agent names the case it met when it reports done.
