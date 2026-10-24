---
title: 'Rendering Pipeline Policy'
description: 'Unified PBR defaults, material policy, tone mapping, AO, environment strategy, and performance patterns for the CAD viewer.'
status: active
created: '2026-02-15'
updated: '2026-10-18'
related:
  - docs/research/onshape-viewer-lighting-profile.md
  - docs/research/headless-gltf-interleaved-accessor-corruption-v2.md
  - docs/research/project-card-thumbnail-preview-parity.md
  - docs/research/studio-environment-consolidation-blueprint.md
---

# Rendering Pipeline Policy

Internal reference for the CAD rendering pipeline across all conversion paths and the Three.js viewer.

## Rationale

Consistent PBR defaults and material handling across OCCT, Replicad, JSCAD, and OpenRSCAD pipelines ensure predictable visual output. Unified tone mapping and environment strategy avoid per-pipeline drift. Performance patterns (geometry key threading, scratch objects, GLTF parse/material split) keep the viewer responsive on complex models.

## Unified PBR Defaults

All conversion pipelines must produce GLTF materials with these canonical PBR values:

```
roughnessFactor:  0.35
metallicFactor:   0.0
baseColorFactor:  [0.7, 0.7, 0.7, 1]  (fallback when no source color)
doubleSided:      true
```

These values are defined in `libs/types/src/constants/material.constants.ts` as `cadMaterialDefaults` and imported by all conversion pipelines.

### Pipelines Covered

| Pipeline              | Source               | File                                                                |
| --------------------- | -------------------- | ------------------------------------------------------------------- |
| OCCT (STEP/IGES/BREP) | `@taucad/brep`       | `packages/plugins/brep/src/occt-loader.ts`                          |
| Replicad Kernel       | `@taucad/replicad`   | `packages/plugins/replicad/src/utils/replicad-to-gltf.ts`           |
| JSCAD Kernel          | `@taucad/jscad`      | `packages/plugins/jscad/src/jscad-to-gltf.ts`                       |
| OpenRSCAD Kernel      | `@taucad/openrscad`  | Native `openrscad-engine` GLB writer                                |
| Fallback edge overlay | `@taucad/middleware` | `packages/plugins/middleware/src/gltf-edge-detection.middleware.ts` |

Tau-generated auxiliary edge overlays use `cadEdgeOverlayMaterialDefaults`: linear `baseColorFactor: [0, 0, 0, 1]`, `metallicFactor: 0`, `roughnessFactor: 1`, `doubleSided: true`, `alphaMode: "OPAQUE"`, and explicit `KHR_materials_unlit`. Direct writers list the extension in `extensionsUsed` only when line primitives exist and do not add it to `extensionsRequired`.

BRep comparisons must use native topological edges tessellated with their owning surfaces. Triangle-angle edge detection is a fallback for triangle-only inputs and is not evidence of BRep edge parity. Keep line geometry at its actual depth; separate coplanar opaque surfaces through the shared surface-depth owner for both orthographic and perspective cameras.

Authored and imported line primitives preserve their source materials in artifacts and headless rendering. `nanoraster` uses a dedicated line pipeline that returns `baseColorFactor` directly and is therefore unlit by construction. The interactive viewport separately replaces loaded line materials with its existing theme-owned presentation material; that display behavior does not change artifact ownership.

## Material Policy

- **Non-metallic default**: All CAD surfaces default to `metallicFactor: 0.0`. None of the source formats (STEP, Replicad, JSCAD, OpenRSCAD) carry per-part metal/non-metal metadata.
- **Semi-glossy roughness**: `roughnessFactor: 0.35` produces a glossy CAD sheen with visible specular highlights under studio lighting, while preserving the metallic-roughness model. Onshape's standard editor uses Blinn–Phong; a lighting fit does not make these BRDFs identical.
- **Source materials preserved**: Source color overrides the default `baseColorFactor`; authored metallic and roughness values override their defaults when the kernel or imported format supplies them.
- **Fallback material**: Meshes with no source color receive a unified neutral grey material (`[0.7, 0.7, 0.7, 1]`) across all pipelines rather than inheriting Three.js defaults.
- **Generated-edge provenance**: Apply `cadEdgeOverlayMaterialDefaults` only to auxiliary overlays Tau creates. Never use the convention to normalize or recolor arbitrary source `LINES`.

## Headless GLB Render Profile

`nanoraster` is a deterministic factor-only glTF metallic-roughness renderer, not a general PBR reference viewer. `gltf-rs` owns GLB and glTF structural parsing and validation; Tau maps only the supported render semantics and rejects unsupported features before GPU setup.

- Surface shading evaluates each primitive's `baseColorFactor`, `metallicFactor`, and `roughnessFactor` against the Tau image transcoder's default view-space directional rig and analytic studio environment. Callers may supply an explicit `lighting` override; texture-backed material content is rejected rather than silently approximated.
- LINES use the dedicated unlit line pipeline and preserve their supplied `baseColorFactor`, whether authored or Tau-generated.
- A glTF node's composed model transform applies equally to its surface and line primitives. Normals use the inverse-transpose transform for non-uniform scaling.
- Repeated core node references share decoded and uploaded mesh buffers and issue one draw per node instance. Hardware draw batching and `EXT_mesh_gpu_instancing` are separate future optimizations/features.
- Camera framing uses exact world-space bounds accumulated from the referenced vertices after every selected node transform.

The public GLB-to-image API therefore accepts standard packed, accessor-offset, interleaved, and sparse physical accessor layouts inside this profile without adding consumer options or a normalization stage. JSON `.gltf` resources, texture-backed PBR, compression/quantization, skins, morph targets, animations, and unsupported primitive modes remain unsupported.

## Tone Mapping Policy

Use `NeutralToneMapping` with exposure `1` for the default interactive viewport, as owned by `defaultStudioLighting` and `defaultPostProcessingSettings`. Preserve linear HDR beauty until the selected tone boundary and encode sRGB exactly once. Diagnostic tone/exposure controls must not change authored materials.

Keep AO-off and unoccluded AO-on pixels consistent. The accepted display-space AO profile multiplies tone-mapped linear display RGB while preserving alpha; it is an appearance choice, not physically equivalent to applying occlusion only to indirect illumination. A change to that appearance requires matched material and motion captures.

## Ambient Occlusion

Keep PBR as the default material foundation. The classic WebGL reference currently uses N8AO and the native WebGPU candidate uses GTAO. Evaluate shared node AO estimation/reconstruction on forced WebGL2 and native WebGPU; matching definitions is preferred where supported and measured, not a requirement to force an inefficient or incorrect algorithm. AO must remain visible during orbit and mechanism motion whenever enabled; never implement interaction quality by silently disabling it. The global post-processing default remains gated on measured motion quality and native-resolution performance.

`post-processing-settings.ts` owns radius, estimator, denoiser and composition settings. The default radius is 1% of the CSS viewport diagonal with a four-device-pixel minimum, converted once to physical pixels. N8AO intensity is 3 and screen-space distance falloff is 0.2; zero falloff suppresses occlusion samples. GTAO uses its separate intensity/falloff controls, eight samples and half-resolution spatial estimation without temporal filtering.

Choose effect resolution independently of native beauty/output pixels. Qualify half-resolution reconstruction at equal radius using holes, tooth tips, contact gaps, transparency and moving parts. Record actual target dimensions and GPU cost; half resolution alone is not evidence of a faster pipeline. Keep demand rendering idle and never reuse stale AO after object motion.

Section caps use the stencil overlay contract in [Graphics Backend Policy](graphics-backend-policy.md), after authoritative depth restoration. They are not part of the tone-mapped or ambient-occluded main pass. Preserve stencil for those active consumers. Exact contours and certified overlap remain worker-owned diagnostics; do not restore CPU per-frame slicing or treat viewport overlap as GeoSpec proof.

## Environment Strategy

Use the renderer-owned neutral `RoomEnvironment` selected by `defaultStudioLighting`. Preserve the current camera-relative directional/ambient rig and theme adjustments. Diagnostic studio-panel and white-furnace modes remain explicit calibration inputs; they are not alternate persisted product presets.

Generate and prefilter environment lighting only when its radiance or resolution changes. Camera motion rotates the existing environment and updates the light direction; it must not regenerate PMREM. Keep environment resources owned by their mount, release them at teardown, and skip them in MatCap mode. Preserve the current device-tier resolution (512 normally, 256 on coarse-pointer devices) until measured image/memory evidence selects another value.

Never override authored metallic, roughness or Physical features globally to fit one reference image. Environment illumination and reflectance model are separate choices.

## Color Pipeline

```
Source color (sRGB) --> GLTF baseColorFactor (linear via spec) --> Three.js linear shading --> Tone mapping --> sRGB output
```

- GLTF spec requires `baseColorFactor` in linear space. Convert source sRGB colors explicitly before storing linear factors; dividing an 8-bit sRGB channel by 255 does not linearize it, and `@gltf-transform/core` does not infer that conversion.
- Three.js `GLTFLoader` creates `MeshStandardMaterial` with `colorSpace: SRGBColorSpace` on base color textures. For factor-only materials (no textures), the factor is treated as linear.
- Tone mapping converts the linear HDR result to displayable sRGB range.

### Verification Checklist

- A pure red part (`baseColorFactor: [1, 0, 0, 1]`) should appear red, not orange or pink, under default lighting.
- A white part should appear neutral white, not warm or cool-shifted.
- Both matcap ON and matcap OFF should produce visually acceptable results on the same model.

## Tessellation Quality

Use the shared tessellation vocabulary, preview/export defaults and budgets in [Graphics Backend Policy rules 15–17](graphics-backend-policy.md#15-name-mesh-resolution-with-one-tessellation-vocabulary). Rendering quality controls must not silently change the model, export geometry or native BRep edge topology.

## Camera Framing Policy

Use one two-stage framing contract for non-empty CAD geometry in both interactive Stage viewers and headless image rendering:

1. Derive camera distance, perspective relationship, clipping range, lighting scale, and scene radius from the geometry's bounding sphere.
2. Derive final screen occupancy from all eight projected AABB corners, the actual viewport aspect, an explicit camera-up vector, and the configured fit margin.

Do not use the sphere as the final fit primitive, add a fit-mode branch, or restore portrait-only distance compensation. A projected axis with zero extent is unconstrained; the other axis still determines the fit. Fall back only when neither projected axis can constrain the frame or the projection inputs are invalid.

Treat `StageOptions.zoomLevel` as a perspective/distance selector and `StageOptions.fitMargin` as the occupancy control. Scale-dependent consumers such as grids and section stripes must use effective perspective FOV, including `PerspectiveCamera.zoom`, rather than raw FOV alone.

When CameraControls owns the active camera, synchronize an imperative projection-zoom change through `zoomTo()` before synchronizing position and target. Directly assigning `camera.zoom` is insufficient because the controls update loop can restore its stale internal zoom on the next frame.

**Why**: This contract keeps WGPU thumbnails, Three.js resets, resize resets, and manual resets geometrically comparable without caller-specific zoom compensation or renderer-specific fitting algorithms.

## Testing Notes (Future Reference)

These testing approaches are documented for future implementation, not actioned now.

### Canonical Test Models

- **Onshape vise assembly** (`MAIN ASSEMBLY.step`): Complex multi-part assembly with varied colours, good for overall appearance comparison.
- **Single filleted cube**: Tests specular highlight rolloff on curved surfaces.
- **Multi-coloured assembly**: Tests per-part colour preservation across pipeline.
- **Very small part** (< 10mm): Tests size-aware light placement.
- **Very large part** (> 1m): Tests size-aware light placement at scale.

### Visual Regression Approach

- Fixed camera snapshots at canonical angles (front-iso, top, right) for each test model.
- Compare before/after for each rendering change.
- Pixel-diff threshold for automated regression (future CI integration).

### A/B Acceptance Criteria for Tone Mapping

- Compare ACES vs AgX vs NoToneMapping on all canonical models.
- Evaluate: highlight rolloff, colour shift on saturated parts, white clipping, shadow depth.
- Document chosen algorithm and rationale.

## Performance Patterns

### Geometry Key Threading

A deterministic `geometryKey` (derived from geometry content hashes) is threaded through `CadViewer -> ThreeProvider -> Scene -> Stage` and `Scene -> Controls -> MeasureTool`. This enables skip-when-unchanged optimizations:

- **Stage bounds computation**: `_box3.setFromObject()` (O(n) scene traversal) is skipped entirely once the bounding radius stabilizes. It only recomputes when `geometryKey` changes (new geometry loaded). During orbit/pan/zoom, the per-frame cost drops from O(scene_graph_size) to O(1).
- **MeasureTool mesh cache**: Scene traversal for raycasting mesh collection is cached and reused while `geometryKey` is stable. Without caching, `scene.traverse()` ran on every mousemove event at 60Hz.

### useFrame Scratch Object Pattern

All `useFrame` callbacks that compute transforms (camera-facing rotations, billboard labels, constant screen-size elements) use **module-scope scratch objects** (`_scratchVec3`, `_scratchQuat`, etc.) instead of allocating `new THREE.Vector3()` / `new THREE.Quaternion()` per frame. This eliminates GC pressure during continuous orbit.

Convention: prefix with underscore (`_`), declare at module scope outside any component.

### GLTF Parse / Material Split

The `GltfMesh` component separates GLTF binary parsing (expensive) from material application (cheap). Toggling matcap only re-applies materials to the already-parsed scene, avoiding a full GLTF re-parse. Original PBR materials are cloned and saved during the initial parse so they can be restored when switching from matcap back to PBR mode.

### Shared Surface Presentation

Batch compatible opaque occurrences with the renderer's existing instancing mechanism. Keep canonical scene objects, occurrence identities, hierarchy, geometry and BVHs for picking, measurement, section analysis, poses and capture. Mark presentation subtrees with the existing scene-tag registry so semantic traversals omit them. Cache occurrence-to-slot membership and update affected matrices after actual pose changes; do not rebuild geometry or traverse the scene on unchanged frames.

Compare rendering properties independently of authored material names and metadata, while preserving those values on canonical occurrences. Fall back for unsupported material hooks, transparency, morphs or placements. Presentation batches borrow geometry and materials and own their instance buffers; teardown must release actual backend buffers without disposing resources still used by another occurrence. Verify draw submissions, pixels and allocation/destruction on both WebGL and WebGPU. Sharing GLTF mesh references alone proves storage reuse, not fewer draw calls.

### Post-Processing Performance

- Resolve multisampled geometry into immutable post-readable color/depth once. Color-only intermediate targets are single sample; composer swaps must never send tone mapping, AO or encoding back into a multisampled geometry target.
- Keep final canvas sampling explicit: the factory's antialiased canvas also serves direct AO-off rendering and overlays. It is a separate boundary from offscreen post targets; do not disable it to hide intermediate routing defects.
- Test the complete chain, including trailing FXAA, consecutive frames, both cameras, toggles, resize and authoritative overlay depth. Never sample a texture attached to the active output target.
- Remove disabled accumulation or redundant copies only with alpha, transparency-aware AO, debug modes, borrowed-depth lifetime and disposal parity. Preserve negative performance/quality results.
- Record source, adapter, actual physical buffers and full feature state for performance claims. Natural foreground frame cadence, CPU submission and asynchronous GPU elapsed time are distinct measurements; reciprocal GPU time is not product FPS.

## Known Limitations

- **No per-material metalness heuristics**: STEP files do not carry metal/non-metal metadata. All surfaces default to non-metallic. Future work could infer metalness from part names or colour patterns.
- **No normal map generation**: The pipeline relies on vertex normals from tessellation. No tangent-space normal maps are generated for surface detail enhancement.
- **Matcap ignores environment**: When matcap is enabled, the environment map is skipped. The matcap texture provides its own baked lighting.
