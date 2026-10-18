## Workflow

1. Author `main.ts`: `import type { Pico, Voxels, Mesh } from 'picovoxel'`, helpers from `picovoxel/shapekernel`, `picovoxel/latticelibrary` and `picovoxel/numerics`.
2. Export `defaultParams` with a `voxelSize` and a default `main(pico, params = defaultParams)` returning `Voxels`, `Mesh`, `{ shape, name?, material? }`, a model envelope, or a flat mixed array; `[]` is an empty scene.
3. For moving parts, read `kinematics-reference.md`: return explicitly named bodies and export `mechanism` or `mechanism(params)` with joints and clips. Fix mechanism warnings.
4. Use the `pico` session Tau passes in. Never call `createPico()` or import `picovoxel/multi`, `picovoxel/raw` or `picovoxel/three`.

Across files, use explicit ESM paths such as `./lib/widget.js` and pass `pico` to helpers.

## Kernel rules

- `voxelSize` is the voxel edge h in millimetres. Choose about one third of the thinnest wall or strut. Time scales with 1/h³, memory and triangles with 1/h². A 200 mm gyroid lamp with 1.5 mm walls at 0.5 mm is about 59 M field evaluations and 1–2 M triangles, minutes per evaluation; a 44 mm geode at 0.5 mm is about 323 k triangles, seconds. A GeoSpec `loadModel` of the part sends about 72 bytes per triangle, so above about 930,000 triangles its claims are refused admission and reported not decided; that is a test ceiling, never a reason to coarsen the design.
- Iterate with per-call `parameters`, e.g. `{ "voxelSize": 1.5 }` on `evaluate_model`, `screenshot` or `export_model`; they are never saved. Stay coarse while iterating and export at the author's value. Tau never changes `voxelSize` itself; edit the source value only when the author asks.
- `voxelSize` is the model, not a mesh setting: PicoVoxel views take no `tessellation` presets. Results report `tessellation` with `voxelSize`, `activeVoxels`, `memoryBytes`, triangles, vertices and elapsed. A view or capture over 2 M triangles shows a mesh simplified within half a voxel and warns `DISPLAY_SIMPLIFIED`; only the picture changes. The grid, exports and GeoSpec subjects stay exact.
- Prefer voxel booleans, offsets, ShapeKernel and LatticeLibrary over manual triangles. Output is mesh, not BRep.
- Prefer an `SdfExpression` (`['max', ['abs', 'x'], ['abs', 'y']]`) over a JS `sdf` callback: expressions fill in parallel, callbacks run serially.
- Dispose large intermediates after their last use.
- The viewer shows a fast preview; exports and GeoSpec checks replay the model exactly, so they can differ by about one voxel. Never request `lane: 'fast'` for manufacturing exports.

Route TypeScript PicoGK requests here; native C# `main.cs` uses desktop `cad-picogk`.

Check a missing default export, a wrong return type and a non-positive `voxelSize` first. `PICO_OUT_OF_MEMORY` means the model cannot be built at this `voxelSize` and bounds: coarsen `voxelSize` only while the thinnest wall still spans about three voxels, or shrink the bounds to the part, and tell the author. A GeoSpec limit is different: keep the model and report the claim as not decided.

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

Names trim; blank/omitted names use ordinal `Shape N`. Duplicate labels and Unicode survive;
STL basenames are safe and unique. Raw parts remain valid. Nested arrays, `children`, invalid
shapes/names fail with the output index. Names create no stable identity or hierarchy.
Mechanism bindings require unique authored names.

## Materials

Attach `material` to final descriptors. Return `{ shapes, images?, textures?, samplers? }`
for maps. Find all six `@taucad/picovoxel` authoring types in `tau-api-index.md`.
Read [materials-reference.md](materials-reference.md) for all 17 maps, 11 extensions,
units, UV0 and exports.
