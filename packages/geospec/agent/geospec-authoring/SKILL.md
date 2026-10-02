---
name: geospec-authoring
description: Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.
---

# GeoSpec authoring

Write tests before implementation; assert deterministic, measurable properties.

## Test shape

- Use `*.geospec.ts` or `*.geospec.js`. Import `describe`, `it` and `expectGeo` from `geospec`, and `loadModel` from `geospec/model`.
- Await `loadModel`, then assert synchronously with `expectGeo(model)`. The host supplies the compiled binding; authoring does not select an engine.
- Await or return the complete model-load chain from the test callback; detached future loads are not part of a completed test.
- Omit `parameters` for model-code defaults; use `{ file, parameters }` for variants. Loaded subjects are opaque.

Canonical TypeScript authoring:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main geometry', () => {
  it('has the intended envelope', async () => {
    const model = await loadModel({ file: 'main.ts', parameters: { width: 120 } });
    expectGeo(model).toHaveBoundingBox({ size: { x: 120 }, tolerance: 1 });
  });
});
```

Python/pytest use `load_model` / `expect_geo` from `geospec`. A `GeoSpecEngine` context or pytest's `geospec_engine_factory` supplies the rooted host; code models require its export capability.

```python
from geospec import expect_geo, load_model

def test_envelope():
    model = load_model(file="part.glb", source_unit="mm")
    expect_geo(model).to_have_bounding_box(size={"x": 120}, tolerance=1)
```

## Coverage

Bounds and physical properties are insufficient. Cover major components, named features, variants, dimensions/positions, disjoint counts, closure, interference and supported exact features. Explicitly report unsupported requirements; proxies cannot fulfill them.

- `toHaveBoundingBox`: size/position.
- `toHaveConnectedComponents`: disjoint chunks; adjust tolerance only for physically touching parts.
- `toBeWatertight`: each geometry unit is a closed manifold. Closed surfaces alone do not prove a Boolean fuse or one material-connected solid; neither does an AABB cluster count. State that qualification as unsupported when the necessary evidence is unavailable.
- `toHaveSurfaceArea`, `toHaveVolume`, `toHaveCenterOfMass`, `toHaveMass`: physical measurements.
- `toHaveNoComponentInterference`: overlap; allow deliberate press fits.
- `loadModel({ file, format: 'step' })`: use BRep evidence for supported topology and feature assertions. Missing occurrence, interference, clearance, containment, lumen, wall, section or motion evidence is unsupported, not a pass or an envelope substitute.

Test assemblies and independent units; preserve sibling coverage when adding files. Non-top-level geometry needs kernel export/invocation, not test removal.

Fix geometry at its root; never weaken tolerances, delete assertions, or reduce detail to pass.

## API reference

All 361 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-functions.md` — Functions
- `api-constants.md` — Constants
- `api-types.md` — Types
- `api-types-2.md` — Types (2)
- `api-classs.md` — Classs

Read ranges, not whole files. Never copy a reference into a source file.
