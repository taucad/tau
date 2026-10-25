---
geospec: minor
---

`geospec check <file.step|file.stp|file.glb>` runs one bundled validity spec on a model file with no `*.geospec.ts`: no error diagnostics, closed edge incidence and a bounding box with positive size, plus mesh integrity for a GLB or a valid BRep with closed shells for a STEP file, each claim its own test. `--components <n>` adds an exact connected-component count, and `--json` prints the same report as `geospec run`. The spec is served from memory in the file's folder, so nothing is written there; `createGeoSpecNodePoolRunner` takes the in-memory `sources` that make this work.

The legacy evidence and STEP structure types are gone from the public surface. The root barrel keeps `GeometryDiagnostic` and `Vec3` (also as `GeoSpecVec3`), which the matcher types name, and `geospec/mesh` keeps `GeometryDiagnostic`, `GeometryExportIntent`, `GeometryFileFormat`, `MeshFileFormat`, `Vec3`, `GeoSpecUnit`, `MeshSource` and `MeshBufferSource`. `BrepEvidence`, `StepEvidence`, `MeshEvidence`, `GeometrySubject`, `GeometryStats`, `MeshQualityStats`, `CheckResult`, the watertight, bounding-box and component failure records and the `Xde*` STEP structure types described the removed TypeScript engine; no published API returned them. The agent bundles are regenerated.
