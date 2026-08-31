import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Group, LineSegments, Object3D, Vector2 } from 'three';
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
export const gltfEdgeLineWidth = 1;

/**
 * Expanded WebGPU edge quad width in CSS pixels. The material shades only the central
 * {@link gltfEdgeLineWidth} stroke as fully covered and uses the extra width as an analytic
 * AA fringe, avoiding the inconsistent opaque-MSAA thickness of near-1px lines.
 */
const webGpuEdgePresentationGeometryLineWidth = 2;

/**
 * Disable raycast on edge meshes. Pointer events traverse the scene every move; the default
 * `LineSegments2.raycast` runs a per-segment screen-space intersection (~150 lines of math)
 * even when nothing in the codebase picks edges. See R5 in
 * `docs/research/gltf-edges-fat-line-performance.md`.
 */
const disableRaycast = (): void => undefined;

export type GltfFatLineMaterial = Line2NodeMaterial | LineMaterial;

export type CreateGltfFatLineMaterialOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  /** Required for the WebGL `LineMaterial` `resolution` uniform; ignored on WebGPU. */
  resolution: Vector2;
  edgeColor?: number;
}>;

export type CreateGltfFatLineSegmentsFromPositionsOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  positions: Float32Array;
  material: GltfFatLineMaterial;
}>;

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
 * Exported so the screenshot capability path can allocate fresh materials per capture
 * — sharing the live viewport's `LineMaterial` across renderer instances is structurally
 * unsafe (the shared `'dispose'` listeners purge pipeline state on every renderer using
 * the material). See `docs/research/screenshot-viewport-shared-material-state-bleed.md`.
 *
 * @param resolution - The viewport resolution for line width calculation.
 * @param edgeColor - sRGB hex edge tint (defaults to {@link gltfEdgeColorLightMode}).
 * @returns A configured LineMaterial that writes the line's geometric depth.
 */
export function createWebGlGltfFatLineMaterial(
  resolution: Vector2,
  edgeColor: number = gltfEdgeColorLightMode,
): LineMaterial {
  return new LineMaterial({
    color: edgeColor,
    linewidth: gltfEdgeLineWidth,
    worldUnits: false,
    resolution: resolution.clone(),
  });
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
 * @param edgeColor - sRGB hex edge tint (defaults to {@link gltfEdgeColorLightMode}).
 */
export function createWebGpuGltfFatLineMaterial(edgeColor: number = gltfEdgeColorLightMode): Line2NodeMaterial {
  const material = new Line2NodeMaterial({
    color: edgeColor,
    linewidth: webGpuEdgePresentationGeometryLineWidth,
    worldUnits: false,
  });

  material.alphaToCoverage = false;
  material.depthWrite = false;
  material.transparent = false;
  material.edgePresentationCoverage = true;
  material.edgePresentationLineWidth = gltfEdgeLineWidth;
  material.useViewportSrgbBlend = false;

  return material;
}

export function createGltfFatLineMaterial(options: CreateGltfFatLineMaterialOptions): GltfFatLineMaterial {
  const { backend, resolution, edgeColor = gltfEdgeColorLightMode } = options;
  return backend === 'webgpu'
    ? createWebGpuGltfFatLineMaterial(edgeColor)
    : createWebGlGltfFatLineMaterial(resolution, edgeColor);
}

export function createGltfFatLineSegmentsFromPositions(
  options: CreateGltfFatLineSegmentsFromPositionsOptions,
): LineSegments2 | WebGpuFatLineSegments2 | undefined {
  const { backend, positions, material } = options;
  if (positions.length === 0) {
    return undefined;
  }

  if (positions.length % 6 !== 0) {
    console.warn('[FatLines] Position buffer length must contain complete line segment endpoint pairs');
    return undefined;
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const fatLine =
    backend === 'webgpu'
      ? new WebGpuFatLineSegments2(geometry, material as Line2NodeMaterial)
      : new LineSegments2(geometry, material as LineMaterial);

  // R5: edge meshes are render-only overlays; skip the expensive per-segment screen-space
  // raycast that R3F's pointermove handler would otherwise invoke on every mouse move.
  fatLine.raycast = disableRaycast;

  return fatLine;
}

export function setGltfFatLineMaterialColor(material: GltfFatLineMaterial, edgeColor: number): void {
  if ('color' in material) {
    material.color.setHex(edgeColor);
  }
}

/**
 * Wrap a single owner-local source `LineSegments` into one `LineSegments2` for the active
 * backend, sharing a pre-built material so multiple edge sources still produce a single
 * shader pipeline.
 */
function wrapAsFatLineSegments(
  lineSegments: LineSegments,
  material: GltfFatLineMaterial,
  backend: ResolvedGraphicsBackend,
): Object3D | undefined {
  const positions = extractPositions(lineSegments);

  if (!positions || positions.length === 0) {
    console.warn('[FatLines] Failed to extract positions from LineSegments');
    return undefined;
  }

  const fatLine = createGltfFatLineSegmentsFromPositions({ backend, positions, material });
  if (!fatLine) {
    return undefined;
  }

  fatLine.position.copy(lineSegments.position);
  fatLine.rotation.copy(lineSegments.rotation);
  fatLine.scale.copy(lineSegments.scale);
  fatLine.quaternion.copy(lineSegments.quaternion);

  fatLine.name = lineSegments.name;
  fatLine.userData = { ...lineSegments.userData };

  // Keep surfaces and owner-local edges adjacent in the ordinary render order. Surface
  // materials provide the bounded coplanar separation; edges retain geometric depth.

  return fatLine;
}

/**
 * Apply fat line segments to a GLTF scene by converting each owner-local `LineSegments` to
 * a shared-material `LineSegments2`.
 *
 * Runtime GLBs preserve kernel/component ownership by keeping LINES primitives on their
 * source meshes. This function may therefore find one or more source `LineSegments`; all
 * sources share a single allocated material so the pipeline count stays flat even when
 * draw calls remain owner-local.
 *
 * @param gltf - The GLTF scene to process
 * @param options - Backend, resolution, and optional edge tint for the host viewer.
 */
type ApplyFatLineSegmentsOptions = Readonly<{
  resolution: Vector2;
  backend: ResolvedGraphicsBackend;
  edgeColor?: number;
}>;

export function applyFatLineSegments(gltf: GLTF, options: ApplyFatLineSegmentsOptions): void {
  const { resolution, backend, edgeColor = gltfEdgeColorLightMode } = options;
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
  const sharedMaterial = createGltfFatLineMaterial({ backend, resolution, edgeColor });

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
 * Shared materials mean one `setHex` updates all edge meshes.
 *
 * @param scene - Scene group containing fat-line edge meshes.
 * @param edgeColor - sRGB hex edge tint.
 * @returns The deduped edge materials whose color was updated.
 */
export function updateGltfEdgeColor(scene: Group, edgeColor: number): Set<GltfFatLineMaterial> {
  const updatedMaterials = new Set<GltfFatLineMaterial>();

  scene.traverse((object) => {
    if (object.type !== 'LineSegments2') {
      return;
    }

    const { material } = object as LineSegments2;
    const edgeMaterial = material as GltfFatLineMaterial;
    setGltfFatLineMaterialColor(edgeMaterial, edgeColor);
    updatedMaterials.add(edgeMaterial);
  });

  return updatedMaterials;
}
