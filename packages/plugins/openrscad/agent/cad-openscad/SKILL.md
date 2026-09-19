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

## API reference

All 78 symbols are listed in `api-index.md`. Grep it for a name, then read only the file its heading names.

- `api-3d-primitives.md` — 3D primitives
- `api-2d-primitives.md` — 2D primitives
- `api-transforms.md` — Transforms
- `api-booleans.md` — Booleans
- `api-extrusion-projection.md` — Extrusion / projection
- `api-control-flow-modules.md` — Control-flow modules
- `api-math-functions.md` — Math functions
- `api-list-string-functions.md` — List / string functions
- `api-special-variables-offered-as-completions.md` — Special variables (offered as completions)

Read ranges, not whole files. Never copy a reference into a source file.
