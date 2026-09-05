---
name: cad-replicad
description: Guides precise Replicad BRep authoring in main.ts. Use when creating or editing TypeScript geometry imported from replicad.
---

# Replicad authoring

## Workflow

1. Author `main.ts` with ES module imports from `replicad`, camelCase names, exported `defaultParams`, and a default `main(params)` returning `Shape3D` or `ShapeConfig[]`.
2. Prefer BRep-native construction: holes in the source sketch, revolved wall profiles for round shells, and separate named `ShapeConfig` parts when a fused solid is unnecessary.
3. Use analytical arcs/circles where they fit. For involutes, airfoils, spirals, or cycloids, sample about eight control points and use `drawPointsInterpolation(points)` instead of chained lines.
4. Verify the entry point and every renderable library file independently.

For multiple files, import helpers with explicit ESM paths such as `./lib/widget.js`. Library files export geometry builders; `main.ts` assembles them. A standalone test target must export a default `main` returning geometry.

Before guessing an API, use `grep` in `/node_modules/replicad/` and `read_file` on only the matching `.d.ts` ranges; do not copy the full reference into context.

## Kernel rules

- Prefer `fuseAll`, `cutAll`, and `intersectAll` over long pairwise boolean chains.
- Build one prototype, then `clone()` before transforming repeated parts.
- Use the `draw()` pen (`.threePointsArcTo`, `.bezierCurveTo`, `.smoothSplineTo`), `drawCircle`, or `drawPointsInterpolation` instead of polyline approximations.
- Do not expose export tessellation in `defaultParams`; the runtime owns linear and angular deflection.

## Canonical pattern

```ts
import { drawRoundedRectangle, makeCylinder, type Shape3D } from 'replicad';

export const defaultParams = { width: 80, depth: 30, height: 12, holeRadius: 4 };

export default function main(p = defaultParams): Shape3D {
  const body = drawRoundedRectangle(p.width, p.depth, 4).sketchOnPlane('XY').extrude(p.height);
  const hole = makeCylinder(p.holeRadius, p.height + 2);
  return body.cutAll([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]);
}
```

Check invalid dimensions, open/self-intersecting sketches, coincident boolean faces, and accidental polyline curves first.
