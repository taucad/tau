import type { Document } from '@gltf-transform/core';
import { WebIO } from '@gltf-transform/core';
import { getGeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import {
  buildMeshAnalysisRecord,
  createGeometryStatsFromRecord,
  meshRecordSnapshotCodec,
  rehydrateMeshAnalysisRecord,
  snapshotMeshAnalysisRecord,
} from '#mesh/analysis-record.js';
import type { MeshAnalysisRecordSnapshot } from '#mesh/analysis-record.js';
import { forensicAsync } from '#runner/forensic.js';
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
  // R3: the record's eager inputs are a pure function of the GLB bytes.
  // Peek the persisted `mesh-record` family before paying the parse, and
  // store the snapshot after a miss — the async parse cannot run inside the
  // sync compute, so this is the overlap peek/store-after discipline.
  const cache = getGeoSpecEvidenceCache();
  const recordKey = cache ? { subjectHash: cache.hashBytes(aligned) } : undefined;
  if (cache && recordKey) {
    const snapshot = cache.getOrCompute<MeshAnalysisRecordSnapshot>({
      family: 'mesh-record',
      version: 1,
      key: recordKey,
      codec: meshRecordSnapshotCodec,
      compute: () => undefined,
    });
    if (snapshot) {
      return createGeometryStatsFromRecord(rehydrateMeshAnalysisRecord(snapshot));
    }
  }
  // R2: GLB parse was part of the uninstrumented mesh path (Finding 5).
  const document = await forensicAsync('mesh.glb.parse', async () => io.readBinary(aligned));
  const record = buildMeshAnalysisRecord(document);
  if (cache && recordKey) {
    cache.getOrCompute({
      family: 'mesh-record',
      version: 1,
      key: recordKey,
      codec: meshRecordSnapshotCodec,
      compute: () => snapshotMeshAnalysisRecord(record),
    });
  }
  return createGeometryStatsFromRecord(record);
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
