import type { Document, Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { createNodeIo } from '@taucad/converter';
import type { GeometryGltf } from '@taucad/types';
import { cadEdgeOverlayMaterialDefaults } from '@taucad/types/constants';
import { z } from 'zod';
import { detectEdges } from '#utils/edge-detection.js';
import type { CreateGeometryResult } from '#types/runtime.types.js';
import type { RuntimeLogger } from '#types/runtime-kernel.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';

/**
 * Primitive mode for triangles in glTF.
 */
const primitiveModeTriangles = 4;

/**
 * Primitive mode for lines in glTF.
 */
const primitiveModeLines = 1;

/**
 * Create fallback edge primitives for every eligible triangle mesh in a glTF document.
 *
 * For each triangle primitive:
 * 1. Run edge detection to find sharp edges
 * 2. Create a new LINES primitive with the edge geometry
 * 3. Apply an unlit material with edge color
 *
 * Existing LINE primitives are preserved. The planner normally prefers a
 * kernel-native edge route and therefore does not select this fallback there;
 * once fallback is selected, authored lines do not prove that every triangle
 * primitive already carries a complete auxiliary overlay.
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
        .setBaseColorFactor([...cadEdgeOverlayMaterialDefaults.baseColorFactor])
        .setMetallicFactor(cadEdgeOverlayMaterialDefaults.metallicFactor)
        .setRoughnessFactor(cadEdgeOverlayMaterialDefaults.roughnessFactor)
        .setDoubleSided(cadEdgeOverlayMaterialDefaults.doubleSided)
        .setAlphaMode(cadEdgeOverlayMaterialDefaults.alphaMode)
        .setExtension('KHR_materials_unlit', unlit);
    }

    return edgeMaterial;
  }

  // Process each mesh
  for (const mesh of document.getRoot().listMeshes()) {
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
      edgePrimitive.setExtras({ ...primitive.getExtras() });

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
 * Add edge primitives to a GLTF geometry while preserving component ownership.
 *
 * Generated LINES primitives are appended to the same mesh as their source
 * TRIANGLES primitive. Existing LINES primitives remain in place, because they
 * usually come from native CAD topology and already belong to their source mesh.
 *
 * If no triangle meshes need generated edges, the original geometry is returned
 * unchanged to skip the @gltf-transform re-serialisation roundtrip.
 *
 * @param geometry - The GLTF geometry to process
 * @param thresholdDegrees - the dihedral angle threshold in degrees for edge detection
 * @returns The geometry with owner-local edges added, or the original if no work was needed
 */
async function addEdgePrimitivesToGltf(geometry: GeometryGltf, thresholdDegrees: number): Promise<GeometryGltf> {
  const io = await createNodeIo();
  io.registerExtensions([KHRMaterialsUnlit]);

  const document = await io.readBinary(geometry.content);

  const hadEdgesAdded = addEdgePrimitivesToDocument(document, thresholdDegrees);
  if (!hadEdgesAdded) {
    return geometry;
  }

  const transformedContent = await io.writeBinary(document);

  return {
    format: 'gltf',
    content: transformedContent,
  };
}

/**
 * Middleware that adds fallback edge detection primitives to GLTF geometries.
 *
 * This middleware runs edge detection on triangle meshes that do not already carry
 * kernel-owned LINES primitives. Topology-aware kernels should emit owner-local
 * lines first; this path is triangle-only fallback inference using a dihedral
 * angle threshold.
 *
 * Uses wrap-style hook - calls handler() then transforms on the "return journey".
 * This ensures the edge detection runs after geometry computation and before caching.
 *
 * The browser-side renderer identifies primitives by Three.js object type:
 * - Mesh objects are surfaces (matcap applied, visibility toggleable)
 * - LineSegments objects are edges (converted to LineSegments2 for fat line rendering)
 * @param result - Geometry result returned by the wrapped operation.
 * @param thresholdDegrees - Minimum triangle-normal angle classified as an edge.
 * @param logger - Runtime logger for the active middleware operation.
 * @returns The original result or a GLTF result enriched with line primitives.
 */
async function addEdgesToResult<Result extends CreateGeometryResult>(
  result: Result,
  thresholdDegrees: number,
  logger: RuntimeLogger,
): Promise<Result> {
  // Add edges on the way back up (onion model "return journey")
  if (!result.success || result.data?.format !== 'gltf') {
    return result;
  }

  logger.trace('Adding edge primitives to GLTF geometry');

  return {
    ...result,
    data: await addEdgePrimitivesToGltf(result.data, thresholdDegrees),
  };
}

/** Add fallback GLTF edge primitives only when the selected route requests them. @public */
export const gltfEdgeDetection = defineMiddleware({
  id: 'gltfEdgeDetection',
  name: 'GltfEdgeDetection',
  version: '2.0.0',
  content: {
    render: ['includeEdges'],
    exportFormats: { glb: ['includeEdges'], gltf: ['includeEdges'] },
  },

  optionsSchema: z.object({
    thresholdDegrees: z.number().default(30),
  }),

  async wrapCreateGeometry(input, handler, { logger, options }) {
    const result = await handler(input);
    return input.content?.includeEdges ? addEdgesToResult(result, options.thresholdDegrees, logger) : result;
  },

  // Display GLTF from kernels that defer tessellation flows through the mesh
  // phase, so the fallback edge primitives are added there too.
  async wrapMeshGeometry(input, handler, { logger, options }) {
    const result = await handler(input);
    return input.content?.includeEdges ? addEdgesToResult(result, options.thresholdDegrees, logger) : result;
  },

  async wrapExportGeometry(input, handler, { logger, options }) {
    const result = await handler(input);
    if (!input.content?.includeEdges || !result.success) {
      return result;
    }

    const files = await Promise.all(
      result.data.map(async (file) => {
        if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
          return file;
        }
        const geometry = await addEdgePrimitivesToGltf(
          { format: 'gltf', content: file.bytes },
          options.thresholdDegrees,
        );
        return { ...file, bytes: geometry.content };
      }),
    );
    logger.trace('Added edge primitives to exported GLTF');
    return { ...result, data: files };
  },
});
