---
name: cad-picovoxel
description: Guides Picovoxel voxel and implicit modeling in main.ts. Use when creating or editing TypeScript geometry with a runtime-owned Pico session.
---

# Picovoxel authoring

## Workflow

1. Author `main.ts` with public Picovoxel ES module imports, exported `defaultParams`, and a default `main(pico, params)`.
2. Use the `Pico` session passed by the runtime; never call `createPico()` or import `picovoxel/multi`.
3. Return a `Mesh`, `Voxels`, or a flat non-empty array of those values—not statistics, nested arrays, or rich result containers.
4. Keep every standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js` and pass the runtime-owned `pico` argument into them.

Before guessing an API, use `grep` in `/node_modules/picovoxel/` and `read_file` on only the matching `.d.ts` ranges; do not copy the full reference into context.

## Kernel rules

- Picovoxel produces triangle meshes sampled from voxel or implicit fields, not analytical BRep.
- Smaller voxel sizes increase memory and runtime cubically; use the coarsest value that preserves the required feature.
- Prefer built-in sphere, beam, capsule, implicit, boolean, ShapeKernel, and LatticeLibrary operations over manual triangles.
- Dispose short-lived heavy intermediates after their last use; never retain disposed geometry.
- Keep the exact lane for reproducible models and exports.

## Canonical pattern

```ts
import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 12, boreRadius: 4 };

export default function main(pico: Pico, p = defaultParams): Voxels {
  const body = pico.createVoxels({ shape: 'sphere', radius: p.radius });
  const bore = pico.createVoxels({
    shape: 'beam',
    start: [0, 0, -p.radius * 1.5],
    end: [0, 0, p.radius * 1.5],
    radius: p.boreRadius,
  });
  return body.subtract(bore);
}
```

Check separate sessions, non-positive `voxelSize`, callback SDFs where expressions are required, and invalid return shapes first.
