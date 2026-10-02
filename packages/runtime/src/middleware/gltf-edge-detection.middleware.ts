import type { Document, Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { createNodeIo } from '@taucad/converter';
import type { GeometryGltf } from '@taucad/types';
import { z } from 'zod';
import { detectEdges } from '#utils/edge-detection.js';
import { mergeGltfLineSegments } from '#utils/merge-gltf-edges.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';

/**
 * Edge color in RGBA format (normalized 0-1).
 * Default: black
 */
const edgeColor: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Primitive mode for triangles in glTF.
 */
const primitiveModeTriangles = 4;

/**
 * Primitive mode for lines in glTF.
 */
const primitiveModeLines = 1;

/**
 * Create edge primitives for triangle meshes in a glTF document that don't already have edges.
 *
 * For each mesh that has no existing LINE primitives:
 * 1. Run edge detection to find sharp edges
 * 2. Create a new LINES primitive with the edge geometry
 * 3. Apply an unlit material with edge color
 *
 * Meshes that already contain LINE primitives (e.g., from replicad's meshEdges) are
 * skipped. Native kernel edges use exact CAD topology and are higher quality than
 * dihedral-angle detection on the tessellated mesh.
 *
 * @param document - The glTF document to process
 * @param thresholdDegrees - the dihedral angle threshold in degrees for edge detection
 * @returns Whether any edge primitives were added
 */
function addEdgePrimitivesToDocument(document: Document, thresholdDegrees: number): boolean {
  let edgesAdded = false;

  // Create unlit extension for edge materials (lazily initialized)
  let edgeMaterial: ReturnType<Document['createMaterial']> | undefined;

  function getEdgeMaterial(): ReturnType<Document['createMaterial']> {
    if (!edgeMaterial) {
      const unlitExtension = document.createExtension(KHRMaterialsUnlit);
      const unlit = unlitExtension.createUnlit();

      edgeMaterial = document
        .createMaterial('tau-edge-material')
        .setBaseColorFactor(edgeColor)
        .setMetallicFactor(0)
        .setRoughnessFactor(1)
        .setDoubleSided(true)
        .setExtension('KHR_materials_unlit', unlit);
    }

    return edgeMaterial;
  }

  // Process each mesh
  for (const mesh of document.getRoot().listMeshes()) {
    // Skip meshes that already have LINE primitives (e.g., from replicad's meshEdges).
    // Native kernel edges are higher quality than dihedral-angle detection
    // because they use exact CAD topology rather than tessellated approximation.
    const hasExistingLines = mesh.listPrimitives().some((p) => p.getMode() === primitiveModeLines);
    if (hasExistingLines) {
      continue;
    }

    const primitivesToAdd: Primitive[] = [];

    for (const primitive of mesh.listPrimitives()) {
      // Only process triangle primitives
      if (primitive.getMode() !== primitiveModeTriangles) {
        continue;
      }

      // Get position accessor
      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }

      const positions = positionAccessor.getArray();
      if (!(positions instanceof Float32Array)) {
        continue;
      }

      // Get index accessor (optional)
      const indexAccessor = primitive.getIndices();
      let indices: Uint32Array | Uint16Array | undefined;
      if (indexAccessor) {
        const indexArray = indexAccessor.getArray();
        if (indexArray instanceof Uint32Array || indexArray instanceof Uint16Array) {
          indices = indexArray;
        }
      }

      // Run edge detection
      const edgeResult = detectEdges(positions, indices, thresholdDegrees);

      // Skip if no edges detected
      if (edgeResult.positions.length === 0) {
        continue;
      }

      // Create edge primitive
      const edgePrimitive = document
        .createPrimitive()
        .setMode(primitiveModeLines)
        .setMaterial(getEdgeMaterial())
        .setAttribute(
          'POSITION',
          document.createAccessor('edge-positions').setType('VEC3').setArray(edgeResult.positions),
        )
        .setIndices(document.createAccessor('edge-indices').setType('SCALAR').setArray(edgeResult.indices));

      primitivesToAdd.push(edgePrimitive);
    }

    // Add edge primitives to mesh
    for (const edgePrimitive of primitivesToAdd) {
      mesh.addPrimitive(edgePrimitive);
      edgesAdded = true;
    }
  }

  return edgesAdded;
}

/**
 * Add edge primitives to a GLTF geometry, then merge every LINES primitive in the
 * document into a single `tau-merged-edges` mesh under the scene root.
 *
 * Stages:
 *
 * 1. {@link addEdgePrimitivesToDocument} runs dihedral edge detection on triangle meshes
 *    that lack native LINES primitives.
 * 2. {@link mergeGltfLineSegments} consolidates every remaining LINES primitive (both
 *    detection-generated and replicad's `meshEdges`-style native edges) into one
 *    primitive with world matrices baked into the positions.
 *
 * The merge step is responsible for the perf delta documented in
 * `docs/research/gltf-edges-fat-line-performance.md` — the UI fat-line conversion path
 * then wraps a single `LineSegments` into a single `LineSegments2`, collapsing N draw
 * calls (one per part in a CAD assembly) into one.
 *
 * If neither stage mutates the document (no triangle meshes needing detection AND no
 * pre-existing LINES primitives to merge), the original geometry is returned unchanged
 * to skip the @gltf-transform re-serialisation roundtrip.
 *
 * @param geometry - The GLTF geometry to process
 * @param thresholdDegrees - the dihedral angle threshold in degrees for edge detection
 * @returns The geometry with edges added + merged, or the original if no work was needed
 */
async function addEdgePrimitivesToGltf(geometry: GeometryGltf, thresholdDegrees: number): Promise<GeometryGltf> {
  const io = await createNodeIo();
  io.registerExtensions([KHRMaterialsUnlit]);

  const document = await io.readBinary(geometry.content);

  const hadEdgesAdded = addEdgePrimitivesToDocument(document, thresholdDegrees);
  const mergeResult = mergeGltfLineSegments(document);

  if (!hadEdgesAdded && !mergeResult.merged) {
    return geometry;
  }

  const transformedContent = await io.writeBinary(document);

  return {
    format: 'gltf',
    content: transformedContent,
  };
}

/**
 * Middleware that adds edge detection primitives to GLTF geometries.
 *
 * This middleware runs edge detection on all triangle meshes and adds LINES primitives
 * for sharp edges. The edge detection uses a dihedral angle threshold to identify
 * edges that should be rendered.
 *
 * Uses wrap-style hook - calls handler() then transforms on the "return journey".
 * This ensures the edge detection runs after geometry computation and before caching.
 *
 * The browser-side renderer identifies primitives by Three.js object type:
 * - Mesh objects are surfaces (matcap applied, visibility toggleable)
 * - LineSegments objects are edges (converted to LineSegments2 for fat line rendering)
 * @public
 */
export const gltfEdgeDetectionMiddleware = defineMiddleware({
  name: 'GltfEdgeDetection',

  optionsSchema: z.object({
    thresholdDegrees: z.number().default(30),
  }),

  async wrapCreateGeometry(input, handler, { logger, options }) {
    // Execute downstream (no pre-processing needed)
    const result = await handler(input);

    // Add edges on the way back up (onion model "return journey")
    if (!result.success || result.data.length === 0) {
      return result;
    }

    logger.trace('Adding edge primitives to GLTF geometries');

    // Process all GLTF geometries
    const processedGeometries = await Promise.all(
      result.data.map(async (geometry) => {
        // Only process GLTF format geometries
        if (geometry.format === 'gltf') {
          return addEdgePrimitivesToGltf(geometry, options.thresholdDegrees);
        }

        // Return other formats unchanged (e.g., SVG)
        return geometry;
      }),
    );

    return {
      ...result,
      data: processedGeometries,
    };
  },
});
