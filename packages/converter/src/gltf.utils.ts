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
 * Create a NodeIO instance for gltf-transform operations
 */
export const createNodeIO = async (): Promise<NodeIO> => {
  return new NodeIO().registerExtensions(allExtensions).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
};

/**
 * Convert GLB data to gltf-transform Document
 */
export const glbToDocument = async (glbData: Uint8Array): Promise<Document> => {
  const io = await createNodeIO();
  return io.readBinary(glbData);
};

/**
 * Get inspect report from GLB data
 */
export const getInspectReport = async (glbData: Uint8Array): Promise<InspectReport> => {
  const document = await glbToDocument(glbData);
  return inspect(document);
};

/**
 * Validate that GLB data is properly formatted.
 */
export const validateGlbData = (glb: Uint8Array): void => {
  if (!glb || glb.length === 0) {
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
 * Extract geometry statistics from an InspectReport
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
 * Extract bounding box information from an InspectReport
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

  if (!scene.bboxMax || !scene.bboxMin || scene.bboxMax.length < 3 || scene.bboxMin.length < 3) {
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
 * Create a geometry signature from an InspectReport for comparison purposes
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
 * Check if a mesh has a specific attribute type
 */
export const hasAttribute = (mesh: InspectReport['meshes']['properties'][0], attributeType: string): boolean => {
  return mesh.attributes.some((attr) => attr.toLowerCase().includes(attributeType.toLowerCase()));
};

/**
 * Get material count from InspectReport
 */
export const getMaterialCount = (report: InspectReport): number => {
  return report.materials.properties.length;
};

/**
 * Get texture count from InspectReport
 */
export const getTextureCount = (report: InspectReport): number => {
  return report.textures.properties.length;
};

// ============================================================================
// GLTF Document Structure Analysis Utilities
// ============================================================================

/**
 * Represents GLTF scene structure for pure GLTF validation
 */
export type GltfSceneStructure = {
  rootNodes: readonly GltfNodeInfo[];
};

/**
 * Represents individual GLTF node information with human-readable types
 */
export type GltfNodeInfo = {
  name?: string;
  type: 'MeshNode' | 'SkinNode' | 'ContainerNode';
  children?: GltfNodeInfo[];
};

/**
 * Analyze GLTF Document structure and return scene hierarchy
 */
export const getDocumentStructure = async (glbData: Uint8Array): Promise<GltfSceneStructure> => {
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
    name: node.getName ? node.getName() : undefined,
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
 */
function sceneToSimpleHierarchy(scene: GltfSceneStructure): SimpleHierarchy[] {
  return scene.rootNodes.map((node) => nodeToSimpleHierarchy(node));
}

/**
 * Convert SimpleHierarchy back to GltfNodeInfo for reprocessing
 */
function convertSimpleToGltf(simple: SimpleHierarchy): GltfNodeInfo {
  return {
    type: simple.type as GltfNodeInfo['type'],
    ...(simple.name && { name: simple.name }),
    ...(simple.children.length > 0 && { children: simple.children.map(convertSimpleToGltf) }),
  };
}

/**
 * Format hierarchy for readable error messages
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
 * Validate GLTF scene structure matches expected structure using hierarchy comparison
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
