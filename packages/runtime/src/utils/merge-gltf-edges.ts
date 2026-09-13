import type { Document, Primitive, Node as GltfNode, Mesh as GltfMesh, Material, mat4 } from '@gltf-transform/core';

/**
 * Name applied to the merged edges node + mesh. The UI fat-line conversion path uses this
 * marker to identify the consolidated LINES primitive after `GLTFLoader.parseAsync`.
 */
export const mergedEdgesNodeName = 'tau-merged-edges';

/**
 * GlTF primitive mode for LINES (1).
 *
 * @see https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/README.md#primitivemode
 */
const primitiveModeLines = 1;

/**
 * Result of {@link mergeGltfLineSegments}.
 */
export type MergeGltfLineSegmentsResult = {
  /** True when at least one LINES primitive was collapsed into the merged node. */
  readonly merged: boolean;
  /** Total segment count (line endpoints / 2) in the merged primitive. Zero when `merged === false`. */
  readonly segmentCount: number;
};

/**
 * A LINES primitive captured during the first traversal pass, paired with the accumulated
 * world matrix of the {@link GltfNode} that referenced it. Stored before any mutation so
 * shared-mesh instances are baked into world space correctly (each instance contributes its
 * own transformed copy of the same source positions).
 */
type CapturedLinePrimitive = {
  readonly primitive: Primitive;
  readonly worldMatrix: mat4;
};

/**
 * Options bag for {@link expandLinePrimitive}. Bundling source + destination + transform
 * into a single argument keeps the function under the project-wide max-params cap (3) while
 * still inlining cleanly in the hot path (V8 elides the object literal when monomorphic).
 */
type ExpandLineOptions = {
  readonly positions: Float32Array;
  /** Optional vertex index buffer. When omitted the positions array is consumed sequentially. */
  readonly indices?: Uint16Array | Uint32Array;
  readonly worldMatrix: mat4;
  readonly output: Float32Array;
  readonly outputOffset: number;
};

/**
 * Expand one source LINES primitive into the merged Float32Array, applying the world
 * matrix vertex-by-vertex. Handles both indexed and non-indexed primitives.
 *
 * The matrix transform is unrolled inline (not delegated to a `transformPoint` helper) so
 * the hot path inside the loop stays free of cross-function call overhead.
 *
 * @param options - Source positions/indices, target world matrix, and output buffer + offset.
 * @returns The post-write offset into `output` (in Float32 elements).
 */
function expandLinePrimitive(options: ExpandLineOptions): number {
  const { positions, indices, worldMatrix, output } = options;
  // Mat4 is column-major: m[col*4 + row]. Pull the matrix elements into locals once so the
  // V8 SMI/double tagging doesn't re-load them on every vertex iteration.
  const m0 = worldMatrix[0];
  const m1 = worldMatrix[1];
  const m2 = worldMatrix[2];
  const m4 = worldMatrix[4];
  const m5 = worldMatrix[5];
  const m6 = worldMatrix[6];
  const m8 = worldMatrix[8];
  const m9 = worldMatrix[9];
  const m10 = worldMatrix[10];
  const m12 = worldMatrix[12];
  const m13 = worldMatrix[13];
  const m14 = worldMatrix[14];

  let writeOffset = options.outputOffset;

  // Each `positions[base + k]!` is an in-range typed-array read; the `!` short-circuits
  // `noUncheckedIndexedAccess` widening without re-introducing the `?? 0` fallback the
  // audit removed (R3 — silent zero substitution masked corruption).
  if (indices) {
    for (const indexValue of indices) {
      const base = indexValue * 3;
      const x = positions[base]!;
      const y = positions[base + 1]!;
      const z = positions[base + 2]!;
      output[writeOffset] = m0 * x + m4 * y + m8 * z + m12;
      output[writeOffset + 1] = m1 * x + m5 * y + m9 * z + m13;
      output[writeOffset + 2] = m2 * x + m6 * y + m10 * z + m14;
      writeOffset += 3;
    }
    return writeOffset;
  }

  const vertexCount = positions.length / 3;
  for (let v = 0; v < vertexCount; v++) {
    const base = v * 3;
    const x = positions[base]!;
    const y = positions[base + 1]!;
    const z = positions[base + 2]!;
    output[writeOffset] = m0 * x + m4 * y + m8 * z + m12;
    output[writeOffset + 1] = m1 * x + m5 * y + m9 * z + m13;
    output[writeOffset + 2] = m2 * x + m6 * y + m10 * z + m14;
    writeOffset += 3;
  }
  return writeOffset;
}

/**
 * Recursively walk node + descendants and capture every LINES primitive paired with its
 * world matrix. Nodes that share a `Mesh` produce one entry per node-instance, so each
 * world placement contributes its own transformed copy to the merged buffer.
 *
 * @param node - Current node to inspect.
 * @param captured - Out-parameter accumulator; populated in traversal order.
 */
function captureLinePrimitives(node: GltfNode, captured: CapturedLinePrimitive[]): void {
  const mesh = node.getMesh();
  if (mesh) {
    const worldMatrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() === primitiveModeLines) {
        captured.push({ primitive, worldMatrix });
      }
    }
  }

  for (const child of node.listChildren()) {
    captureLinePrimitives(child, captured);
  }
}

/**
 * Resolve a primitive's POSITION accessor down to a typed-array pair `(positions, indices?)`
 * that {@link expandLinePrimitive} can consume directly. Returns `undefined` when the
 * primitive cannot be safely read (missing accessor / non-Float32 positions / unsupported
 * index type) so the caller can skip the primitive without aborting the merge.
 */
type ResolvedLineData = {
  readonly positions: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly vertexCount: number;
};

function resolveLinePrimitive(primitive: Primitive): ResolvedLineData | undefined {
  const positionAccessor = primitive.getAttribute('POSITION');
  if (!positionAccessor) {
    return undefined;
  }
  const positions = positionAccessor.getArray();
  if (!(positions instanceof Float32Array)) {
    return undefined;
  }

  const indexAccessor = primitive.getIndices();
  if (!indexAccessor) {
    return { positions, vertexCount: positionAccessor.getCount() };
  }

  const indices = indexAccessor.getArray();
  if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
    return undefined;
  }
  return { positions, indices, vertexCount: indices.length };
}

/**
 * Pick the material to attach to the merged primitive. Prefers an existing material named
 * `tau-edge-material` (the lazily-allocated material from `gltfEdgeDetectionMiddleware`),
 * falling back to the first non-null material on any captured primitive.
 *
 * @param captured - The captured LINE primitives with their world matrices.
 * @returns The material to attach to the merged primitive, or `undefined` when no edge
 *   material exists — the merged primitive is then left material-less, mirroring the
 *   source primitives' state.
 */
function pickEdgeMaterial(captured: readonly CapturedLinePrimitive[]): Material | undefined {
  for (const { primitive } of captured) {
    const material = primitive.getMaterial();
    if (material?.getName() === 'tau-edge-material') {
      return material;
    }
  }

  for (const { primitive } of captured) {
    const material = primitive.getMaterial();
    if (material) {
      return material;
    }
  }

  return undefined;
}

/**
 * Build the map from source LINE primitive → owning Mesh so the removal pass can detach
 * each primitive from its mesh without re-scanning the whole document per primitive.
 *
 * @param document - The document being mutated.
 * @param linePrimitives - The set of primitives whose owning meshes we want to look up.
 * @returns Map keyed by primitive identity; each value is the unique owning Mesh.
 */
function buildPrimitiveOwnerMap(document: Document, linePrimitives: ReadonlySet<Primitive>): Map<Primitive, GltfMesh> {
  const owners = new Map<Primitive, GltfMesh>();
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (linePrimitives.has(primitive)) {
        owners.set(primitive, mesh);
      }
    }
  }
  return owners;
}

/**
 * Merge every LINES primitive in `document` into a single LINES primitive sitting under
 * a new node named {@link mergedEdgesNodeName} attached to the first scene. World matrices
 * of the source nodes are baked into the merged positions so the merged node carries the
 * identity transform — `applyFatLineSegments` on the UI side then wraps the single source
 * `LineSegments` into one `LineSegments2` per backend.
 *
 * Behaviour:
 *
 * - Empty document or no LINES primitives → returns `{ merged: false, segmentCount: 0 }`
 *   and leaves the document untouched (no work, no allocations).
 * - Indexed and non-indexed primitives are both honoured; segments are concatenated in
 *   traversal order (depth-first, scene children first).
 * - Shared meshes (`Node.getMesh()` returning the same `Mesh` from multiple `Node`s)
 *   contribute one transformed copy per node-instance — each world placement is
 *   captured before any mutation runs.
 * - Per-mesh LINES primitives are removed AFTER the merged primitive is constructed so
 *   the resulting document carries exactly one LINES primitive (the merged one), even
 *   when source meshes shared LINES primitives via node-instance reuse.
 * - When a captured primitive is missing a usable POSITION accessor or has unsupported
 *   index types, it is skipped but does not abort the merge.
 *
 * @param document - glTF document to mutate in place
 * @returns Information about whether and how much was merged
 */
export function mergeGltfLineSegments(document: Document): MergeGltfLineSegmentsResult {
  const scenes = document.getRoot().listScenes();
  const scene = scenes[0];
  if (!scene) {
    return { merged: false, segmentCount: 0 };
  }

  const captured: CapturedLinePrimitive[] = [];
  for (const root of scene.listChildren()) {
    captureLinePrimitives(root, captured);
  }

  if (captured.length === 0) {
    return { merged: false, segmentCount: 0 };
  }

  // Two-pass: count first so the final Float32Array can be allocated exactly once. The
  // resolve step is the single source of truth for "is this primitive usable", so both
  // passes agree and we never need to trim the output buffer.
  const resolved: Array<{ data: ResolvedLineData; worldMatrix: mat4 }> = [];
  let totalVertices = 0;
  for (const entry of captured) {
    const data = resolveLinePrimitive(entry.primitive);
    if (!data) {
      continue;
    }
    resolved.push({ data, worldMatrix: entry.worldMatrix });
    totalVertices += data.vertexCount;
  }

  if (totalVertices === 0) {
    return { merged: false, segmentCount: 0 };
  }

  const mergedPositions = new Float32Array(totalVertices * 3);
  let offset = 0;
  for (const { data, worldMatrix } of resolved) {
    offset = expandLinePrimitive({
      positions: data.positions,
      indices: data.indices,
      worldMatrix,
      output: mergedPositions,
      outputOffset: offset,
    });
  }

  const material = pickEdgeMaterial(captured);

  // Remove source LINES primitives. Use a Set to dedupe primitives that surface multiple
  // times via shared meshes (a single Primitive lives on a single Mesh, so the Set keys
  // by primitive identity).
  const uniqueLinePrimitives = new Set<Primitive>();
  for (const { primitive } of captured) {
    uniqueLinePrimitives.add(primitive);
  }
  const owners = buildPrimitiveOwnerMap(document, uniqueLinePrimitives);
  for (const primitive of uniqueLinePrimitives) {
    const mesh = owners.get(primitive);
    if (mesh) {
      mesh.removePrimitive(primitive);
    }
    primitive.dispose();
  }

  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const positionAccessor = document
    .createAccessor('tau-merged-edges-positions')
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(mergedPositions);

  const mergedPrimitive = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute('POSITION', positionAccessor);

  if (material) {
    mergedPrimitive.setMaterial(material);
  }

  const mergedMesh = document.createMesh(mergedEdgesNodeName).addPrimitive(mergedPrimitive);
  const mergedNode = document.createNode(mergedEdgesNodeName).setMesh(mergedMesh);
  scene.addChild(mergedNode);

  return { merged: true, segmentCount: totalVertices / 2 };
}
