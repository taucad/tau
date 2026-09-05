---
name: geospec-authoring
description: Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.
---

# GeoSpec authoring

Write tests before implementation. Keep each assertion deterministic and focused on one measurable property.

## Test shape

- Put tests in `*.geospec.ts` or `*.geospec.js`.
- Import `describe`, `it`, and `expectGeo` from `geospec`; import `loadModel` from `geospec/model`.
- Omit `parameters` to test model-code defaults. Pass a test-local object to `loadModel({ file, parameters })` for an intentional variant.
- Assert through `expectGeo(model)`; the loaded subject is opaque.

Before guessing a matcher or option, use `grep` in `/node_modules/geospec/` and `read_file` on only the matching `.d.ts` ranges.

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main geometry', () => {
  it('has the intended envelope', async () => {
    const model = await loadModel({ file: 'main.ts', parameters: { width: 120 } });
    expectGeo(model).toHaveBoundingBox({ size: { x: 120 }, tolerance: 1 });
  });

  it('is closed', async () => {
    expectGeo(await loadModel({ file: 'main.ts' })).toBeWatertight();
  });
});
```

## Coverage

A whole-model bounding box plus physical properties is insufficient for a production or high-fidelity assembly. Cover every major component and named visible feature, parameter variants, dimensions/positions, spatially disjoint part count, watertight solids, interference, and supported exact features. State unsupported coverage and add the nearest honest proxy.

Choose matchers by question:

- `toHaveBoundingBox`: size or position.
- `toHaveConnectedComponents`: spatially disjoint chunks; adjust tolerance only when parts physically touch.
- `toBeWatertight`: whether each geometry unit is a closed manifold; use this—not connected components—to prove a boolean fuse.
- `toHaveSurfaceArea`, `toHaveVolume`, `toHaveCenterOfMass`, `toHaveMass`: physical measurements.
- `toHaveNoComponentInterference`: unintended overlap; encode deliberate press fits as allowances.
- With `loadModel({ file, format: 'step' })`: BRep validity, topology, units, product structure, planar/cylindrical faces, holes/patterns, fillets, chamfers, wall thickness, and spatial relationships.

Test the assembly and its independently renderable geometry units. When adding a source file, add or update its matching test and preserve sibling coverage. If a target lacks top-level geometry, add the kernel-specific export/invocation; never drop the test.

On failure, fix the modeled geometry at its root. Do not weaken tolerances, delete assertions, or reduce detail merely to turn the test green.
