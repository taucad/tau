## Workflow

1. Author the assembly in `main.kcl`, beginning with `@settings(defaultLengthUnit = mm, kclVersion = 2.0)`.
2. Write dimensions with unit suffixes (`10mm`, `90deg`); bare numbers take the default unit.
3. Draw each profile in a `sketch(on = XY) { … }` block (or `XZ`, `YZ`, `offsetPlane(XY, offset = 5mm)`, `faceOf(…)`): name every segment, then constrain it.
4. Make a face with `region(segments = [s.first, s.second])` (two consecutive counter-clockwise segments, or one circle); inner loops become holes. Then `extrude`, `revolve`, `sweep` or `loft` it.
5. Chain operations with `|>`; the piped value fills the `@` argument. Tag faces with `$name` (`tagEnd = $top`); a region's side faces are `region.tags.<segment>`.
6. `hide(sketch)` once used; leave top-level geometry so each file renders standalone.

KCL uses an assembly-only layout: keep library modules flat and import them from `main.kcl` (`import widget from "widget.kcl"`); a library renders alone only with its own top-level `widget()` call.

## Sketch blocks

- Segments: `line(start, end)`, `arc(start, end, center)`, `circle(start, center)`; add `construction = true` for guides.
- Seed coordinates with literal `var` guesses (`[var 40mm, var 0mm]`); they only start the solver. Parameters go in constraints.
- Constraints: `coincident([a.end, b.start])`, `horizontal(a)`, `vertical(a)`, `parallel`, `perpendicular`, `tangent`, `equalLength`. Dimensions are equations: `distance([p, q]) == 20mm`, `horizontalDistance([ORIGIN, c.center]) == width / 2`, `radius(c) == r`, `diameter(c) == d`.
- "Sketch is over-constrained": remove a conflicting constraint.

## Canonical pattern

```kcl
@settings(defaultLengthUnit = mm, kclVersion = 2.0)

width = 60mm
depth = 40mm
thickness = 8mm
holeDiameter = 10mm

profile = sketch(on = XY) {
  bottom = line(start = [var 0mm, var 0mm], end = [var 60mm, var 0mm])
  right = line(start = [var 60mm, var 0mm], end = [var 60mm, var 40mm])
  top = line(start = [var 60mm, var 40mm], end = [var 0mm, var 40mm])
  left = line(start = [var 0mm, var 40mm], end = [var 0mm, var 0mm])
  coincident([bottom.end, right.start])
  coincident([right.end, top.start])
  coincident([top.end, left.start])
  coincident([left.end, bottom.start])
  coincident([bottom.start, ORIGIN])
  horizontal(bottom)
  vertical(right)
  horizontal(top)
  vertical(left)
  horizontalDistance([bottom.start, bottom.end]) == width
  verticalDistance([right.start, right.end]) == depth

  hole = circle(start = [var 35mm, var 20mm], center = [var 30mm, var 20mm])
  horizontalDistance([ORIGIN, hole.center]) == width / 2
  verticalDistance([ORIGIN, hole.center]) == depth / 2
  diameter(hole) == holeDiameter
}

base = region(segments = [profile.bottom, profile.right])
plate = extrude(base, length = thickness, tagEnd = $topFace)
  |> fillet(radius = 1mm, tags = [getCommonEdge(faces = [base.tags.right, topFace])])
  |> appearance(color = "#1f9896")
hide(profile)
```

## Wrong / Correct

- `startSketchOn(XY) |> startProfile(…)` (deprecated in KCL 2.0) → a `sketch(on = XY) { … }` block plus `region()`.
- `extrude(profile, …)` → `extrude(region(segments = [profile.a, profile.b]), …)`.
- `var width` (parse error) → `var 60mm` plus a constraint using `width`.
- `circle(center, radius)` in a block → `circle(start, center)` plus `radius(c) == r`.

A TypeScript `main.geospec.ts` can test the model: `const model = await loadModel({ file: 'main.kcl' })`, then `expectGeo(model).toHaveBoundingBox({ size: { x: 60, y: 40, z: 8 }, tolerance: 0.1 })`.

Check unclosed loops, undefined names and solver warnings first.
