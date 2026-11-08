---
manifold: minor
jscad: minor
openrscad: minor
---

Manifold, JSCAD and OpenSCAD take the shared tessellation form that the OCCT kernels use. A render or export takes `tessellation`: a preset (`low`, `medium`, `high`, `extra-high`) or a strict explicit object with at least one field, never both. Renders default to `medium` and exports to `high`. A render or export meshes once at the requested values, with no triangle budget: it is never coarsened and never refused for its size. Each render reports `tessellation` with the requested form, its triangle and vertex counts and the time it took.

- Manifold: explicit `{ segments?, linearTolerance?, angularTolerance? }` in millimetres and degrees sets Manifold's circular segments, minimum edge length and minimum angle. A preset derives the edge length from the model's bounding-box diagonal and bounds the angle by the same chord deviation, so a sphere of radius 5 mm and one of 500 mm both mesh to 2,592 triangles at `medium`. The kernel version is 1.3.0; the serialized handle now carries the bundled program, so a render or export re-runs the model at the requested detail.
- JSCAD: explicit `{ segments }` sets the default segment count of every circular primitive that does not pass its own; the presets are 16, 32, 64 and 128. `medium` is JSCAD's own default of 32, so a `medium` preview is unchanged. The kernel version is 1.2.0; the serialized handle carries the program, and an older handle still reads.
- OpenSCAD: explicit `{ segments?, linearTolerance?, angularTolerance? }` sets `$fn`, `$fs` and `$fa`. `minimumSize` and `minimumAngle` still read as deprecated aliases of `linearTolerance` and `angularTolerance`, but never beside them. With no `tessellation` given, the lane default fills only the variables a script does not assign at top level; a requested preset or explicit object sets all three. The kernel version is the engine release with `+tessellation1` build metadata.

Default outputs that change: a Manifold or OpenSCAD model that does not set its own resolution now previews at `medium` and exports at `high` instead of the kernel's built-in defaults, so its triangle count changes. JSCAD and Manifold GLB exports now default to `high` (JSCAD 64 segments instead of 32). A model that sets its own segment count, or an OpenSCAD script that assigns `$fn`, `$fa` or `$fs`, keeps that value.
