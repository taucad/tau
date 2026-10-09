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

## Wrong / Correct

- Wrong: `cylinder(10, 5)`; positional order is easy to misread. Correct: name the arguments: `cylinder(h = 10, r = 5, center = true)`.
- Wrong: `include <lib/widget.scad>` for a module library. Correct: `use <lib/widget.scad>`.
- Wrong: relying on top-level `$fa`/`$fs` for measured accuracy. Correct: they shape the preview, but exports and GeoSpec evidence tessellate with `$fn = 32`; set `$fn` on a curved feature (`cylinder(h = 16, r = 4, $fn = 64)`) when its volume or fit is tested, and size volume tolerances to that facet count.

## Verify

Test with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.scad' })`; OpenSCAD yields mesh evidence.
