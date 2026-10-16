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

## Loads and budgets

- GeoSpec has no `beforeAll`. Write each `loadModel` inside its own `it`: within one run, identical loads (same file or code, parameters, format, tolerances and region) share one export and one admission. Each load keeps its own `loadId` and records `reused: true`, and a file is reused only while its source closure is unchanged.
- `loadModel({ file, workUnitLimit })` sets the default claim budget for that subject, and `expectGeo(model, { workUnitLimit })` overrides it for one chain. The budget is a positive integer no greater than 512000000. A `MATCHER_TIMEOUT` refusal reports `details.limit` and, when measured, `details.used`; raise the budget within the bound or simplify the model, and never treat the refusal as a pass.
- `loadModel({ file, region: { min: [x, y, z], max: [x, y, z] } })` makes a separate claim about one millimetre box, never a stand-in for a whole-model claim. The kernel crops before export (PicoVoxel trims Voxels parts), and other kernels, STEP loads and unconfirmed crops refuse with a typed diagnostic. A cropped subject answers only bounding box, volume, surface area, mass and center of mass of its region, and its assertions record the region. Every other matcher on it refuses with `GEOSPEC_REGION_WHOLE_MODEL_CLAIM`. Name the region in the test, and keep whole-model claims on whole-model loads.
- A host or engine limit leaves a claim undecided, never false. Keep the model as designed: never coarsen, shrink or crop it to fit. Raise `workUnitLimit` or `testTimeout` within the host's maximum, which the host can raise, or report the claim as not decided at this capacity.
- `toHaveCenterOfMass({ point, tolerance })` takes an exact point. Per-axis ranges such as `{ y: { greaterThan: 1 } }` are refused.

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
