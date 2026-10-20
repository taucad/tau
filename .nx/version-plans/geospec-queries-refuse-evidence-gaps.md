---
geospec: minor
geospec-engine: minor
cli: minor
host: minor
---

The bundled engine moves to `geospec-engine` 0.3.0, in which `inspectGeometry`, `analyzeMeshOverlap` and `analyzeBrep` answer `refused` instead of `failed` when the evidence they read is missing or cannot decide: a selector that is unmatched, ambiguous or unsupported on the subject, an inconclusive component partition, an invalid component, a subject with no BRep or a BRep the backend cannot measure. Each keeps its diagnostic code, and a refused result carries no `evidence`. A query asserts nothing, so every query now answers `passed` or `refused`; code that branched on `failed` for these queries should branch on `refused` and read the first diagnostic's code. The `client.query` and `evaluateGeoSpecNativeQuery` documentation and the `geospec-authoring` skill say so.

`@taucad/host` now asks for the `geospec-engine` peer at `^0.3.0`, the first stable release that refuses these queries.
