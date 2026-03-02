# Rendering Pipeline Policy

Internal reference for the CAD rendering pipeline across all conversion paths and the Three.js viewer.

## Unified PBR Defaults

All conversion pipelines must produce GLTF materials with these canonical PBR values:

```
roughnessFactor:  0.35
metallicFactor:   0.0
baseColorFactor:  [0.8, 0.8, 0.8, 1]  (fallback when no source color)
doubleSided:      true
```

These values are defined in `libs/types/src/constants/material.constants.ts` as `cadMaterialDefaults` and imported by all conversion pipelines.

### Pipelines Covered

| Pipeline | Source | File |
|----------|--------|------|
| OCCT (STEP/IGES/BREP) | `packages/converter` | `loaders/occt.loader.ts` |
| Replicad Kernel | `apps/ui` | `kernel/replicad/utils/replicad-to-gltf.ts` |
| JSCAD Kernel | `apps/ui` | `kernel/jscad/jscad-to-gltf.ts` |
| OpenSCAD Kernel | `apps/ui` | `kernel/utils/export-glb.ts` |

Edge/line materials use `metallicFactor: 0`, `roughnessFactor: 1`, as they are rendered as flat-shaded `LineMaterial` and do not participate in PBR lighting.

## Material Policy

- **Non-metallic default**: All CAD surfaces default to `metallicFactor: 0.0`. None of the source formats (STEP, Replicad, JSCAD, OpenSCAD) carry per-part metal/non-metal metadata.
- **Semi-glossy roughness**: `roughnessFactor: 0.35` produces a glossy CAD sheen with visible specular highlights under studio lighting, closely matching professional CAD viewers like Onshape.
- **Source colors preserved**: When the source provides a color (STEP color, `colorize()`, etc.), it overrides the default `baseColorFactor`. Roughness and metalness remain at defaults unless the source format provides PBR data (only Rhino 3DM currently does).
- **Fallback material**: Meshes with no source color receive a unified neutral grey material (`[0.8, 0.8, 0.8, 1]`) across all pipelines rather than inheriting Three.js defaults.

## Tone Mapping Policy

The renderer uses `ACESFilmicToneMapping` (React Three Fiber default) with `toneMappingExposure: 1.5` to offset ACES highlight compression while keeping mid-tones visible.

**Rationale**: Environment maps contain HDR values exceeding 1.0. Without tone mapping, bright reflections clip to pure white, losing surface detail. ACES filmic provides good highlight rolloff while preserving natural colour appearance. The 1.5x exposure boost compensates for ACES's aggressive highlight compression, ensuring specular highlights remain visible.

**Decision gate for AgX**: If visual testing reveals unacceptable hue shifts under ACES (particularly in saturated reds/blues), switch to `THREE.AgXToneMapping` which preserves hues more accurately under bright lighting. Acceptance criteria:
- Highlight rolloff: smooth gradation from specular peak to diffuse, no hard clipping
- Color shift: saturated base colors (red, blue, green) should not visibly shift hue under bright environment
- White clipping: no pure-white patches on curved metallic surfaces

## Ambient Occlusion

The renderer uses **N8AO** (from `@react-three/postprocessing`) for screen-space ambient occlusion, adding depth to crevices, part junctions, and concave areas.

**Configuration** (in `three-context.tsx`):

```
screenSpaceRadius: true       -- AO radius in pixels, consistent at any zoom level
aoRadius:          24          -- screen-space radius in pixels
intensity:         1           -- pow(ao, intensity); 1 = natural, higher = darker AO
distanceFalloff:   0.2         -- ratio of radius at which AO fades (for screen-space mode)
```

**Rationale**: Professional CAD viewers (e.g. Onshape at 37.5% AO) use ambient occlusion to create depth perception. Without AO, the scene appears flat, especially from top-down and bottom-up views. N8AO was chosen because it:
- Supports logarithmic depth buffers (auto-detected)
- Supports stencil buffers (for section view compatibility)
- Works with the `frameloop="demand"` mode (AO runs during render passes only)
- Uses `screenSpaceRadius` for zoom-independent consistent appearance

**Stencil compatibility**: The `EffectComposer` is configured with `stencilBuffer` to preserve stencil-based cross-section rendering in the Section View component.

## Environment Strategy

The main CAD viewer uses an `<Environment>` component with `<Lightformer>` children (from `@react-three/drei`) for studio-style lighting.

### Design Decisions

- **Lightformers, not HDRI presets**: Full control over light panel placement, no CDN dependency, deterministic appearance across environments.
- **Size-aware placement**: All Lightformer positions and scales are expressed as multiples of the scene's bounding sphere radius (`sceneRadius`). This ensures a 5mm watch gear and a 5-meter building frame both receive proportionally sized soft panels.
- **No background**: The environment map is used for reflections only (`background` is not set). The app's CSS background shows through, consistent with standard CAD viewer behaviour.
- **Conditional on matcap**: When matcap is enabled, the environment is skipped entirely since `MeshMatcapMaterial` ignores environment maps. This avoids unnecessary GPU work.
- **Camera-relative fill light**: A directional light (intensity `0.7`) follows the camera for consistent orbit illumination.
- **Fixed directional key light**: A world-space directional light (intensity `3`) from above-front for angle-dependent specular highlights.
- **Environment resolution**: `512px` for sharp, defined reflections on surfaces.
- **Ambient light**: Moderate intensity (`0.35`) to provide base diffuse illumination, offset by AO in occluded areas.
- **Post-load envMapIntensity**: After GLTF load, all `MeshStandardMaterial` instances receive `envMapIntensity = 2.5` (PBR path only) to amplify environment reflections.
- **Post-load roughnessOverride**: After GLTF load, all `MeshStandardMaterial` instances receive `roughness = 0.28` for a semi-matte CAD appearance consistent with professional CAD viewers.

### Presets

| Preset | Description |
|--------|-------------|
| `studio` | Full Lightformer rig -- key (8), fill (4), rim (2), ground (0.25). Default. |
| `neutral` | Reduced intensity, minimal reflections. |
| `soft` | Hemisphere + ambient only, no environment map. |
| `performance` | No environment, minimal lights. Equivalent to matcap-era setup. |

## Color Pipeline

```
Source color (sRGB) --> GLTF baseColorFactor (linear via spec) --> Three.js linear shading --> Tone mapping --> sRGB output
```

- GLTF spec requires `baseColorFactor` in linear space. The `@gltf-transform/core` API handles this correctly when values are provided in 0-1 range.
- Three.js `GLTFLoader` creates `MeshStandardMaterial` with `colorSpace: SRGBColorSpace` on base color textures. For factor-only materials (no textures), the factor is treated as linear.
- Tone mapping converts the linear HDR result to displayable sRGB range.

### Verification Checklist

- A pure red part (`baseColorFactor: [1, 0, 0, 1]`) should appear red, not orange or pink, under default lighting.
- A white part should appear neutral white, not warm or cool-shifted.
- Both matcap ON and matcap OFF should produce visually acceptable results on the same model.

## Tessellation Quality

Current defaults per kernel:

| Kernel | Linear Tolerance | Angular Tolerance | Notes |
|--------|-----------------|-------------------|-------|
| Replicad | 0.1mm | 30deg | Configurable via `meshConfiguration` |
| Replicad (export) | 0.01mm | 30deg | Higher quality for file export |
| JSCAD | N/A | N/A | Fan triangulation of CSG output polygons |
| OpenSCAD | N/A | N/A | Manifold backend defaults |
| OCCT (converter) | OCCT defaults | OCCT defaults | `undefined` passed to `ReadStepFile` |

**Known limitation**: The OCCT converter does not expose tessellation quality parameters. This means curved surfaces may appear faceted on high-detail models. Future work: expose `linearDeflection` and `angularDeflection` options.

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
- **N8AO halfRes**: The ambient occlusion pass runs at half resolution with depth-aware upsampling for ~2-4x speedup at minimal visual cost on smooth CAD surfaces.

## Known Limitations

- **No per-material metalness heuristics**: STEP files do not carry metal/non-metal metadata. All surfaces default to non-metallic. Future work could infer metalness from part names or colour patterns.
- **No normal map generation**: The pipeline relies on vertex normals from tessellation. No tangent-space normal maps are generated for surface detail enhancement.
- **Fixed tessellation quality for OCCT**: The converter passes `undefined` to `ReadStepFile`, using OCCT library defaults. Curved surfaces may appear faceted.
- **Matcap ignores environment**: When matcap is enabled, the environment map is skipped. The matcap texture provides its own baked lighting.
