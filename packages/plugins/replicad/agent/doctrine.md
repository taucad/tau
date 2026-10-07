## Workflow

1. Author `main.ts` with ES module imports from `replicad`, camelCase names, exported `defaultParams`, and a default `main(params)` returning a shape, Tau `ShapeConfig[]`, or a `Model` envelope.
2. Prefer BRep-native construction: holes in the source sketch, revolved wall profiles for round shells, and separate named `ShapeConfig` parts when a fused solid is unnecessary.
3. Use analytical arcs/circles where they fit. For involutes, airfoils, spirals, or cycloids, sample about eight control points and use `drawPointsInterpolation(points)` instead of chained lines.
4. For appearance, materials, textures, STEP interfaces or mass requests, read `tau-authoring-reference.md` and use Tau model types from `@taucad/replicad/model`. Use physical `material` for glTF effects beyond the legacy color/opacity/metalness/roughness fields.
5. If parts move relative to one another, read `kinematics-reference.md`. Return separate named parts, export `mechanism` with joints and an animation for every independent motion, and verify the Kinematics pane plays them.
6. Verify the entry point and every renderable library file independently. Fix material/resource and mechanism warnings even if geometry renders.

For multiple files, import helpers with explicit ESM paths such as `./lib/widget.js`. Library files export geometry builders; `main.ts` assembles them. A standalone test target must export a default `main` returning geometry.

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

Check invalid dimensions, open/self-intersecting sketches, coincident boolean faces, and accidental polyline curves first. `api-*` files cover upstream `replicad`; `tau-api-*` files cover Tau's returned model, material and annotation types. Grep them before assuming a field or API is unavailable.

## Wrong / Correct

- Wrong: `draw().moveTo([0, 0])`. Correct: `draw([0, 0])`, or `pen.movePointerTo([x, y])` before the first segment.
- Wrong: starting a pen with `.tangentArcTo(…)` ("You need a previous curve"). Correct: draw a `lineTo`/`hLine`/arc first; a tangent arc continues the previous curve.
- Wrong: `makeCylinder(r, h).translate(…)` reused in several places. Correct: build once, then `clone()` each copy before transforming.
