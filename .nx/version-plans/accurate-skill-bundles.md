---
agent-plugin: minor
geospec: minor
build123d: minor
jscad: minor
manifold: minor
opencascade: minor
openrscad: minor
picogk: minor
picovoxel: minor
replicad: minor
smlib: minor
tscircuit: minor
zoo: minor
---

The generated agent skills show each signature in full and say where the rest is. A union type alias with object variants lists every variant on its own line, so `cad-picovoxel` shows all five `CreateVoxelsOptions` shapes instead of the first. A small type that several shown signatures name is declared once: `geospec-authoring` declares `GeoSpecNumericExpectation` once instead of five times. The marker under a trimmed class names the members it hides (`cad-manifold`'s `Manifold` marker lists `levelSet`, `hull`, `slice` and the rest), and `api-index.md` gives each top-level symbol the line range of the file that holds it, which the reference map tells the agent to read instead of grepping the skill directory. `cad-replicad` declares Tau's `ShapeConfig`, with `density` and `interfaces`, and no longer the upstream one beside it.

`geospec-authoring` gains a Ceilings table: the 64 MiB subject and resource limits with the 72-bytes-per-triangle mesh export that puts admission near 930,000 triangles, the 128 MiB total, the decoded triangle and vertex counts, the 32 MiB continuous-evidence limit of `toHaveNoComponentInterference`, and the `workUnitLimit` cap, plus when to load `format: 'step'`. Its limit advice now says only a `work-budget` row's `limit.retry` is a retry and every other limit is reported as not decided. `cad-picovoxel` states the same triangle ceiling beside `voxelSize` and coarsens on `PICO_OUT_OF_MEMORY` only while the thinnest wall still spans about three voxels. A `geospec-engine` test compares the table's admission limits with the ones the installed engine reports.
