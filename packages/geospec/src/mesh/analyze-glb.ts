import type { Document } from '@gltf-transform/core';
import { WebIO } from '@gltf-transform/core';
import { buildMeshAnalysisRecord, createGeometryStatsFromRecord } from '#mesh/analysis-record.js';
import type { GeometryStats } from '#mesh/types.js';

/**
 * Parses a GLB binary and returns geometry statistics.
 *
 * Handles the common case where Node.js Buffers from Socket.IO have a
 * non-zero byteOffset into a shared pool ArrayBuffer by copying into
 * an aligned Uint8Array when necessary.
 *
 * @param glb - Raw GLB binary data
 * @returns Geometry statistics including vertex/mesh counts, connected components,
 *   watertight status, and bounding box
 * @public
 */
export const analyzeGlb = async (glb: Uint8Array<ArrayBuffer>): Promise<GeometryStats> => {
  const io = new WebIO();
  // Node.js Buffers from Socket.IO may have a non-zero byteOffset into a
  // shared pool ArrayBuffer (https://github.com/nodejs/node/issues/2888).
  // gltf-transform's GLB parser creates Uint32Array views at glb.byteOffset,
  // which requires 4-byte alignment. Copying into a fresh Uint8Array
  // guarantees byteOffset === 0.
  const aligned = glb.byteOffset % 4 === 0 ? glb : new Uint8Array(glb);
  const document = await io.readBinary(aligned);
  return analyzeGltfDocument(document);
};

/**
 * Analyze a parsed glTF-Transform document.
 *
 * @param document - Parsed glTF document.
 * @returns Geometry statistics.
 * @public
 */
export const analyzeGltfDocument = (document: Document): GeometryStats => {
  return createGeometryStatsFromRecord(buildMeshAnalysisRecord(document));
};
