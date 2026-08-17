import type { Document, Node as GltfNode } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { inspect } from '@gltf-transform/functions';
import type { InspectReport } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { allExtensions } from '#gltf.extensions.js';

// ============================================================================
// gltf-transform Utility Functions
// ============================================================================

/**
 * Creates a NodeIO instance pre-configured with all glTF extensions and Draco codecs.
 *
 * @returns A ready-to-use NodeIO for reading and writing glTF documents.
 * @public
 */
export const createNodeIo = async (): Promise<NodeIO> => {
  return new NodeIO().registerExtensions(allExtensions).registerDependencies({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- draco3d uses this format
    'draco3d.decoder': await draco3d.createDecoderModule({
      locateFile: () => new URL('assets/draco3d/gltf/draco_decoder_gltf.wasm', import.meta.url).href,
    }),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- draco3d uses this format
    'draco3d.encoder': await draco3d.createEncoderModule({
      locateFile: () => new URL('assets/draco3d/gltf/draco_encoder.wasm', import.meta.url).href,
    }),
  });
};

/**
 * Converts a GLB buffer into a gltf-transform Document for inspection or manipulation.
 *
 * @param glbData - the raw GLB buffer to parse
 * @returns The parsed gltf-transform Document.
 * @public
 */
export const glbToDocument = async (glbData: Uint8Array<ArrayBuffer>): Promise<Document> => {
  const io = await createNodeIo();
  return io.readBinary(glbData);
};

/**
 * Produces a gltf-transform InspectReport from raw GLB data.
 *
 * @param glbData - the raw GLB buffer to inspect
 * @returns The inspection report containing mesh, material, and texture statistics.
 * @public
 */
export const getInspectReport = async (glbData: Uint8Array<ArrayBuffer>): Promise<InspectReport> => {
  const document = await glbToDocument(glbData);
  return inspect(document);
};

/**
 * Validates that a GLB buffer has a non-empty body and a correct magic header.
 *
 * @param glb - the raw GLB buffer to validate
 * @throws Error if the buffer is empty or the header is not `glTF`
 * @public
 */
export const validateGlbData = (glb: Uint8Array<ArrayBuffer>): void => {
  if (glb.length === 0) {
    throw new Error('GLB data cannot be empty');
  }

  // Basic GLB header validation (first 4 bytes should be 'glTF')
  if (glb.length >= 4) {
    const header = new TextDecoder().decode(glb.slice(0, 4));
    if (header !== 'glTF') {
      throw new Error('Invalid GLB header - expected "glTF"');
    }
  }
};

// ============================================================================
// Inspect Report Analysis Utilities
// ============================================================================

/**
 * Extracts aggregate geometry statistics (vertex, face, and mesh counts) from an InspectReport.
 *
 * @param report - the gltf-transform inspection report to summarize
 * @returns An object with `vertexCount`, `faceCount`, and `meshCount`.
 * @public
 */
export const getGeometryStatsFromInspect = (
  report: InspectReport,
): {
  vertexCount: number;
  faceCount: number;
  meshCount: number;
} => {
  const totalVertices = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const totalFaces = Math.round(totalVertices / 3); // Assuming triangulation
  const meshCount = report.meshes.properties.length;

  return { vertexCount: totalVertices, faceCount: totalFaces, meshCount };
};

/**
 * Extracts bounding box size and center from the first scene in an InspectReport.
 *
 * @param report - the gltf-transform inspection report
 * @returns The bounding box `size` and `center`, or `undefined` if no scene is present.
 * @public
 */
export const getBoundingBoxFromInspect = (
  report: InspectReport,
):
  | {
      size: [number, number, number];
      center: [number, number, number];
    }
  | undefined => {
  if (report.scenes.properties.length === 0) {
    return undefined;
  }

  const scene = report.scenes.properties[0]!;

  if (scene.bboxMax.length < 3 || scene.bboxMin.length < 3) {
    return undefined;
  }

  const size: [number, number, number] = [
    scene.bboxMax[0]! - scene.bboxMin[0]!,
    scene.bboxMax[1]! - scene.bboxMin[1]!,
    scene.bboxMax[2]! - scene.bboxMin[2]!,
  ];

  const center: [number, number, number] = [
    (scene.bboxMax[0]! + scene.bboxMin[0]!) / 2,
    (scene.bboxMax[1]! + scene.bboxMin[1]!) / 2,
    (scene.bboxMax[2]! + scene.bboxMin[2]!) / 2,
  ];

  return { size, center };
};

/**
 * Creates a geometry signature from an InspectReport for comparison purposes.
 *
 * @param report - the gltf-transform inspection report
 * @returns A signature object with vertex, face, mesh counts and optional bounding box.
 * @public
 */
export const createInspectSignature = (
  report: InspectReport,
): {
  vertexCount: number;
  faceCount: number;
  meshCount: number;
  boundingBox?: {
    size: [number, number, number];
    center: [number, number, number];
  };
} => {
  const stats = getGeometryStatsFromInspect(report);
  const boundingBox = getBoundingBoxFromInspect(report);

  return {
    vertexCount: stats.vertexCount,
    faceCount: stats.faceCount,
    meshCount: stats.meshCount,
    boundingBox,
  };
};

/**
 * Checks whether a mesh entry in an InspectReport contains the given attribute type.
 *
 * @param mesh - a single mesh property entry from an InspectReport
 * @param attributeType - the attribute name to search for (case-insensitive substring match)
 * @returns `true` if the mesh has a matching attribute.
 * @public
 */
export const hasAttribute = (mesh: InspectReport['meshes']['properties'][0], attributeType: string): boolean => {
  return mesh.attributes.some((attribute) => attribute.toLowerCase().includes(attributeType.toLowerCase()));
};

/**
 * Returns the number of materials in an InspectReport.
 *
 * @param report - the gltf-transform inspection report
 * @returns number of distinct materials referenced in the document
 * @public
 */
export const getMaterialCount = (report: InspectReport): number => {
  return report.materials.properties.length;
};

/**
 * Returns the number of textures in an InspectReport.
 *
 * @param report - the gltf-transform inspection report
 * @returns number of texture images referenced in the document
 * @public
 */
export const getTextureCount = (report: InspectReport): number => {
  return report.textures.properties.length;
};

// ============================================================================
// GLTF Document Structure Analysis Utilities
// ============================================================================

/**
 * Top-level GLTF scene hierarchy used for structural validation of GLB documents.
 *
 * @public
 */
export type GltfSceneStructure = {
  rootNodes: readonly GltfNodeInfo[];
};

/**
 * Individual GLTF node with a human-readable type classification (MeshNode, SkinNode, ContainerNode).
 *
 * @public
 */
export type GltfNodeInfo = {
  name?: string;
  type: 'MeshNode' | 'SkinNode' | 'ContainerNode';
  children?: GltfNodeInfo[];
};

/**
 * Analyzes GLB data and returns the scene node hierarchy for structural inspection.
 *
 * @param glbData - the raw GLB buffer to analyze
 * @returns The scene structure with classified root nodes.
 * @throws Error if no scene is found in the GLB document
 * @public
 */
export const getDocumentStructure = async (glbData: Uint8Array<ArrayBuffer>): Promise<GltfSceneStructure> => {
  const document = await glbToDocument(glbData);
  const root = document.getRoot();
  const scene = root.listScenes()[0];

  if (!scene) {
    throw new Error('No scene found in GLB document');
  }

  // Build root nodes hierarchy
  const rootNodes = scene.listChildren().map((child) => convertNodeToInfo(child));

  return {
    rootNodes,
  };
};

/**
 * Convert GLTF node to node info using human-readable types
 *
 * @param node - the glTF node to convert
 * @returns the converted node info
 */
function convertNodeToInfo(node: GltfNode): GltfNodeInfo {
  const mesh = node.getMesh();
  const skin = node.getSkin();
  const children = node.listChildren();

  // Determine node type based on content
  let nodeType: 'MeshNode' | 'SkinNode' | 'ContainerNode';
  if (skin !== null) {
    nodeType = 'SkinNode';
  } else if (mesh === null) {
    nodeType = 'ContainerNode';
  } else {
    nodeType = 'MeshNode';
  }

  const nodeInfo: GltfNodeInfo = {
    name: node.getName(),
    type: nodeType,
  };

  // Process children recursively
  if (children.length > 0) {
    nodeInfo.children = children.map((child) => convertNodeToInfo(child));
  }

  return nodeInfo;
}

/**
 * Simplified hierarchy representation for easy comparison
 */
type SimpleHierarchy = {
  type: string;
  name?: string;
  children: SimpleHierarchy[];
};

/**
 * Convert GLTF node to simple hierarchy for comparison
 * Names are included for readable output but ignored in JSON comparison
 *
 * @param node - the glTF node info to convert
 * @param includeNames - whether to include node names in the output
 * @returns the simplified hierarchy representation
 */
function nodeToSimpleHierarchy(node: GltfNodeInfo, includeNames = true): SimpleHierarchy {
  return {
    type: node.type,
    ...(includeNames && node.name && { name: node.name }),
    children: node.children?.map((child) => nodeToSimpleHierarchy(child, includeNames)) ?? [],
  };
}

/**
 * Convert GLTF scene structure to simple hierarchy for comparison
 *
 * @param scene - the glTF scene structure to convert
 * @returns the array of simplified hierarchy trees
 */
function sceneToSimpleHierarchy(scene: GltfSceneStructure): SimpleHierarchy[] {
  return scene.rootNodes.map((node) => nodeToSimpleHierarchy(node));
}

/**
 * Convert SimpleHierarchy back to GltfNodeInfo for reprocessing
 *
 * @param simple - the simplified hierarchy node to convert back
 * @returns the reconstructed glTF node info
 */
function convertSimpleToGltf(simple: SimpleHierarchy): GltfNodeInfo {
  return {
    type: simple.type as GltfNodeInfo['type'],
    ...(simple.name && { name: simple.name }),
    ...(simple.children.length > 0 && {
      children: simple.children.map((child) => convertSimpleToGltf(child)),
    }),
  };
}

/**
 * Format hierarchy for readable error messages
 *
 * @param hierarchy - the hierarchy nodes to format
 * @param indent - the current indentation level
 * @returns the formatted string representation
 */
function formatHierarchy(hierarchy: SimpleHierarchy[], indent = 0): string {
  return hierarchy
    .map((node) => {
      const padding = '  '.repeat(indent);
      const name = node.name ? ` (${node.name})` : '';
      const childrenString = node.children.length > 0 ? '\n' + formatHierarchy(node.children, indent + 1) : '';
      return `${padding}${node.type}${name}${childrenString}`;
    })
    .join('\n');
}

/**
 * Asserts that two GLTF scene structures are structurally equivalent (ignoring node names).
 *
 * @param actual - the scene structure produced by the loader under test
 * @param expected - the reference scene structure to compare against
 * @throws Error with a formatted diff if the structures do not match
 * @public
 */
export const validateGltfScene = (actual: GltfSceneStructure, expected: GltfSceneStructure): void => {
  // Compare structures without names (names are optional and added by loaders)
  const actualHierarchy = sceneToSimpleHierarchy(actual);
  const expectedHierarchy = sceneToSimpleHierarchy(expected);

  // Create comparison versions without names for structural equality
  const actualForComparison = actualHierarchy.map((node) => nodeToSimpleHierarchy(convertSimpleToGltf(node), false));
  const expectedForComparison = expectedHierarchy.map((node) =>
    nodeToSimpleHierarchy(convertSimpleToGltf(node), false),
  );

  // Use JSON comparison for deep equality check (without names)
  const actualJson = JSON.stringify(actualForComparison, null, 2);
  const expectedJson = JSON.stringify(expectedForComparison, null, 2);

  if (actualJson !== expectedJson) {
    const actualFormatted = formatHierarchy(actualHierarchy);
    const expectedFormatted = formatHierarchy(expectedHierarchy);

    throw new Error(
      `GLTF structure mismatch:\n\n` +
        `Expected:\n${expectedFormatted}\n\n` +
        `Actual:\n${actualFormatted}\n\n` +
        `Structures compared without names for equality.\n\n` +
        `Expected JSON:\n${expectedJson}\n\n` +
        `Actual JSON:\n${actualJson}`,
    );
  }
};
