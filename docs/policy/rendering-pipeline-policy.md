---
title: 'Rendering Pipeline Policy'
description: 'Unified PBR defaults, material policy, tone mapping, AO, environment strategy, and performance patterns for the CAD viewer.'
status: active
created: '2026-02-15'
updated: '2026-09-23'
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

Use `ACESFilmicToneMapping` with `toneMappingExposure: 0.5` for the interactive viewport. Keep the WebGL composer in `HalfFloatType` until the final tone-mapping pass. Apply the same ACES curve and exposure after WebGL N8AO compositing; enabling AO must not change the color of unoccluded surfaces. The current value is measured against the [Onshape planetary-gear reference](../research/onshape-viewer-lighting-profile.md), not a universal physical light calibration.

**Rationale**: The prior 1.0 direct-render exposure over-brightened the reference gray surface; applying the same output transform across direct and composited paths keeps the AO toggle from changing the base material color. ACES rolls off HDR highlights without clipping every bright reflection to white.

**Decision gate for AgX**: If visual testing reveals unacceptable hue shifts under ACES (particularly in saturated reds/blues), switch to `THREE.AgXToneMapping` which preserves hues more accurately under bright lighting. Acceptance criteria:

- Highlight rolloff: smooth gradation from specular peak to diffuse, no hard clipping
- Color shift: saturated base colors (red, blue, green) should not visibly shift hue under bright environment
- White clipping: no pure-white patches on curved metallic surfaces

## Ambient Occlusion

When post-processing is enabled, WebGL uses **N8AO** (from `n8ao`) and WebGPU uses **GTAO** for screen-space ambient occlusion, adding depth to crevices, part junctions, and concave areas. The default graphics setting currently leaves post-processing off; the user can enable it per viewer.

**WebGL configuration** (in `post-processing-webgl.tsx`):

```
screenSpaceRadius: true       -- AO radius in pixels, consistent at any zoom level
aoRadius:          24          -- screen-space radius in pixels
intensity:         1           -- pow(ao, intensity); 1 = natural, higher = darker AO
distanceFalloff:   0.2         -- attenuation radius as a fraction of the screen-space AO radius
```

A zero N8AO falloff suppresses occlusion samples; do not use it to disable attenuation. WebGPU GTAO uses a 24 px world-space-converted radius, half-resolution sampling, eight samples, and distance falloff 1. Both paths must preserve depth for overlays and section caps.

**Rationale**: Professional CAD viewers (e.g. Onshape at 37.5% AO) use ambient occlusion to create depth perception. Without AO, the scene appears flat, especially from top-down and bottom-up views. N8AO was chosen because it:

- Supports logarithmic depth buffers (auto-detected)
- Coexists with the BVH contour-fill section view path
- Works with the `frameloop="demand"` mode (AO runs during render passes only)
- Uses `screenSpaceRadius` for zoom-independent consistent appearance

**Section view compatibility**: Section View uses clipped source geometry plus generated BVH contour fills outside the clipping group. Section caps are opaque, depth-owned meshes rather than stencil-derived transparent planes; post-processing must preserve their normal depth ordering.

**Section cap diagnostics**: Section-plane overlap highlighting is a viewport visual diagnostic, not GeoSpec exact positive-volume evidence. Implement red overlap cues by splitting generated cap regions into disjoint normal and diagnostic triangles in section-cap geometry, preferably using one packed vertex-colored mesh per source and shared opaque WebGL/WebGPU striped cap materials. Do not render transparent red overlays, coincident duplicate cap meshes, or stencil-derived caps for this diagnostic.

## Environment Strategy

The main CAD viewer uses an `<Environment>` component with `<Lightformer>` children (from `@react-three/drei`) for studio-style lighting.

### Design Decisions

- **Lightformers, not HDRI presets**: Full control over light panel placement, no CDN dependency, deterministic appearance across environments.
- **Size-aware placement**: All Lightformer positions and scales are expressed as multiples of the scene's bounding sphere radius (`sceneRadius`). This ensures a 5mm watch gear and a 5-meter building frame both receive proportionally sized soft panels.
- **No background**: The environment map contributes PBR lighting and reflections (`background` is not set). The app's CSS background shows through, consistent with standard CAD viewer behaviour.
- **Conditional on matcap**: When matcap is enabled, the environment is skipped entirely since `MeshMatcapMaterial` ignores environment maps. This avoids unnecessary GPU work.
- **Camera-relative rig**: Five asymmetric Lightformers provide key, left fill, top, ground, and back-fill panels; the complete camera quaternion rotates the environment through tilt, roll, and pole crossings, keeping the rig fixed in view space.
- **Headlamp and ambient floor**: The default view-space directional key follows `normalize([1, 1, 1])` at intensity `1.5`, with ambient intensity `0.1` and environment intensity `1`. Keep all light energy independent of field of view and projection. The key reflection panel uses intensity `64`, position `[1, 1, 1] × sceneRadius`, and size `[1.2, 1.2] × sceneRadius`; the other four panels provide low-energy fill.
- **Environment resolution**: `512px` for sharp, defined reflections on surfaces.
- **Material ownership**: Preserve authored glTF roughness and metalness; do not add a post-load global material override merely to fit one reference part.

### Canonical Studio Environment

The interactive Three.js CAD viewer has one environment implementation: the Studio Lightformer rig. It is renderer behavior rather than a user-selectable or persisted preset. The rig mounts whenever matcap is disabled and is skipped when matcap is enabled; there is no alternate environment branch.

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

Current defaults per kernel:

| Kernel             | Linear Tolerance | Angular Tolerance | Notes                                          |
| ------------------ | ---------------- | ----------------- | ---------------------------------------------- |
| Replicad           | 0.02mm           | 20deg             | Locked by `occt-tessellation-defaults.test.ts` |
| Replicad (export)  | 0.01mm           | 20deg             | Higher quality for file export                 |
| JSCAD              | N/A              | N/A               | Fan triangulation of CSG output polygons       |
| OpenRSCAD          | Engine defaults  | Engine defaults   | Native tessellation options                    |
| BRep import kernel | OCCT defaults    | OCCT defaults     | `undefined` passed to `ReadStepFile`           |

**Known limitation**: The BRep import kernel does not expose tessellation quality parameters. This means curved surfaces may appear faceted on high-detail models. Future work: expose `linearDeflection` and `angularDeflection` options.

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

### Post-Processing Performance

- **No double MSAA**: The Canvas `gl` config omits `antialias: true` since `EffectComposer` handles antialiasing via its own `multisampling` FBO.
- **N8AO resolution**: The current WebGL pass uses the dependency's full-resolution default. Do not claim half-resolution savings without enabling and measuring that mode.

## Known Limitations

- **No per-material metalness heuristics**: STEP files do not carry metal/non-metal metadata. All surfaces default to non-metallic. Future work could infer metalness from part names or colour patterns.
- **No normal map generation**: The pipeline relies on vertex normals from tessellation. No tangent-space normal maps are generated for surface detail enhancement.
- **Fixed tessellation quality for BRep imports**: The BRep kernel passes `undefined` to `ReadStepFile`, using OCCT library defaults. Curved surfaces may appear faceted.
- **Matcap ignores environment**: When matcap is enabled, the environment map is skipped. The matcap texture provides its own baked lighting.
