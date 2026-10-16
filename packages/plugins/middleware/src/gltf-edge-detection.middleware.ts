// oxlint-disable-next-line import/consistent-type-specifier-style -- a separate type import trips import/no-duplicates.
import { Primitive, WebIO, type Document, type JSONDocument } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { allExtensions, detectEdges, embedGltfResources } from '@taucad/geometry-core';
import { cadEdgeOverlayMaterialDefaults } from '@taucad/runtime/types';
import type { RenderResult, RuntimeLogger } from '@taucad/runtime/types';

import { z } from 'zod';

import { defineMiddleware } from '@taucad/runtime/middleware';
import { nonemptyExportFiles } from '@taucad/runtime/kernel';

/**
 * Largest triangle primitive the render-phase fallback edge detector processes.
 *
 * The dihedral detector is linear in triangles but dominates render time on
 * dense meshes; render primitives above this count are left without generated
 * edges and the skip is logged. Export keeps detecting edges on every
 * primitive so explicit export bytes stay stable.
 * @internal
 */
export const gltfEdgeDetectionMaxTriangles = 500_000;

/**
 * Read the positions and supported indices of a triangle primitive.
 *
 * @param primitive - The glTF primitive to inspect
 * @returns Float32 positions with Uint16/Uint32 indices, or undefined when the primitive is not an eligible triangle mesh
 */
function readTriangleInput(
  primitive: Primitive,
): { positions: Float32Array; indices: Uint32Array | Uint16Array | undefined } | undefined {
  if (primitive.getMode() !== Primitive.Mode['TRIANGLES']) {
    return undefined;
  }
  const positions = primitive.getAttribute('POSITION')?.getArray();
  if (!(positions instanceof Float32Array)) {
    return undefined;
  }
  const indexArray = primitive.getIndices()?.getArray();
  const indices = indexArray instanceof Uint32Array || indexArray instanceof Uint16Array ? indexArray : undefined;
  return { positions, indices };
}

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
 * Triangle primitives above `maxTriangles` are skipped, one warning each.
 *
 * @param document - The glTF document to process
 * @param thresholdDegrees - the dihedral angle threshold in degrees for edge detection
 * @param budget - Optional per-primitive triangle limit and the logger that reports skips
 * @returns Whether any edge primitives were added
 */
function addEdgePrimitivesToDocument(
  document: Document,
  thresholdDegrees: number,
  budget?: { maxTriangles: number; logger: RuntimeLogger },
): boolean {
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
        .setExtension(KHRMaterialsUnlit.EXTENSION_NAME, unlit);
    }

    return edgeMaterial;
  }

  // Process each source mesh. Newly created sibling edge meshes are not inputs.
  const sourceMeshes = document.getRoot().listMeshes();
  for (const mesh of sourceMeshes) {
    const primitivesToAdd: Primitive[] = [];

    for (const primitive of mesh.listPrimitives()) {
      const triangles = readTriangleInput(primitive);
      if (!triangles) {
        continue;
      }
      const { positions, indices } = triangles;

      const triangleCount = Math.floor((indices?.length ?? positions.length / 3) / 3);
      if (budget && triangleCount > budget.maxTriangles) {
        budget.logger.warn(
          `Skipping fallback edge detection for a primitive with ${triangleCount} triangles (limit ${budget.maxTriangles})`,
        );
        continue;
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
        .setMode(Primitive.Mode['LINES']!)
        .setMaterial(getEdgeMaterial())
        .setAttribute(
          'POSITION',
          document.createAccessor('edge-positions').setType('VEC3').setArray(edgeResult.positions),
        );
      edgePrimitive.setExtras({ ...primitive.getExtras() });

      primitivesToAdd.push(edgePrimitive);
    }

    if (primitivesToAdd.length === 0) {
      continue;
    }

    if (mesh.getExtension('EXT_mesh_manifold')) {
      const edgeMesh = document.createMesh(`${mesh.getName() || 'mesh'} edges`);
      for (const edgePrimitive of primitivesToAdd) {
        edgeMesh.addPrimitive(edgePrimitive);
      }
      for (const node of document
        .getRoot()
        .listNodes()
        .filter((candidate) => candidate.getMesh() === mesh)) {
        node.addChild(
          document
            .createNode(`${node.getName() || mesh.getName() || 'mesh'} edges`)
            .setMesh(edgeMesh)
            .setExtras({ ...node.getExtras() }),
        );
      }
    } else {
      for (const edgePrimitive of primitivesToAdd) {
        mesh.addPrimitive(edgePrimitive);
      }
    }
    edgesAdded = true;
  }

  return edgesAdded;
}

/**
 * Add edge primitives to a GLTF geometry while preserving component ownership.
 *
 * Generated LINES primitives are appended to the source mesh unless that mesh
 * carries `EXT_mesh_manifold`. Annotated surface meshes keep TRIANGLES only;
 * their lines use an identity child node so component visibility and transforms
 * remain shared without invalidating the topology extension.
 *
 * If no triangle meshes need generated edges, the original geometry is returned
 * unchanged to skip the @gltf-transform re-serialisation roundtrip.
 *
 * @param content - The GLB or JSON glTF bytes to process
 * @param thresholdDegrees - the dihedral angle threshold in degrees for edge detection
 * @param options - Export resources, output format and the optional per-primitive triangle budget
 * @returns The requested glTF format with owner-local edges added, or the original if no work was needed
 */
async function addEdgePrimitivesToGltf(
  content: Uint8Array<ArrayBuffer>,
  thresholdDegrees: number,
  {
    resources = {},
    outputFormat = 'glb',
    budget,
  }: {
    resources?: JSONDocument['resources'];
    outputFormat?: 'glb' | 'gltf';
    budget?: { maxTriangles: number; logger: RuntimeLogger };
  } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const io = new WebIO().registerExtensions(allExtensions);
  io.registerExtensions([KHRMaterialsUnlit]);

  const binary =
    content.length >= 4 &&
    new DataView(content.buffer, content.byteOffset, content.byteLength).getUint32(0, true) === 0x46_54_6c_67;
  const document = binary
    ? await io.readBinary(content)
    : await io.readJSON({
        json: JSON.parse(new TextDecoder().decode(content)) as JSONDocument['json'],
        resources,
      });

  if (!addEdgePrimitivesToDocument(document, thresholdDegrees, budget)) {
    return content;
  }
  if (outputFormat === 'gltf') {
    const output = await io.writeJSON(document);
    const json = embedGltfResources(output.json as unknown as Record<string, unknown>, output.resources);
    return new TextEncoder().encode(JSON.stringify(json));
  }
  return io.writeBinary(document);
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
async function addEdgesToResult(
  result: RenderResult,
  thresholdDegrees: number,
  logger: RuntimeLogger,
): Promise<RenderResult> {
  // Add edges on the way back up (onion model "return journey")
  if (!result.success || result.data.mimeType !== 'model/gltf-binary' || !(result.data.content instanceof Uint8Array)) {
    return result;
  }

  logger.trace('Adding edge primitives to GLTF geometry');

  const content = await addEdgePrimitivesToGltf(result.data.content, thresholdDegrees, {
    budget: { maxTriangles: gltfEdgeDetectionMaxTriangles, logger },
  });
  if (content === result.data.content) {
    return result;
  }

  return {
    ...result,
    data: {
      ...result.data,
      content,
    },
  };
}

/** Add fallback GLTF edge primitives only when the selected route requests them. @public */
export const gltfEdgeDetection = defineMiddleware({
  id: 'gltfEdgeDetection',
  name: 'GltfEdgeDetection',
  version: '3.0.0',
  content: {
    views: { 'model/gltf-binary': ['includeEdges'] },
    exports: { glb: ['includeEdges'], gltf: ['includeEdges'] },
  },

  optionsSchema: z.object({
    thresholdDegrees: z.number().default(30),
  }),

  // Every display artifact is produced by render, including kernels that
  // formerly returned GLB bytes directly from createGeometry.
  async wrapRender(input, handler, { logger, options }) {
    const result = await handler(input);
    return input.content?.includeEdges ? addEdgesToResult(result, options.thresholdDegrees, logger) : result;
  },

  async wrapExport(input, handler, { logger, options }) {
    const result = await handler(input);
    if (!input.content?.includeEdges || !result.success) {
      return result;
    }

    const resources = Object.fromEntries(result.data.map((file) => [file.name, file.bytes]));
    const files = await Promise.all(
      result.data.map(async (file) => {
        if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
          return file;
        }
        const bytes = await addEdgePrimitivesToGltf(file.bytes, options.thresholdDegrees, {
          resources,
          outputFormat: file.name.endsWith('.gltf') ? 'gltf' : 'glb',
        });
        return bytes === file.bytes ? file : { ...file, bytes };
      }),
    );
    logger.trace('Added edge primitives to exported GLTF');
    if (files.every((file, index) => file === result.data[index])) {
      return result;
    }
    return { ...result, data: nonemptyExportFiles(files) };
  },
});
