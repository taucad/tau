import { Document, MathUtils } from '@gltf-transform/core';
import type { Material, Mesh, Node } from '@gltf-transform/core';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import type { SpatialBounds, SpatialMatrix } from '@taucad/spatial';
import { admitMechanism, listDegreesOfFreedom, transformMechanism } from '@taucad/kinematics';
import type { Joint, Mechanism } from '@taucad/kinematics';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject, PublishedPartAsset, PublishedPartRecord } from '@taucad/runtime/types';
import { TauCadTopology } from '#extensions/tau-cad-topology.js';
import { allExtensions } from '#gltf.extensions.js';
import type { TauCadTopologyRoot } from '#extensions/tau-cad-topology.js';
import type {
  TauCadPhysical,
  TauCadTopologyComponent,
  TauCadTopologyPayload,
  TauCadTopologyPrimitiveRef,
} from '#extensions/tau-cad-topology.types.js';
import { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';
import type { TauCadTopologyDocumentBounds } from '#extensions/tau-cad-topology-validation.js';
import { createNodeIo } from '#gltf.utils.js';

type FlattenInput = Readonly<{
  /** Records and assets have already passed rooted host admission. */
  parts: Readonly<Record<string, PublishedPartRecord>>;
  occurrences: readonly PublishedPartOccurrence[];
  readAsset: (part: string, asset: PublishedPartAsset) => Promise<Uint8Array<ArrayBuffer>>;
}>;

type PublishedPartOccurrence = Readonly<{ id: string; transform: readonly number[] }> &
  (
    | Readonly<{ children: readonly PublishedPartOccurrence[]; part?: never; variant?: never }>
    | Readonly<{ part: string; variant: string; children?: never }>
  );

type ComponentSource = Readonly<{ ancestry: readonly string[]; sourceComponentId: string }>;
type MaterialSource = Readonly<{
  flattenedIndex: number;
  sourceDigest: PublishedPartAsset['digest'];
  sourceMaterialIndex: number;
  variant: string;
}>;

type FlattenResult = Readonly<{
  geometry: Readonly<{ format: 'gltf'; content: Uint8Array<ArrayBuffer> }>;
  components: Readonly<Record<string, ComponentSource>>;
  materials: readonly MaterialSource[];
  bounds: SpatialBounds;
}>;

/** Portable canonical display metadata; source indices are scoped to each occurrence definition. @public */
export type AdmittedAssemblyGlbMetadata = Readonly<{
  bounds: SpatialBounds;
  occurrences: ReadonlyArray<
    Readonly<{
      id: string;
      ancestry: readonly string[];
      parentId?: string;
      worldTransform: readonly number[];
      bounds?: SpatialBounds;
      definition?: Readonly<{ part: string; variant: string }>;
    }>
  >;
  components: ReadonlyArray<
    Readonly<{
      ancestry: readonly string[];
      sourceComponentId?: string;
      component: TauCadTopologyComponent;
    }>
  >;
  materials: ReadonlyArray<Omit<MaterialSource, 'flattenedIndex'>>;
  mechanism?: Mechanism;
}>;

type LoadedVariant = Readonly<{
  source: Document;
  mappedMeshes: ReadonlyMap<Mesh, Mesh>;
  materials: ReadonlyArray<Readonly<{ mapped: Material; sourceIndex: number }>>;
  topology: TauCadTopologyPayload | undefined;
}>;

type PendingTopology = Readonly<{
  ancestry: readonly string[];
  source?: Document;
  sourceComponentId?: string;
  component: TauCadTopologyComponent;
  node: Node | undefined;
  mesh: Mesh | undefined;
  refs: ReadonlyArray<Readonly<{ node: Node; mesh: Mesh; primitiveIndex: number }>>;
}>;

const encodeIdentity = (
  tag: 'occurrence' | 'component' | 'mechanism-link' | 'mechanism-joint' | 'mechanism-animation',
  path: readonly string[],
  sourceId?: string,
): string => {
  const bytes = new TextEncoder().encode(
    JSON.stringify(sourceId === undefined ? [tag, ...path] : [tag, ...path, sourceId]),
  );
  return `occ:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const finiteMatrix = (matrix: readonly number[]): void => {
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Occurrence transform must be a finite 4×4 matrix.');
  }
};

type Vec3 = [number, number, number];
const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
const unit = (value: Vec3): Vec3 => {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
};

/**
 * Complete rotation axes before setting a zero-scale matrix, which glTF-Transform cannot decompose.
 * @param matrix - Admitted local TRS matrix in column-major order.
 * @returns Translation, rotation and scale preserving degenerate axes.
 */
const decomposeNodeTrs = (
  matrix: readonly number[],
): Readonly<{ translation: Vec3; rotation: [number, number, number, number]; scale: Vec3 }> => {
  const columns: [Vec3, Vec3, Vec3] = [
    [matrix[0]!, matrix[1]!, matrix[2]!],
    [matrix[4]!, matrix[5]!, matrix[6]!],
    [matrix[8]!, matrix[9]!, matrix[10]!],
  ];
  const scales: Vec3 = [Math.hypot(...columns[0]), Math.hypot(...columns[1]), Math.hypot(...columns[2])];
  const basis: Array<Vec3 | undefined> = columns.map((column, index) =>
    scales[index] === 0 ? undefined : unit(column),
  );
  const present = basis.filter((column): column is Vec3 => column !== undefined);
  switch (present.length) {
    case 3: {
      const normal = cross(basis[1]!, basis[2]!);
      const handedness = basis[0]![0] * normal[0] + basis[0]![1] * normal[1] + basis[0]![2] * normal[2];
      if (handedness < 0) {
        scales[0] = -scales[0];
        basis[0] = basis[0]!.map((value) => -value) as Vec3;
      }
      break;
    }
    case 0: {
      basis.splice(0, 3, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
      break;
    }
    case 1: {
      const index = basis.findIndex((column) => column !== undefined);
      const direction = basis[index]!;
      let leastAligned = 0;
      for (const candidate of [1, 2]) {
        if (Math.abs(direction[candidate]!) < Math.abs(direction[leastAligned]!)) {
          leastAligned = candidate;
        }
      }
      const reference: Vec3 = [0, 0, 0];
      reference[leastAligned] = 1;
      const perpendicular = unit(cross(direction, reference));
      if (index === 0) {
        basis[1] = perpendicular;
        basis[2] = cross(direction, perpendicular);
      } else if (index === 1) {
        basis[2] = perpendicular;
        basis[0] = cross(direction, perpendicular);
      } else {
        basis[0] = perpendicular;
        basis[1] = cross(direction, perpendicular);
      }
      break;
    }
    default: {
      if (basis[0] === undefined) {
        basis[0] = cross(basis[1]!, basis[2]!);
      } else if (basis[1] === undefined) {
        basis[1] = cross(basis[2]!, basis[0]);
      } else {
        basis[2] = cross(basis[0], basis[1]);
      }
    }
  }
  const surrogate: ReturnType<Node['getMatrix']> = [
    ...basis[0]!,
    0,
    ...basis[1]!,
    0,
    ...basis[2]!,
    0,
    matrix[12]!,
    matrix[13]!,
    matrix[14]!,
    1,
  ];
  const translation: Vec3 = [0, 0, 0];
  const rotation: [number, number, number, number] = [0, 0, 0, 1];
  const unitScale: Vec3 = [1, 1, 1];
  MathUtils.decompose(surrogate, translation, rotation, unitScale);
  return { translation, rotation, scale: scales };
};

const setNodeTrs = (node: Node, matrix: readonly number[]): void => {
  const trs = decomposeNodeTrs(matrix);
  node.setTranslation(trs.translation).setRotation(trs.rotation).setScale(trs.scale);
};

const projectedNodeMatrix = (matrix: readonly number[]): ReturnType<Node['getMatrix']> => {
  const trs = decomposeNodeTrs(matrix);
  return MathUtils.compose(trs.translation, trs.rotation, trs.scale, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};

const addedLocalDeterminant = (matrix: readonly number[]): number =>
  Math.abs(
    matrix[0]! * (matrix[5]! * matrix[10]! - matrix[6]! * matrix[9]!) -
      matrix[4]! * (matrix[1]! * matrix[10]! - matrix[2]! * matrix[9]!) +
      matrix[8]! * (matrix[1]! * matrix[6]! - matrix[2]! * matrix[5]!),
  );

const deriveOccurrencePhysical = (physical: TauCadPhysical | undefined, factor: number): TauCadPhysical | undefined => {
  if (!physical || physical.volume.state === 'unavailable') {
    return physical;
  }
  const sourceValueMm3 =
    physical.volume.state === 'derived' ? physical.volume.sourceValueMm3 : physical.volume.valueMm3;
  const addedAbsDeterminant =
    physical.volume.state === 'derived' ? physical.volume.addedAbsDeterminant * factor : factor;
  const valueMm3 = sourceValueMm3 * addedAbsDeterminant;
  if (addedAbsDeterminant === 0 || valueMm3 === 0) {
    return { ...physical, volume: { state: 'unavailable', reason: 'degenerate-placement' } };
  }
  if (!Number.isFinite(addedAbsDeterminant) || !Number.isFinite(valueMm3)) {
    return { ...physical, volume: { state: 'unavailable', reason: 'nonfinite-placement' } };
  }
  return {
    ...physical,
    volume: {
      state: 'derived',
      sourceValueMm3,
      addedAbsDeterminant,
      valueMm3,
      geometryDigest: physical.volume.geometryDigest,
      method: 'occurrence-determinant-v1',
      validity: 'placed-solid',
    },
  };
};

const sourceTopology = (source: Document): TauCadTopologyPayload | undefined => {
  const value = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();
  if (value === undefined) {
    return undefined;
  }
  if (value['schemaVersion'] !== 1 || !Array.isArray(value['components'])) {
    throw new TypeError('Source GLB has an incompatible TAU_cad_topology payload.');
  }
  const payload = value as unknown as TauCadTopologyPayload;
  const meshes = source.getRoot().listMeshes();
  const meshIndices = new Map(meshes.map((mesh, index) => [mesh, index]));
  // The producer may describe one node's primitives implicitly. Materialize only those
  // references for validation; the source payload and its native evidence remain intact.
  const validationPayload: TauCadTopologyPayload = {
    ...payload,
    components: payload.components.map((component) => {
      if (component.primitiveRefs !== undefined || component.nodeIndex === undefined) {
        return component;
      }
      const node = sourceNodeAt(source, component.nodeIndex);
      const mesh = component.meshIndex === undefined ? node.getMesh() : meshes[component.meshIndex];
      const meshIndex = mesh === null || mesh === undefined ? undefined : meshIndices.get(mesh);
      return meshIndex === undefined
        ? component
        : {
            ...component,
            primitiveRefs: (component.primitiveIndices ?? mesh!.listPrimitives().map((_, index) => index)).map(
              (primitiveIndex) => ({ nodeIndex: component.nodeIndex!, meshIndex, primitiveIndex }),
            ),
          };
    }),
  };
  const issues = validateTauCadTopology(validationPayload, topologyBounds(source));
  if (issues.length > 0) {
    throw new TypeError(`Source topology is invalid: ${issues.join('; ')}`);
  }
  // Parent errors remain independent of identity ownership. Logical grouping components
  // may have no mesh; every displayed mesh node must have one matching topology owner.
  sourceTopologyParents(payload);
  const nodes = source.getRoot().listNodes();
  const activeNodes = new Set<Node>();
  const scene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  scene?.traverse((node) => activeNodes.add(node));
  const ownedMeshNodes = new Set<Node>();
  for (const component of validationPayload.components) {
    const node = component.nodeIndex === undefined ? undefined : nodes[component.nodeIndex];
    if (node && !activeNodes.has(node)) {
      throw new TypeError('Source topology component node is outside the active scene.');
    }
    if (node?.getMesh() && node.getExtras()['tauComponentId'] !== component.id) {
      throw new TypeError('Source topology component identity differs from its mesh node tauComponentId.');
    }
    if (node?.getMesh() && component.primitiveRefs?.length === 0) {
      throw new TypeError('Source topology mesh component has no owned primitive references.');
    }
    for (const reference of component.primitiveRefs ?? []) {
      const referencedNode = nodes[reference.nodeIndex]!;
      const referencedMesh = meshes[reference.meshIndex]!;
      if (!activeNodes.has(referencedNode) || referencedNode.getMesh() !== referencedMesh) {
        throw new TypeError('Source topology contains an invalid primitive reference.');
      }
      if (referencedNode.getExtras()['tauComponentId'] !== component.id) {
        throw new TypeError('Source topology primitive reference belongs to a different component identity.');
      }
      ownedMeshNodes.add(referencedNode);
    }
  }
  for (const node of activeNodes) {
    if (node.getMesh() && !ownedMeshNodes.has(node)) {
      throw new TypeError('Source topology omits a mesh-bearing active scene component.');
    }
  }
  return payload;
};

const sourceNodeAt = (source: Document, index: number): Node => {
  const node = source.getRoot().listNodes()[index];
  if (!node) {
    throw new TypeError(`Source topology refers to missing node ${index}.`);
  }
  return node;
};

const topologyBounds = (document: Document): TauCadTopologyDocumentBounds => {
  const root = document.getRoot();
  const meshes = root.listMeshes();
  const meshIndices = new Map(meshes.map((mesh, index) => [mesh, index]));
  return {
    nodes: root.listNodes().map((node) => {
      const mesh = node.getMesh();
      return { meshIndex: mesh === null ? undefined : meshIndices.get(mesh) };
    }),
    meshes: meshes.map((mesh) =>
      mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        indexCount: primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0,
        positionScalarCount: (primitive.getAttribute('POSITION')?.getCount() ?? 0) * 3,
      })),
    ),
  };
};

const sourceTopologyParents = (payload: TauCadTopologyPayload): ReadonlyMap<string, string> => {
  const sourceComponents = new Map<string, TauCadTopologyComponent>();
  for (const component of payload.components) {
    if (typeof component.id !== 'string' || component.id.length === 0 || sourceComponents.has(component.id)) {
      throw new TypeError('Source topology has an invalid or duplicate component ID.');
    }
    sourceComponents.set(component.id, component);
  }
  const parents = new Map<string, string>();
  const setParent = (child: string, parent: string): void => {
    if (!sourceComponents.has(child) || !sourceComponents.has(parent)) {
      throw new TypeError(`Source topology references unknown parent or child ${parent} → ${child}.`);
    }
    const previous = parents.get(child);
    if (previous && previous !== parent) {
      throw new TypeError(`Source topology has conflicting parents for ${child}.`);
    }
    parents.set(child, parent);
  };
  for (const component of payload.components) {
    if (component.parentId) {
      setParent(component.id, component.parentId);
    }
    for (const childId of component.childIds ?? []) {
      setParent(childId, component.id);
    }
  }
  const state = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string): void => {
    if (state.get(id) === 'visiting') {
      throw new TypeError(`Source topology has a parent cycle at ${id}.`);
    }
    if (state.get(id) === 'visited') {
      return;
    }
    state.set(id, 'visiting');
    const parent = parents.get(id);
    if (parent) {
      visit(parent);
    }
    state.set(id, 'visited');
  };
  for (const id of sourceComponents.keys()) {
    visit(id);
  }
  return parents;
};

const assertProjectableSource = (source: Document): void => {
  const root = source.getRoot();
  if (root.listAnimations().length > 0 || root.listSkins().length > 0 || root.listCameras().length > 0) {
    throw new TypeError('Source GLB animation, skin, or camera state cannot be flattened losslessly.');
  }
  for (const extension of root.listExtensions()) {
    if (![tauCadTopologyExtension, kittyCadBoundaryRepresentationExtension].includes(extension.extensionName)) {
      throw new TypeError(`Source GLB root extension ${extension.extensionName} cannot be flattened losslessly.`);
    }
  }
  for (const node of root.listNodes()) {
    if (
      node.getSkin() !== null ||
      node.getCamera() !== null ||
      node.getWeights().length > 0 ||
      node.listExtensions().length > 0
    ) {
      throw new TypeError('Source GLB node skin, camera, morph weights, or extension cannot be flattened losslessly.');
    }
  }
  for (const mesh of root.listMeshes()) {
    if (mesh.getWeights().length > 0 || mesh.listPrimitives().some((primitive) => primitive.listTargets().length > 0)) {
      throw new TypeError('Source GLB morph targets cannot be flattened losslessly.');
    }
  }
};

const supportedExtensions = new Set(allExtensions.map((extension) => extension.EXTENSION_NAME));

const assertKnownRawExtensions = (bytes: Uint8Array<ArrayBuffer>): void => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  if (
    bytes.byteLength < 20 ||
    decoder.decode(bytes.subarray(0, 4)) !== 'glTF' ||
    decoder.decode(bytes.subarray(16, 20)) !== 'JSON'
  ) {
    throw new TypeError('Published part display asset must be a GLB.');
  }
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > bytes.byteLength - 20) {
    throw new TypeError('Published part GLB JSON chunk is incomplete.');
  }
  const json: unknown = JSON.parse(decoder.decode(bytes.subarray(20, 20 + jsonLength)));
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    for (const declaration of ['extensionsUsed', 'extensionsRequired']) {
      const names = (json as Record<string, unknown>)[declaration];
      if (Array.isArray(names)) {
        for (const name of names) {
          if (typeof name === 'string' && !supportedExtensions.has(name)) {
            throw new TypeError(`Source GLB extension ${name} cannot be flattened losslessly.`);
          }
        }
      }
    }
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    const fields = value as Record<string, unknown>;
    if (fields['extensions'] && typeof fields['extensions'] === 'object') {
      for (const name of Object.keys(fields['extensions'])) {
        if (!supportedExtensions.has(name)) {
          throw new TypeError(`Source GLB extension ${name} cannot be flattened losslessly.`);
        }
      }
    }
    for (const [name, child] of Object.entries(fields)) {
      if (name !== 'extras') {
        visit(child);
      }
    }
  };
  visit(json);
};

const stripPrimitiveIdentity = (mesh: Mesh): void => {
  for (const primitive of mesh.listPrimitives()) {
    const {
      tauComponentId: _id,
      tauComponentKind: _kind,
      tauComponentSelector: _selector,
      tauSectionOwnerComponentId: _owner,
      faceGroups: _faces,
      edgeGroups: _edges,
      ...extras
    } = primitive.getExtras();
    primitive.setExtras(extras);
  }
};

const expandPoint = (
  matrix: ReturnType<Node['getWorldMatrix']>,
  point: readonly [number, number, number],
  bounds: Readonly<{ min: [number, number, number]; max: [number, number, number] }>,
): void => {
  const { min, max } = bounds;
  for (let axis = 0; axis < 3; axis++) {
    const value =
      matrix[axis]! * point[0] + matrix[4 + axis]! * point[1] + matrix[8 + axis]! * point[2] + matrix[12 + axis]!;
    if (!Number.isFinite(value)) {
      throw new RangeError('Placed GLB bounds are not finite.');
    }
    min[axis] = Math.min(min[axis]!, value);
    max[axis] = Math.max(max[axis]!, value);
  }
};

const multiplyMatrices = (left: readonly number[], right: readonly number[]): ReturnType<Node['getWorldMatrix']> =>
  Array.from({ length: 16 }, (_, index) =>
    [0, 1, 2, 3].reduce(
      (sum, axis) => sum + left[axis * 4 + (index % 4)]! * right[Math.floor(index / 4) * 4 + axis]!,
      0,
    ),
  ) as ReturnType<Node['getWorldMatrix']>;

const expandNodeBounds = (
  node: Node,
  bounds: Readonly<{ min: [number, number, number]; max: [number, number, number] }>,
  matrix = node.getWorldMatrix(),
): void => {
  const mesh = node.getMesh();
  if (!mesh) {
    return;
  }
  const { min, max } = bounds;
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (!position || position.getCount() === 0) {
      continue;
    }
    const localMin = position.getMinNormalized([]);
    const localMax = position.getMaxNormalized([]);
    if (![...localMin, ...localMax].every((value) => Number.isFinite(value))) {
      throw new RangeError('Source GLB has non-finite POSITION bounds.');
    }
    for (const x of [localMin[0]!, localMax[0]!]) {
      for (const y of [localMin[1]!, localMax[1]!]) {
        for (const z of [localMin[2]!, localMax[2]!]) {
          expandPoint(matrix, [x, y, z], { min, max });
        }
      }
    }
  }
};

const serializeTopologyComponent = (
  { component, node, mesh, refs: references }: PendingTopology,
  indices: Readonly<{ nodes: ReadonlyMap<Node, number>; meshes: ReadonlyMap<Mesh, number> }>,
  children: ReadonlyMap<string, string[]>,
): TauCadTopologyComponent => {
  const nodeIndices = indices.nodes;
  const meshIndices = indices.meshes;
  const nodeIndex = node === undefined ? undefined : nodeIndices.get(node);
  const meshIndex = mesh === undefined ? undefined : meshIndices.get(mesh);
  if ((node !== undefined && nodeIndex === undefined) || (mesh !== undefined && meshIndex === undefined)) {
    throw new Error('Flattened topology lost a node or mesh.');
  }
  const primitiveReferences = references.map(({ node: refNode, mesh: refMesh, primitiveIndex }) => {
    const mappedNodeIndex = nodeIndices.get(refNode);
    const mappedMeshIndex = meshIndices.get(refMesh);
    if (mappedNodeIndex === undefined || mappedMeshIndex === undefined) {
      throw new Error('Flattened topology lost a primitive reference.');
    }
    return { nodeIndex: mappedNodeIndex, meshIndex: mappedMeshIndex, primitiveIndex };
  });
  return {
    ...component,
    ...(nodeIndex === undefined ? {} : { nodeIndex }),
    ...(meshIndex === undefined ? {} : { meshIndex }),
    ...(primitiveReferences.length === 0 ? {} : { primitiveRefs: primitiveReferences }),
    ...(children.has(component.id) ? { childIds: children.get(component.id)! } : {}),
  };
};

const remapOccurrenceMechanism = ({
  mechanism,
  worldMatrix,
  path,
}: Readonly<{
  mechanism: Mechanism;
  worldMatrix: readonly number[];
  path: readonly string[];
}>): Mechanism => {
  const matrix: SpatialMatrix = [
    worldMatrix[0]!,
    worldMatrix[1]!,
    worldMatrix[2]!,
    worldMatrix[3]!,
    worldMatrix[4]!,
    worldMatrix[5]!,
    worldMatrix[6]!,
    worldMatrix[7]!,
    worldMatrix[8]!,
    worldMatrix[9]!,
    worldMatrix[10]!,
    worldMatrix[11]!,
    worldMatrix[12]!,
    worldMatrix[13]!,
    worldMatrix[14]!,
    worldMatrix[15]!,
  ];
  const outcome = transformMechanism({ mechanism, units: { length: 'm', angle: 'rad' }, matrix });
  if (outcome.status === 'invalid') {
    throw new TypeError(`Placed mechanism is invalid: ${outcome.issues.map((issue) => issue.message).join('; ')}`);
  }
  const placed = outcome.mechanism;
  const linkId = (id: string): string => encodeIdentity('mechanism-link', path, id);
  const jointId = (id: string): string => encodeIdentity('mechanism-joint', path, id);
  const dofs = new Map(
    listDegreesOfFreedom(placed).map((dof) => [dof.id, jointId(dof.jointId) + dof.id.slice(dof.jointId.length)]),
  );
  const dofId = (id: string): string => {
    const remapped = dofs.get(id);
    if (!remapped) {
      throw new TypeError(`Mechanism references unknown degree of freedom ${id}.`);
    }
    return remapped;
  };
  return {
    schemaVersion: 1,
    units: placed.units,
    root: linkId(placed.root),
    links: Object.fromEntries(
      Object.entries(placed.links).map(([id, mechanismLink]) => [
        linkId(id),
        { components: mechanismLink.components.map((component) => encodeIdentity('component', path, component)) },
      ]),
    ),
    joints: Object.fromEntries(
      Object.entries(placed.joints).map(([id, joint]): [string, Joint] => [
        jointId(id),
        { ...joint, parent: linkId(joint.parent), child: linkId(joint.child) },
      ]),
    ),
    ...(placed.couplings
      ? {
          couplings: placed.couplings.map((coupling) => ({
            ...coupling,
            driver: dofId(coupling.driver),
            follower: dofId(coupling.follower),
          })),
        }
      : {}),
    ...(placed.animations
      ? {
          animations: placed.animations.map((animation) => ({
            ...animation,
            id: encodeIdentity('mechanism-animation', path, animation.id),
            keyframes: animation.keyframes.map((keyframe) => ({
              ...keyframe,
              coordinates: Object.fromEntries(
                Object.entries(keyframe.coordinates).map(([id, value]) => [dofId(id), value]),
              ),
            })),
          })),
        }
      : {}),
  };
};

const processAdmittedAssemblyGlb = async (
  { parts, occurrences, readAsset }: FlattenInput,
  project: boolean,
): Promise<FlattenResult | AdmittedAssemblyGlbMetadata> => {
  const io = await createNodeIo();
  const target = project ? new Document() : undefined;
  target?.createBuffer();
  const scene = target?.createScene();
  if (scene) {
    target?.getRoot().setDefaultScene(scene);
  }
  const loaded = new Map<string, LoadedVariant>();
  const emptyIndices = { nodes: new Map<Node, number>(), meshes: new Map<Mesh, number>() };
  const sourceIndices = new Map<Document, { nodes: Map<Node, number>; meshes: Map<Mesh, number> }>();
  const registeredMaterialVariants = new Set<string>();
  const materialSources: Array<{
    mapped: Material;
    digest: PublishedPartAsset['digest'];
    index: number;
    variant: string;
  }> = [];
  const components: Record<string, ComponentSource> = Object.create(null) as Record<string, ComponentSource>;
  const topology: PendingTopology[] = [];
  const placedMechanisms: Array<Readonly<{ path: readonly string[]; mechanism: Mechanism }>> = [];
  const occurrenceMetadata: Array<AdmittedAssemblyGlbMetadata['occurrences'][number]> = [];
  const boundsMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const boundsMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const getVariant = async (part: string, variant: string): Promise<LoadedVariant> => {
    const recipeKey = JSON.stringify([part, variant]);
    const record = own(parts, part);
    const effective = record && own(record.variants, variant);
    if (!effective) {
      throw new TypeError(`Unknown published part variant ${recipeKey}.`);
    }
    const cacheKey = effective.glb.digest;
    const registerMaterials = (entry: LoadedVariant): void => {
      const provenanceKey = JSON.stringify([cacheKey, variant]);
      if (registeredMaterialVariants.has(provenanceKey)) {
        return;
      }
      for (const { mapped, sourceIndex } of entry.materials) {
        materialSources.push({ mapped, digest: effective.glb.digest, index: sourceIndex, variant });
      }
      registeredMaterialVariants.add(provenanceKey);
    };
    const cached = loaded.get(cacheKey);
    if (cached) {
      registerMaterials(cached);
      return cached;
    }
    const bytes = await readAsset(part, effective.glb);
    assertKnownRawExtensions(bytes);
    const source = await io.readBinary(bytes);
    assertProjectableSource(source);
    const sourcePayload = sourceTopology(source);
    const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
    if (!sourceScene) {
      throw new TypeError(`Published part variant ${recipeKey} has no GLB scene.`);
    }
    if (!target) {
      sourceIndices.set(source, {
        nodes: new Map(
          source
            .getRoot()
            .listNodes()
            .map((node, index) => [node, index]),
        ),
        meshes: new Map(
          source
            .getRoot()
            .listMeshes()
            .map((mesh, index) => [mesh, index]),
        ),
      });
      const result = {
        source,
        mappedMeshes: new Map(
          source
            .getRoot()
            .listMeshes()
            .map((mesh) => [mesh, mesh]),
        ),
        materials: source
          .getRoot()
          .listMaterials()
          .map((mapped, sourceIndex) => ({ mapped, sourceIndex })),
        topology: sourcePayload,
      };
      loaded.set(cacheKey, result);
      registerMaterials(result);
      return result;
    }
    const mapping = mergeDocuments(target, source);
    const mappedMeshes = new Map<Mesh, Mesh>();
    for (const mesh of source.getRoot().listMeshes()) {
      const mapped = mapping.get(mesh) as Mesh | undefined;
      if (!mapped) {
        throw new Error('Merged GLB lost a source mesh.');
      }
      mappedMeshes.set(mesh, mapped);
      stripPrimitiveIdentity(mapped);
    }
    const materials: Array<{ mapped: Material; sourceIndex: number }> = [];
    for (const [sourceIndex, material] of source.getRoot().listMaterials().entries()) {
      const mapped = mapping.get(material) as Material | undefined;
      if (!mapped) {
        throw new Error('Merged GLB lost a source material.');
      }
      materials.push({ mapped, sourceIndex });
    }
    // The merged source scene is only a template. Occurrences below get distinct nodes.
    for (const property of source.getRoot().listNodes()) {
      mapping.get(property)?.dispose();
    }
    for (const property of source.getRoot().listScenes()) {
      mapping.get(property)?.dispose();
    }
    const result = { source, mappedMeshes, materials, topology: sourcePayload };
    loaded.set(cacheKey, result);
    registerMaterials(result);
    return result;
  };

  const projectSource = (
    sourceNode: Node,
    context: Readonly<{
      parent: Node | undefined;
      parentId: string;
      worldMatrix: readonly number[];
      occurrenceBounds: { min: [number, number, number]; max: [number, number, number] };
      path: readonly string[];
      variant: LoadedVariant;
      nodeMap: Map<Node, Node>;
    }>,
  ): void => {
    const { parent, parentId, path, variant, nodeMap, worldMatrix, occurrenceBounds } = context;
    const extras = sourceNode.getExtras();
    const sourceId = extras['tauComponentId'];
    if (sourceNode.getMesh() && (typeof sourceId !== 'string' || sourceId.length === 0)) {
      throw new TypeError('Mesh-bearing source GLB node lacks tauComponentId.');
    }
    const copy = target ? target.createNode(sourceNode.getName()) : sourceNode;
    if (target) {
      setNodeTrs(copy, sourceNode.getMatrix());
    }
    if (target && sourceNode.getMesh()) {
      copy.setMesh(variant.mappedMeshes.get(sourceNode.getMesh()!)!);
    }
    if (typeof sourceId === 'string' && sourceId.length > 0) {
      const id = encodeIdentity('component', path, sourceId);
      if (own(components, id)) {
        throw new TypeError(`Duplicate source-local component identity ${sourceId}.`);
      }
      components[id] = { ancestry: path, sourceComponentId: sourceId };
      if (target) {
        copy.setExtras({ ...extras, tauComponentId: id });
      }
    } else if (target) {
      copy.setExtras(extras);
    }
    if (target) {
      parent?.addChild(copy);
    }
    nodeMap.set(sourceNode, copy);
    let childParentId = parentId;
    if (!variant.topology && typeof sourceId === 'string' && sourceId.length > 0) {
      const id = encodeIdentity('component', path, sourceId);
      const mesh = copy.getMesh() ?? undefined;
      topology.push({
        ancestry: path,
        source: variant.source,
        sourceComponentId: sourceId,
        component: {
          id,
          name: sourceNode.getName() || sourceId,
          kind: typeof extras['tauComponentKind'] === 'string' ? extras['tauComponentKind'] : 'part',
          selector: typeof extras['tauComponentSelector'] === 'string' ? extras['tauComponentSelector'] : sourceId,
          parentId,
        },
        node: copy,
        mesh,
        refs: mesh?.listPrimitives().map((_, primitiveIndex) => ({ node: copy, mesh, primitiveIndex })) ?? [],
      });
      childParentId = id;
    } else if (typeof sourceId === 'string' && sourceId.length > 0) {
      childParentId = encodeIdentity('component', path, sourceId);
    }
    expandNodeBounds(
      copy,
      occurrenceBounds,
      target ? copy.getWorldMatrix() : multiplyMatrices(worldMatrix, sourceNode.getWorldMatrix()),
    );
    for (const child of sourceNode.listChildren()) {
      projectSource(child, {
        parent: copy,
        parentId: childParentId,
        path,
        variant,
        nodeMap,
        worldMatrix,
        occurrenceBounds,
      });
    }
  };

  const addSourceTopology = ({
    variant,
    path,
    occurrenceId,
    nodeMap,
    addedAbsDeterminant,
  }: Readonly<{
    variant: LoadedVariant;
    path: readonly string[];
    occurrenceId: string;
    nodeMap: ReadonlyMap<Node, Node>;
    addedAbsDeterminant: number;
  }>): void => {
    const payload = variant.topology;
    if (!payload) {
      return;
    }
    const sourceRoot = variant.source.getRoot();
    const parents = sourceTopologyParents(payload);
    const mapRef = (reference: TauCadTopologyPrimitiveRef): { node: Node; mesh: Mesh; primitiveIndex: number } => {
      const sourceNode = sourceNodeAt(variant.source, reference.nodeIndex);
      const sourceMesh = sourceRoot.listMeshes()[reference.meshIndex];
      const node = nodeMap.get(sourceNode);
      const mesh = sourceMesh && variant.mappedMeshes.get(sourceMesh);
      if (!node || !mesh || sourceNode.getMesh() !== sourceMesh || !mesh.listPrimitives()[reference.primitiveIndex]) {
        throw new TypeError('Source topology contains an invalid primitive reference.');
      }
      return { node, mesh, primitiveIndex: reference.primitiveIndex };
    };
    for (const sourceComponent of payload.components) {
      const parentSourceId = parents.get(sourceComponent.id);
      const id = encodeIdentity('component', path, sourceComponent.id);
      const sourceNode =
        sourceComponent.nodeIndex === undefined ? undefined : sourceNodeAt(variant.source, sourceComponent.nodeIndex);
      const node = sourceNode === undefined ? undefined : nodeMap.get(sourceNode);
      if (sourceNode && !node) {
        throw new TypeError('Source topology component node is outside the active scene.');
      }
      const sourceMesh =
        sourceComponent.meshIndex === undefined
          ? sourceNode?.getMesh()
          : sourceRoot.listMeshes()[sourceComponent.meshIndex];
      const mesh = sourceMesh === undefined || sourceMesh === null ? undefined : variant.mappedMeshes.get(sourceMesh);
      if (sourceComponent.meshIndex !== undefined && !mesh) {
        throw new TypeError('Source topology component references a missing mesh.');
      }
      const references = sourceComponent.primitiveRefs
        ? sourceComponent.primitiveRefs.map(mapRef)
        : node && mesh
          ? (sourceComponent.primitiveIndices ?? mesh.listPrimitives().map((_, index) => index)).map(
              (primitiveIndex) => {
                if (!mesh.listPrimitives()[primitiveIndex]) {
                  throw new TypeError('Source topology component references a missing primitive.');
                }
                return { node, mesh, primitiveIndex };
              },
            )
          : [];
      const {
        nodeIndex: _nodeIndex,
        meshIndex: _meshIndex,
        primitiveRefs: _primitiveReferences,
        childIds: _childIds,
        physical: _physical,
        ...rest
      } = sourceComponent;
      topology.push({
        ancestry: path,
        source: variant.source,
        sourceComponentId: sourceComponent.id,
        component: {
          ...rest,
          id,
          parentId: parentSourceId ? encodeIdentity('component', path, parentSourceId) : occurrenceId,
          ...(_physical === undefined ? {} : { physical: deriveOccurrencePhysical(_physical, addedAbsDeterminant) }),
        },
        node,
        mesh,
        refs: references,
      });
      if (!own(components, id)) {
        components[id] = { ancestry: path, sourceComponentId: sourceComponent.id };
      }
    }
  };

  const activeOccurrences = new Set<PublishedPartOccurrence>();
  const projectOccurrence = async (
    occurrence: PublishedPartOccurrence,
    context: Readonly<{
      parent: Node | undefined;
      ancestry: readonly string[];
      addedAbsDeterminant: number;
      worldMatrix: readonly number[];
      parentBounds?: { min: [number, number, number]; max: [number, number, number] };
    }>,
  ): Promise<void> => {
    if (typeof occurrence.id !== 'string' || occurrence.id.length === 0 || activeOccurrences.has(occurrence)) {
      throw new TypeError('Occurrence graph contains an invalid ID or cycle.');
    }
    activeOccurrences.add(occurrence);
    finiteMatrix(occurrence.transform);
    const { parent, ancestry } = context;
    const localFactor = addedLocalDeterminant(occurrence.transform);
    const addedAbsDeterminant =
      context.addedAbsDeterminant === 0 || localFactor === 0 ? 0 : context.addedAbsDeterminant * localFactor;
    const path = [...ancestry, occurrence.id];
    const occurrenceBounds: { min: [number, number, number]; max: [number, number, number] } = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    const worldMatrix = multiplyMatrices(context.worldMatrix, projectedNodeMatrix(occurrence.transform));
    const wrapper = target?.createNode(occurrence.id);
    if (wrapper) {
      setNodeTrs(wrapper, occurrence.transform);
    }
    const occurrenceId = encodeIdentity('occurrence', path);
    wrapper?.setExtras({ tauComponentId: occurrenceId });
    if (wrapper) {
      if (parent) {
        parent.addChild(wrapper);
      } else {
        scene?.addChild(wrapper);
      }
    }
    topology.push({
      ancestry: path,
      component: {
        id: occurrenceId,
        name: occurrence.id,
        kind: 'children' in occurrence ? 'assembly' : 'part',
        selector: occurrenceId,
        ...(ancestry.length > 0 ? { parentId: encodeIdentity('occurrence', ancestry) } : {}),
      },
      node: wrapper,
      mesh: undefined,
      refs: [],
    });
    if ('children' in occurrence && occurrence.children) {
      for (const child of occurrence.children) {
        // oxlint-disable-next-line no-await-in-loop -- Preserve authored order while mutating one glTF document and variant cache.
        await projectOccurrence(child, {
          parent: wrapper,
          ancestry: path,
          addedAbsDeterminant,
          worldMatrix,
          parentBounds: occurrenceBounds,
        });
      }
    } else if ('part' in occurrence) {
      const variant = await getVariant(occurrence.part, occurrence.variant);
      const sourceScene = variant.source.getRoot().getDefaultScene() ?? variant.source.getRoot().listScenes()[0]!;
      const nodeMap = new Map<Node, Node>();
      for (const sourceNode of sourceScene.listChildren()) {
        projectSource(sourceNode, {
          parent: wrapper,
          parentId: occurrenceId,
          path,
          variant,
          nodeMap,
          worldMatrix,
          occurrenceBounds,
        });
      }
      addSourceTopology({ variant, path, occurrenceId, nodeMap, addedAbsDeterminant });
      if (variant.topology?.mechanism) {
        placedMechanisms.push({
          path,
          mechanism: remapOccurrenceMechanism({ mechanism: variant.topology.mechanism, worldMatrix, path }),
        });
      }
    }
    const placedBounds = [...occurrenceBounds.min, ...occurrenceBounds.max].every((value) => Number.isFinite(value))
      ? occurrenceBounds
      : undefined;
    if (placedBounds) {
      const destination = context.parentBounds ?? { min: boundsMin, max: boundsMax };
      for (const axis of [0, 1, 2]) {
        destination.min[axis] = Math.min(destination.min[axis]!, placedBounds.min[axis]!);
        destination.max[axis] = Math.max(destination.max[axis]!, placedBounds.max[axis]!);
      }
    }
    occurrenceMetadata.push({
      id: occurrenceId,
      ancestry: path,
      ...(ancestry.length === 0 ? {} : { parentId: encodeIdentity('occurrence', ancestry) }),
      worldTransform: worldMatrix,
      ...(placedBounds ? { bounds: placedBounds } : {}),
      ...(occurrence.part === undefined ? {} : { definition: { part: occurrence.part, variant: occurrence.variant } }),
    });
    activeOccurrences.delete(occurrence);
  };

  for (const occurrence of occurrences) {
    // oxlint-disable-next-line no-await-in-loop -- Preserve authored order while mutating one glTF document and variant cache.
    await projectOccurrence(occurrence, {
      parent: undefined,
      ancestry: [],
      addedAbsDeterminant: 1,
      worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    });
  }
  if (![...boundsMin, ...boundsMax].every((value) => Number.isFinite(value))) {
    throw new RangeError('Assembly has no finite placed geometry bounds.');
  }
  const children = new Map<string, string[]>();
  const topologyIds = new Set(topology.map(({ component }) => component.id));
  if (topologyIds.size !== topology.length) {
    throw new TypeError('Flattened assembly has duplicate topology component IDs.');
  }
  for (const { component } of topology) {
    if (component.parentId) {
      if (!topologyIds.has(component.parentId)) {
        throw new TypeError(`Flattened topology has missing parent ${component.parentId}.`);
      }
      const siblings = children.get(component.parentId) ?? [];
      siblings.push(component.id);
      children.set(component.parentId, siblings);
    }
  }
  let mechanism: Mechanism | undefined;
  if (placedMechanisms.length > 0) {
    const root = encodeIdentity('mechanism-link', []);
    mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root,
      links: Object.fromEntries([
        [root, { components: [] }],
        ...placedMechanisms.flatMap((entry) => Object.entries(entry.mechanism.links)),
      ]),
      joints: Object.fromEntries(
        placedMechanisms.flatMap(
          ({ path, mechanism: entry }): Array<[string, Joint]> => [
            [
              encodeIdentity('mechanism-joint', path),
              { type: 'fixed', parent: root, child: entry.root, origin: [0, 0, 0] },
            ],
            ...Object.entries(entry.joints),
          ],
        ),
      ),
      couplings: placedMechanisms.flatMap((entry) => entry.mechanism.couplings ?? []),
      animations: placedMechanisms.flatMap((entry) => entry.mechanism.animations ?? []),
    };
    const admission = admitMechanism(mechanism);
    if (admission.status === 'invalid') {
      throw new TypeError(
        `Assembly mechanism is invalid: ${admission.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    mechanism = admission.mechanism;
  }
  if (!target) {
    return {
      bounds: { min: boundsMin, max: boundsMax },
      occurrences: occurrenceMetadata,
      ...(mechanism ? { mechanism } : {}),
      materials: materialSources.map(({ digest, index, variant }) => ({
        sourceDigest: digest,
        sourceMaterialIndex: index,
        variant,
      })),
      components: topology.map((entry) => ({
        ancestry: entry.ancestry,
        ...(entry.sourceComponentId ? { sourceComponentId: entry.sourceComponentId } : {}),
        component: serializeTopologyComponent(
          entry,
          entry.source ? sourceIndices.get(entry.source)! : emptyIndices,
          children,
        ),
      })),
    };
  }
  await target.transform(unpartition());
  const materialIndices = new Map(
    target
      .getRoot()
      .listMaterials()
      .map((material, index) => [material, index]),
  );
  const materials: MaterialSource[] = materialSources.map(({ mapped, digest, index, variant }) => ({
    flattenedIndex: materialIndices.get(mapped) ?? -1,
    sourceDigest: digest,
    sourceMaterialIndex: index,
    variant,
  }));
  if (materials.some(({ flattenedIndex }) => flattenedIndex < 0)) {
    throw new Error('Merged GLB lost material provenance.');
  }
  const targetNodes = target.getRoot().listNodes();
  const targetMeshes = target.getRoot().listMeshes();
  const nodeIndices = new Map(targetNodes.map((node, index) => [node, index]));
  const meshIndices = new Map(targetMeshes.map((mesh, index) => [mesh, index]));
  const topologyPayload: TauCadTopologyPayload = {
    schemaVersion: 1,
    ...(mechanism ? { mechanism } : {}),
    components: topology.map((entry) =>
      serializeTopologyComponent(entry, { nodes: nodeIndices, meshes: meshIndices }, children),
    ),
  };
  const topologyIssues = validateTauCadTopology(topologyPayload, topologyBounds(target));
  if (topologyIssues.length > 0) {
    throw new TypeError(`Flattened topology is invalid: ${topologyIssues.join('; ')}`);
  }
  const extension = target.createExtension(TauCadTopology);
  target
    .getRoot()
    .setExtension(tauCadTopologyExtension, extension.createRoot().setPayload(topologyPayload as unknown as JSONObject));
  return {
    geometry: { format: 'gltf', content: await io.writeBinary(target) },
    components,
    materials,
    bounds: { min: boundsMin, max: boundsMax },
  };
};

/**
 * Validate admitted display records and occurrences without allocating flattened output.
 * @param input - Pinned records, admitted occurrence graph, and host-owned asset reader.
 * @returns Portable canonical metadata after strict source, identity, topology and placed-bounds validation.
 * @public
 */
export const validateAdmittedAssemblyGlb = async (input: FlattenInput): Promise<AdmittedAssemblyGlbMetadata> => {
  const result = await processAdmittedAssemblyGlb(input, false);
  if ('geometry' in result) {
    throw new Error('Admission unexpectedly produced a GLB.');
  }
  return result;
};

/**
 * Flatten already admitted part records into one compatibility GLB.
 * @param input - Pinned records, admitted occurrence graph, and host-owned asset reader.
 * @returns A flattened GLB with component/material provenance and placed bounds.
 * @public
 */
export const flattenAdmittedAssemblyGlb = async (input: FlattenInput): Promise<FlattenResult> => {
  const result = await processAdmittedAssemblyGlb(input, true);
  if (!('geometry' in result)) {
    throw new Error('Assembly projection produced no GLB.');
  }
  return result;
};
