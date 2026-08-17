import { NodeIO } from '@gltf-transform/core';
import { expect } from 'vitest';

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
  const document = await new NodeIO().readBinary(bytes);
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

/**
 * Assert that semantic mesh-bearing node and mesh names stay in parity.
 *
 * @param summary - Extracted GLB naming summary.
 * @param expectedNames - Expected node and mesh names in semantic order.
 */
export function expectSemanticNodeMeshParity(summary: GltfNamingSummary, expectedNames: string[]): void {
  expect(summary.nodeNames).toEqual(expectedNames);
  expect(summary.meshNames).toEqual(expectedNames);
}
