---
name: cad-picovoxel
description: Guides PicoVoxel voxel, SDF and lattice CAD, named parts and PBR materials. Use for TypeScript PicoVoxel geometry, appearance or texture authoring.
---

# PicoVoxel authoring

## Workflow

1. Author `main.ts`: `import type { Pico, Voxels, Mesh } from 'picovoxel'`, helpers from `picovoxel/shapekernel`, `picovoxel/latticelibrary` and `picovoxel/numerics`.
2. Export `defaultParams` with a `voxelSize` and a default `main(pico, params = defaultParams)` returning `Voxels`, `Mesh`, `{ shape, name?, material? }`, a model envelope, or a flat mixed array; `[]` is an empty scene.
3. Use the `pico` session Tau passes in. Never call `createPico()` or import `picovoxel/multi`, `picovoxel/raw` or `picovoxel/three`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js` and pass `pico` into them.

## Kernel rules

- `voxelSize` is the voxel edge in millimetres. Cost grows roughly with 1/voxelSize³: start at 0.5–1 mm and refine only for final detail.
- Output is a triangle mesh sampled from voxels, not BRep. Prefer voxel booleans, offsets, ShapeKernel bases and LatticeLibrary lattices over manual triangles.
- For implicits, prefer an `SdfExpression` (`['max', ['abs', 'x'], ['abs', 'y']]`) over a JS `sdf` callback: expressions fill in parallel, callbacks run serially.
- Dispose large intermediates after their last use.
- The viewer shows a fast preview; exports and GeoSpec checks replay the model exactly, so they can differ by about one voxel. Never request `lane: 'fast'` for manufacturing exports.

Route TypeScript PicoGK requests here; native C# `main.cs` uses desktop `cad-picogk`.

Check a missing default export, a wrong return type and a non-positive `voxelSize` first. `PICO_OUT_OF_MEMORY` means coarsen `voxelSize` or shrink the bounds.

## Part names

Name final parts with `{ shape, name }` after transforms, booleans or clones. Import
`PicovoxelResult` with `import type` only.

```ts
import type { Pico } from 'picovoxel';
import type { PicovoxelResult } from '@taucad/picovoxel';

export default function main(pico: Pico): PicovoxelResult {
  return {
    shape: pico.createVoxels({ shape: 'sphere', radius: 10 }),
    name: 'Housing',
  };
}
```

Names trim; blank/omitted names use ordinal `Shape N`. Duplicate labels and Unicode survive
preview, exact GLB and caches. STL filenames are safe unique derivatives. Raw parts remain valid.
Nested arrays, `children`, invalid shapes/non-string names fail with the output index. Names do not
create stable IDs, hierarchy or assembly occurrences. Use author indexes to distinguish repeated parts.

## Materials

Attach `material` to final descriptors. Return `{ shapes, images?, textures?, samplers? }`
for indexed maps. Use root type aliases `Material`, `Image`, `Resources`, `PicovoxelModel`.
Read [materials-reference.md](materials-reference.md) for all 17 maps, 11 extensions,
units, UV0 and exports.

## API reference

All 725 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-interfaces.md` — Interfaces
- `api-types.md` — Types
- `api-classs.md` — Classs
- `api-classs-2.md` — Classs (2)
- `api-functions.md` — Functions
- `api-constants.md` — Constants

Read ranges, not whole files. Never copy a reference into a source file.
