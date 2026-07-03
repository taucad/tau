---
title: 'glTF Construction Policy'
description: 'Rules for constructing glTF/GLB binaries in the runtime, governing the direct writer, buffer layout, material encoding, and kernel integration patterns'
status: active
created: '2026-03-24'
updated: '2026-06-30'
related:
  - docs/policy/geometry-naming-policy.md
  - docs/policy/rendering-pipeline-policy.md
  - docs/research/runtime-overhead-forensics.md
  - docs/architecture/runtime-topology.md
---

# glTF Construction Policy

Internal reference for how `@taucad/runtime` constructs glTF 2.0 / GLB binaries from kernel geometry output.

## Rationale

The runtime converts kernel geometry (meshes from Replicad, JSCAD, OpenSCAD, Manifold, OpenCASCADE) into GLB binary format for transport to the Three.js viewer. V8 CPU profiling (`docs/research/runtime-overhead-forensics.md`) revealed that GLB serialization via `@gltf-transform/core` consumed ~8ms for a simple box — more than the kernel's 1.4ms of OpenCASCADE work. The library's full document model (animations, extensions, validation) is architectural overhead for our mesh-only use case.

This policy codifies the decision to use a direct GLB binary writer on the render hot path, the buffer layout decisions, and the integration rules for each kernel. User-visible and identity-bearing names are governed by `docs/policy/geometry-naming-policy.md`.

## 1. Use the Direct Writer on the Render Hot Path

Use `writeGlb()` and `writeGltfJson()` from `packages/runtime/src/utils/glb-writer.ts` for all render-path GLB construction. Do not use `@gltf-transform/core` `Document` + `NodeIO` on the render hot path.

**Why**: The direct writer is synchronous, allocates no intermediate document model, and produces spec-compliant GLB in a single pass. Profiling shows this eliminates the `Document` construction and `NodeIO.writeBinary()` overhead that dominated short renders.

CORRECT:

```typescript
import { writeGlb } from '#utils/glb-writer.js';

const glb = writeGlb({
  nodes: [
    {
      name: 'Shape 1',
      primitives: [
        {
          mode: 4,
          positions: transformedPositions,
          normals: transformedNormals,
          indices: new Uint32Array(triangles),
          material: {
            baseColorFactor: [0.8, 0.8, 0.8, 1],
            metallicFactor: cadMaterialDefaults.metallicFactor,
            roughnessFactor: cadMaterialDefaults.roughnessFactor,
            doubleSided: true,
            alphaMode: 'OPAQUE',
          },
        },
      ],
    },
  ],
});
```

INCORRECT:

```typescript
import { Document, NodeIO } from '@gltf-transform/core';

const document = new Document();
document.createBuffer();
const scene = document.createScene();
// ... build entire document model ...
const glb = await new NodeIO().writeBinary(document);
```

### 1.1 Permitted Uses of `@gltf-transform/core`

`@gltf-transform/core` remains a dependency for use cases that require **reading** or **mutating** existing GLB documents:

| Use case                        | File                                      | Why direct writer is insufficient                                                    |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Edge detection middleware       | `gltf-edge-detection.middleware.ts`       | Reads GLB, adds LINES primitives, writes back — requires document model for mutation |
| Coordinate transform middleware | `gltf-coordinate-transform.middleware.ts` | Reads GLB, applies transforms, writes back                                           |
| Manifold kernel                 | `manifold.kernel.ts`                      | Uses `manifold-3d`'s own `GLTFNodesToGLTFDoc` which returns a `Document`             |
| Test assertions                 | `*.test.ts`                               | `NodeIO().readBinary()` to parse and verify output structure                         |

Do not add new `@gltf-transform/core` `Document` + `NodeIO().writeBinary()` calls to kernel render paths. If a new kernel produces mesh data (positions, normals, indices), map it to `GlbInput` and call `writeGlb()`.

## 2. Non-Interleaved Buffer Layout

The direct writer uses **non-interleaved** (Structure of Arrays) buffer layout: each vertex attribute (POSITION, NORMAL) gets its own `bufferView`. Do not implement interleaved (Array of Structures) layout with `byteStride`.

**Why**: The interleaving decision was evaluated against both CPU write cost and GPU read benefit:

| Factor                   | Non-interleaved                         | Interleaved                        |
| ------------------------ | --------------------------------------- | ---------------------------------- |
| Write method             | Bulk `TypedArray.set()` (memcpy)        | Per-vertex element copy loop       |
| CPU cost (100K vertices) | ~0.05ms                                 | ~0.35ms                            |
| GPU vertex fetch benefit | Prefetcher handles 2-attribute SoA well | Same cache line for pos+norm       |
| GPU impact per frame     | <0.005ms at our mesh sizes              | <0.005ms (within noise)            |
| Code complexity          | Trivial                                 | Stride metadata, offset arithmetic |

The GPU benefit is negligible for two reasons: (1) we have only two vertex attributes (POSITION + NORMAL), where modern GPU prefetchers handle dual-stream access efficiently, and (2) OCCT's Delaunay-based tessellation produces spatially coherent index sequences with good cache locality regardless of buffer layout.

Additionally, the edge detection and coordinate transform middleware re-serialize through `@gltf-transform/core` (which interleaves by default), so the Three.js viewer receives interleaved data whenever middleware is active.

Three.js `GLTFLoader` handles both layouts. The UI code (`gltf-edges.ts`) has explicit `InterleavedBufferAttribute` handling for the middleware-interleaved path, and regular `BufferAttribute` handling for the direct-writer non-interleaved path.

## 3. GLB Binary Format Requirements

All GLB output must comply with the glTF 2.0 specification. The direct writer must produce:

### 3.1 Header and Chunks

- 12-byte GLB header: magic `0x46546C67`, version `2`, total byte length
- JSON chunk: 8-byte header (length + type `0x4E4F534A`) + JSON padded to 4-byte boundary with spaces (`0x20`)
- BIN chunk: 8-byte header (length + type `0x004E4942`) + binary data padded to 4-byte boundary with zeros (`0x00`)

### 3.2 Required JSON Properties

| Property                           | Requirement                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `asset.version`                    | Must be `"2.0"`                                                                    |
| `asset.generator`                  | Must be `"tau-runtime"`                                                            |
| `scene`                            | Must be `0` (index of default scene)                                               |
| `scenes[0].nodes`                  | Array of root node indices                                                         |
| `bufferViews[].target`             | `34962` (ARRAY_BUFFER) for vertex data, `34963` (ELEMENT_ARRAY_BUFFER) for indices |
| `accessors[].min/max`              | Required on POSITION accessors (bounding box). Omit on NORMAL and index accessors. |
| `accessors[].componentType`        | `5126` (FLOAT) for positions/normals, `5125` (UNSIGNED_INT) for indices            |
| `accessors[].type`                 | `"VEC3"` for positions/normals, `"SCALAR"` for indices                             |
| `materials[].pbrMetallicRoughness` | Always present with `baseColorFactor`, `metallicFactor`, `roughnessFactor`         |
| `materials[].doubleSided`          | Always `true` for CAD geometry                                                     |

### 3.3 Material Encoding

Follow `cadMaterialDefaults` from `@taucad/types/constants` (see `docs/policy/rendering-pipeline-policy.md`):

| Property          | Surface primitives                       | Edge/line primitives                                                                                                          |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `metallicFactor`  | `0.0`                                    | `0`                                                                                                                           |
| `roughnessFactor` | `0.35`                                   | `1`                                                                                                                           |
| `doubleSided`     | `true`                                   | `true`                                                                                                                        |
| `alphaMode`       | `"OPAQUE"` or `"BLEND"` (based on alpha) | `"OPAQUE"`                                                                                                                    |
| `baseColorFactor` | Source color or `[0.8, 0.8, 0.8, 1]`     | Kernel-specific edge color; generated edge materials remain unnamed unless the geometry naming policy permits a semantic role |

### 3.4 Primitive Modes

| Mode      | Value | Use                                                      |
| --------- | ----- | -------------------------------------------------------- |
| TRIANGLES | `4`   | Surface geometry (faces)                                 |
| LINES     | `1`   | Owner-local edge/outline geometry or fallback mesh edges |

## 4. Exact GLB Byte View Contract

Every runtime-produced `GeometryGltf.content` must be an exact `Uint8Array<ArrayBuffer>` view over the full GLB payload: `content.byteOffset === 0` and `content.byteLength === content.buffer.byteLength`.

`Uint8Array<ArrayBuffer>` alone is not sufficient, because a typed array can be a view into a larger buffer. Runtime code must enforce exactness at GLB writer output, middleware rewrite output, cache reads, transport materialization, and any in-process pass-through boundary before exposing `GeometryGltf` to runtime clients or viewers.

**Why**: Three.js `GLTFLoader.parse` / `parseAsync` accepts `ArrayBuffer`, not `Uint8Array`; consumers should be able to pass `geometry.content.buffer` directly without app-level slice helpers.

CORRECT:

```typescript
const exactBytes =
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : new Uint8Array(bytes);

return {
  format: 'gltf',
  content: exactBytes,
};
```

CORRECT:

```typescript
const gltf = await gltfLoader.parseAsync(geometry.content.buffer, '');
```

INCORRECT:

```typescript
const glb = geometry.content.buffer.slice(
  geometry.content.byteOffset,
  geometry.content.byteOffset + geometry.content.byteLength,
);
const gltf = await gltfLoader.parseAsync(glb, '');
```

INCORRECT:

```typescript
return {
  format: 'gltf',
  content: glb.subarray(12),
};
```

Low-level parsers that intentionally accept arbitrary byte views before runtime normalization may still use offset-aware APIs such as `new DataView(content.buffer, content.byteOffset, content.byteLength)`. That is an internal parsing concern, not a consumer-facing GLB geometry contract.

## 5. Coordinate System

All GLB output must use the glTF coordinate system:

- **Y-up** (glTF spec requires Y-up; CAD kernels use Z-up)
- **Meters** (glTF spec requires meters; CAD kernels use millimeters)

Transform vertex data before writing to GLB using `transformVertexArray()` (positions: rotate + scale) and `transformNormalArray()` (normals: rotate only, preserve unit length) from `packages/runtime/src/framework/common.ts`.

Do not apply coordinate transforms inside the GLB writer itself — the writer accepts pre-transformed data.

## 6. Kernel Integration

Each kernel maps its geometry output to `GlbInput` before calling `writeGlb()`. The mapping is kernel-specific; the writer is kernel-agnostic.

| Kernel      | Geometry source                           | Mapping location      | Input to GLB                                                                                                                |
| ----------- | ----------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Replicad    | `GeometryReplicad` (faces, edges, colors) | `replicad-to-gltf.ts` | Pre-transformed positions/normals, indices, optional edge lines                                                             |
| JSCAD       | Named `geom3` part descriptors            | `jscad-to-gltf.ts`    | One named node/mesh per part, fresh export-only retessellation, triangle normalization, and owner-local topology edge lines |
| OpenSCAD    | `IndexedPolyhedron` (via OFF parser)      | `export-glb.ts`       | Color-grouped, triangulated, transformed geometry                                                                           |
| Manifold    | `manifold-3d` GLTF nodes                  | `manifold.kernel.ts`  | Uses `@gltf-transform/core` (out of scope — manifold-3d owns the Document)                                                  |
| OpenCASCADE | `TopoDS_Shape`                            | `opencascade-mesh.ts` | Native `RWGltf_CafWriter` (out of scope — OCCT produces GLB directly)                                                       |

### 6.1 Kernel Mapping Responsibilities

The kernel-specific mapping file (not the GLB writer) is responsible for:

- Extracting mesh data from kernel-native types
- Color normalization (hex to RGBA, opacity handling)
- Coordinate transformation (Z-up/mm to Y-up/m)
- Triangulation or export-only normalization of non-triangle faces before GLB writing
- Normal computation when not provided by the kernel
- Owner-local edge primitive extraction when the kernel has better topology than generic triangle-soup detection
- Splitting geometry into per-color primitives (for per-material alpha modes)

The GLB writer accepts only pre-processed, ready-to-serialize data.

### 6.2 Naming Responsibilities

Follow `docs/policy/geometry-naming-policy.md` for node/mesh parity, material names, scene names, topology metadata, component IDs, selectors, generated-name provenance, diagnostics, native handles, and export artifact names.

**Why**: GLB serialization mechanics and geometry naming are separate contracts; keeping naming centralized prevents kernels from copying legacy fallback strings.

### 6.3 JSCAD Render Evidence

JSCAD GLB output must not rely on generic middleware edge detection for normal render topology. `jscad-to-gltf.ts` builds export-only evidence from a cloned JSCAD shape, bakes transformed polygons, creates a fresh `geom3`, reruns JSCAD coplanar retessellation, then applies `generalize({ snap: true, triangulate: true })` before writing surface `TRIANGLES` and same-mesh owner-local `LINES`.

JSCAD assemblies should be written as one GLB scene with one named node/mesh per normalized part descriptor. Part names come from upstream-compatible `shape.name` metadata with deterministic one-indexed `Shape N` fallbacks and duplicate-name suffixes.

This export evidence must not mutate the original JSCAD object or its private retessellation flag. Shape-level material/color extraction remains based on the original shape. JSCAD edge primitives use black `[0,0,0,1]`, `roughnessFactor: 1`, `metallicFactor: 0`, `alphaMode: "OPAQUE"`, and `KHR_materials_unlit`; generated edge materials remain unnamed.

## 7. glTF JSON Export

For file export paths (user clicks "Export as glTF"), use `writeGltfJson()` which produces a self-contained `.gltf` JSON file with base64-embedded binary data. The binary buffer is encoded as a `data:application/octet-stream;base64,...` URI in the `buffers[0].uri` field.

Do not produce separate `.bin` files — all exports must be single-file.

## 8. Testing GLB Output

Test GLB output by parsing it with `NodeIO().readBinary()` from `@gltf-transform/core` and asserting structural properties:

- Accessor counts (vertex count, index count)
- Material properties (baseColorFactor, alphaMode, metallicFactor, roughnessFactor)
- Coordinate values (round-trip verification of transform correctness)
- Edge line segment coordinates when a kernel emits owner-local LINES primitives
- Node names
- Primitive modes (TRIANGLES vs LINES)
- POSITION accessor `min`/`max` bounds

Do not assert only byte length or `instanceof Uint8Array` — these are existence checks, not behavioral assertions. Parse and verify structure.

**Why**: Testing policy requires asserting observable behavior. A GLB that is the right size but has wrong accessor types, missing normals, or incorrect coordinate transforms would pass an existence check but produce broken rendering.

## Anti-Patterns

- Using `@gltf-transform/core` `Document` + `NodeIO().writeBinary()` for new render-path GLB construction
- Applying coordinate transforms inside the GLB writer (transforms belong in kernel mapping code)
- Interleaving vertex attributes with `byteStride` in the direct writer
- Producing GLB without `asset.generator: "tau-runtime"` (breaks traceability)
- Testing GLB output with only `expect(result).toBeInstanceOf(Uint8Array)` without parsing
- Omitting `min`/`max` on POSITION accessors (breaks bounding box computation in viewers)
- Using `alphaMode: "MASK"` (not used in CAD; use `"BLEND"` for transparent, `"OPAQUE"` for opaque)
- Returning GLB content as a non-zero-offset typed-array view
- Adding app or example `bytesToArrayBuffer` helpers to compensate for an unenforced runtime byte-view invariant

## Summary Checklist

- [ ] Render-path GLB uses `writeGlb()` from `glb-writer.ts`, not `@gltf-transform/core`
- [ ] `GeometryGltf.content` is an exact `Uint8Array<ArrayBuffer>` before crossing runtime/client boundaries
- [ ] Buffer layout is non-interleaved (separate bufferViews per attribute)
- [ ] `asset.generator` is `"tau-runtime"`
- [ ] POSITION accessors have `min`/`max`
- [ ] `bufferView.target` is set (34962 for vertex, 34963 for index)
- [ ] Materials use `cadMaterialDefaults` from `@taucad/types/constants`
- [ ] Names follow `docs/policy/geometry-naming-policy.md`
- [ ] Coordinates are Y-up meters (transformed before writing)
- [ ] Tests parse output with `NodeIO().readBinary()` and assert structure
- [ ] Tests include at least one offset-view fixture proving runtime normalizes GLB bytes to an exact view
- [ ] New kernels map to `GlbInput` rather than building `Document` objects

## References

- [Rendering Pipeline Policy](rendering-pipeline-policy.md) — PBR defaults, materials, tone mapping
- [Geometry Naming Policy](geometry-naming-policy.md) — node/mesh names, material names, scene names, topology metadata, selectors, and export artifact names
- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) — Binary format, accessor types, buffer views
- Research: `docs/research/runtime-overhead-forensics.md` — Profiling data motivating the direct writer
- Architecture: `docs/architecture/runtime-topology.md` — Render pipeline topology
