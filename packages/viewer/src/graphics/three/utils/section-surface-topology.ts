import * as THREE from 'three';
import type { GeometryComponentManifest } from '@taucad/types';
import { maxSynchronousBvhTriangles } from '#graphics/three/utils/bvh-cache.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { getModelComponentId, getModelComponentOwnerInHierarchy } from '#graphics/three/utils/model-component-owner.js';
import type { ModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import { hasSceneTag, hasSceneTagInHierarchy, sceneTag } from '#graphics/three/utils/scene-tags.js';
import { censusSectionSurfaceClosure } from '#graphics/three/utils/section-surface-closure.js';
import type { SectionClosureCensus, SectionClosureInput } from '#graphics/three/utils/section-surface-closure.js';
import { buildSectionClosureInWorker } from '#graphics/three/utils/section-surface-topology-worker-client.js';

/** Why a source is not capped exactly. */
export type SectionTopologyFailure = Readonly<{
  code:
    | 'open-surface'
    | 'collapsed-triangle'
    | 'missing-position'
    | 'non-finite-position'
    | 'partial-visibility'
    | 'topology-unavailable';
  message: string;
  sourceKey: string;
}>;

/**
 * Whether a source is a closed, consistently oriented surface the stencil caps exactly (`closed`), is not (`open`),
 * or is still being checked (`pending`).
 */
export type SectionSurfaceClosure =
  | Readonly<{ status: 'closed'; census: SectionClosureCensus }>
  | Readonly<{ status: 'open'; failure: SectionTopologyFailure }>
  | Readonly<{ status: 'pending' }>;

type SectionSurfaceParticipant = {
  readonly mesh: SectionSurfaceMesh;
  readonly localToSource: THREE.Matrix4;
  readonly order: number;
  readonly nodeIndex: number | undefined;
  readonly meshIndex: number | undefined;
  readonly primitiveIndex: number | undefined;
  /** The material orders of the triangles the source draws, filled with its closure. */
  readonly usedMaterialOrders: Set<number>;
};

type SectionSurfaceMesh = THREE.Mesh;

/** One logical solid of the model, as the section caps grade and draw it. */
export type SectionSurfaceSource = Readonly<{
  key: string;
  root: THREE.Object3D;
  owner: ModelComponentOwner | undefined;
  participants: readonly SectionSurfaceParticipant[];
  closure: SectionSurfaceClosure;
  revision: string;
}>;

export type VisibleSectionSurfaceSource = Readonly<{
  source: SectionSurfaceSource;
  visibility: 'complete' | 'partial';
}>;

export type GltfSectionTopologyTiming = Readonly<{
  submitMilliseconds: number;
  /** Aggregate census CPU, which may include main-thread work; not worker wall time. */
  workerMilliseconds: number;
  packMilliseconds: number;
  /** Always 0: a census result needs no hydration. Kept for the timing span's shape. */
  hydrateMilliseconds: number;
  resolveMilliseconds: number;
}>;

/** What the section worker censuses for one source. */
export type SectionClosureWorkerInput = SectionClosureInput & Readonly<{ sourceKey: string }>;

type GltfAssociation = Readonly<{
  nodes?: number;
  meshes?: number;
  primitives?: number;
}>;

export type SectionTopologyGltfParser = Readonly<{
  json: unknown;
  associations: ReadonlyMap<THREE.Object3D, GltfAssociation>;
  getDependency(type: 'accessor', index: number): Promise<unknown>;
}>;

export type GltfSectionSurfaceRegistrationState = 'pending' | 'ready' | 'unsupported' | 'cancelled';

type SectionSourceRegistration =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'unsupported' }>
  | Readonly<{ status: 'cancelled' }>
  | Readonly<{ status: 'ready'; sources: readonly SectionSurfaceSource[] }>;

const sectionSourceRegistry = new WeakMap<THREE.Object3D, SectionSourceRegistration>();

/** Marks a loaded glTF root before its asynchronous registration begins. @internal */
export const setGltfSectionSurfaceRegistrationState = (
  scene: THREE.Group,
  status: Exclude<GltfSectionSurfaceRegistrationState, 'ready'>,
): void => {
  sectionSourceRegistry.set(scene, { status });
};
const standaloneSourceCache = new WeakMap<SectionSurfaceMesh, SectionSurfaceSource>();
const geometrySourceCache = new WeakMap<THREE.BufferGeometry, SectionSurfaceSource>();

const openClosure = (
  sourceKey: string,
  code: SectionTopologyFailure['code'],
  detail: string,
): Readonly<{ status: 'open'; failure: SectionTopologyFailure }> => ({
  status: 'open',
  failure: { sourceKey, code, message: `Section topology ${sourceKey}: ${detail}` },
});

const pendingClosure: SectionSurfaceClosure = { status: 'pending' };

/** Records a source capped per loop because its census could not run where it is allowed to. */
const recordSourceUnsupported = (failure: SectionTopologyFailure, reason: string): void => {
  recordRendererSpan('renderer.section-source-unsupported', {
    startTime: performance.now(),
    duration: 0,
    attributes: { sourceKey: failure.sourceKey, code: failure.code, reason },
  });
};

/**
 * The most triangles a census may run on the main thread, when no worker can: the BVH's synchronous limit, one bound
 * for every per-geometry build a frame may meet.
 */
const maxSynchronousClosureTriangles = maxSynchronousBvhTriangles;

/** A census that could not run in its worker: capped per loop with a span, never rerun on the main thread. */
const unavailableClosure = (sourceKey: string, reason: string): SectionSurfaceClosure => {
  const result = openClosure(sourceKey, 'topology-unavailable', `no closure census (${reason})`);
  recordSourceUnsupported(result.failure, reason);
  return result;
};

const closureFromCensus = (sourceKey: string, census: SectionClosureCensus): SectionSurfaceClosure =>
  census.isClosed
    ? { status: 'closed', census }
    : openClosure(
        sourceKey,
        'open-surface',
        census.unbalancedEdgeCount === 0
          ? 'has no triangles'
          : `has ${census.unbalancedEdgeCount} welded edges not closed in both directions`,
      );

/** The render material slot of one geometry triangle, from the geometry's groups. */
const materialOrderAtTriangle = (mesh: SectionSurfaceMesh, triangleIndex: number): number => {
  const indexOffset = triangleIndex * 3;
  const group = mesh.geometry.groups.find(
    (candidate) => indexOffset >= candidate.start && indexOffset < candidate.start + candidate.count,
  );
  return group?.materialIndex ?? 0;
};

const geometryRevision = (geometry: THREE.BufferGeometry): string => {
  const { position } = geometry.attributes;
  const index = geometry.getIndex();
  const positionVersion = position && 'version' in position ? position.version : position?.data.version;
  return [
    geometry.uuid,
    positionVersion ?? 0,
    position?.count ?? 0,
    index?.version ?? 0,
    index?.count ?? 0,
    geometry.drawRange.start,
    geometry.drawRange.count,
  ].join(':');
};

/** Writes every vertex of `position`, moved by `matrix`, into `target` from vertex `base`; false on a non-finite one. */
const writeSourcePositions = (options: {
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  matrix: THREE.Matrix4;
  target: Float64Array;
  base: number;
}): boolean => {
  const { position, matrix, target, base } = options;
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.set(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(matrix);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      return false;
    }
    point.toArray(target, (base + vertex) * 3);
  }
  return true;
};

/**
 * Every participant's vertices in the source frame and their drawn triangles, as one census input. Records the
 * material orders each participant draws, which its visibility follows. A triangle with a repeated index is refused;
 * a sliver with three distinct indices is kept, as it bounds the solid like any other face.
 */
const createClosureInput = (options: {
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): SectionClosureWorkerInput | SectionSurfaceClosure => {
  let vertexCount = 0;
  let triangleCapacity = 0;
  const vertexBaseByParticipant: number[] = [];
  for (const participant of options.participants) {
    participant.usedMaterialOrders.clear();
    const { position } = participant.mesh.geometry.attributes;
    if (!position || position.itemSize < 3) {
      return openClosure(options.sourceKey, 'missing-position', 'is missing a VEC3 position attribute');
    }
    vertexBaseByParticipant.push(vertexCount);
    vertexCount += position.count;
    triangleCapacity += Math.floor((participant.mesh.geometry.getIndex()?.count ?? position.count) / 3);
  }
  const positions = new Float64Array(vertexCount * 3);
  for (const [participantIndex, participant] of options.participants.entries()) {
    const position = participant.mesh.geometry.attributes['position']!;
    if (
      !writeSourcePositions({
        position,
        matrix: participant.localToSource,
        target: positions,
        base: vertexBaseByParticipant[participantIndex]!,
      })
    ) {
      return openClosure(options.sourceKey, 'non-finite-position', 'contains a non-finite position');
    }
  }

  const triangleVertices = new Uint32Array(triangleCapacity * 3);
  let written = 0;
  for (const [participantIndex, participant] of options.participants.entries()) {
    const position = participant.mesh.geometry.attributes['position']!;
    const vertexBase = vertexBaseByParticipant[participantIndex]!;
    const index = participant.mesh.geometry.getIndex();
    const indexCount = index?.count ?? position.count;
    const drawStart = Math.max(0, participant.mesh.geometry.drawRange.start);
    const requestedCount = participant.mesh.geometry.drawRange.count;
    const drawEnd = Math.min(
      indexCount,
      requestedCount === Number.POSITIVE_INFINITY ? indexCount : drawStart + requestedCount,
    );
    if ((drawEnd - drawStart) % 3 !== 0) {
      return openClosure(options.sourceKey, 'collapsed-triangle', 'has an incomplete triangle index list');
    }
    const isVertex = (vertex: number): boolean => Number.isInteger(vertex) && vertex >= 0 && vertex < position.count;
    const hasGroups = participant.mesh.geometry.groups.length > 0;
    for (let offset = drawStart; offset < drawEnd; offset += 3) {
      const first = index ? index.getX(offset) : offset;
      const second = index ? index.getX(offset + 1) : offset + 1;
      const third = index ? index.getX(offset + 2) : offset + 2;
      if (!isVertex(first) || !isVertex(second) || !isVertex(third)) {
        return openClosure(options.sourceKey, 'missing-position', 'references a missing vertex');
      }
      if (first === second || second === third || third === first) {
        return openClosure(options.sourceKey, 'collapsed-triangle', 'contains a collapsed triangle');
      }
      triangleVertices[written++] = vertexBase + first;
      triangleVertices[written++] = vertexBase + second;
      triangleVertices[written++] = vertexBase + third;
      participant.usedMaterialOrders.add(hasGroups ? materialOrderAtTriangle(participant.mesh, offset / 3) : 0);
    }
  }
  return {
    sourceKey: options.sourceKey,
    positions,
    triangleVertices: written === triangleVertices.length ? triangleVertices : triangleVertices.slice(0, written),
  };
};

const buildClosure = (options: {
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): SectionSurfaceClosure => {
  const input = createClosureInput(options);
  return 'status' in input ? input : closureFromCensus(options.sourceKey, censusSectionSurfaceClosure(input));
};

/**
 * Grades a source in the section worker. Without a worker, a small source is censused here and a large one is capped
 * per loop. A worker that fails is replaced and asked once more; a second failure caps the source per loop with a
 * span. Neither reruns a large census on the main thread.
 */
const buildClosureAsync = async (options: {
  onPack?: (milliseconds: number) => void;
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): Promise<SectionSurfaceClosure> => {
  const packStartedAt = performance.now();
  const input = createClosureInput(options);
  if ('status' in input) {
    return input;
  }
  if (input.triangleVertices.length / 3 <= maxSynchronousClosureTriangles) {
    return closureFromCensus(options.sourceKey, censusSectionSurfaceClosure(input));
  }
  const pending = buildSectionClosureInWorker(input);
  if (!pending) {
    return unavailableClosure(options.sourceKey, 'no topology worker');
  }
  options.onPack?.(performance.now() - packStartedAt);
  let census: SectionClosureCensus | undefined;
  let failure = 'the topology worker failed';
  // The client terminates a failed worker, so the retry runs in a fresh one.
  for (const attempt of [pending, undefined]) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the retry follows the first attempt's failure.
      census = await (attempt ?? buildSectionClosureInWorker(input));
      break;
    } catch (error) {
      failure = error instanceof Error && error.message ? error.message : failure;
    }
  }
  return census ? closureFromCensus(options.sourceKey, census) : unavailableClosure(options.sourceKey, failure);
};

/** Whether a material draws anything: visible and not fully transparent. @internal */
export const isSectionMaterialVisible = (material: THREE.Material): boolean =>
  material.visible && (!('opacity' in material) || typeof material.opacity !== 'number' || material.opacity > 0);

/** Whether an object and all its ancestors are visible. @internal */
export const isSectionObjectVisible = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }
  return true;
};

const participantVisibility = (participant: SectionSurfaceParticipant): 'visible' | 'hidden' | 'partial' => {
  if (!isSectionObjectVisible(participant.mesh)) {
    return 'hidden';
  }
  const materials = Array.isArray(participant.mesh.material) ? participant.mesh.material : [participant.mesh.material];
  const { usedMaterialOrders } = participant;
  const usedMaterials =
    usedMaterialOrders.size > 0
      ? [...usedMaterialOrders].map((order) => materials[order] ?? materials[0]!)
      : [materials[0]!];
  const visibleCount = usedMaterials.filter((material) => isSectionMaterialVisible(material)).length;
  if (visibleCount === 0) {
    return 'hidden';
  }
  return visibleCount === usedMaterials.length ? 'visible' : 'partial';
};

const createParticipant = (options: {
  mesh: SectionSurfaceMesh;
  rootInverse: THREE.Matrix4;
  order: number;
  association?: GltfAssociation;
}): SectionSurfaceParticipant => ({
  mesh: options.mesh,
  localToSource: new THREE.Matrix4().multiplyMatrices(options.rootInverse, options.mesh.matrixWorld),
  order: options.order,
  nodeIndex: options.association?.nodes,
  meshIndex: options.association?.meshes,
  primitiveIndex: options.association?.primitives,
  usedMaterialOrders: new Set(),
});

const createStandaloneParticipant = (mesh: SectionSurfaceMesh): SectionSurfaceParticipant => {
  mesh.updateWorldMatrix(true, true);
  return createParticipant({ mesh, rootInverse: new THREE.Matrix4().copy(mesh.matrixWorld).invert(), order: 0 });
};

const createStandaloneSource = (mesh: SectionSurfaceMesh): SectionSurfaceSource => {
  const revision = geometryRevision(mesh.geometry);
  const cached = standaloneSourceCache.get(mesh);
  if (cached?.revision === revision) {
    return cached;
  }
  const participant = createStandaloneParticipant(mesh);
  const source: SectionSurfaceSource = {
    key: mesh.uuid,
    root: mesh,
    owner: getModelComponentOwnerInHierarchy(mesh),
    participants: [participant],
    closure: buildClosure({ sourceKey: mesh.uuid, participants: [participant] }),
    revision: geometryRevision(mesh.geometry),
  };
  standaloneSourceCache.set(mesh, source);
  return source;
};

const geometryTriangleCount = (geometry: THREE.BufferGeometry): number =>
  Math.floor((geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3);

type PendingStandaloneSource = Readonly<{
  revision: string;
  provisional: SectionSurfaceSource;
  ready: Promise<SectionSurfaceSource>;
}>;

const pendingStandaloneSources = new WeakMap<SectionSurfaceMesh, PendingStandaloneSource>();

/**
 * A standalone mesh's source: graded here up to the synchronous limit, and above it in the section worker. While the
 * worker runs, a provisional source with a pending closure stands in, with the census to wait on.
 */
const getStandaloneSource = (
  mesh: SectionSurfaceMesh,
): SectionSurfaceSource | Readonly<{ provisional: SectionSurfaceSource; ready: Promise<SectionSurfaceSource> }> => {
  const revision = geometryRevision(mesh.geometry);
  const cached = standaloneSourceCache.get(mesh);
  if (cached?.revision === revision) {
    return cached;
  }
  if (geometryTriangleCount(mesh.geometry) <= maxSynchronousClosureTriangles) {
    return createStandaloneSource(mesh);
  }
  const pending = pendingStandaloneSources.get(mesh);
  if (pending?.revision === revision) {
    return pending;
  }
  const participant = createStandaloneParticipant(mesh);
  const provisional: SectionSurfaceSource = {
    key: mesh.uuid,
    root: mesh,
    owner: getModelComponentOwnerInHierarchy(mesh),
    participants: [participant],
    closure: pendingClosure,
    // Its own revision, so the landed source changes the caps' commit identity and is graded again.
    revision: `${revision}:pending`,
  };
  const build = async (): Promise<SectionSurfaceSource> => {
    const source: SectionSurfaceSource = {
      ...provisional,
      closure: await buildClosureAsync({ sourceKey: mesh.uuid, participants: [participant] }),
      revision,
    };
    // A newer revision may have replaced this build meanwhile; only the current one is kept.
    if (pendingStandaloneSources.get(mesh)?.revision === revision) {
      pendingStandaloneSources.delete(mesh);
      standaloneSourceCache.set(mesh, source);
    }
    return source;
  };
  const entry: PendingStandaloneSource = { revision, provisional, ready: build() };
  pendingStandaloneSources.set(mesh, entry);
  return entry;
};

const provisionalRegistrationSources = new WeakMap<THREE.Object3D, Map<SectionSurfaceMesh, SectionSurfaceSource>>();

/**
 * A mesh of a glTF whose registration has not finished (`pending`) or failed (`open`, capped per loop). It stands in
 * as its own source, so a cut through it commits without waiting.
 */
const getProvisionalRegistrationSource = (
  root: THREE.Object3D,
  mesh: SectionSurfaceMesh,
  status: 'pending' | 'refused',
): SectionSurfaceSource => {
  const sources = provisionalRegistrationSources.get(root) ?? new Map<SectionSurfaceMesh, SectionSurfaceSource>();
  provisionalRegistrationSources.set(root, sources);
  const revision = `${geometryRevision(mesh.geometry)}:${status}`;
  const cached = sources.get(mesh);
  if (cached?.revision === revision) {
    return cached;
  }
  const owner = getModelComponentOwnerInHierarchy(mesh);
  const key = owner ? `${owner.unitId}:${owner.componentId}:${mesh.uuid}` : mesh.uuid;
  let closure: SectionSurfaceClosure = pendingClosure;
  if (status === 'refused') {
    const refused = openClosure(key, 'topology-unavailable', 'its model could not be prepared for section views');
    recordSourceUnsupported(refused.failure, 'the registration failed');
    closure = refused;
  }
  const source: SectionSurfaceSource = {
    key,
    root,
    owner,
    participants: [createParticipant({ mesh, rootInverse: new THREE.Matrix4(), order: 0 })],
    closure,
    revision,
  };
  sources.set(mesh, source);
  return source;
};

/** @internal */
export const buildSectionSurfaceClosureForGeometry = (geometry: THREE.BufferGeometry): SectionSurfaceClosure =>
  getGeometrySource(geometry).closure;

const getGeometrySource = (geometry: THREE.BufferGeometry): SectionSurfaceSource => {
  const revision = geometryRevision(geometry);
  const cached = geometrySourceCache.get(geometry);
  if (cached?.revision === revision) {
    return cached;
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const source = createStandaloneSource(mesh);
  geometrySourceCache.set(geometry, source);
  return source;
};

const getAssociation = (
  object: THREE.Object3D,
  associations: ReadonlyMap<THREE.Object3D, GltfAssociation>,
): GltfAssociation | undefined => {
  const direct = associations.get(object);
  let nodeIndex = direct?.nodes;
  let current = object.parent;
  while (nodeIndex === undefined && current) {
    nodeIndex = associations.get(current)?.nodes;
    current = current.parent;
  }
  if (!direct && nodeIndex === undefined) {
    return undefined;
  }
  return { ...direct, nodes: nodeIndex };
};

const presentationSceneTags = new Set([sceneTag.gltfSurfacePresentation]);

const isSectionSurfaceMesh = (object: THREE.Object3D): object is SectionSurfaceMesh =>
  object instanceof THREE.Mesh && !hasSceneTagInHierarchy(object, presentationSceneTags);

const hasPositionAttribute = (geometry: THREE.BufferGeometry): boolean =>
  Object.hasOwn(geometry.attributes, 'position');

const createRegisteredSource = async (options: {
  onPack?: (milliseconds: number) => void;
  key: string;
  root: THREE.Object3D;
  owner: ModelComponentOwner | undefined;
  participants: readonly SectionSurfaceParticipant[];
}): Promise<SectionSurfaceSource> => ({
  key: options.key,
  root: options.root,
  owner: options.owner,
  participants: options.participants,
  closure: await buildClosureAsync({
    sourceKey: options.key,
    participants: options.participants,
    onPack: options.onPack,
  }),
  revision: options.participants.map((participant) => geometryRevision(participant.mesh.geometry)).join('|'),
});

/** Grades and registers the section sources of one loaded glTF scene. @internal */
export const registerGltfSectionSurfaceSources = async (options: {
  scene: THREE.Group;
  manifest: GeometryComponentManifest;
  unitId: string;
  parser: SectionTopologyGltfParser;
  onTiming?: (timing: GltfSectionTopologyTiming) => void;
  isCancelled?: () => boolean;
}): Promise<readonly SectionSurfaceSource[]> => {
  const startedAt = performance.now();
  setGltfSectionSurfaceRegistrationState(options.scene, 'pending');
  const meshes: SectionSurfaceMesh[] = [];
  options.scene.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(options.scene.matrixWorld).invert();
  options.scene.traverse((object) => {
    if (
      isSectionSurfaceMesh(object) &&
      object.type !== 'LineSegments2' &&
      hasPositionAttribute(object.geometry) &&
      !hasSceneTag(object, sceneTag.sectionViewHelper)
    ) {
      meshes.push(object);
    }
  });
  const participants = meshes.map((mesh, order) =>
    createParticipant({
      mesh,
      rootInverse,
      order,
      association: getAssociation(mesh, options.parser.associations),
    }),
  );
  const participantsByComponent = new Map<string, SectionSurfaceParticipant[]>();
  for (const participant of participants) {
    const componentId = getModelComponentId(participant.mesh);
    if (!componentId) {
      continue;
    }
    const entries = participantsByComponent.get(componentId) ?? [];
    entries.push(participant);
    participantsByComponent.set(componentId, entries);
  }

  const claimed = new Set<SectionSurfaceParticipant>();
  const sourceInputs: Array<{
    key: string;
    owner: ModelComponentOwner | undefined;
    participants: readonly SectionSurfaceParticipant[];
  }> = [];
  for (const componentId of options.manifest.nodeOrder) {
    const component = options.manifest.nodesById[componentId];
    if (component?.kind !== 'body' || component.childIds.length === 0) {
      continue;
    }
    const bodyParticipants = component.childIds.flatMap((childId) => participantsByComponent.get(childId) ?? []);
    if (bodyParticipants.length < 2) {
      continue;
    }
    for (const participant of bodyParticipants) {
      claimed.add(participant);
    }
    sourceInputs.push({
      key: `${options.unitId}:${componentId}`,
      owner: { unitId: options.unitId, componentId },
      participants: bodyParticipants,
    });
  }

  const remainingByIdentity = new Map<string, SectionSurfaceParticipant[]>();
  for (const participant of participants) {
    if (claimed.has(participant)) {
      continue;
    }
    const identity =
      participant.nodeIndex !== undefined && participant.meshIndex !== undefined
        ? `${participant.nodeIndex}:${participant.meshIndex}`
        : participant.mesh.uuid;
    const entries = remainingByIdentity.get(identity) ?? [];
    entries.push(participant);
    remainingByIdentity.set(identity, entries);
  }
  for (const [identity, sourceParticipants] of remainingByIdentity) {
    const owner = getModelComponentOwnerInHierarchy(sourceParticipants[0]!.mesh);
    sourceInputs.push({
      key: owner ? `${owner.unitId}:${owner.componentId}:${identity}` : `${options.unitId}:${identity}`,
      owner,
      participants: sourceParticipants,
    });
  }

  const submittedAt = performance.now();
  let submitMilliseconds = submittedAt - startedAt;
  const hydrateMilliseconds = 0;
  let packMilliseconds = 0;
  const onPack = (milliseconds: number): void => {
    packMilliseconds += milliseconds;
  };
  const pending: Array<Promise<SectionSurfaceSource>> = [];
  let sliceStartedAt = performance.now();
  for (const input of sourceInputs) {
    if (options.isCancelled?.()) {
      // Already submitted workers retain their inputs until their census finishes.
      // oxlint-disable-next-line no-await-in-loop -- Retain submitted participants until every worker has released them.
      await Promise.allSettled(pending);
      throw new DOMException('Section preparation superseded', 'AbortError');
    }
    const sourceStartedAt = performance.now();
    pending.push(
      createRegisteredSource({
        onPack,
        key: input.key,
        root: options.scene,
        owner: input.owner,
        participants: input.participants,
      }),
    );
    submitMilliseconds += performance.now() - sourceStartedAt;
    if (performance.now() - sliceStartedAt >= 16) {
      // oxlint-disable-next-line no-await-in-loop -- Bound main-thread submission slices while keeping workers concurrent.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      sliceStartedAt = performance.now();
    }
  }
  const sources = await Promise.all(pending);
  if (options.isCancelled?.()) {
    throw new DOMException('Section preparation superseded', 'AbortError');
  }
  sectionSourceRegistry.set(options.scene, { status: 'ready', sources });
  const completedAt = performance.now();
  const workerMilliseconds = sources.reduce(
    (total, source) => total + (source.closure.status === 'closed' ? source.closure.census.milliseconds : 0),
    0,
  );
  options.onTiming?.({
    submitMilliseconds,
    packMilliseconds,
    workerMilliseconds,
    hydrateMilliseconds,
    resolveMilliseconds: completedAt - submittedAt,
  });
  return sources;
};

/**
 * Collects registered glTF sources and standalone meshes. A mesh whose grade is still pending (its glTF is
 * registering, or its census runs in the worker) is collected with a pending closure rather than held back, so a cut
 * commits at once; `onBlocked` hears of each such wait and receives the census to await, when there is one.
 * @internal
 */
export const collectSectionSurfaceSources = (
  root: THREE.Group,
  onBlocked?: (ready?: Promise<unknown>) => void,
): VisibleSectionSurfaceSource[] => {
  const registered: SectionSurfaceSource[] = [];
  const coveredMeshes = new Set<SectionSurfaceMesh>();
  const provisionalRoots = new Map<THREE.Object3D, 'pending' | 'refused'>();
  root.traverse((object) => {
    const registration = sectionSourceRegistry.get(object);
    if (!registration) {
      return;
    }
    if (registration.status === 'pending' || registration.status === 'cancelled') {
      provisionalRoots.set(object, 'pending');
      onBlocked?.();
      return;
    }
    if (registration.status === 'unsupported') {
      provisionalRoots.set(object, 'refused');
      return;
    }
    registered.push(...registration.sources);
    for (const source of registration.sources) {
      for (const participant of source.participants) {
        coveredMeshes.add(participant.mesh);
      }
    }
  });
  const standalone: SectionSurfaceSource[] = [];
  root.traverse((object) => {
    if (
      isSectionSurfaceMesh(object) &&
      object.type !== 'LineSegments2' &&
      !coveredMeshes.has(object) &&
      hasPositionAttribute(object.geometry) &&
      !hasSceneTag(object, sceneTag.sectionViewHelper)
    ) {
      // A glTF that is registering or failed to register stands in mesh by mesh; its meshes are never graded here.
      const provisionalRoot = findAncestorInMap(object, provisionalRoots);
      if (provisionalRoot) {
        standalone.push(
          getProvisionalRegistrationSource(provisionalRoot, object, provisionalRoots.get(provisionalRoot)!),
        );
        return;
      }
      const source = getStandaloneSource(object);
      if ('ready' in source) {
        onBlocked?.(source.ready);
        standalone.push(source.provisional);
        return;
      }
      standalone.push(source);
    }
  });

  return [...registered, ...standalone].flatMap((source) => {
    const states = source.participants.map((participant) => participantVisibility(participant));
    if (states.every((state) => state === 'hidden')) {
      return [];
    }
    return [
      {
        source,
        visibility: states.every((state) => state === 'visible') ? 'complete' : 'partial',
      } as const,
    ];
  });
};

const findAncestorInMap = (
  object: THREE.Object3D,
  candidates: ReadonlyMap<THREE.Object3D, unknown>,
): THREE.Object3D | undefined => {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (candidates.has(current)) {
      return current;
    }
    current = current.parent ?? undefined;
  }
  return undefined;
};

/**
 * Where the source frame sits in the world now. Participant positions were fixed through each participant's
 * registration-time `localToSource`, and posing moves participant meshes without moving the source root, so
 * the frame follows a participant: `matrixWorld × localToSource⁻¹` (the root's `matrixWorld` while unposed).
 * It reads the participant's matrix as the caller last updated it.
 * @internal
 */
export const getSectionSourceWorldMatrix = (
  source: SectionSurfaceSource,
  target = new THREE.Matrix4(),
): THREE.Matrix4 => {
  // ponytail: one rigid placement per source, from its first participant; a body posed apart across kinematic
  // links would need per-participant slicing.
  const participant = source.participants[0]!;
  return target.copy(participant.localToSource).invert().premultiply(participant.mesh.matrixWorld);
};
