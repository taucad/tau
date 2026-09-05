---
name: cad-zoo
description: Guides Zoo KCL modeling in main.kcl with pipe-based analytical geometry. Use when creating or editing KCL models.
---

# Zoo KCL authoring

## Workflow

1. Author the assembly in `main.kcl`, beginning with `@settings(defaultLengthUnit = mm)`.
2. Use camelCase variables and pipe operators (`|>`) for operation chains.
3. Build profiles with analytical lines, arcs, and curves, then use `extrude`, `revolve`, or `sweep` for the intended construction.
4. Leave top-level geometry, such as a completed extrusion pipeline, so each tested file renders standalone.

KCL uses an assembly-only layout. Keep library modules flat and import them from `main.kcl`, for example `import widget from "widget.kcl"`; give a library file its own top-level `widget()` call when it must render independently.

Before guessing a KCL API, use `grep` in `/node_modules/kcl-stdlib/` and `read_file` on only the matching reference ranges; do not copy the full reference into context.

## Kernel rules

- Prefer `arc`, `tangentialArc`, `arcTo`, `tangentialArcTo`, `bezierCurve`, `circle`, and `ellipse` over sampled polylines.
- Use `tangentialArc` when the next segment must continue smoothly.
- Keep smooth analytical construction visible in one pipeline rather than splitting it into sketches merely to compute intermediates.
- The runtime owns tessellation; do not expose it as a parameter.

## Canonical pattern

```kcl
@settings(defaultLengthUnit = mm)

radius = 24
height = 40

part = startSketchOn(XY)
  |> circle(center = [0, 0], radius = radius)
  |> extrude(length = height)
  |> appearance(color = "#1f9896")
```

Check missing pipes, unclosed sketches, undefined variables, and invalid geometric parameters first.
