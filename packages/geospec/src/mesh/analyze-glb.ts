import type { Document } from '@gltf-transform/core';
import { WebIO } from '@gltf-transform/core';
import { inspect } from '@gltf-transform/functions';
import { analyseConnectedComponents, collectPrimitiveRecords } from '#mesh/connected-components.js';
import { analyseWatertight } from '#mesh/watertight.js';
import { analyzeMeshQuality } from '#mesh/mesh-quality.js';
import type { ConnectedComponentsResult, WatertightResult, BoundingBoxStats, GeometryStats } from '#mesh/types.js';

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
  const report = inspect(document);

  const vertexCount = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const meshCount = report.meshes.properties.length;
  const meshQuality = analyzeMeshQuality(document);

  let boundingBox: BoundingBoxStats | undefined;
  if (report.scenes.properties.length > 0) {
    const scene = report.scenes.properties[0]!;
    if (scene.bboxMax.length >= 3 && scene.bboxMin.length >= 3) {
      boundingBox = {
        size: [
          scene.bboxMax[0]! - scene.bboxMin[0]!,
          scene.bboxMax[1]! - scene.bboxMin[1]!,
          scene.bboxMax[2]! - scene.bboxMin[2]!,
        ],
        center: [
          (scene.bboxMax[0]! + scene.bboxMin[0]!) / 2,
          (scene.bboxMax[1]! + scene.bboxMin[1]!) / 2,
          (scene.bboxMax[2]! + scene.bboxMin[2]!) / 2,
        ],
        primitives: collectPrimitiveRecords(document),
      };
    }
  }

  // Memoise per-tolerance lookups so repeated `evaluateRequirement` calls
  // against the same stats object don't re-traverse primitives. The check
  // table is small (callers typically supply 0–2 distinct tolerances per GLB).
  const ccCache = new Map<number, ConnectedComponentsResult>();
  const analyseConnectedComponentsMemo = (toleranceMm: number): ConnectedComponentsResult => {
    const cached = ccCache.get(toleranceMm);
    if (cached !== undefined) {
      return cached;
    }
    const value = analyseConnectedComponents(document, toleranceMm);
    ccCache.set(toleranceMm, value);
    return value;
  };

  const connectedComponents = (toleranceMm: number): number => analyseConnectedComponentsMemo(toleranceMm).count;

  const connectedComponentsAnalysisAtTolerance = (toleranceMm: number): ConnectedComponentsResult =>
    analyseConnectedComponentsMemo(toleranceMm);

  let wtCache: WatertightResult | undefined;
  const analyseWatertightMemo = (): WatertightResult => {
    wtCache ??= analyseWatertight(document);
    return wtCache;
  };

  const { watertight } = analyseWatertightMemo();

  return {
    vertexCount,
    meshCount,
    triangleCount: meshQuality.triangleCount,
    meshQuality,
    connectedComponents,
    analyseConnectedComponents: connectedComponentsAnalysisAtTolerance,
    watertight,
    analyseWatertight: analyseWatertightMemo,
    boundingBox,
  };
};
