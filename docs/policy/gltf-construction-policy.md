---
title: 'glTF Construction Policy'
description: 'Rules for constructing glTF/GLB binaries in the runtime, governing the direct writer, buffer layout, material encoding, and kernel integration patterns'
status: active
created: '2026-03-24'
updated: '2026-07-19'
related:
  - docs/policy/geometry-naming-policy.md
  - docs/policy/rendering-pipeline-policy.md
  - docs/research/headless-capture-z-up-axis-semantics-parity.md
  - docs/research/headless-gltf-interleaved-accessor-corruption-v2.md
  - docs/research/headless-thumbnail-coordinate-orientation-parity.md
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

### 2.1 Consumer Layout and Instantiation Contract

The direct-writer rule is a producer optimization, not a restriction on standards-compliant consumers. `@taucad/render` delegates GLB framing, glTF schema validation, accessor offsets, `byteStride`, and sparse-accessor decoding to pinned `gltf-rs`. Within its documented static render profile, it accepts packed, accessor-offset, interleaved, and sparse physical layouts.

The headless renderer also evaluates the selected glTF scene's complete core node hierarchy. It composes matrix/TRS transforms, decodes and uploads each reachable mesh asset once, draws every node instance from the shared buffers, applies the same model transform to surface and line primitives, uses an inverse-transpose normal transform, and fits the camera from exact transformed vertices.

This does not imply reference-viewer coverage. The consumer rejects unsupported required extensions and render features before GPU setup. JSON `.gltf` resource resolution, texture-backed PBR, compressed or quantized geometry, skins, morph targets, animations, `EXT_mesh_gpu_instancing`, and unsupported primitive modes remain outside the current render profile. Producers must not depend on silent degradation.

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

Follow `cadMaterialDefaults` and `cadEdgeOverlayMaterialDefaults` from `@taucad/types/constants` (see `docs/policy/rendering-pipeline-policy.md`):

| Property                 | Surface primitives                       | Tau-generated auxiliary edge overlays |
| ------------------------ | ---------------------------------------- | ------------------------------------- |
| `metallicFactor`         | `0.0`                                    | `0`                                   |
| `roughnessFactor`        | `0.35`                                   | `1`                                   |
| `doubleSided`            | `true`                                   | `true`                                |
| `alphaMode`              | `"OPAQUE"` or `"BLEND"` (based on alpha) | `"OPAQUE"`                            |
| `baseColorFactor`        | Source color or `[0.8, 0.8, 0.8, 1]`     | `[0, 0, 0, 1]`                        |
| `KHR_materials_unlit`    | Not required                             | Required in `extensionsUsed`          |
| `extensionsRequired` use | Format-specific                          | Do not require the unlit extension    |

This is a provenance rule, not a global `LINES` rule. Tau-generated auxiliary overlays use the canonical black, opaque, unlit material. Authored or imported line primitives preserve their source materials in artifacts and headless rendering. Writers must not traverse arbitrary input glTF and recolor existing lines.

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

Canonical kernel render geometry uses the glTF-native **Y-up/metres** convention. Internal GLB source artifacts must use the coordinate system and unit declared by their selected route. Spec-oriented interop routes ordinarily request Y-up/metres; a derivative that visibly names model axes must instead request the user-facing semantic frame it promises to display. Tau annotated image routes therefore request Z-up/metres, while unannotated and annotated image modes share that one source contract. Direct GLB/glTF export routes may honor any coordinate system or unit that the route explicitly advertises.

The renderer's declared up axis, camera labels, axis annotations, and physical-scale interpretation must agree with the source artifact's declared frame. Every artifact boundary must convert from its declared input convention to its declared output convention **exactly once**.

For the canonical Z-up/millimetres to Y-up/metres conversion:

```text
(x, y, z) -> (x / 1000, z / 1000, -y / 1000)
```

Apply the matching rotation without scale to normals so they remain unit length and preserve handedness. Kernel mapping and export-boundary code use `transformVertexArray()` and `transformNormalArray()` from `packages/runtime/src/framework/common.ts` for this conversion.

Do not apply coordinate transforms inside the GLB writer itself. The writer serializes already-prepared data and is unaware of kernel-native conventions. In particular, a kernel must not pre-rotate geometry and then ask its mapping/writer boundary to perform the same conversion again.

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
- Coordinate transformation from the kernel-native convention to the route's declared output convention, exactly once
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

This export evidence must not mutate the original JSCAD object or its private retessellation flag. Shape-level material/color extraction remains based on the original shape. JSCAD edge primitives use the shared `cadEdgeOverlayMaterialDefaults` and `KHR_materials_unlit`; generated edge materials remain unnamed. JSCAD-specific topology ownership does not change the framework-wide generated-overlay material contract.

## 7. glTF JSON Export

For file export paths (user clicks "Export as glTF"), use `writeGltfJson()` which produces a self-contained `.gltf` JSON file with base64-embedded binary data. The binary buffer is encoded as a `data:application/octet-stream;base64,...` URI in the `buffers[0].uri` field.

Do not produce separate `.bin` files — all exports must be single-file.

## 8. Testing GLB Output

Test GLB output by parsing it with `NodeIO().readBinary()` from `@gltf-transform/core` and asserting structural properties:

- Accessor counts (vertex count, index count)
- Material properties (baseColorFactor, alphaMode, metallicFactor, roughnessFactor)
- Generated-edge `KHR_materials_unlit` and conditional `extensionsUsed` metadata
- Preservation of a distinct authored/imported line material across middleware processing
- Coordinate values on asymmetric, translated fixtures (round-trip verification of transform correctness)
- Component centroids, normals, winding/handedness, and applied node transforms for every advertised coordinate/unit route
- Edge line segment coordinates when a kernel emits owner-local LINES primitives
- Node names
- Primitive modes (TRIANGLES vs LINES)
- POSITION accessor `min`/`max` bounds

Do not assert only byte length, byte inequality, or `instanceof Uint8Array` — these are existence checks, not behavioral assertions. Parse world-space evidence and verify structure and semantics. Symmetric cubes and unordered dimension triples are insufficient coordinate fixtures because they can hide axis relabeling or duplicate rotations.

**Why**: Testing policy requires asserting observable behavior. A GLB that is the right size but has wrong accessor types, missing normals, or incorrect coordinate transforms would pass an existence check but produce broken rendering.

## Anti-Patterns

- Using `@gltf-transform/core` `Document` + `NodeIO().writeBinary()` for new render-path GLB construction
- Applying coordinate transforms inside the GLB writer (transforms belong in kernel mapping code)
- Pre-rotating kernel geometry and then requesting the same conversion again from its mapping/export boundary
- Adding renderer-side kernel correction tables or rotating final image pixels to compensate for malformed source geometry
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
- [ ] Consumers treat the writer layout as an implementation choice and accept supported packed, offset, interleaved, and sparse accessor layouts
- [ ] Headless scene consumption preserves core node transforms and repeated mesh references for both surfaces and lines
- [ ] `asset.generator` is `"tau-runtime"`
- [ ] POSITION accessors have `min`/`max`
- [ ] `bufferView.target` is set (34962 for vertex, 34963 for index)
- [ ] Materials use `cadMaterialDefaults` from `@taucad/types/constants`
- [ ] Tau-generated auxiliary edges use `cadEdgeOverlayMaterialDefaults` and `KHR_materials_unlit`
- [ ] Authored/imported line materials remain unchanged in artifacts and headless rendering
- [ ] Names follow `docs/policy/geometry-naming-policy.md`
- [ ] Canonical kernel render GLB is Y-up/metres; each internal source and direct export matches its selected route's explicitly declared convention
- [ ] Derivatives that visibly name axes request the user-facing semantic frame, and renderer up/labels/scale agree with that frame
- [ ] Each boundary applies its declared coordinate/unit conversion exactly once
- [ ] Coordinate tests parse asymmetric world-space evidence and assert positions, centroids, normals, handedness, and node transforms
- [ ] Tests include at least one offset-view fixture proving runtime normalizes GLB bytes to an exact view
- [ ] New kernels map to `GlbInput` rather than building `Document` objects

## References

- [Rendering Pipeline Policy](rendering-pipeline-policy.md) — PBR defaults, materials, tone mapping
- [Geometry Naming Policy](geometry-naming-policy.md) — node/mesh names, material names, scene names, topology metadata, selectors, and export artifact names
- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) — Binary format, accessor types, buffer views
- Research: `docs/research/runtime-overhead-forensics.md` — Profiling data motivating the direct writer
- Architecture: `docs/architecture/runtime-topology.md` — Render pipeline topology
