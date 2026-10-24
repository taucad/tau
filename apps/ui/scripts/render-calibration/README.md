# Renderer calibration fixtures

Build from the workspace root after the normal frozen-lockfile installation:

```bash
node apps/ui/scripts/render-calibration/generate.mts \
  --onshape /path/to/onshape-planetary-brep-edges.glb \
  --authored '/path/to/Planetary Gear System (2).glb'
```

The coordinator also exposes `pnpm nx run ui:render-calibration` for the viewer. Generation writes `out/render-calibration/catalog.json`, GLBs under `fixtures/`, and native STEP evidence and upstream provenance under `sources/`. No generated assets belong in the UI's committed public directory. `--output` changes that generated-output root. Subsequent runs reuse verified upstream bytes.

## Catalog

| Family      | Assets                                                             | Purpose                                                                                                          |
| ----------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| F1          | Pinned Khronos textureless grid                                    | 98 material cases, 102 drawable nodes including annotation geometry; no edge lines                               |
| F2          | Output patches and nine spheres                                    | Linear gray/HDR ramp, lit/unlit color pairs, 18% gray probe, near mirror and seven white-conductor furnace cases |
| F3          | Four feature coupon materials                                      | Identical native geometry: 0.1/0.3/1/3 mm convex fillets and chamfers, concave pocket, cylinder/cone             |
| F4          | Dielectric/metal jig, each at 1×/100×                              | 2/8/16 mm blind holes, counterbore, deep pocket, 0.5 mm wall, 0/0.1/0.3/1/3 mm gaps                              |
| F5          | Archived Onshape reference                                         | Existing exact BRep lines; raw millimeter positions normalized to meters                                         |
| F6          | Authored planetary assembly                                        | Exact user GLB bytes and all materials, hash pinned                                                              |
| F7          | Frozen housing assembly                                            | Inward 4 mm housing wall, mounting bosses, polymer inspection cover, metallic fasteners; reserved for validation |
| Performance | 4×/16× shared-buffer assemblies and 4× independent-buffer assembly | Distinguish draw/triangle work from geometry-memory pressure                                                     |

All catalog geometry is meters/Y-up. **F1 is unusually small because the upstream asset is small:** its sphere radius is 0.35 mm; its pinned bytes are unchanged. F1 is CC0-1.0; the pinned upstream README is copied alongside its bytes. F3/F4/F7 are generated from explicit millimeter/Z-up Replicad features through the production Replicad serializer. STEP uses millimeters/Z-up. Native normals are retained; no edge detection, normal averaging or vertex welding is introduced.

The manifest records bounds, hashes, material values, native-topology provenance, regions and actual scene counts. `triangles`, `vertices` and `lineSegments` count submitted geometry over scene nodes. `uniqueTriangles` counts unique position/normal/index accessor combinations. `meshes` counts glTF mesh objects; it is not a draw-call or unique-buffer count. A shared-buffer workload is not GPU instancing.

Override workload sizes with `--replicas 4,16,64 --independent-replicas 4,16`. An empty quoted list skips that workload family. Counts are bounded to 1–1024. The independent mode actually copies accessor buffers, so its memory cost grows with the selected workload.

## Measurement contracts

- F5 retains the archived STEP/Onshape material values; its ring linear base factor is approximately `[0.443137, 0.509804, 0.576471]`. F6 correctly decodes the authored `#718293` into `[0.165132, 0.223228, 0.291771]`. The earlier Replicad STEP exporter passed encoded sRGB channels into OCCT's linear-color constructor. These fixtures have different base albedos and cannot be treated as a metalness-only sweep. Use F2's paired lit swatches and F3's fixed-geometry variants for controlled material comparisons; do not gamma-correct either frozen asset.
- F2's gray patches from 0–1 and color references use `KHR_materials_unlit`. HDR values 2/4/8 use emissive-strength materials: measure them with **all illumination and AO off**, because their dielectric base can still reflect a light. Use the production HDR/output path and record tone mapping/exposure.
- Installed nanoraster 0.5.1 does not apply unlit/emissive semantics to triangle surfaces. F2's output controls therefore cannot establish nanoraster conformance until those semantics are supported; its ordinary PBR probes remain useful. The source audit is in `docs/research/artifacts/onshape-viewer-lighting-profile/runs/pbr-calibration/nano-lane.md`.
- Furnace spheres have pure-white conductor base color, metalness 1, and roughness 0–1. The Khronos neutral grid has linear base color about 0.604 and is not the white-furnace control.
- Region identities come from nodes/materials, never pixel brightness. F3/F4/F7 additionally carry native `faceGroups` and `edgeGroups` in primitive extras and `TAU_cad_topology`. The older F5/F6 archives retain native line geometry but lack per-face identities; the manifest states that limitation.
- F7 is frozen to SHA-256 `b293d77c4ac82b7f874cc9bdb68031b0229aebd60741efc92d582431b351031a`. Do not use it for initial fitting. If it guides changes, reserve a new holdout before claiming independent validation.

Every build checks input hashes, 98 material combinations, BRep validity and one solid per part, positive volumes, unit normals, exact native edge/surface endpoint equality, and native gap distances. It also checks that F3 material variants retain identical geometry and that F4's 100× output retains normals/indices/topology with at most 1 micrometer of Float32 position rounding. The actual observed error goes into the catalog. These are geometry/material checks; rendering quality and performance require the separate real-browser captures.

The single internal source import deliberately calls Tau's production serializer without adding a public API for an offline fixture script. No dependency or package manifest changes are required.

## PNG comparison

```bash
node apps/ui/scripts/render-calibration/compare.mts --self-check
node apps/ui/scripts/render-calibration/compare.mts \
  --reference out/render-calibration/captures/reference.png \
  --candidate out/render-calibration/captures/candidate.png \
  --mask out/render-calibration/captures/geometry-mask.png \
  --regions out/render-calibration/captures/regions.json \
  --output out/render-calibration/captures/comparison.json
```

The optional regions file is an array such as `[{"name":"carrier","x":100,"y":80,"width":220,"height":140}]`. Rectangles use integer pixels from the upper-left corner and must be inside the image. Every comparison requires a geometry alpha mask; brightness-derived masks would hide the dark-metal failure. Capture metadata must establish that cameras, framing and output settings match. The command requires identical image dimensions and performs no registration, resizing or exposure adjustment.

The installed Sharp decoder is resolved through `libs/tau-examples`, its existing package owner, and explicitly decodes to 8-bit sRGB RGBA. Embedded color profiles may therefore be converted to sRGB; this operation is recorded in the report. Scores include pixels with mask alpha at least 128:

- sRGB MAE/RMSE use 0–255 channel code values. Error p95 is the nearest-rank 95th percentile of each pixel's mean absolute RGB error.
- Luminance p05/p50/p95 use inverse-sRGB transfer and linear Rec.709 weights. Near-black fraction uses luminance ≤0.01. Clipped fraction counts any sRGB channel ≥254. These descriptive thresholds impose no acceptance gate.
- Each named rectangle gets the same statistics intersected with the geometry mask. Empty rectangles are reported explicitly.
- Silhouette IoU uses the entire image alpha only when both PNGs include foreground and background alpha. An opaque Onshape screenshot cannot provide that silhouette by itself.

`--self-check` round-trips known tiny PNGs through the actual decoder, verifies zero/known-offset errors and linear luminance, excludes different background colors, and rejects dimension/alpha mistakes. Pixel scores do not establish human preference or editing task performance.

## Native nanoraster captures

```bash
node apps/ui/scripts/render-calibration/render-nano.mts --name default
node apps/ui/scripts/render-calibration/render-nano.mts \
  --fixtures f6-authored-planetary --name distance10 --distance 10
```

The CLI verifies fixture hashes, preserves all GLB bytes/materials/native edges, and saves white-background and transparent-mask PNGs plus complete option/adapter/timing metadata under `out/render-calibration/captures/nano`. Defaults are 1276×798, 1 px lines, installed studio lighting, canonical isometric orthographic camera, 0.1985 m span and the fixture bounds center. `--camera` accepts the harness capture JSON; only the supported fixed-camera fields are forwarded. `--span`, `--distance`, `--width`, `--height`, `--line-width`, `--output` and `--catalog` allow explicit aligned captures. `--profile` accepts a nanoraster lighting JSON, strictly validated by its public API; `--fixtures` is a comma-separated catalog ID list.

The installed ESM runtime and types are resolved through the existing image-plugin dependency owner, without adding a UI dependency. API-only lighting experiments and the reproduced orthographic shading defect are documented in `docs/research/artifacts/onshape-viewer-lighting-profile/runs/pbr-calibration/nano-lane.md`. The tested candidate lost housing wall contrast on F7 and was rejected as a universal default; no profile is selected or applied by this CLI.

### Performance ablation (calibration server only)

The calibration Vite configuration applies guarded source experiments through
`app/routes/[__e2e].onshape-render-profile/ablation-transform.ts`. Production configuration
never installs them; query choices do not enter the viewer API. The current branch
contains the lean production candidate described below. Restart the calibration
server after editing that transform. Query parameters are fixed at page load:

- `abl=full|direct|beauty|mrt|raw-ao|filtered-ao|bilateral-ao`: full graph; direct PBR draw; tone-mapped beauty;
  tone-mapped beauty with normal MRT; raw GTAO with bilinear sampling; filtered GTAO with bilinear sampling (the lean default); filtered GTAO with native bilateral reconstruction.
- The lean candidate has no FXAA intermediate. Historical `aa=off` comparisons belong to commit `1cec9efe67`.
- `samples=0|4`: override the single-sample renderer default; `sceneSamples=0|4`: independently set the scene target.
- `nodegl=1`: force the node WebGL2 backend, preserving standard depth and reporting actual execution.
- `frameStorage=half`: retain the RGBA16F composed-color reference. Default Neutral tone mapping uses hardware-sRGB RGBA8 storage with linear blending; other tone mappings keep RGBA16F. This changes no depth, AO or scene HDR allocation.
- `edges=off`: omit BRep lines. `overlay=grid|axes|both`: enable only those overlays.
- `depthRestore=off`: intentionally incorrect occlusion control; omit the later depth restore.
- The lean candidate uses ordinary linear overlay blending without viewport copies. Historical `overlayBlend` comparisons belong to commit `1cec9efe67`.
- `view=close`: initial span request 0.09 m; full is 0.22 m.

Example: `/calibration-preview.html?abl=full&view=close&overlay=both&sceneSamples=0`.
Select the desired backend after loading; wait for readiness, then explicitly set the span
(the initial auto-fit can override it). Verify the actual projection and drawing buffer in
the completed report. For the 5K experiment use CSS 2560×1440, DPR 2, natural cadence and
Benchmark combined. Save PNG + metadata only after timing finishes. Warmup is 30 frames,
then 300 samples. Run matched repeats; never report capped cadence as exclusive GPU time.

`mrt` and `raw-ao` remove graph dependencies, not merely their visible
contribution. `filtered-ao` matches the lean full graph; `bilateral-ao` restores the expensive reconstruction for controlled comparison. Draw counts and allocated target counts verify the intended execution. Raw/filtered controls intentionally change appearance. The lean branch defaults to single-sample
scene acquisition and frame targets, bilinear AO reconstruction, no FXAA intermediate and linear overlay blending; it is not appearance-qualified. Direct rendering still
uses Tau's loaded meshes, materials, lighting and update owners; it is not a standalone
Three.js application or a measurement of all Tau CPU overhead.

### Transmission retirement and depth-copy experiment

`ledger=1` now distinguishes historical per-texture events from active renderer allocations. `backendLive` is the last texture event; `activeBackendAllocation` also excludes disposed/lost renderers. `retirement` records observed device destruction or GL context loss, and `disposedAt` records renderer disposal time. `canvasDepth` reports the separate native descriptor or GL context attributes; it is not process/driver VRAM. Three's byte counter may be stale after viewport-copy resize, so calculate mip storage from the latest allocation descriptor.

`depthCopy=load` tests integer texel loads only in the full-resolution composed depth copy. The default retains normalized nearest sampling, and scaled explicit depth bridges are unchanged. It is diagnostic-only: the October21 5K trials were pixel-identical but did not establish a repeatable timing benefit. Match the actual initialized backend, poses, output depth state and current factory before admitting a comparison; the canvas-depth optimization already ships in `canvas-three-gl.ts`.
