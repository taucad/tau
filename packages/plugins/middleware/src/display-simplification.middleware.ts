import { Primitive, WebIO } from '@gltf-transform/core';
import type { Document, Mesh, Node } from '@gltf-transform/core';
import { compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { allExtensions } from '@taucad/geometry-core';
import type { KernelIssue, RenderResult, RuntimeLogger, TessellationReport } from '@taucad/runtime/types';

import { z } from 'zod';

import { defineMiddleware } from '@taucad/runtime/middleware';

/**
 * Triangles a voxel display mesh may carry before preview and capture simplify it.
 *
 * The same 2,000,000-triangle preview budget OCCT kernels coarsen to
 * (`occtTriangleBudgets.preview` in `@taucad/occt-core`). It is kept here rather than imported so
 * this kernel-agnostic package takes no dependency on the OCCT support package.
 * @internal
 */
export const displaySimplificationMaxTriangles = 2_000_000;

/**
 * Largest surface deviation of a simplified display mesh, as a fraction of the voxel size.
 *
 * Half a voxel is below the resolution of the voxel grid the mesh came from, so the picture
 * changes and the part does not.
 * @internal
 */
export const displaySimplificationVoxelErrorRatio = 0.5;

/**
 * Fraction of the deviation bound handed to meshoptimizer as its target error.
 *
 * meshoptimizer's error is a quadric estimate, not a distance to the simplified surface. On a
 * 4.5 M-triangle gyroid lamp at 0.5 mm voxels, the measured deviation of every removed vertex from
 * the simplified surface stayed within the bound at a quarter of it (0.247 mm for a 0.25 mm bound)
 * and exceeded it at a third or more, so a quarter is used. The bound is measured, not proven.
 */
const simplifierTargetFraction = 0.25;

/**
 * Angle in degrees between a face and its vertex's averaged normal above which the vertex is
 * locked. The quadric metric lets a vertex slide along a crease at no cost, which on the lamp's
 * flat cut moved the surface up to 2.4 mm; locking crease vertices keeps every crease exact.
 */
const creaseLockDegrees = 30;

/** Issue producer named in `details.producer`. */
const producer = 'displaySimplification';

/** Millimetres per glTF unit: glTF positions are metres. */
const millimetresPerGltfUnit = 1000;

/**
 * Whether a tessellation report describes a voxel mesh. Only voxel kernels report the grid fields.
 *
 * @param report - The rendered view's tessellation report.
 * @returns Whether any voxel-only field is present.
 */
const isVoxelReport = (report: TessellationReport): boolean =>
  report.voxelSize !== undefined || report.activeVoxels !== undefined || report.memoryBytes !== undefined;

/**
 * Largest axis scale a node's world transform applies, so a local error bound stays a world bound.
 *
 * @param node - A node that draws the mesh.
 * @returns The largest column length of the world matrix's linear part.
 */
const worldScale = (node: Node): number => {
  const matrix = node.getWorldMatrix();
  return Math.max(
    Math.hypot(matrix[0], matrix[1], matrix[2]),
    Math.hypot(matrix[4], matrix[5], matrix[6]),
    Math.hypot(matrix[8], matrix[9], matrix[10]),
  );
};

/** Triangles and vertices removed from the delivered mesh, counted per drawn occurrence. */
type Removed = { triangles: number; vertices: number };

/**
 * Lock the vertices on creases: those where some adjacent face turns more than
 * {@link creaseLockDegrees} away from the vertex's area-weighted normal.
 *
 * @param positions - Vertex positions, three per vertex.
 * @param indices - Triangle indices, three per triangle.
 * @returns One flag per vertex, 1 where the vertex is locked.
 */
const lockCreaseVertices = (positions: Float32Array, indices: Uint32Array): Uint8Array<ArrayBuffer> => {
  const faceNormals = new Float32Array(indices.length);
  const vertexNormals = new Float32Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]! * 3;
    const b = indices[offset + 1]! * 3;
    const c = indices[offset + 2]! * 3;
    const abX = positions[b]! - positions[a]!;
    const abY = positions[b + 1]! - positions[a + 1]!;
    const abZ = positions[b + 2]! - positions[a + 2]!;
    const acX = positions[c]! - positions[a]!;
    const acY = positions[c + 1]! - positions[a + 1]!;
    const acZ = positions[c + 2]! - positions[a + 2]!;
    const normal = [abY * acZ - abZ * acY, abZ * acX - abX * acZ, abX * acY - abY * acX];
    for (const [axis, component] of normal.entries()) {
      faceNormals[offset + axis] = component;
      vertexNormals[a + axis]! += component;
      vertexNormals[b + axis]! += component;
      vertexNormals[c + axis]! += component;
    }
  }
  const threshold = Math.cos((creaseLockDegrees * Math.PI) / 180);
  const locked = new Uint8Array(positions.length / 3);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const faceX = faceNormals[offset]!;
    const faceY = faceNormals[offset + 1]!;
    const faceZ = faceNormals[offset + 2]!;
    const faceLength = Math.hypot(faceX, faceY, faceZ);
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices[offset + corner]!;
      const x = vertexNormals[vertex * 3]!;
      const y = vertexNormals[vertex * 3 + 1]!;
      const z = vertexNormals[vertex * 3 + 2]!;
      // A zero-area face or a cancelled vertex normal compares below any threshold and locks.
      if (!(faceX * x + faceY * y + faceZ * z >= threshold * faceLength * Math.hypot(x, y, z))) {
        locked[vertex] = 1;
      }
    }
  }
  return locked;
};

/**
 * Simplify one mesh's indexed triangle primitives in place, within an absolute error in metres.
 *
 * Simplification is meshoptimizer's quadric edge collapse, which keeps topology and never moves a
 * vertex: every kept vertex is an original one. Borders and creases are locked, and gltf-transform
 * reads, compacts and rewrites the primitive around it.
 *
 * @param input - The document that owns the mesh, the mesh, the nodes that draw it (each occurrence
 * counts in the tessellation report) and the largest deviation allowed, in world metres.
 * @returns Triangles and vertices removed across every occurrence.
 */
const simplifyMesh = (
  input: Readonly<{ document: Document; mesh: Mesh; nodes: readonly Node[]; maxErrorMetres: number }>,
): Removed => {
  const { document, mesh, nodes, maxErrorMetres } = input;
  const removed: Removed = { triangles: 0, vertices: 0 };
  const localError = (maxErrorMetres * simplifierTargetFraction) / Math.max(...nodes.map((node) => worldScale(node)));
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    const positions = primitive.getAttribute('POSITION')?.getArray();
    if (primitive.getMode() !== Primitive.Mode['TRIANGLES'] || !indices || !(positions instanceof Float32Array)) {
      continue;
    }
    const source = Uint32Array.from(indices.getArray()!);
    const vertices = positions.length / 3;
    const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
      source,
      positions,
      3,
      new Float32Array(0),
      0,
      [],
      lockCreaseVertices(positions, source),
      0,
      // The target error is relative to the mesh extent, the bounding box's longest side.
      Math.min(1, localError / MeshoptSimplifier.getScale(positions, 3)),
      ['LockBorder'],
    );
    primitive.setIndices(
      document.createAccessor().setType('SCALAR').setArray(new Uint32Array(simplified)).setBuffer(indices.getBuffer()),
    );
    if (indices.listParents().length === 1) {
      indices.dispose();
    }
    compactPrimitive(primitive);
    removed.triangles += ((source.length - simplified.length) / 3) * nodes.length;
    removed.vertices += (vertices - primitive.getAttribute('POSITION')!.getCount()) * nodes.length;
  }
  return removed;
};

/**
 * Simplify every eligible mesh in a GLB.
 *
 * A mesh annotated with `EXT_mesh_manifold` keeps its exact triangles, because its topology
 * annotation names them. A mesh no node draws is not shown and is left alone.
 *
 * @param content - GLB bytes.
 * @param maxErrorMetres - The largest deviation allowed, in world metres.
 * @returns The simplified GLB and what was removed, or the original bytes when nothing was.
 */
async function simplifyGlb(
  content: Uint8Array<ArrayBuffer>,
  maxErrorMetres: number,
): Promise<{ content: Uint8Array<ArrayBuffer>; removed: Removed }> {
  await MeshoptSimplifier.ready;
  const io = new WebIO().registerExtensions(allExtensions);
  const document: Document = await io.readBinary(content);
  const removed: Removed = { triangles: 0, vertices: 0 };
  for (const mesh of document.getRoot().listMeshes()) {
    const nodes = mesh.listParents().filter((parent): parent is Node => parent.propertyType === 'Node');
    if (nodes.length === 0 || mesh.getExtension('EXT_mesh_manifold')) {
      continue;
    }
    const meshRemoved = simplifyMesh({ document, mesh, nodes, maxErrorMetres });
    removed.triangles += meshRemoved.triangles;
    removed.vertices += meshRemoved.vertices;
  }
  if (removed.triangles === 0) {
    return { content, removed };
  }
  return { content: await io.writeBinary(document), removed };
}

/**
 * The warning a voxel render reports after its display mesh was simplified.
 *
 * @param options - Triangle counts, the bound used, the voxel size, the budget and the time taken.
 * @returns A `DISPLAY_SIMPLIFIED` warning.
 */
const createDisplaySimplifiedIssue = (options: {
  from: number;
  to: number;
  maxErrorMm: number;
  voxelSize: number;
  budget: number;
  elapsed: number;
}): KernelIssue => {
  const { from, to, maxErrorMm, voxelSize, budget } = options;
  const overBudget =
    to > budget ? ` It is still over the budget; a larger voxelSize lightens the preview and changes the part.` : '';
  return {
    message:
      `The display mesh had ${String(from)} triangles, over the ${String(budget)}-triangle preview budget, ` +
      `so preview and capture show it simplified to ${String(to)} triangles within ${String(maxErrorMm)} mm ` +
      `(half the ${String(voxelSize)} mm voxel size). voxelSize is unchanged, and exports and GeoSpec checks ` +
      `use the full mesh.${overBudget}`,
    code: 'DISPLAY_SIMPLIFIED',
    type: 'kernel',
    severity: 'warning',
    details: { producer, ...options },
  };
};

/**
 * The warning a voxel render reports when its display mesh is over budget but its voxel size is
 * unknown, so no deviation bound can be derived and the mesh is shown as produced.
 *
 * @param triangles - Triangles in the delivered mesh.
 * @param budget - The preview triangle budget.
 * @returns A `RESOURCE_LIMIT` warning.
 */
const createVoxelSizeUnknownIssue = (triangles: number, budget: number): KernelIssue => ({
  message:
    `The display mesh has ${String(triangles)} triangles, over the ${String(budget)}-triangle preview budget, ` +
    `and was not simplified because the render did not report its voxel size. ` +
    `A larger voxelSize lightens the preview and changes the part.`,
  code: 'RESOURCE_LIMIT',
  type: 'kernel',
  severity: 'warning',
  details: { producer, triangles, budget, reason: 'voxelSize-unknown' },
});

/**
 * Simplify a voxel render's display mesh when it exceeds the budget, and report it.
 *
 * Passes through, byte for byte, every failed render, every non-GLB artifact, every artifact
 * without a voxel tessellation report and every voxel mesh within the budget.
 *
 * @param result - The render result returned by the wrapped handler.
 * @param budget - The preview triangle budget.
 * @param logger - Runtime logger for the active middleware operation.
 * @returns The original result, or one carrying the simplified mesh, its counts and the issue.
 */
async function simplifyDisplayResult(
  result: RenderResult,
  budget: number,
  logger: RuntimeLogger,
): Promise<RenderResult> {
  if (!result.success) {
    return result;
  }
  const { data } = result;
  const report = data.tessellation;
  if (
    data.mimeType !== 'model/gltf-binary' ||
    !(data.content instanceof Uint8Array) ||
    !report ||
    !isVoxelReport(report) ||
    report.triangles <= budget
  ) {
    return result;
  }
  if (report.voxelSize === undefined) {
    logger.warn(`Voxel display mesh has ${String(report.triangles)} triangles but no voxel size; not simplified`);
    return { ...result, issues: [...result.issues, createVoxelSizeUnknownIssue(report.triangles, budget)] };
  }

  const maxErrorMm = report.voxelSize * displaySimplificationVoxelErrorRatio;
  const started = performance.now();
  const simplified = await simplifyGlb(data.content, maxErrorMm / millimetresPerGltfUnit);
  const elapsed = performance.now() - started;
  const to = report.triangles - simplified.removed.triangles;
  logger.debug(`Simplified voxel display mesh from ${String(report.triangles)} to ${String(to)} triangles`);

  return {
    ...result,
    data: {
      ...data,
      content: simplified.content,
      tessellation: {
        ...report,
        triangles: to,
        vertices: report.vertices - simplified.removed.vertices,
      },
    },
    issues: [
      ...result.issues,
      createDisplaySimplifiedIssue({
        from: report.triangles,
        to,
        maxErrorMm,
        voxelSize: report.voxelSize,
        budget,
        elapsed,
      }),
    ],
  };
}

/**
 * Simplify over-budget voxel display meshes for preview and capture.
 *
 * Voxel kernels keep the author's voxel size, so a dense model can render millions of triangles.
 * When a render's tessellation report names a voxel mesh above `maxTriangles`, this middleware
 * collapses edges within half a voxel (meshoptimizer through gltf-transform, topology kept, borders
 * locked), updates the report's counts to the delivered mesh and adds a `DISPLAY_SIMPLIFIED`
 * warning carrying `{ from, to, maxErrorMm }`. It wraps render only: exports, and so GeoSpec
 * subjects, keep the full mesh byte for byte.
 *
 * Register it after `gltfEdgeDetection` so it sits closer to the kernel and any fallback edge pass
 * runs on the smaller mesh.
 * @public
 */
export const displaySimplification = defineMiddleware({
  id: 'displaySimplification',
  name: 'DisplaySimplification',
  version: '1.0.0',

  optionsSchema: z.object({
    maxTriangles: z.number().int().positive().default(displaySimplificationMaxTriangles),
  }),

  async wrapRender(input, handler, { logger, options }) {
    return simplifyDisplayResult(await handler(input), options.maxTriangles, logger);
  },
});
