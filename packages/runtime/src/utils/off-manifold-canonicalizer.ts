import type { ManifoldToplevel } from 'manifold-3d';
import type { Color, Face, IndexedPolyhedron, Vertex } from '#framework/common.js';
import { createVertexTransform } from '#framework/common.js';
import { createGlb, createGltf } from '#utils/export-glb.js';
import { parseOff } from '#utils/import-off.js';
import type { ConvertOffToGltfOptions } from '#utils/off-to-gltf.js';

/**
 * Options for canonicalizing OFF through Manifold before glTF/GLB export.
 *
 * @public
 */
export type ConvertOffToManifoldGltfOptions = ConvertOffToGltfOptions & {
  manifoldModule: ManifoldToplevel;
};

type FaceRun = {
  color: Color;
  faces: Face[];
  originalId: number;
};

const colorKey = (color: Color): string => color.map((component) => component.toString()).join(',');

const groupFacesByColor = (mesh: IndexedPolyhedron, manifoldModule: ManifoldToplevel): FaceRun[] => {
  const colorGroups = new Map<string, { color: Color; faces: Face[] }>();
  for (const [index, face] of mesh.faces.entries()) {
    const color = mesh.colors[index] ?? [1, 1, 1, 1];
    const key = colorKey(color);
    const group = colorGroups.get(key);
    if (group) {
      group.faces.push(face);
      continue;
    }
    colorGroups.set(key, { color, faces: [face] });
  }

  const firstOriginalId = manifoldModule.Manifold.reserveIDs(colorGroups.size);
  return [...colorGroups.values()].map((group, index) => ({
    color: group.color,
    faces: group.faces,
    originalId: firstOriginalId + index,
  }));
};

const createManifoldMesh = (options: {
  mesh: IndexedPolyhedron;
  manifoldModule: ManifoldToplevel;
  runs: readonly FaceRun[];
}): InstanceType<ManifoldToplevel['Mesh']> => {
  const { mesh, manifoldModule, runs } = options;
  const vertProperties = new Float32Array(mesh.vertices.length * 3);
  for (const [index, vertex] of mesh.vertices.entries()) {
    const offset = index * 3;
    vertProperties[offset] = vertex[0];
    vertProperties[offset + 1] = vertex[1];
    vertProperties[offset + 2] = vertex[2];
  }

  const triVerts = new Uint32Array(mesh.faces.length * 3);
  const runIndex = new Uint32Array(runs.length + 1);
  const runOriginalId = new Uint32Array(runs.length);
  let triangleVertexOffset = 0;

  for (const [runIndexValue, run] of runs.entries()) {
    runIndex[runIndexValue] = triangleVertexOffset;
    runOriginalId[runIndexValue] = run.originalId;
    for (const face of run.faces) {
      if (face.length !== 3) {
        throw new Error(`Manifold OFF canonicalization expected triangulated faces; received ${face.length} vertices.`);
      }
      triVerts[triangleVertexOffset] = face[0]!;
      triVerts[triangleVertexOffset + 1] = face[1]!;
      triVerts[triangleVertexOffset + 2] = face[2]!;
      triangleVertexOffset += 3;
    }
  }
  runIndex[runs.length] = triangleVertexOffset;

  return new manifoldModule.Mesh({
    numProp: 3,
    vertProperties,
    triVerts,
    runIndex,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold's Mesh constructor uses this upstream field name.
    runOriginalID: runOriginalId,
  });
};

const getRunFaceColor = (options: {
  runIndex: Uint32Array;
  runOriginalId: Uint32Array;
  originalIdToColor: ReadonlyMap<number, Color>;
  triangleVertexOffset: number;
}): Color => {
  const { runIndex, runOriginalId, originalIdToColor, triangleVertexOffset } = options;
  for (const [run, originalId] of runOriginalId.entries()) {
    const start = runIndex[run] ?? 0;
    const end = runIndex[run + 1] ?? 0;
    if (triangleVertexOffset >= start && triangleVertexOffset < end) {
      const color = originalIdToColor.get(originalId);
      if (!color) {
        throw new Error(`Manifold OFF canonicalization lost material run ${originalId}.`);
      }
      return color;
    }
  }

  throw new Error(`Manifold OFF canonicalization produced triangle outside material runs at ${triangleVertexOffset}.`);
};

/**
 * Rebuild an OFF mesh through Manifold and return canonical triangle topology.
 *
 * @param offContent - OFF text emitted by OpenSCAD.
 * @param manifoldModule - Initialized Manifold module.
 * @returns Canonical indexed mesh suitable for existing glTF writers.
 * @public
 */
export const canonicalizeOffWithManifold = (
  offContent: string,
  manifoldModule: ManifoldToplevel,
): IndexedPolyhedron => {
  const offMesh = parseOff(offContent);
  const runs = groupFacesByColor(offMesh, manifoldModule);
  const originalIdToColor = new Map(runs.map((run) => [run.originalId, run.color] as const));
  const mesh = createManifoldMesh({ mesh: offMesh, manifoldModule, runs });
  const manifold = new manifoldModule.Manifold(mesh);

  try {
    const canonicalMesh = manifold.getMesh();
    const vertices: Vertex[] = [];
    for (let vertexIndex = 0; vertexIndex < canonicalMesh.vertProperties.length; vertexIndex += canonicalMesh.numProp) {
      vertices.push([
        canonicalMesh.vertProperties[vertexIndex]!,
        canonicalMesh.vertProperties[vertexIndex + 1]!,
        canonicalMesh.vertProperties[vertexIndex + 2]!,
      ]);
    }

    const faces: Face[] = [];
    const colors: Color[] = [];
    for (let index = 0; index < canonicalMesh.triVerts.length; index += 3) {
      faces.push([
        canonicalMesh.triVerts[index]!,
        canonicalMesh.triVerts[index + 1]!,
        canonicalMesh.triVerts[index + 2]!,
      ]);
      colors.push(
        getRunFaceColor({
          runIndex: canonicalMesh.runIndex,
          runOriginalId: canonicalMesh.runOriginalID,
          originalIdToColor,
          triangleVertexOffset: index,
        }),
      );
    }

    return { vertices, faces, colors };
  } finally {
    manifold.delete();
  }
};

/**
 * Canonicalize OFF through Manifold before writing glTF/GLB.
 *
 * OpenSCAD's Manifold backend can emit valid closed OFF meshes whose raw
 * triangle soup contains over-adjacent/coincident edges. Reconstructing the
 * mesh through Manifold collapses that topology to the canonical oriented
 * 2-manifold representation while preserving material runs via original IDs.
 *
 * @param offContent - OFF text emitted by OpenSCAD.
 * @param options - glTF output options plus an initialized Manifold module.
 * @returns glTF JSON or GLB bytes for the canonicalized mesh.
 * @public
 */
export const convertOffToManifoldGltf = async (
  offContent: string,
  options: ConvertOffToManifoldGltfOptions,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { manifoldModule, ...outputOptions } = options;
  const canonicalMesh = canonicalizeOffWithManifold(offContent, manifoldModule);
  const format = outputOptions.format ?? 'glb';
  const transform = createVertexTransform(outputOptions);

  if (format === 'gltf') {
    return createGltf(canonicalMesh, transform);
  }

  return createGlb(canonicalMesh, transform);
};
