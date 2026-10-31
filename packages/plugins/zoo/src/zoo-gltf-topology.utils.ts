import { Primitive, WebIO } from '@gltf-transform/core';
import type {
  Document,
  JSONDocument,
  Mesh as GltfTransformMesh,
  Node as GltfTransformNode,
} from '@gltf-transform/core';

import { embedGltfResources, registerTauGltfExtensions, TauCadTopology } from '@taucad/geometry-core';
import type {
  KittyCadBrepNode,
  KittyCadBrepRoot,
  TauCadTopologyComponent,
  TauCadTopologyExport,
} from '@taucad/geometry-core';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';

/** A named solid's engine box in millimetres, Z up; the engine pads it, so it contains the solid. */
export type NamedSolidBounds = { name: string; min: readonly number[]; max: readonly number[] };

type SolidBox = { min: readonly number[]; max: readonly number[] };

type EnrichZooGltfTopologyOptions = {
  format: 'glb' | 'gltf';
  /** Engine boxes of named solids; each names the body whose mesh box it contains most tightly. */
  namedSolidBounds?: readonly NamedSolidBounds[];
};

// 0.05 mm: engine rounding. Plus 0.5% of the box's diagonal: a mesh can overshoot an exact box by its tessellation.
const boundsTolerance = 0.05;
const relativeBoundsTolerance = 0.005;

/**
 * Name glTF solids from engine boxes, since the export carries no solid ids and lists solids in no fixed order. A box
 * is a candidate for a solid when it contains the solid's mesh box; the tightest pairs are taken first, and a solid
 * no box contains keeps its default name.
 *
 * @param solidBoxes - each B-rep solid's mesh box in millimetres, Z up, by solid index
 * @param namedBounds - the engine boxes of named solids
 * @returns the body name by solid index
 */
export const matchSolidNamesByBounds = (
  solidBoxes: ReadonlyArray<SolidBox | undefined>,
  namedBounds: readonly NamedSolidBounds[],
): Array<string | undefined> => {
  // ponytail: greedy over all pairs, O(n·m log); a true assignment solver if greedy ever mislabels.
  const pairs: Array<{ cost: number; solidIndex: number; boundsIndex: number }> = [];
  for (const [solidIndex, box] of solidBoxes.entries()) {
    if (!box) {
      continue;
    }
    for (const [boundsIndex, bounds] of namedBounds.entries()) {
      let cost = 0;
      let contains = true;
      const slack =
        boundsTolerance +
        relativeBoundsTolerance * Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis]!));
      for (let axis = 0; axis < 3; axis += 1) {
        const solidMin = box.min[axis]!;
        const solidMax = box.max[axis]!;
        const boundsMin = bounds.min[axis]!;
        const boundsMax = bounds.max[axis]!;
        contains &&= boundsMin <= solidMin + slack && boundsMax >= solidMax - slack;
        // Squared face offsets: a shifted box costs more than a padded one, which only comparing sizes misses.
        const scale = boundsMax - boundsMin + boundsTolerance;
        cost += ((solidMin - boundsMin) / scale) ** 2 + ((boundsMax - solidMax) / scale) ** 2;
      }
      if (contains) {
        pairs.push({ cost, solidIndex, boundsIndex });
      }
    }
  }
  pairs.sort((first, second) => first.cost - second.cost);
  const names: Array<string | undefined> = solidBoxes.map(() => undefined);
  const usedBounds = new Set<number>();
  for (const { solidIndex, boundsIndex } of pairs) {
    if (names[solidIndex] === undefined && !usedBounds.has(boundsIndex)) {
      names[solidIndex] = namedBounds[boundsIndex]!.name;
      usedBounds.add(boundsIndex);
    }
  }
  return names;
};

/**
 * A solid's box in millimetres, Z up, from its mesh's glTF (metres, Y up) position bounds placed by its node. Zoo bakes
 * positions into world space; the offline engine places pattern copies with node transforms.
 *
 * @param mesh - the solid's mesh
 * @param node - the node that places it, when it has one
 * @returns the box, or `undefined` when the mesh has no positions
 */
const getMeshBox = (mesh: GltfTransformMesh | undefined, node: GltfTransformNode | undefined): SolidBox | undefined => {
  const matrix = node?.getWorldMatrix();
  // A rotated node's box comes from its vertices: the rotated box of its local box is looser than the solid.
  const isTranslation =
    !matrix || [0, 1, 2, 4, 5, 6, 8, 9, 10].every((index) => matrix[index] === (index % 5 === 0 ? 1 : 0));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const include = (point: readonly number[]): void => {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = matrix
        ? matrix[axis]! * point[0]! + matrix[axis + 4]! * point[1]! + matrix[axis + 8]! * point[2]! + matrix[axis + 12]!
        : point[axis]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  };
  for (const primitive of mesh?.listPrimitives() ?? []) {
    const position = primitive.getAttribute('POSITION');
    if (!position) {
      continue;
    }
    if (isTranslation) {
      include(position.getMin([]));
      include(position.getMax([]));
      continue;
    }
    const point: number[] = [];
    for (let index = 0; index < position.getCount(); index += 1) {
      include(position.getElement(index, point));
    }
  }
  if (min[0] === Infinity) {
    return undefined;
  }
  const [minX, minY, minZ] = min.map((value) => value * 1000) as [number, number, number];
  const [maxX, maxY, maxZ] = max.map((value) => value * 1000) as [number, number, number];
  return { min: [minX, -maxZ, minY], max: [maxX, -minZ, maxY] };
};

type KittyCadSolid = {
  shells?: unknown;
  mesh?: unknown;
};

type KittyCadShell = {
  faces?: unknown;
};

type KittyCadFace = {
  loops?: unknown;
  surface?: unknown;
};

type KittyCadLoop = {
  edges?: unknown;
};

type KittyCadEdge = {
  curve?: unknown;
  start?: unknown;
  end?: unknown;
  t?: unknown;
};

type KittyCadBrepPayload = {
  solids: Array<KittyCadSolid | undefined>;
  shells: Array<KittyCadShell | undefined>;
  faces: Array<KittyCadFace | undefined>;
  loops: Array<KittyCadLoop | undefined>;
  edges: Array<KittyCadEdge | undefined>;
  vertices?: unknown[];
  surfaces?: unknown[];
  curves3D?: unknown[];
};

type TauTopologyComponent = TauCadTopologyComponent & {
  kind: 'body' | 'face';
  nodeIndex: number;
  meshIndex: number;
  primitiveIndices: number[];
  primitiveRefs: NonNullable<TauCadTopologyComponent['primitiveRefs']>;
  capabilities: JSONObject;
  sourceRefs: JSONObject;
};

type BuildTopologyResult = {
  payload: JSONObject;
  primitiveComponentIdsByMesh: Map<number, Map<number, string>>;
  bodyComponentIdsByNode: Map<number, string>;
};

const defaultExports: TauCadTopologyExport[] = [
  { fidelity: 'mesh', formats: ['glb', 'stl'], available: true },
  { fidelity: 'brep', formats: ['step', 'stp', 'iges', 'igs', 'brep', 'dxf'], available: true },
];

const defaultCapabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: true,
  exports: defaultExports,
} satisfies JSONObject;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readIndex = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'number' && Number.isInteger(value[0]) && value[0] >= 0) {
    return value[0];
  }

  return undefined;
};

const readIndices = (value: unknown): number[] =>
  asArray(value)
    .map((entry) => readIndex(entry))
    .filter((index): index is number => index !== undefined);

const asKittyCadBrepPayload = (payload: JSONObject): KittyCadBrepPayload | undefined => {
  if (
    !Array.isArray(payload['solids']) ||
    !Array.isArray(payload['shells']) ||
    !Array.isArray(payload['faces']) ||
    !Array.isArray(payload['loops']) ||
    !Array.isArray(payload['edges'])
  ) {
    return undefined;
  }

  // Preserve original indices: non-record holes map to undefined so per-lookup
  // guards fire instead of shifting every later entity onto the wrong reference.
  return {
    solids: payload['solids'].map((v) => (isRecord(v) ? (v as KittyCadSolid) : undefined)),
    shells: payload['shells'].map((v) => (isRecord(v) ? (v as KittyCadShell) : undefined)),
    faces: payload['faces'].map((v) => (isRecord(v) ? (v as KittyCadFace) : undefined)),
    loops: payload['loops'].map((v) => (isRecord(v) ? (v as KittyCadLoop) : undefined)),
    edges: payload['edges'].map((v) => (isRecord(v) ? (v as KittyCadEdge) : undefined)),
    vertices: Array.isArray(payload['vertices']) ? payload['vertices'] : undefined,
    surfaces: Array.isArray(payload['surfaces']) ? payload['surfaces'] : undefined,
    curves3D: Array.isArray(payload['curves3D']) ? payload['curves3D'] : undefined,
  };
};

const formatBodyComponentId = (solidIndex: number): string => `component:zoo-solid-${solidIndex}`;
const formatFaceComponentId = (solidIndex: number, faceIndex: number): string =>
  `component:zoo-solid-${solidIndex}:face-${faceIndex}`;

const flattenSolidFaces = (payload: KittyCadBrepPayload, solid: KittyCadSolid, warnings: JSONObject[]): number[] => {
  const faceIndices: number[] = [];
  for (const shellIndex of readIndices(solid.shells)) {
    const shell = payload.shells[shellIndex];
    if (!shell) {
      warnings.push({ code: 'KBR_INVALID_SHELL_REF', shellIndex });
      continue;
    }

    for (const faceIndex of readIndices(shell.faces)) {
      if (!payload.faces[faceIndex]) {
        warnings.push({ code: 'KBR_INVALID_FACE_REF', shellIndex, faceIndex });
        continue;
      }
      faceIndices.push(faceIndex);
    }
  }

  return faceIndices;
};

const getFaceEdgeIndices = (payload: KittyCadBrepPayload, faceIndex: number, warnings: JSONObject[]): number[] => {
  const face = payload.faces[faceIndex];
  if (!face) {
    return [];
  }

  const edgeIndices: number[] = [];
  for (const loopIndex of readIndices(face.loops)) {
    const loop = payload.loops[loopIndex];
    if (!loop) {
      warnings.push({ code: 'KBR_INVALID_LOOP_REF', faceIndex, loopIndex });
      continue;
    }

    for (const edgeEntry of asArray(loop.edges)) {
      if (edgeEntry === null) {
        continue;
      }

      const edgeIndex = readIndex(edgeEntry);
      if (edgeIndex === undefined || !payload.edges[edgeIndex]) {
        warnings.push({ code: 'KBR_INVALID_EDGE_REF', faceIndex, loopIndex, edgeEntry: JSON.stringify(edgeEntry) });
        continue;
      }
      edgeIndices.push(edgeIndex);
    }
  }

  return edgeIndices;
};

const buildEdgeUses = (payload: KittyCadBrepPayload, faceIndices: readonly number[], warnings: JSONObject[]) => {
  const edgeUses = new Map<number, number[]>();
  for (const faceIndex of faceIndices) {
    for (const edgeIndex of getFaceEdgeIndices(payload, faceIndex, warnings)) {
      const uses = edgeUses.get(edgeIndex) ?? [];
      uses.push(faceIndex);
      edgeUses.set(edgeIndex, uses);
    }
  }
  return edgeUses;
};

const buildAdjacencyByFace = (
  edgeUses: Map<number, number[]>,
): Map<number, Array<{ edgeIndex: number; faceIndex: number }>> => {
  const adjacency = new Map<number, Array<{ edgeIndex: number; faceIndex: number }>>();
  for (const [edgeIndex, faceUses] of edgeUses) {
    if (faceUses.length !== 2) {
      continue;
    }

    const [firstFace, secondFace] = faceUses;
    if (firstFace === undefined || secondFace === undefined) {
      continue;
    }

    const first = adjacency.get(firstFace) ?? [];
    first.push({ edgeIndex, faceIndex: secondFace });
    adjacency.set(firstFace, first);

    const second = adjacency.get(secondFace) ?? [];
    second.push({ edgeIndex, faceIndex: firstFace });
    adjacency.set(secondFace, second);
  }
  return adjacency;
};

const buildTopologyPayload = ({
  payload,
  meshPrimitiveCounts,
  solidNodesBySolidIndex,
  solidNames,
}: {
  payload: KittyCadBrepPayload;
  solidNames?: ReadonlyArray<string | undefined>;
  meshPrimitiveCounts: readonly number[];
  solidNodesBySolidIndex: ReadonlyMap<number, ReadonlyArray<{ nodeIndex: number; meshIndex: number | undefined }>>;
}): BuildTopologyResult | undefined => {
  const warnings: JSONObject[] = [];
  const components: TauTopologyComponent[] = [];
  const sectionSources: JSONObject[] = [];
  const primitiveComponentIdsByMesh = new Map<number, Map<number, string>>();
  const bodyComponentIdsByNode = new Map<number, string>();

  for (const [solidIndex, solid] of payload.solids.entries()) {
    if (!solid) {
      warnings.push({ code: 'KBR_INVALID_SOLID_REF', solidIndex });
      continue;
    }

    const bindings = solidNodesBySolidIndex.get(solidIndex) ?? [];
    const primaryBinding = bindings[0];
    const meshIndex = typeof solid.mesh === 'number' ? solid.mesh : primaryBinding?.meshIndex;
    const nodeIndex = primaryBinding?.nodeIndex;
    if (meshIndex === undefined || nodeIndex === undefined) {
      warnings.push({ code: 'KBR_SOLID_NOT_BOUND_TO_NODE_OR_MESH', solidIndex });
      continue;
    }

    const primitiveCount = meshPrimitiveCounts[meshIndex];
    if (primitiveCount === undefined) {
      warnings.push({ code: 'KBR_INVALID_SOLID_MESH_REF', solidIndex, meshIndex });
      continue;
    }

    const faceIndices = flattenSolidFaces(payload, solid, warnings);
    if (faceIndices.length !== primitiveCount) {
      warnings.push({
        code: 'KBR_FACE_PRIMITIVE_COUNT_MISMATCH',
        solidIndex,
        meshIndex,
        faceCount: faceIndices.length,
        primitiveCount,
      });
      continue;
    }

    const bodyId = formatBodyComponentId(solidIndex);
    // Every node referencing this solid (all instances) shares the one body
    // component, so bind them all rather than only the representative node.
    for (const binding of bindings) {
      bodyComponentIdsByNode.set(binding.nodeIndex, bodyId);
    }
    const edgeUses = buildEdgeUses(payload, faceIndices, warnings);
    const adjacencyByFace = buildAdjacencyByFace(edgeUses);
    const faceComponentIds = faceIndices.map((faceIndex) => formatFaceComponentId(solidIndex, faceIndex));
    const primitiveReferences = faceIndices.map((_, primitiveIndex) => ({ nodeIndex, meshIndex, primitiveIndex }));

    components.push({
      id: bodyId,
      name: solidNames?.[solidIndex] ?? `Solid ${solidIndex + 1}`,
      kind: 'body',
      selector: `kittycad/solid/${solidIndex}`,
      nodeIndex,
      meshIndex,
      primitiveIndices: faceIndices.map((_, primitiveIndex) => primitiveIndex),
      primitiveRefs: primitiveReferences,
      childIds: faceComponentIds,
      capabilities: defaultCapabilities,
      sourceRefs: {
        [kittyCadBoundaryRepresentationExtension]: {
          solidIndex,
          meshIndex,
        },
      } as unknown as JSONObject,
    });

    sectionSources.push({
      id: `section-source:zoo-solid-${solidIndex}`,
      ownerComponentId: bodyId,
      nodeIndex,
      meshIndex,
      primitiveRefs: primitiveReferences,
      edgeUses: [...edgeUses].map(([edgeIndex, faceUses]) => ({ edgeIndex, faceUses })),
    });

    const meshPrimitiveMap = primitiveComponentIdsByMesh.get(meshIndex) ?? new Map<number, string>();
    primitiveComponentIdsByMesh.set(meshIndex, meshPrimitiveMap);

    for (const [primitiveIndex, faceIndex] of faceIndices.entries()) {
      const faceId = formatFaceComponentId(solidIndex, faceIndex);
      meshPrimitiveMap.set(primitiveIndex, faceId);
      const edgeIndices = getFaceEdgeIndices(payload, faceIndex, warnings);
      components.push({
        id: faceId,
        name: `Face ${faceIndex + 1}`,
        kind: 'face',
        selector: `kittycad/solid/${solidIndex}/face/${faceIndex}`,
        parentId: bodyId,
        nodeIndex,
        meshIndex,
        primitiveIndices: [primitiveIndex],
        primitiveRefs: [{ nodeIndex, meshIndex, primitiveIndex }],
        capabilities: defaultCapabilities,
        sourceRefs: {
          [kittyCadBoundaryRepresentationExtension]: {
            solidIndex,
            faceIndex,
            meshIndex,
            primitiveIndex,
            edgeIndices,
            adjacentFaces: adjacencyByFace.get(faceIndex) ?? [],
          },
        } as unknown as JSONObject,
      });
    }
  }

  if (components.length === 0) {
    return undefined;
  }

  return {
    payload: {
      schemaVersion: 1,
      sourceExtension: kittyCadBoundaryRepresentationExtension,
      components,
      sectionSources,
      warnings,
    } as unknown as JSONObject,
    primitiveComponentIdsByMesh,
    bodyComponentIdsByNode,
  };
};

const applyTopologyExtras = (document: Document, topology: BuildTopologyResult): void => {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const meshes = root.listMeshes();

  for (const [nodeIndex, componentId] of topology.bodyComponentIdsByNode) {
    const node = nodes[nodeIndex];
    if (!node) {
      continue;
    }

    node.setExtras({
      ...node.getExtras(),
      tauComponentId: componentId,
      tauComponentKind: 'body',
      tauComponentSelector: `node/${nodeIndex}`,
    });
  }

  for (const [meshIndex, primitiveMap] of topology.primitiveComponentIdsByMesh) {
    const mesh = meshes[meshIndex];
    if (!mesh) {
      continue;
    }

    for (const [primitiveIndex, componentId] of primitiveMap) {
      const primitive = mesh.listPrimitives()[primitiveIndex];
      if (!primitive) {
        continue;
      }

      const existingExtras = primitive.getExtras();
      const sectionOwnerComponentId = componentId.split(':face-')[0];
      primitive.setExtras({
        ...existingExtras,
        tauComponentId: componentId,
        tauComponentKind: 'face',
        tauComponentSelector: `mesh/${meshIndex}/primitive/${primitiveIndex}`,
        tauSectionOwnerComponentId: sectionOwnerComponentId,
      });
    }
  }
};

/**
 * Preserve Zoo source topology and translate it into Tau render topology.
 *
 * @public
 */
export async function enrichZooGltfTopology(
  bytes: Uint8Array<ArrayBuffer>,
  options: EnrichZooGltfTopologyOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const io = registerTauGltfExtensions(new WebIO());
  const document =
    options.format === 'glb'
      ? await io.readBinary(bytes)
      : await io.readJSON({ json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'], resources: {} });

  const root = document.getRoot();
  const brepRoot = root.getExtension<KittyCadBrepRoot>(kittyCadBoundaryRepresentationExtension);
  const brepPayload = brepRoot ? asKittyCadBrepPayload(brepRoot.getPayload()) : undefined;
  if (!brepPayload) {
    return bytes;
  }

  const solidNodesBySolidIndex = new Map<number, Array<{ nodeIndex: number; meshIndex: number | undefined }>>();
  for (const [nodeIndex, node] of root.listNodes().entries()) {
    const brepNode = node.getExtension<KittyCadBrepNode>(kittyCadBoundaryRepresentationExtension);
    const solidIndex = brepNode?.getSolid();
    if (solidIndex === undefined) {
      continue;
    }

    const mesh = node.getMesh();
    const binding = { nodeIndex, meshIndex: mesh ? root.listMeshes().indexOf(mesh) : undefined };
    // Instanced solids are referenced by more than one node; accumulate every
    // referencing node so none of them lose their body binding.
    const bindings = solidNodesBySolidIndex.get(solidIndex);
    if (bindings) {
      bindings.push(binding);
    } else {
      solidNodesBySolidIndex.set(solidIndex, [binding]);
    }
  }

  // Faces bind to surface primitives only: an edge overlay (`LINES`, appended after the faces) has no B-rep face.
  const meshPrimitiveCounts = root
    .listMeshes()
    .map(
      (mesh: GltfTransformMesh) =>
        mesh.listPrimitives().filter((primitive) => primitive.getMode() === Primitive.Mode['TRIANGLES']).length,
    );
  const meshes = root.listMeshes();
  const solidNames = options.namedSolidBounds?.length
    ? matchSolidNamesByBounds(
        brepPayload.solids.map((solid, solidIndex) => {
          const binding = solidNodesBySolidIndex.get(solidIndex)?.[0];
          const meshIndex = typeof solid?.mesh === 'number' ? solid.mesh : binding?.meshIndex;
          return meshIndex === undefined
            ? undefined
            : getMeshBox(meshes[meshIndex], binding && root.listNodes()[binding.nodeIndex]);
        }),
        options.namedSolidBounds,
      )
    : undefined;
  const topology = buildTopologyPayload({
    payload: brepPayload,
    meshPrimitiveCounts,
    solidNodesBySolidIndex,
    solidNames,
  });
  if (!topology) {
    return bytes;
  }

  const tauTopology = document.createExtension(TauCadTopology);
  root.setExtension(tauCadTopologyExtension, tauTopology.createRoot().setPayload(topology.payload));
  applyTopologyExtras(document, topology);

  if (options.format === 'glb') {
    return io.writeBinary(document);
  }

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
