## Workflow

1. Author `main.ts` with named imports from `libcascade`, exported `defaultParams`, and a default `main(params): TopoDS_Shape`.
2. Construct analytical edges and closed wires, build the operation, then return its shape.
3. Track every OCCT object and call `.delete()` in `finally`, including `gp_*`, `Geom*`, `BRep*`, and `TopoDS_*` intermediates.
4. Keep every standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; helpers return `TopoDS_Shape` and dispose their builders before returning.

## Kernel rules

- Use `GC_MakeArcOfCircle`, `Geom_Circle`, `Geom_BSplineCurve`, or `Geom2dAPI_PointsToBSpline` instead of polygon chains for analytical curves.
- Build profile wires from analytical edges and close them explicitly.
- Call `Build()` before `Shape()` where the selected builder requires it.

## Tessellation

Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the shape's bounding-box diagonal D: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances.

## Canonical pattern

```ts
import { BRepPrimAPI_MakeBox, gp_Pnt, type TopoDS_Shape } from 'libcascade';

export const defaultParams = { width: 80, depth: 40, height: 20 };

export default function main(p = defaultParams): TopoDS_Shape {
  const corner = new gp_Pnt(-p.width / 2, -p.depth / 2, -p.height / 2);
  const builder = new BRepPrimAPI_MakeBox(corner, p.width, p.depth, p.height);
  try {
    return builder.Shape();
  } finally {
    builder.delete();
    corner.delete();
  }
}
```

Check overload suffixes, unfreed temporaries, build order, and missing disposal first.
