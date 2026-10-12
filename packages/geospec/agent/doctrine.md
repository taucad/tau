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

Specs are always TypeScript or JavaScript, whatever the model's kernel: `loadModel({ file })` evaluates `main.ts`, `main.tsx`, `main.py`, `main.scad`, `main.kcl` or `main.cs` through Tau's runtime. `test_model` discovers `*.geospec.ts` and `*.geospec.js` only.

Every matcher takes one expectation object:

- Wrong: `expectGeo(model).toHaveVolume(5000, { tolerance: 5 })`. Correct: `expectGeo(model).toHaveVolume({ value: 5000, tolerance: 5 })`.
- Wrong: `await expectGeo(model)…`. Correct: await `loadModel`, then assert synchronously.
- Wrong: exact-feature matchers on a mesh kernel (Manifold, JSCAD, OpenSCAD, PicoGK, PicoVoxel). Correct: `toBeValidBrep`, `toHaveTopologyCounts`, the face, hole, pattern, chamfer, fillet and wall-thickness matchers, `toHaveStepUnits`, `toHaveProductStructure` and `toHaveVoidContinuity` need STEP BRep evidence and report unsupported on meshes; assert meshes with bounds, volume, surface area, connected components and `toBeWatertight`.

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

`public-api-index.md` covers the host and framework API; authoring needs only the Core API below and `api-*` files.
