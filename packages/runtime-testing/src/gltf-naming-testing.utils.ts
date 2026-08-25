import { createNodeIo } from '@taucad/geometry-core';

/**
 * Extracted names from a GLB used by cross-kernel naming contract tests.
 *
 * @public
 */
export type GltfNamingSummary = {
  nodeNames: string[];
  meshNames: string[];
  materialNames: string[];
  sceneNames: string[];
};

/**
 * Read user-visible geometry names from GLB bytes.
 *
 * @param bytes - GLB bytes to inspect.
 * @returns A summary of node, mesh, material, and scene names.
 * @public
 */
export async function readGltfNamingSummary(bytes: Uint8Array<ArrayBuffer>): Promise<GltfNamingSummary> {
  const io = await createNodeIo();
  const document = await io.readBinary(bytes);
  return {
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    meshNames: document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
    materialNames: document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName()),
    sceneNames: document
      .getRoot()
      .listScenes()
      .map((scene) => scene.getName()),
  };
}
