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

## Tessellation

Views and exports take `options.tessellation` as a quality preset or an explicit object, never both. Pick `low` for a first look, thumbnails or large assemblies, `medium` (the default for `evaluate_model`, `screenshot` and the viewer) for ordinary review, `high` (the export default) for printing and GeoSpec evidence, and `extra-high` only when asked. Presets scale with the model's size, so a 5 mm pin and a 5 m frame cost about the same. The explicit object uses segments, millimetres and degrees and does not scale. Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters; resolution written into the geometry itself is covered below. Results report the effective `tessellation` (requested form, resolution, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M is refused rather than coarsened.

In OpenSCAD the explicit object is `{ segments?, linearTolerance?, angularTolerance? }`, set as `$fn`, `$fs` and `$fa`. With no `tessellation` given, top-level `$fn`, `$fa` and `$fs` assignments keep the script's own resolution; a requested value replaces the variables it sets, and a `$fn` passed to a call stays.

## Wrong / Correct

- Wrong: `cylinder(10, 5)`; positional order is easy to misread. Correct: name the arguments: `cylinder(h = 10, r = 5, center = true)`.
- Wrong: `include <lib/widget.scad>` for a module library. Correct: `use <lib/widget.scad>`.
- Wrong: sizing a volume tolerance to the true circle. Correct: unless a requested `tessellation` overrides them, preview, exports and GeoSpec evidence tessellate with the script's own `$fa`/`$fs`/`$fn`, so a faceted `r = 4` boss measures below `πr²h`; tighten `$fa`/`$fs`, or set `$fn` on the tested feature (`cylinder(h = 16, r = 4, $fn = 64)`), and size the tolerance to that facet count.

## Verify

Test with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.scad' })`; OpenSCAD yields mesh evidence.
