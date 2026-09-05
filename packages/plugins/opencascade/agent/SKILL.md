---
name: cad-opencascadejs
description: Guides direct OpenCascade.js BRep authoring in main.ts. Use when creating or editing libcascade geometry.
---

# OpenCascade.js authoring

## Workflow

1. Author `main.ts` with named imports from `libcascade`, exported `defaultParams`, and a default `main(params): TopoDS_Shape`.
2. Construct analytical edges and closed wires, build the operation, then return its shape.
3. Track every OCCT object and call `.delete()` in `finally`, including `gp_*`, `Geom*`, `BRep*`, and `TopoDS_*` intermediates.
4. Keep every standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; helpers return `TopoDS_Shape` and dispose their builders before returning.

Before guessing an API or overload, use `grep` in `/node_modules/libcascade/` and `read_file` on only the matching `.d.ts` ranges; do not copy the full reference into context.

## Kernel rules

- Use `GC_MakeArcOfCircle`, `Geom_Circle`, `Geom_BSplineCurve`, or `Geom2dAPI_PointsToBSpline` instead of polygon chains for analytical curves.
- Build profile wires from analytical edges and close them explicitly.
- Call `Build()` before `Shape()` where the selected builder requires it.
- The runtime meshes BRep at export; do not expose tessellation in `defaultParams`.

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
