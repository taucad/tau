---
name: geospec-authoring
description: Guides canonical GeoSpec tests in TypeScript, JavaScript and Python/pytest. Use for *.geospec.ts, *.geospec.js and GeoSpec pytest *.py tests.
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

Python: `load_model` / `expect_geo` from `geospec`. Below needs pytest's plugin scope; `geospec_engine_factory` configures its host. Standalone needs a `GeoSpecEngine` context; code models need export capability. Desktop `test_model` discovers TS/JS only.

```python
from geospec import expect_geo, load_model

def test_envelope():
    model = load_model(file="part.glb", source_unit="mm")
    expect_geo(model).to_have_bounding_box(size={"x": 120}, tolerance=1)
```

## Coverage

Bounds and physical properties are insufficient. Cover major components, named features, variants, dimensions/positions, disjoint counts, closure, interference and supported exact features. Explicitly report unsupported requirements; proxies cannot fulfill them.

- `toHaveBoundingBox`: size/position.
- `toHaveConnectedComponents`: qualified material connectivity; visual touching cannot justify tolerance changes.
- `toBeWatertight`: closed edge incidence, not manifold validity, fusion or material connectivity. Bounds prove none of these. Missing evidence is unsupported.
- `toHaveSurfaceArea`, `toHaveVolume`, `toHaveCenterOfMass`, `toHaveMass`: physical measurements.
- `toHaveNoComponentInterference`: overlap; allow deliberate press fits.
- `loadModel({ file, format: 'step' })`: use BRep evidence for supported topology and feature assertions. Missing occurrence, interference, clearance, containment, lumen, wall, section or motion evidence is unsupported, not a pass or an envelope substitute.

Test assemblies and independent units; preserve sibling coverage when adding files. Non-top-level geometry needs kernel export/invocation, not test removal.

Fix geometry at its root; never weaken tolerances, delete assertions, or reduce detail to pass.

Host/framework API: `public-api-index.md`; ordinary authoring: `api-index.md`.

## API reference

All 345 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-functions.md` — Functions
- `api-constants.md` — Constants
- `api-types.md` — Types
- `api-classes.md` — Classes

Read ranges, not whole files. Never copy a reference into a source file.
