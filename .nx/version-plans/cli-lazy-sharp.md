---
geometry-core: minor
cli: minor
---

`tau` no longer loads the `sharp` image add-on at startup. `@taucad/geometry-core` imported `@gltf-transform/functions` at module load, and in Node that package imports `sharp` through `ndarray-pixels` for its texture functions, so `tau check`, `tau prepare`, `tau test`, `tau view` and `tau export` loaded `sharp` before parsing their arguments. `createCoordinateTransform`, `createScalingTransform` and `createReverseCoordinateTransform` now import it when a transform first runs, and return an asynchronous transform (`(document: Document) => Promise<void>`), which `document.transform()` already awaits. When `sharp` cannot load, its error now rejects that transform instead of the import of `@taucad/geometry-core`.
