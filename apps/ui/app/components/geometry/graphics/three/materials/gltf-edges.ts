import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Group, LineSegments, Material, Object3D, Scene, Vector2 } from 'three';
import { InterleavedBufferAttribute } from 'three';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three/addons';
import { LineSegments2 as WebGpuFatLineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { gltfEdgeColorLightMode } from '#components/geometry/graphics/three/overlay-colors.constants.js';

/**
 * Default line width in pixels for edge rendering.
 * This is screen-space width, not world units.
 */
const defaultLineWidth = 1;

/**
 * Depth bias multiplier shared by WebGL (`LineMaterial`) and WebGPU (`Line2NodeMaterial.depthBias`).
 *
 * **WebGL (logarithmicDepthBuffer)** — biases are appended only in the vertex shader after
 * `<logdepthbuf_vertex>`: `vFragDepth *= pow(depthBiasFactor, fovScale)` on **perspective** cameras
 * so `log2(vFragDepth)` in three's bundled fragment chunk gains a constant offset in log space.
 * Omitting `<logdepthbuf_fragment>` replacement avoids rewriting `gl_FragDepth` in the fragment
 * shader, which restores MSAA coverage compared to injecting `gl_FragDepth` manually.
 *
 * **WebGPU** — forwarded to {@link Line2NodeMaterial.depthBias}. The subclass'
 * `setupDepth(builder)` override picks the matching `viewZTo*Depth` encoder per renderer
 * (reversed-Z viewport, log-depth screenshot/offscreen, or standard perspective) so the
 * emitted depth always shares the surrounding surface rasterizer's encoding. Hardcoding a
 * single encoder at construction time was the "lines never occluded in screenshots"
 * smoking gun (see `docs/research/webgpu-fat-line-renderer-aware-depth.md`).
 *
 * **FOV adaptation (WebGL perspective only)**:
 * `fovScale = tan(fov/2)/tan(30°)`; `adjustedBias = pow(depthBiasFactor, fovScale)`.
 * Orthographic projection is intentionally not biased here (`gl_FragCoord.z` path in three's chunk);
 * defer ortho parity to a dedicated follow-up.
 *
 * Tuning trade-off (WebGL subtle bias vs ghosting): weaker bias preserves occlusion from real
 * occluders; stronger bias restores full opaque line coverage against coplanar faces.
 *
 * @see `docs/policy/webgpu-rendering-pipeline.md`
 * @see `docs/research/webgpu-fat-line-renderer-aware-depth.md`
 */
const depthBiasFactor = 0.999;

/**
 * Module-level singleton uniform shared by every WebGL `LineMaterial` instance produced by
 * {@link createWebGlGltfFatLineMaterial}. Lifting the uniform out of per-call allocation
 * (combined with {@link webGlEdgeProgramCacheKey} below) lets three's `WebGLPrograms`
 * deduplicate the compiled GLSL across viewport + screenshot renderers and across every
 * `LineSegments2` mesh in a loaded scene — the structural perf win from
 * `docs/research/gltf-edges-fat-line-performance.md` R7.
 *
 * Mutating `sharedDepthBiasUniform.value` at runtime updates every material that references it.
 * The middleware-side merge already guarantees one `LineSegments2` per backend per scene, so
 * this fan-out is normally a one-element fan-out — but the shared uniform also covers the
 * screenshot-clone path (`applyEdgeMaterialsToClonedScene`) which allocates fresh materials
 * per capture.
 */
const sharedDepthBiasUniform = { value: depthBiasFactor };

/**
 * Stable cache key returned from `LineMaterial.customProgramCacheKey()`. The shader source
 * is identical across every consumer of {@link createWebGlGltfFatLineMaterial}, so a constant
 * key collapses three's program cache to one compiled program instead of one-per-instance.
 *
 * Versioned (`v1`) so a future shader patch can intentionally invalidate every cached program
 * by bumping the suffix.
 */
const webGlEdgeProgramCacheKey = 'tau-gltf-edge-logdepth-bias-v1';

/**
 * Disable raycast on edge meshes. Pointer events traverse the scene every move; the default
 * `LineSegments2.raycast` runs a per-segment screen-space intersection (~150 lines of math)
 * even when nothing in the codebase picks edges. See R5 in
 * `docs/research/gltf-edges-fat-line-performance.md`.
 */
const disableRaycast = (): void => undefined;

/**
 * Extract positions from indexed geometry with InterleavedBufferAttribute, baking each
 * referenced vertex into a pre-allocated `Float32Array`. Drops the historical `?? 0`
 * fallback — for in-range indexed reads against a valid `InterleavedBufferAttribute`,
 * `array[v]` is always defined and the fallback only obscured genuine corruption.
 *
 * @param positionAttribute - Interleaved POSITION attribute (vec3 with arbitrary stride/offset).
 * @param indices - Vertex index buffer for the source geometry.
 * @returns Flat `[x1, y1, z1, x2, ...]` typed-array of the referenced vertices.
 */
function extractFromInterleavedIndexed(
  positionAttribute: InterleavedBufferAttribute,
  indices: Uint32Array | Uint16Array,
): Float32Array {
  const { stride } = positionAttribute.data;
  const { offset } = positionAttribute;
  const { array } = positionAttribute.data;
  const out = new Float32Array(indices.length * 3);
  let writeOffset = 0;
  // In-range typed-array reads return `number | undefined` under `noUncheckedIndexedAccess`;
  // the `!` short-circuits widening without re-introducing the `?? 0` fallback (R3 removed
  // it because silent zero substitution masked genuine vertex corruption).
  for (const indexValue of indices) {
    const base = indexValue * stride + offset;
    out[writeOffset] = array[base]!;
    out[writeOffset + 1] = array[base + 1]!;
    out[writeOffset + 2] = array[base + 2]!;
    writeOffset += 3;
  }
  return out;
}

/**
 * Extract positions from non-indexed geometry with InterleavedBufferAttribute.
 *
 * @param positionAttribute - Interleaved POSITION attribute (vec3 with arbitrary stride/offset).
 * @returns Flat `[x1, y1, z1, x2, ...]` typed-array of the referenced vertices.
 */
function extractFromInterleavedNonIndexed(positionAttribute: InterleavedBufferAttribute): Float32Array {
  const { stride } = positionAttribute.data;
  const { offset } = positionAttribute;
  const { array } = positionAttribute.data;
  const { count } = positionAttribute;
  const out = new Float32Array(count * 3);
  let writeOffset = 0;
  for (let vertex = 0; vertex < count; vertex++) {
    const base = vertex * stride + offset;
    out[writeOffset] = array[base]!;
    out[writeOffset + 1] = array[base + 1]!;
    out[writeOffset + 2] = array[base + 2]!;
    writeOffset += 3;
  }
  return out;
}

/**
 * Extract positions from indexed geometry with regular BufferAttribute.
 *
 * @param array - Tightly-packed `[x, y, z, x, y, z, ...]` POSITION storage.
 * @param indices - Vertex index buffer for the source geometry.
 * @returns Flat `[x1, y1, z1, x2, ...]` typed-array of the referenced vertices.
 */
function extractFromRegularIndexed(array: Float32Array, indices: Uint32Array | Uint16Array): Float32Array {
  const out = new Float32Array(indices.length * 3);
  let writeOffset = 0;
  for (const indexValue of indices) {
    const base = indexValue * 3;
    out[writeOffset] = array[base]!;
    out[writeOffset + 1] = array[base + 1]!;
    out[writeOffset + 2] = array[base + 2]!;
    writeOffset += 3;
  }
  return out;
}

/**
 * Extract positions from a LineSegments geometry, handling both regular and interleaved buffers.
 * Returns a freshly-allocated `Float32Array` ready to be passed to `LineSegmentsGeometry.setPositions`
 * (which itself wraps the array in an `InstancedInterleavedBuffer` without re-copying).
 *
 * Pre-allocates the exact final length and uses indexed loops to avoid the historical
 * `number[]`-then-spread allocation cliff documented in `docs/research/gltf-edges-fat-line-performance.md`
 * Finding 3.
 *
 * @param lineSegments - The LineSegments object to extract positions from
 * @returns Float32Array of position values [x1, y1, z1, x2, y2, z2, ...] or undefined if extraction fails
 */
function extractPositions(lineSegments: LineSegments): Float32Array | undefined {
  const { geometry } = lineSegments;
  const positionAttribute = geometry.attributes['position'];

  if (!positionAttribute) {
    console.warn('[FatLines] No position attribute found on LineSegments');
    return undefined;
  }

  const indexAttribute = geometry.index;
  const indices = indexAttribute?.array as Uint32Array | Uint16Array | undefined;

  if (positionAttribute instanceof InterleavedBufferAttribute) {
    if (indices) {
      return extractFromInterleavedIndexed(positionAttribute, indices);
    }
    return extractFromInterleavedNonIndexed(positionAttribute);
  }

  const array = positionAttribute.array as Float32Array;

  if (indices) {
    return extractFromRegularIndexed(array, indices);
  }

  // Non-indexed regular buffer — clone into a fresh Float32Array so downstream mutation
  // can never alias the GLTF loader's internal buffer. `new Float32Array(array)` copies
  // typed-array → typed-array in one allocation (no number[] roundtrip).
  return new Float32Array(array);
}

/**
 * WebGL fat-line material paired with `LineSegments2` (`three/addons/lines/LineSegments2`).
 *
 * Injects multiplicative bias on `vFragDepth` in the vertex shader only (after three's
 * `<logdepthbuf_vertex>`), so the engine's `<logdepthbuf_fragment>` chunk (r180+
 * `USE_LOGARITHMIC_DEPTH_BUFFER`) stays authoritative and fragment MSAA stays valid.
 *
 * Exported so the screenshot capability path can allocate fresh materials per capture
 * — sharing the live viewport's `LineMaterial` across renderer instances is structurally
 * unsafe (the shared `'dispose'` listeners purge pipeline state on every renderer using
 * the material). See `docs/research/screenshot-viewport-shared-material-state-bleed.md`.
 *
 * Performance shape (R7): the `depthBias` uniform is the module-level
 * {@link sharedDepthBiasUniform} singleton and `customProgramCacheKey` returns the stable
 * {@link webGlEdgeProgramCacheKey} string, so three's `WebGLPrograms` deduplicates the
 * compiled GLSL program across every consumer in the same renderer. The previous shape
 * minted one program-cache slot per `LineMaterial` instance because three's default
 * `customProgramCacheKey` derived from the material identity rather than the shader text.
 *
 * @param resolution - The viewport resolution for line width calculation.
 * @param edgeColor - sRGB hex edge tint (defaults to {@link gltfEdgeColorLightMode}).
 * @returns A configured LineMaterial with FOV-adaptive depth bias (perspective only).
 */
export function createWebGlGltfFatLineMaterial(
  resolution: Vector2,
  edgeColor: number = gltfEdgeColorLightMode,
): LineMaterial {
  const material = new LineMaterial({
    color: edgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false,
    resolution: resolution.clone(),
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms['depthBias'] = sharedDepthBiasUniform;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_pars_vertex>',
      `#include <logdepthbuf_pars_vertex>
      uniform float depthBias;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      `#include <logdepthbuf_vertex>
      #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
        if (projectionMatrix[3][3] == 0.0) {
          float tanHalfFov = 1.0 / projectionMatrix[1][1];
          float fovScale = tanHalfFov / 0.57735;
          vFragDepth *= pow(depthBias, fovScale);
        }
      #endif`,
    );
  };

  // Stable cache key so three's WebGLPrograms collapses identical-shader materials into a
  // single compiled program. Without this override the program cache treats each
  // `onBeforeCompile`-bearing material as a distinct program (`docs/research/gltf-edges-fat-line-performance.md`
  // Finding 7).
  material.customProgramCacheKey = () => webGlEdgeProgramCacheKey;

  // Public alias preserved for callers that bumped the bias at runtime via userData.
  material.userData['depthBiasUniform'] = sharedDepthBiasUniform;

  return material;
}

/**
 * WebGPU fat-line material paired with {@link LineSegmentsGeometry} via
 * `three/addons/lines/webgpu/LineSegments2`.
 *
 * **`alphaToCoverage = false`** — opts the WebGPU material out of upstream
 * `Line2NodeMaterial`'s default `_useAlphaToCoverage = true` so the screen-space rounded
 * endcap branch falls through to the deterministic `discard` path. Upstream WebGL
 * `LineMaterial` already takes that path by default (`USE_ALPHA_TO_COVERAGE` define
 * absent) and produces the crisp 5-level MSAA coverage Tau ships today; mirroring the
 * WebGPU side closes the screenshot crispness gap because the WebGPU spec leaves the
 * alpha→sample-mask conversion vendor-defined (e.g. Qualcomm's documented 4×4
 * area-dither LUT, gpuweb/gpuweb#4867) which surfaces as visible graininess on
 * dithered drivers. See `docs/research/webgpu-edge-line-crispness-gap.md`.
 *
 * The coplanar bias is forwarded as `material.depthBias`; the renderer-aware encoder
 * dispatch lives inside {@link Line2NodeMaterial.setupDepth}, so the same material
 * instance can be rendered correctly by either the reversed-Z viewport renderer or the
 * log-depth screenshot/offscreen renderer in the same frame budget.
 *
 * @param edgeColor - sRGB hex edge tint (defaults to {@link gltfEdgeColorLightMode}).
 */
export function createWebGpuGltfFatLineMaterial(edgeColor: number = gltfEdgeColorLightMode): Line2NodeMaterial {
  const material = new Line2NodeMaterial({
    color: edgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false,
  });

  material.alphaToCoverage = false;
  material.depthBias = depthBiasFactor;

  return material;
}

/**
 * Wrap a single source `LineSegments` (the kernel-side merged edges primitive) into one
 * `LineSegments2` for the active backend, sharing a pre-built material so multiple sources
 * — when the middleware skips merging — still produce a single pipeline.
 */
function wrapAsFatLineSegments(
  lineSegments: LineSegments,
  material: Line2NodeMaterial | LineMaterial,
  backend: ResolvedGraphicsBackend,
): Object3D | undefined {
  const positions = extractPositions(lineSegments);

  if (!positions || positions.length === 0) {
    console.warn('[FatLines] Failed to extract positions from LineSegments');
    return undefined;
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  // The backend-specific mesh classes accept different material types at the type level
  // (`Line2NodeMaterial` vs `LineMaterial`) but both satisfy each other's runtime contract.
  // Cast at the constructor call site so the assignment is local rather than function-wide.
  const fatLine =
    backend === 'webgpu'
      ? new WebGpuFatLineSegments2(geometry, material as Line2NodeMaterial)
      : new LineSegments2(geometry, material as LineMaterial);

  fatLine.position.copy(lineSegments.position);
  fatLine.rotation.copy(lineSegments.rotation);
  fatLine.scale.copy(lineSegments.scale);
  fatLine.quaternion.copy(lineSegments.quaternion);

  fatLine.name = lineSegments.name;
  fatLine.userData = { ...lineSegments.userData };

  // R5: edge meshes are render-only overlays; skip the expensive per-segment screen-space
  // raycast that R3F's pointermove handler would otherwise invoke on every mouse move.
  fatLine.raycast = disableRaycast;

  // R8: do not pin `renderOrder = 1`. The explicit `depthBias` on both backends already
  // wins the coplanar comparison; sorting edges into a separate bucket only loses cache
  // locality against the surfaces they overlay.

  return fatLine;
}

/**
 * Apply fat line segments to a GLTF scene by converting each `LineSegments` to a single
 * shared-material `LineSegments2`.
 *
 * The kernel-side `gltfEdgeDetectionMiddleware` (via `mergeGltfLineSegments`) consolidates
 * every LINES primitive into a single `tau-merged-edges` mesh before the bytes leave the
 * runtime, so under normal operation this function finds exactly one source `LineSegments`
 * and produces exactly one `LineSegments2` + one shared material + one render pipeline.
 *
 * The implementation remains tolerant of multiple source `LineSegments` (test fixtures or
 * future kernels that bypass the merge): all sources share a single allocated material so
 * the R1 perf win (one pipeline) holds even when R2 (one draw call) does not.
 *
 * @param gltf - The GLTF scene to process
 * @param resolution - The viewport resolution for line width calculation
 * @param backend - Active rendering backend for the host viewer
 * @param edgeColor - sRGB hex edge tint (defaults to {@link gltfEdgeColorLightMode}).
 */
export function applyFatLineSegments(
  gltf: GLTF,
  resolution: Vector2,
  backend: ResolvedGraphicsBackend,
  edgeColor: number = gltfEdgeColorLightMode,
): void {
  const sources: Array<{ parent: Group; lineSegments: LineSegments }> = [];

  gltf.scene.traverse((object) => {
    if (object.type === 'LineSegments') {
      const lineSegments = object as LineSegments;
      const parent = lineSegments.parent as Group | undefined;
      if (parent) {
        sources.push({ parent, lineSegments });
      }
    }
  });

  if (sources.length === 0) {
    return;
  }

  // Single material instance shared across every wrapped fat line — the R1 perf win.
  const sharedMaterial: Line2NodeMaterial | LineMaterial =
    backend === 'webgpu'
      ? createWebGpuGltfFatLineMaterial(edgeColor)
      : createWebGlGltfFatLineMaterial(resolution, edgeColor);

  for (const { parent, lineSegments } of sources) {
    const fatLine = wrapAsFatLineSegments(lineSegments, sharedMaterial, backend);
    if (!fatLine) {
      continue;
    }

    parent.remove(lineSegments);
    parent.add(fatLine);

    lineSegments.geometry.dispose();
    if (Array.isArray(lineSegments.material)) {
      for (const material of lineSegments.material) {
        material.dispose();
      }
    } else {
      lineSegments.material.dispose();
    }
  }
}

type ApplyEdgeMaterialsToClonedSceneOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  /** Required for the WebGL `LineMaterial` `resolution` uniform; ignored on WebGPU. */
  resolution: Vector2;
}>;

/**
 * Allocate fresh fat-line materials on every `LineSegments2` in a cloned screenshot scene.
 *
 * The screenshot renderer's flag set diverges from the viewport's on `reversedDepthBuffer`,
 * `logarithmicDepthBuffer`, and the `RenderPipeline`/`PassNode` post-processing chain. A
 * `Line2NodeMaterial` whose TSL graph is materialised once against the viewport's flags
 * cannot legally be reused by a renderer with a different sample-count contract — three.js
 * caches the built node graph on the material instance, so the screenshot renderer would
 * inherit the viewport's reversed-Z depth encoder, HalfFloat color attachment expectations,
 * and PassNode-level filtering assumptions.
 *
 * Allocating fresh materials here means each renderer compiles its own pipeline against
 * its own flag set. Tau's `Line2NodeMaterial.setupDepth` then correctly picks the
 * screenshot renderer's `viewZToLogarithmicDepth` branch instead of the viewport's
 * `viewZToReversedPerspectiveDepth` one. Combined with `applyMatcapToClonedScene`'s
 * existing fresh-allocation pattern for surface meshes, this closes the captured-output
 * graininess gap (Symptom B in
 * `docs/research/screenshot-viewport-shared-material-state-bleed.md`).
 *
 * Since the kernel-side merge collapses every LINES primitive into a single `LineSegments2`
 * per scene, this function now typically allocates exactly one material per capture (rather
 * than one-per-source-primitive as it did before the merge landed).
 *
 * @returns The set of newly-allocated edge materials owned by this clone pass.
 */
export function applyEdgeMaterialsToClonedScene(
  scene: Scene,
  options: ApplyEdgeMaterialsToClonedSceneOptions,
): Set<Material> {
  const allocated = new Set<Material>();

  scene.traverse((child) => {
    if (!('type' in child) || child.type !== 'LineSegments2') {
      return;
    }

    // Both the WebGL `LineSegments2` (from `three/addons`) and the WebGPU
    // `LineSegments2` (from `three/addons/lines/webgpu/LineSegments2.js`) set
    // `.type === 'LineSegments2'`. Their `material` slots accept different
    // concrete material classes (`LineMaterial` vs `Line2NodeMaterial`), so we
    // treat both via the structural intersection both materials expose.
    type FatLineMesh = { material: { color?: { getHex(): number }; linewidth?: number } };
    const lineSegments = child as unknown as FatLineMesh;
    const sourceMaterial = lineSegments.material;

    const fresh =
      options.backend === 'webgpu'
        ? createWebGpuGltfFatLineMaterial()
        : createWebGlGltfFatLineMaterial(options.resolution);

    if (sourceMaterial.color && 'color' in fresh) {
      (fresh as { color: { setHex(hex: number): void } }).color.setHex(sourceMaterial.color.getHex());
    }
    if (typeof sourceMaterial.linewidth === 'number') {
      (fresh as { linewidth: number }).linewidth = sourceMaterial.linewidth;
    }

    lineSegments.material = fresh as { color?: { getHex(): number }; linewidth?: number };
    allocated.add(fresh);
  });

  return allocated;
}

/**
 * Update the resolution of all LineMaterial instances in a scene.
 * Call this when the viewport size changes to maintain correct line widths.
 *
 * @param scene - The scene to update
 * @param resolution - The new viewport resolution
 */
export function updateLineMaterialResolution(scene: Group, resolution: Vector2): void {
  scene.traverse((object) => {
    if (object.type !== 'LineSegments2') {
      return;
    }

    const { material } = object as LineSegments2;
    if ('resolution' in material) {
      (material as { resolution: Vector2 }).resolution.copy(resolution);
    }
  });
}

/**
 * Update the edge tint on every `LineSegments2` in a scene.
 *
 * Shared materials mean one `setHex` updates all edge meshes (including screenshot
 * clones that copied the viewport color via {@link applyEdgeMaterialsToClonedScene}).
 *
 * @param scene - Scene group containing fat-line edge meshes
 * @param edgeColor - sRGB hex edge tint
 */
export function updateGltfEdgeColor(scene: Group, edgeColor: number): void {
  scene.traverse((object) => {
    if (object.type !== 'LineSegments2') {
      return;
    }

    const { material } = object as LineSegments2;
    if ('color' in material && material.color) {
      (material as { color: { setHex(hex: number): void } }).color.setHex(edgeColor);
    }
  });
}
