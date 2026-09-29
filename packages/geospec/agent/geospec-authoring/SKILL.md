---
name: geospec-authoring
description: Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.
---

# GeoSpec authoring

Write tests before implementation; assert deterministic, measurable properties.

## Test shape

- Use `*.geospec.ts` or `*.geospec.js`. Follow the selected API recipe in `test_model`; legacy is the default.
- Both families import `describe` and `it` from `geospec`. Keep loaders/matchers paired; never alias or rebind families.
- Legacy: `expectGeo` from `geospec`, `loadModel` from `geospec/model`; assert with `expectGeo(model)`.
- Native: `expectNativeGeo` from `geospec`, `loadNativeModel` from `geospec/runner/native`; await every `expectNativeGeo(model)` assertion.
- Await or return the complete model-load chain from the test callback; detached future loads are not part of a completed test.
- Omit `parameters` for model-code defaults; use `{ file, parameters }` for variants. Loaded subjects are opaque.

When `test_model` selects native:

```ts
import { describe, expectNativeGeo, it } from 'geospec';
import { loadNativeModel } from 'geospec/runner/native';

describe('main geometry', () => {
  it('has the intended envelope', async () => {
    const model = await loadNativeModel({ file: 'main.ts', parameters: { width: 120 } });
    await expectNativeGeo(model).toHaveBoundingBox({ size: { x: 120 }, tolerance: 1 });
  });
});
```

## Coverage

Whole-model bounds and physical properties alone are insufficient. Cover every major component and named visible feature, variants, dimensions/positions, disjoint part count, watertight solids, interference, and supported exact features. State unsupported coverage with the nearest honest proxy.

- `toHaveBoundingBox`: size/position.
- `toHaveConnectedComponents`: disjoint chunks; adjust tolerance only for physically touching parts.
- `toBeWatertight`: each geometry unit is a closed manifold; use this, not component count, to prove a boolean fuse.
- `toHaveSurfaceArea`, `toHaveVolume`, `toHaveCenterOfMass`, `toHaveMass`: physical measurements.
- `toHaveNoComponentInterference`: overlap; allow deliberate press fits.
- Selected loader's `{ file, format: 'step' }`: BRep validity, topology, units, product structure, planar/cylindrical faces, holes/patterns, fillets, chamfers, wall thickness, spatial relationships.

Test assembly and independently renderable units. Add/update tests for new source files; preserve sibling coverage. Targets without top-level geometry need kernel-specific export/invocation, not test removal.

Fix geometry at its root; never weaken tolerances, delete assertions, or reduce detail to pass.

## API reference

All 367 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-functions.md` — Functions
- `api-constants.md` — Constants
- `api-types.md` — Types
- `api-classs.md` — Classs

Read ranges, not whole files. Never copy a reference into a source file.
