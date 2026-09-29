---
name: cad-picovoxel
description: Guides PicoVoxel voxel, SDF and lattice CAD in main.ts. Use when creating or editing TypeScript models that import picovoxel.
---

# PicoVoxel authoring

## Workflow

1. Author `main.ts`: `import type { Pico, Voxels, Mesh } from 'picovoxel'`, helpers from `picovoxel/shapekernel`, `picovoxel/latticelibrary` and `picovoxel/numerics`.
2. Export `defaultParams` with a `voxelSize` and a default `main(pico, params = defaultParams)` returning `Voxels`, `Mesh`, or a flat array of them; `[]` is an empty scene.
3. Use the `pico` session Tau passes in. Never call `createPico()` or import `picovoxel/multi`, `picovoxel/raw` or `picovoxel/three`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js` and pass `pico` into them.

## Kernel rules

- `voxelSize` is the voxel edge in millimetres. Cost grows roughly with 1/voxelSize³: start at 0.5–1 mm and refine only for final detail.
- Output is a triangle mesh sampled from voxels, not BRep. Prefer voxel booleans, offsets, ShapeKernel bases and LatticeLibrary lattices over manual triangles.
- For implicits, prefer an `SdfExpression` (`['max', ['abs', 'x'], ['abs', 'y']]`) over a JS `sdf` callback: expressions fill in parallel, callbacks run serially.
- Dispose large intermediates after their last use.
- The viewer shows a fast preview; exports and GeoSpec checks replay the model exactly, so they can differ by about one voxel. Never request `lane: 'fast'` for manufacturing exports.

PicoVoxel is PicoGK compiled to WebAssembly and runs in the browser, desktop and CLI. Native PicoGK is C# (`main.cs`) on the desktop only. Route `.ts` PicoGK-style requests here and `.cs` to `cad-picogk`; projects do not convert between them.

## Canonical pattern

```ts
import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 10, boreRadius: 3.5 };

export default function main(pico: Pico, params = defaultParams): Voxels {
  const sphere = pico.createVoxels({ shape: 'sphere', radius: params.radius });
  const beam = (axis: 0 | 1 | 2) => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0, 0, 0];
    start[axis] = -params.radius * 1.2;
    end[axis] = params.radius * 1.2;
    return pico.createVoxels({ shape: 'beam', start, end, radius: params.boreRadius });
  };
  return sphere.subtract(beam(0), beam(1), beam(2));
}
```

Check a missing default export, a wrong return type and a non-positive `voxelSize` first. `PICO_OUT_OF_MEMORY` means coarsen `voxelSize` or shrink the bounds.

## API reference

All 725 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-interfaces.md` — Interfaces
- `api-types.md` — Types
- `api-classs.md` — Classs
- `api-classs-2.md` — Classs (2)
- `api-functions.md` — Functions
- `api-constants.md` — Constants

Read ranges, not whole files. Never copy a reference into a source file.
