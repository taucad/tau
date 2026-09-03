# @taucad/geometry-core

[![npm](https://img.shields.io/npm/v/@taucad/geometry-core)](https://www.npmjs.com/package/@taucad/geometry-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/geometry-core)](https://www.npmjs.com/package/@taucad/geometry-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/geometry-core)](https://www.npmjs.com/package/@taucad/geometry-core)
[![license](https://img.shields.io/npm/l/@taucad/geometry-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared geometry import, export, and inventory helpers

## Why @taucad/geometry-core?

- **One glTF pipeline for ten plugins** — naming, coordinate transforms, GLB writing, and import
  staging published once instead of copied per kernel.
- **Tau's glTF extensions** — `TauCadTopology` and `KittyCadBoundaryRepresentation`, so BRep topology
  survives a glTF round trip.
- **Deterministic GLB** — `writeGlb` emits byte-locked output, which is what makes kernel snapshots
  comparable.
- **Not a plugin** — no capabilities, no backend at module scope; plugin packages call it from their
  own `initialize()`.

## Install

```bash
npm i @taucad/geometry-core @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. `vitest` is an optional
peer, wanted only by `./testing`.

## Quick start

Call it from a capability's own code — the package initializes nothing on import:

```typescript
import { normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';

/** The GLB a kernel just produced. */
declare const glbBytes: Uint8Array<ArrayBuffer>;

const named = await normalizeGltfGeometryNames(glbBytes, { format: 'glb' });
const exported = await transformGltfExportBytes(named, {
  format: 'glb',
  coordinateSystem: 'z-up',
  unit: { length: 'millimeter' },
});
```

## API

| Area                            | Exports                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| glTF extension contract         | `allExtensions`, `registerTauGltfExtensions`, `TauCadTopology`, `TauCadTopologyRoot`, `KittyCadBoundaryRepresentation`, `KittyCadBrepNode`, `KittyCadBrepRoot`                 |
| glTF IO and document transforms | `createNodeIo`, `createCoordinateTransform`, `createScalingTransform`, `createReverseCoordinateTransform`                                                                      |
| Serialized-bytes pipeline       | `normalizeGltfGeometryNames`, `transformGltfExportBytes`                                                                                                                       |
| GLB writing                     | `writeGlb`, `writeGltfJson`, `createEmptyGlb`, `createEmptyGltf`, `createEmptyGltfGeometry`, types `GlbInput`, `GlbNode`, `GlbPrimitive`, `GlbMaterial`, `GlbManifoldTopology` |
| Import staging                  | `createImportFileInventory`, `ImportLoader`, types `ImportFile`, `ImportFileInventory`, `FileResolver`                                                                         |
| Names and color                 | `resolveShapeName`, `uniqueShapeName`, `formatShapeName`, `isLegacyGeneratedShapeName`, `srgbToLinear`, `srgbTupleToLinear`, `srgbHexToLinearTuple`                            |
| Coordinate and unit transforms  | `transformVertexArray`, `transformNormalArray`, types `GeometryOutputTransformOptions`, `OutputCoordinateSystem`, `OutputLengthUnit`                                           |

The shared glTF-Transform registry preserves `EXT_mesh_manifold`.

| Entry                   | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `@taucad/geometry-core` | the shared production helpers above; use `@taucad/runtime-testing` for test-only assertions |

## Environment

| Host           | Supported | Notes                                                                |
| -------------- | --------- | -------------------------------------------------------------------- |
| Browser worker | Yes       | pure JavaScript over `@gltf-transform/*`; no WASM, no Node built-ins |
| Node.js        | Yes       | `>=24`                                                               |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/core/geometry)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/geometry/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
