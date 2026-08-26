import { NodeIO } from '@gltf-transform/core';
import { allExtensions } from '#gltf.extensions.js';

// ============================================================================
// gltf-transform Utility Functions
// ============================================================================

/**
 * Creates a NodeIO instance pre-configured with all glTF extensions.
 *
 * @returns A ready-to-use NodeIO for reading and writing glTF documents.
 * @public
 */
export const createNodeIo = async (): Promise<NodeIO> => new NodeIO().registerExtensions(allExtensions);
