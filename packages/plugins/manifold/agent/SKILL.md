---
name: cad-manifold
description: Guides robust Manifold mesh CAD in main.ts. Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.
---

# Manifold authoring

## Workflow

1. Author `main.ts` with ES module imports from `manifold-3d/manifoldCAD`, exported `defaultParams`, and a default `main(params)` returning a `Manifold` or a flat array of `Manifold`/GLTF nodes.
2. Use positive dimensions and built-in primitives, revolves, and booleans.
3. Choose segment counts deliberately because all curves become mesh geometry.
4. Keep every standalone test target renderable through a default `main` returning geometry.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; keep assembly orchestration in `main.ts`.

Before guessing an API, use `grep` in `/node_modules/manifold-3d/` and `read_file` on only the matching `.d.ts` ranges; do not copy the full reference into context.

## Kernel rules

- For cylinders, spheres, and revolves, start near `max(16, Math.PI * diameter / 0.3)` segments for visible parts; 32 suits small features and 64 large ones.
- Prefer `Manifold.cylinder`, `Manifold.sphere`, and `Manifold.revolve` over manual point loops.
- Combine arrays once with `Manifold.compose` or n-ary boolean methods instead of nested Manifold-of-Manifold construction.
- Do not proliferate segments on small features.

## Canonical pattern

```ts
import { Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = { width: 80, depth: 40, height: 20, holeRadius: 6 };

export default function main(p = defaultParams): Manifold {
  const body = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cylinder(p.height + 2, p.holeRadius, -1, 64, true);
  return body.subtract(Manifold.union([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]));
}
```

Check missing imports, undefined returns, invalid boolean inputs, and non-positive dimensions first.
