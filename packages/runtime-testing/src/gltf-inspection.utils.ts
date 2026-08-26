import type { Document } from '@gltf-transform/core';
import { inspect } from '@gltf-transform/functions';
import type { InspectReport } from '@gltf-transform/functions';
import { createNodeIo } from '@taucad/geometry-core';

/** Converts GLB bytes into a glTF Transform document. @public */
export const glbToDocument = async (glbData: Uint8Array<ArrayBuffer>): Promise<Document> => {
  const io = await createNodeIo();
  return io.readBinary(glbData);
};

/** Produces a glTF Transform inspection report from GLB bytes. @public */
export const getInspectReport = async (glbData: Uint8Array<ArrayBuffer>): Promise<InspectReport> =>
  inspect(await glbToDocument(glbData));

/** Verifies that bytes have a non-empty GLB body and the `glTF` magic header. @public */
export const validateGlbData = (glb: Uint8Array<ArrayBuffer>): void => {
  if (glb.length === 0) {
    throw new Error('GLB data cannot be empty');
  }
  if (glb.length >= 4 && new TextDecoder().decode(glb.slice(0, 4)) !== 'glTF') {
    throw new Error('Invalid GLB header - expected "glTF"');
  }
};

/** Extracts aggregate vertex, face, and mesh counts from an inspection report. @public */
export const getGeometryStatsFromInspect = (
  report: InspectReport,
): { vertexCount: number; faceCount: number; meshCount: number } => {
  const vertexCount = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  return {
    vertexCount,
    faceCount: Math.round(vertexCount / 3),
    meshCount: report.meshes.properties.length,
  };
};

/** Extracts the first scene's bounding-box size and center. @public */
export const getBoundingBoxFromInspect = (
  report: InspectReport,
): { size: [number, number, number]; center: [number, number, number] } | undefined => {
  const scene = report.scenes.properties[0];
  if (!scene || scene.bboxMax.length < 3 || scene.bboxMin.length < 3) {
    return undefined;
  }
  return {
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
  };
};
