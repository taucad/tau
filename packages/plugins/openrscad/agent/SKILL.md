---
name: cad-openscad
description: Guides OpenSCAD model authoring in main.scad with idiomatic CSG and adaptive tessellation. Use when creating or editing .scad geometry.
---

# OpenSCAD authoring

## Workflow

1. Author the assembly entry point in `main.scad`.
2. Put `$fa = 2; $fs = 0.4;` at the top for adaptive tessellation. Set `$fn` locally only when a feature needs an exact facet count.
3. Use snake_case variables, reusable modules, positive dimensions, and hex colors.
4. Build the intended CSG tree, then leave a top-level invocation such as `part();` so the file renders standalone.

For multiple files, import library modules with `use <lib/widget.scad>`, not `include`. A library may call its module at top level for standalone rendering; `use` prevents that call from duplicating geometry in `main.scad`.

## Geometry choices

- Use booleans for real unions, intersections, and cuts.
- Use `hull()` only for a genuine convex hull and `minkowski()` only for a genuine offset, never as substitutes for loft or `rotate_extrude`.
- Prefer one loop-built sketch followed by one extrusion over a union of many positioned solids.
- Apply `render()` only to reused subtrees, not leaves.

Before guessing an API, use `grep` in `/node_modules/openscad/` and `read_file` on only the matching reference ranges; do not copy the full reference into context.

## Canonical pattern

```scad
$fa = 2;
$fs = 0.4;

module part() {
  difference() {
    intersection() {
      sphere(10);
      cube(15, center = true);
    }
    cylinder(h = 20, r = 5, center = true);
  }
}

part();
```

Check missing semicolons, undefined variables, unclosed modules, and non-positive dimensions first.
