---
title: 'Spatial Policy'
description: 'Coordinate-space, unit, frame, render-local scaling, floating-origin, camera, tolerance, persistence, capture, and testing rules for spatial code in Tau.'
status: active
created: '2026-08-29'
updated: '2026-08-29'
related:
  - docs/research/spatial-foundation-all-magnitudes-blueprint.md
  - docs/research/nanoraster-caller-world-canonical-glb-blueprint.md
  - docs/policy/graphics-backend-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/workspace-project-policy.md
---

# Spatial Policy

Internal reference for every Tau feature that stores, transforms, renders, displays, compares, persists, exports, or captures spatial values.

## Rationale

Physical units, asset coordinates, display units, renderer coordinates, and screen pixels answer different questions. Treating them as one “world unit” caused Tau's parameter regression and creates precision ceilings at microscopic and planetary scales. This policy keeps physical truth stable while each viewport derives a local GPU representation appropriate to what the user is viewing.

## Canonical Spaces

| Space          | Contract                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| Parameter      | Value uses the CAD/kernel-declared source symbol                                        |
| Asset          | Value uses the format's declared convention; canonical glTF is right-handed Y-up/metres |
| Physical frame | Translation is metres in a named hierarchical frame                                     |
| Tau root       | Right-handed Z-up, forward −Y, metres                                                   |
| Render         | Per-viewport local units defined by a `RenderFrame`                                     |
| Display        | Human-selected SI/imperial symbol                                                       |
| Screen         | CSS/physical pixels, NDC, or depth                                                      |

## Rules

### 1. Name the Space and Unit

Name spatial fields and APIs by meaning. Use `translationMeters`, `metersPerRenderUnit`, `sourceSymbol`, `displaySymbol`, `pixelTolerance`, or an equally explicit domain name. Do not use unqualified `factor`, `scale`, `units`, `position`, `epsilon`, or “world units” where more than one space is possible.

```typescript
// CORRECT: direction and dimensionality are explicit
type RenderFrame = {
  originMeters: SpatialVector;
  metersPerRenderUnit: number;
};

// INCORRECT: caller cannot tell which direction or space applies
type Context = { origin: number[]; factor: number; epsilon: number };
```

**Why:** A numeric value does not carry its coordinate frame or unit at runtime.

### 2. Keep Physical Truth in Named Metre Frames

Store project/viewer physical translations and lengths in metres inside a named frame. Store rotations as normalized quaternions or documented normalized directions. Give every persisted point a `frameId`.

Do not store display-unit values or render-local values as physical truth. Do not infer a frame from the currently selected viewer.

```typescript
// CORRECT
const measurement = { frameId: 'part:rotor', startPoint, endPoint, distanceMeters };

// INCORRECT
const measurement = { startPoint: nativeThreePoint, unit: selectedGridUnit };
```

**Why:** Display preferences and render origins change without changing the model.

### 3. Use Hierarchical Rigid Frames for Mixed Scales

Represent large offsets and local detail as parent/child frame relationships. Resolve one frame relative to another through their lowest common ancestor. Keep geometry near its owning local origin.

Physical frame edges contain rotation and metre translation only. Do not put display conversion, unit normalization, nonuniform scale, shear, renderer state, or entity data in the physical frame graph.

Do not flatten a planetary system and microscopic instruments into one absolute vertex space. Distant branches require culling/LOD when their simultaneous dynamic range exceeds the active renderer's useful precision.

**Why:** Local relationships preserve significant digits; a larger flat coordinate type does not remove float32 GPU limits.

### 4. Adapt Assets at Consumer Boundaries Without Rewriting Bytes

Treat canonical GLB as immutable, spec-compliant asset data. Compose its declared asset convention with physical-frame and render-frame transforms at the viewer/capture boundary. Keep parsed asset-local geometry unchanged where practical.

```typescript
// CORRECT: compose a root presentation transform
const matrix = toThreeMatrix(resolveAssetRenderTransform({ asset, graph, renderFrame }));

// INCORRECT: mutate every vertex or reserialize GLB for one viewer convention
await rewriteGltfVerticesToCurrentViewportWorld(bytes);
```

**Why:** Boundary transforms are reversible, constant-time with respect to vertex count, and preserve one canonical artifact for every consumer.

### 5. Give Every Viewport Its Own Ephemeral Render Frame

Each viewport derives an `anchorFrameId`, `originMeters`, and positive finite `metersPerRenderUnit`. Keep the active camera, scene, helpers, and interactions in numerically safe local render coordinates.

Do not use one global floating origin. Do not persist a render frame. Do not expose render units as physical metres or user units.

Choose render scale deterministically from the active physical characteristic length/visible span, using power-of-1000 bands aligned with SI magnitudes. Retain the current band with hysteresis; do not rescale continuously.

**Why:** Two viewports may inspect the same project at planetary and microscopic scales simultaneously.

### 6. Rebase and Rescale Atomically

Change a render frame only as one per-view transaction. Update scene transforms, native camera endpoints, controls target, grid phase, helpers, clipping, and inverse interaction mapping from the same revision, then invalidate once.

Rebasing/rescaling must preserve the physical camera and projected image. Tests must enforce a maximum `0.25` physical-pixel displacement at stable reference points.

Do not reparse GLB, traverse/rewrite vertices, rebuild geometry/BVH, or create a continuous render loop for a frame change.

**Why:** A mixed old/new frame produces visible jumps and corrupts picks even if each individual transform is correct.

### 7. Keep Camera State Physical and Renderer Adapters Local

Portable camera target, position, bounds, span, distances, and clipping are physical metres in a named frame. Projection angles/zoom and normalized direction/up remain dimensionless. Renderer adapters map the complete state to/from the active render frame.

Camera framing and clipping formulas must be scale-covariant. Do not use fixed metre floors for ordinary nondegenerate scenes. Handle empty or point-like bounds explicitly.

Depth-buffer techniques such as logarithmic or reversed depth may improve depth distribution but do not replace floating-origin/local-scale design. Do not enable backend-specific high-precision modes as a substitute for locality.

### 8. Convert Parameters by Source and Display Symbols

Every length editor receives both its source and display symbols. Convert with `@taucad/units` `convertLength()` in both directions.

```typescript
// CORRECT
const shown = convertLength(sourceValue, sourceSymbol, displaySymbol);
const committed = convertLength(editedValue, displaySymbol, sourceSymbol);

// INCORRECT: direction and baseline are implicit
const shown = sourceValue / units.factor;
const committed = editedValue * units.factor;
```

CAD parameters use the CAD actor's source symbol. Viewer-world controls use `m` as source. A selected grid/display unit never changes a kernel parameter's source unit.

Do not show an approximation marker merely because the viewer has a non-1 metres-per-display-unit value. Approximation reflects actual formatted conversion loss.

**Why:** Metres per display unit and CAD-source units per display unit are different contracts even when both are numbers.

### 9. Do Not Create a Global Spatial Epsilon

Classify every tolerance by dimension and space:

- exact validation: no epsilon;
- normalized algebra: named dimensionless relative guard;
- float32 mesh comparison: local magnitude/source-precision guard;
- geometry predicates: normalize locally or accept an explicit physical tolerance;
- snapping/picking/handles: pixels converted at depth when necessary;
- area/volume: squared/cubed length scale or normalized operation;
- shader/depth bias: backend-aware screen/depth behavior.

```typescript
// CORRECT: normalize the polygon then use a dimensionless predicate threshold
const normalized = normalizePolygonToUnitExtent(points);
const rings = sanitizeRings(normalized.points, normalizedTolerance);

// INCORRECT: assumes every input is measured near metres
const samePoint = distance(a, b) < 1e-7;
```

Give constants names that expose their dimension, such as `planeDistanceToleranceRenderUnits` or `snapDistancePixels`. A mechanically renamed number without a derived scale is still a defect.

**Why:** Length, area, angle, pixel, and numerical conditioning thresholds cannot share one value or scaling rule.

### 10. Normalize Geometric Predicates Near Their Data

Before polygon boolean, triangulation, collinearity, plane-side, or duplicate-point work at extreme magnitudes, translate to a local origin and normalize by a finite characteristic extent. Run dimensionless predicates there and map results back.

Derive normalization from the smallest owning geometry/frame that contains the operation. Do not use the total project/planetary extent for a microscopic face operation.

Preserve caller-supplied manufacturing/scientific tolerances as physical semantic inputs; normalization is an implementation representation, not a change in acceptance meaning.

### 11. Keep Screen-Sized Interactions in Screen Space

Specify snap radius, pointer slop, handle size, label offset, line width, and click equivalence in CSS/physical pixels. Convert to render/physical length only at the relevant camera depth.

Use stable feature/snap identity when available rather than a distance approximation. Do not reject a physically valid microscopic measurement using a historical metre threshold.

**Why:** A usable pointer target should not shrink when the display unit changes or the model is rebased.

### 12. Invert Render Mapping at Every Interaction Boundary

Ray hits, dragged points, section planes, measurement endpoints, camera events, and annotations leave Three/render space only through the active render-frame inverse and the correct physical frame transform.

Never send a raw `THREE.Vector3` from a render-local scene directly into persistence, CAD parameters, graphics physical state, or capture.

Test point, vector, length, bounds, plane, and camera round-trips. Directions do not receive translation; plane transforms must preserve incidence.

### 13. Persist Physical State, Not Rendering State

Persist frame-aware physical cameras, measurements, annotations, and any durable section state. Migrations assign legacy metre values to a stable root frame after any older unit migration.

Never persist floating origin, render scale, native clip overrides, Three matrices, GPU coordinates, or render-frame revision.

On restore, reject or diagnose unknown frame IDs. Do not silently reinterpret them in the active frame.

### 14. Keep Export and Capture Independent of View Normalization

Export canonical asset bytes according to the format contract. For current-view capture, convert physical camera/section data into the consumer-declared asset/caller world; do not pass native render-local camera state.

Axes and scale bars describe physical conventions and units. The same physical view must yield equivalent capture before and after a render rebase/rescale.

**Why:** A screenshot is evidence of the model/view, not of an internal GPU normalization.

### 15. Keep `@taucad/spatial` Dependency-Free and Renderer-Neutral

`@taucad/spatial` owns serializable vectors/quaternions/matrices, coordinate conventions, rigid frame graphs, reversible frame transforms, render-frame conversion, and shared scale-selection math.

It must not depend on or own:

- `three`, React, React Three Fiber, XState, glTF-Transform, or nanoraster;
- unit catalogs/parsers/display formatting;
- camera projection/control algorithms;
- GLB parsing/serialization;
- mesh topology, BVHs, polygon boolean, or scene entities;
- persistence stores, project state, or viewport state machines;
- arbitrary-precision arithmetic or speculative high/low coordinate transport.

Native adapters belong to the native package (`@taucad/three`); projection belongs to `@taucad/camera`; display conversion belongs to `@taucad/units`; composition/state belongs to the application.

**Why:** The package is a shared foundation only if lower-level consumers can depend on it without pulling a rendering or application stack.

### 16. Preserve WebGL/WebGPU Behavioral Parity

Any spatial change affecting matrices, clipping, depth, shaders, lines, picking, sections, or helpers must be verified under both supported graphics backends according to the graphics backend policy.

Do not accept a WebGPU-only precision fix that changes WebGL behavior, or vice versa. Capability-specific skips require explicit detected evidence and must remain visible in test output.

### 17. Use Red TDD for Spatial Bug Fixes

Before fixing a reported regression, add the smallest test that fails for the reported observable behavior. Then add scale-covariance/round-trip coverage at the shared owner so sibling callers cannot regress.

Required categories for foundational changes:

1. pure algebra and invalid-input unit tests;
2. scale-covariance tests across representative exponents;
3. adapter round-trip tests;
4. persistence migration tests;
5. browser pixel/interaction tests for renderer behavior;
6. WebGL/WebGPU parity tests;
7. capture payload/output parity where current-view capture is affected.

Use deterministic table loops with existing Vitest facilities before adding a new test dependency.

### 18. Account for Every Spatial Constant During Migration

When changing coordinate scale or frames, audit relevant code for `epsilon`, `tolerance`, `threshold`, scientific-notation literals, near/far planes, distance/zoom limits, polygon offsets, and pixel constants. Classify each match as physical, render-local, screen-space, area/volume, or dimensionless.

Do not mechanically edit all matches. Keep dimensionless/shader guards that remain correct and add a comment/test stating their space when ambiguity exists.

### 19. Reject Impossible Flat Inputs Explicitly

If an asset has already baked detail below its numeric encoding precision at a huge absolute offset, a viewer transform cannot recover it. Detect nonfinite/degenerate bounds and, where practical, diagnose unsafe local dynamic range rather than presenting corrupted precision as exact.

Recommend local node geometry, hierarchical frames, or LOD partitioning. Do not claim that “all magnitudes” means infinite simultaneous detail in one float32 mesh.

## Review Checklist

- [ ] Every spatial value's space and unit are explicit at the boundary.
- [ ] Physical values use metres and name a frame.
- [ ] Asset bytes remain canonical and unmodified.
- [ ] Each viewport owns its render frame; no global floating origin exists.
- [ ] Render mapping is reversible for camera, picking, measurement, sectioning, persistence, and capture.
- [ ] Parameter conversion uses source/display symbols through `convertLength()`.
- [ ] Camera and geometric formulas are scale-covariant or explicitly semantic physical tolerances.
- [ ] Screen interactions remain pixel-based.
- [ ] No global epsilon or unexplained physical floor was introduced.
- [ ] Persisted data contains physical frames and excludes render state.
- [ ] WebGL and WebGPU observable parity is tested.
- [ ] Bug fixes began with a failing observable test.
- [ ] `@taucad/spatial` remains dependency-free and renderer-neutral.

## Enforcement

- `pnpm nx lint spatial`, dependency-boundary validation, package `pkgcheck`, and size checks enforce the package boundary.
- Package/unit/UI/browser tests enforce algebra, migrations, scale covariance, visual invariance, and backend parity.
- `pnpm docs:validate` enforces this document's metadata and links.
- Semantic dimensionality and tolerance ownership require review; do not add a broad lint rule that mistakes every scientific-notation literal for a spatial value.

## References

- Blueprint: `docs/research/spatial-foundation-all-magnitudes-blueprint.md`
- Canonical GLB architecture: `docs/research/nanoraster-caller-world-canonical-glb-blueprint.md`
- Backend rules: `docs/policy/graphics-backend-policy.md`
- Public package/API rules: `docs/policy/workspace-project-policy.md`, `docs/policy/library-api-policy.md`
- Testing rules: `docs/policy/testing-policy.md`, `docs/policy/react-testing-policy.md`
