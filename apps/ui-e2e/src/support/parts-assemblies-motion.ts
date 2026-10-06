import type { GeoSpecCanonicalClaimReport, MinimumDistanceFact } from 'geospec/assertion-client';
import type { HostEngine, HostSubjectLifecycle } from '@taucad/geospec-engine-native/node';
import type { AdmittedAssemblyGlbMetadata } from '@taucad/geometry-core';
import type { AdmittedAssembly, PublishedPartAsset, TelemetrySpanRecord } from '@taucad/runtime/types';

type Vector = readonly [number, number, number];
type Matrix = readonly number[];

/** Independent column-major rigid source oracle; does not call Tau's pose solver or placement composer. */
export const multiplyMotionMatrices = (left: Matrix, right: Matrix): number[] =>
  Array.from({ length: 16 }, (_, index) => {
    const row = index % 4;
    const column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, lane) => sum + left[lane * 4 + row]! * right[column * 4 + lane]!, 0);
  });

export const transformMotionPoint = (matrix: Matrix, point: Vector): Vector => [
  matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
  matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
  matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!,
];

/** Native source millimeters and source Z-up are converted to the actual Replicad GLTF metres/Y-up frame. */
export const motionNativeToGltfPoint = ([x, y, z]: Vector): Vector => [x / 1000, z / 1000, -y / 1000];

/** The finite source's body centroid after its whole serial chain, with intrinsic placement S applied once. */
export function expectedMotionBodyCentroid(chain: number, body: number, driverRadians: number): Vector {
  let point: Vector = [18 + body * 22, chain * 40 + 4, 3];
  const ratios = [1, 0.5, -0.5, 0.25, -0.25];
  for (let joint = body; joint >= 0; joint -= 1) {
    const angle = driverRadians * ratios[joint]!;
    const x = 10 + joint * 22;
    const y = chain * 40;
    const dx = point[0] - x;
    const dy = point[1] - y;
    point = [
      x + Math.cos(angle) * dx - Math.sin(angle) * dy,
      y + Math.sin(angle) * dx + Math.cos(angle) * dy,
      point[2],
    ];
  }
  return motionNativeToGltfPoint(point);
}

export const motionEvidenceRequirements = Object.freeze({
  realMovingLinks: 100,
  admittedDefinitions: 1,
  admittedLeafOccurrences: 4,
  animationFrames: 120,
  environment: 'Chrome151 / M2Pro12core / 32GiB / 1920x1080 / DPR1',
  requiredNativeFlushBarrier:
    'A real explicit posed minimum-distance export may drain dispatcher telemetry; require retained origin/epoch/span markers and verified interval coverage before concluding zero. No debug flush/export verb.',
  sourceSpanNames: ['kernel.compute', 'kernel.execute', 'kernel.render', 'create.serializeNativeHandle'],
  submissionBoundary:
    'Draw-eligible geometry and indexed triangles are not actual renderer submissions or GPU upload/binding bytes.',
});

/** Narrow consumed browser evidence; app-private rows are transported by the owning bridge. */
export type MotionDrawObservation = Readonly<{
  key: string;
  presentationRevision: number;
  candidateSceneId: string;
  unitId: string;
  poseRevision: number;
  canonicalToRenderMatrix: readonly number[];
  mechanism: AdmittedAssemblyGlbMetadata['mechanism'];
  canonicalComponents: ReadonlyArray<
    Readonly<{
      ancestry: AdmittedAssemblyGlbMetadata['components'][number]['ancestry'];
      component: Pick<AdmittedAssemblyGlbMetadata['components'][number]['component'], 'id' | 'name'>;
    }>
  >;
  surfaces: ReadonlyArray<
    Readonly<{
      componentId: string;
      objectId: number;
      objectUuid: string;
      instanceId?: number;
      canonicalRenderBounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
      drawMatrixWorld: readonly number[];
      drawGeometryId: string;
      canonicalGeometryId: string;
      materialIds: readonly string[];
      materialOpacities: readonly number[];
      indexVersion?: number;
      attributeVersions: Readonly<Record<string, number>>;
      visible: boolean;
      projection: Readonly<{ intersectsFrustum: boolean; finiteProjection: boolean }>;
    }>
  >;
  edges: ReadonlyArray<
    Readonly<{
      objectId: number;
      geometryId: string;
      positionVersions: Readonly<Record<string, number>>;
      segments: ReadonlyArray<Readonly<{ componentId: string; first: number; count: number }>>;
      mandatoryTriangles: number;
      visible: boolean;
    }>
  >;
}>;

/** Test-owned consumed camera gesture; production camera semantics are qualified by actual product assertions. */
export type AssemblyTestCamera = Readonly<{
  position: Vector;
  bounds?: Readonly<{ min: Vector; max: Vector }>;
  target?: Vector;
  fov?: number;
  zoom?: number;
  rollRadians?: number;
}>;

/** Additional data consumed by assembly product controls, beyond motion's existing narrow rows. */
export type AssemblyDrawObservation = Omit<MotionDrawObservation, 'surfaces'> &
  Readonly<{
    canvas: Readonly<{ cssWidth: number; cssHeight: number; bufferWidth: number; bufferHeight: number }>;
    frustumSurfaceTriangleUpperBound: number;
    residentMandatoryEdgeTriangles: number;
    surfaces: ReadonlyArray<
      MotionDrawObservation['surfaces'][number] &
        Readonly<{
          drawTriangles: number;
          projection: MotionDrawObservation['surfaces'][number]['projection'] &
            Readonly<{
              corners: ReadonlyArray<Readonly<{ x: number; y: number; depth: number }>>;
            }>;
        }>
    >;
  }>;

/** Explicit untimed known-record subset; neither complete GPU residency nor upload bytes. */
export type AssemblyBackendObservation = Readonly<{
  backend: 'webgl' | 'webgpu';
  candidateSceneId: string;
  samples: ReadonlyArray<
    Readonly<{
      objectUuid: string;
      materialUuid: string;
      buffers: ReadonlyArray<Readonly<{ ordinal: number; binding: string; slot?: number; divisor?: number }>>;
      missingRecords: readonly string[];
    }>
  >;
  buffers: ReadonlyArray<Readonly<{ ordinal: number; bytes: number; usage?: number }>>;
  uniqueObservedBufferBytes: number;
  completeResidentInventory: false;
  uploadedBytes: undefined;
}>;

type AssemblyTestSectionCut =
  | Readonly<{ id: string; kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>
  | Readonly<{ id: string; kind: 'revolution' }>;

export type MotionBrowserWindow = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCommittedDrawInventory(): AssemblyDrawObservation | undefined;
    exportCurrentPosedAssembly(): Promise<MotionPosedExport>;
    getCommittedAssembly(): Readonly<{
      assemblyDisplay: Readonly<{ root: PublishedPartAsset; admitted: AdmittedAssembly }> | undefined;
      diagnostics: Readonly<{
        projectId: string | undefined;
        outcome: 'success' | 'failure' | undefined;
        requestedKey: string | undefined;
        presentedKey: string | undefined;
        requestedRevision: number;
        presentedRevision: number;
        sourceEntryPath: string | undefined;
        sourceGeometryHash: string | undefined;
        requestedRenderId: number | undefined;
        settledRenderId: number | undefined;
      }>;
      isCurrent(): boolean;
      readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
    }>;
    getCamera(): Readonly<{
      position: Vector;
      quaternion: readonly [number, number, number, number];
      bounds: Readonly<{ min: Vector; max: Vector }>;
      target: Vector;
      direction: Vector;
      up: Vector;
      verticalSpan: number;
      requestedPerspectiveZoom: number;
      actorStatus: string;
      projection: 'orthographic' | 'perspective';
      fov?: number;
      zoom?: number;
      requestedFov: number;
      aspect: number;
    }>;
    setCamera(camera: AssemblyTestCamera): void;
    isViewRecordApplied(): Promise<boolean>;
    setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
    setPostProcessingEnabled(enabled: boolean): void;
    setAssemblyDetailCalibration(calibration: unknown): void;
    getAssemblyResourceTelemetry(): readonly TelemetrySpanRecord[];
    getRendererIdentity(
      options?: Readonly<{ includeRenderDevice?: boolean; includeRendererName?: boolean }>,
    ): Readonly<{
      api: 'webgl' | 'webgpu';
      name: string;
      frame: number;
      renderDevice?:
        | Readonly<{ status: 'unavailable'; reason: string }>
        | Readonly<{
            status: 'observed';
            source: 'mounted-webgl-context' | 'mounted-webgpu-canvas-device';
            canvasMatches: true;
            configuredDeviceMatches: boolean | undefined;
            vendor: string;
            architecture: string;
            device: string;
            description: string;
            isFallbackAdapter: boolean | undefined;
            identityFieldsComplete: boolean;
          }>;
    }>;
    getViewportCanvas(): HTMLCanvasElement;
    observeBackendBindings(options?: Readonly<{ signal?: AbortSignal }>): Promise<AssemblyBackendObservation>;
    setRenderFrame(frame: Readonly<{ originMeters: readonly number[]; metersPerRenderUnit: number }>): void;
    getModelVisibility(): Readonly<{ hiddenComponentIds: readonly string[]; isolatedComponentIds: readonly string[] }>;
    getRenderedModelComponentState(id: string): Readonly<{
      meshCount: number;
      visibleMeshCount: number;
      materialOpacities: readonly number[];
      edgeMaterials: ReadonlyArray<
        Readonly<{
          objectId: string;
          materialId: string;
          visible: boolean;
          linewidth: number;
          alphaToCoverage: boolean;
          side: number;
          depthWrite: boolean;
          depthTest: boolean;
          transparent: boolean;
          edgePresentationCoverage: boolean;
          edgePresentationLineWidth: number;
          edgePresentationCoverageGamma: number;
          useViewportSrgbBlend: boolean;
        }>
      >;
    }>;
    projectWorldPoint(point: Vector): Readonly<{ x: number; y: number; visible: boolean }>;
    projectModelComponent(componentId: string): ReadonlyArray<Readonly<{ x: number; y: number; visible: boolean }>>;
    getRenderFrame(): Readonly<{ originMeters: readonly number[]; metersPerRenderUnit: number }>;
    getModelHoverState(): Readonly<{
      activeUnitId?: string;
      hoveredComponentId?: string;
      selectedComponentIds?: readonly string[];
      rayParity?: Readonly<{
        candidateSceneId: string;
        pointer: readonly [number, number];
        clippingEnabled: boolean;
        stockComponentId?: string;
        unclippedStockComponentId?: string;
        tauComponentId?: string;
      }>;
    }>;
    setSectionCuts(
      cuts: ReadonlyArray<Readonly<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>>,
    ): readonly string[];
    setSectionViewActive(active: boolean): void;
    getSectionState(): Readonly<{
      isActive: boolean;
      isCommitted: boolean;
      cuts: readonly AssemblyTestSectionCut[];
      committedCuts: readonly AssemblyTestSectionCut[];
    }>;
    getSectionCapCompleteness():
      | Readonly<{
          status: string;
          trueCutComponentCount?: number;
          cappedTrueCutComponentCount?: number;
          unsupportedSourceCount?: number;
        }>
      | undefined;
    getMeasureState(): MotionMeasureObservation;
    getCadActivity(): MotionActivityObservation | undefined;
    armCadTelemetryIngress(): boolean;
    readCadTelemetryIngress(): readonly TelemetrySpanRecord[];
    stopCadTelemetryIngress(): readonly TelemetrySpanRecord[];
    clearCadTelemetryIngress(): void;
    getGraphicsBackend(): 'webgl' | 'webgpu';
    getModelComponents(): ReadonlyArray<Readonly<{ id: string; name: string }>>;
    hideModelComponent(componentId: string): void;
    isolateModelComponent(componentId: string): void;
    resetModelVisibility(): void;
  };
  __TAU_HEADLESS_IMAGE_DEBUG__?: { readonly records: readonly MotionHeadlessRecord[] };
  __TAU_KINEMATICS_TEST__?: {
    getState(unitId: string):
      | Readonly<{
          revision: number;
          coordinates: Readonly<Record<string, number>>;
          playback: Readonly<{ status: string; time: number }>;
          atLimit: readonly string[];
        }>
      | undefined;
  };
};

export type AssemblyTestBridgeApi = NonNullable<MotionBrowserWindow['__TAU_SECTION_VIEW_TEST__']>;

/** Actual admitted revolute-link component identities, independent of namespace encoding and object names. */
export function getMovingMotionComponentIds(observation: MotionDrawObservation): readonly string[] {
  const { mechanism } = observation;
  if (!mechanism) {
    throw new Error('The committed native fixture has no admitted mechanism.');
  }
  return Object.values(mechanism.joints)
    .filter((joint) => joint.type === 'revolute')
    .flatMap((joint) => mechanism.links[joint.child]?.components ?? []);
}

/** CPU-side resource evidence only. Equal versions/identities are not a GPU upload counter. */
export function motionResourceSignature(observation: MotionDrawObservation): string {
  return JSON.stringify({
    surfaces: observation.surfaces
      .map(
        ({
          componentId,
          objectId,
          drawGeometryId,
          canonicalGeometryId,
          materialIds,
          indexVersion,
          attributeVersions,
        }) => ({
          componentId,
          objectId,
          drawGeometryId,
          canonicalGeometryId,
          materialIds,
          indexVersion,
          attributeVersions,
        }),
      )
      .sort((a, b) => a.componentId.localeCompare(b.componentId)),
    edges: observation.edges
      .map(({ objectId, geometryId, positionVersions, segments }) => ({
        objectId,
        geometryId,
        positionVersions,
        segments,
      }))
      .sort((a, b) => a.objectId - b.objectId),
  });
}

const motionIdentity: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Independent affine matrix inversion for the explicit observed render frame, no Tau pose/frame helper. */
export function invertMotionMatrix(matrix: Matrix): Matrix {
  if (
    matrix.length !== 16 ||
    !matrix.every((value) => Number.isFinite(value)) ||
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new TypeError('Motion frame requires a finite affine matrix.');
  }
  const a = matrix[0]!,
    b = matrix[4]!,
    c = matrix[8]!,
    d = matrix[1]!,
    middle = matrix[5]!,
    f = matrix[9]!,
    g = matrix[2]!,
    h = matrix[6]!,
    i = matrix[10]!;
  const determinant = a * (middle * i - f * h) - b * (d * i - f * g) + c * (d * h - middle * g);
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError('Motion frame is singular.');
  }
  const inverse = [
    (middle * i - f * h) / determinant,
    (f * g - d * i) / determinant,
    (d * h - middle * g) / determinant,
    0,
    (c * h - b * i) / determinant,
    (a * i - c * g) / determinant,
    (b * g - a * h) / determinant,
    0,
    (b * f - c * middle) / determinant,
    (c * d - a * f) / determinant,
    (a * middle - b * d) / determinant,
    0,
    0,
    0,
    0,
    1,
  ];
  const translation = transformMotionPoint(inverse, [matrix[12]!, matrix[13]!, matrix[14]!]);
  inverse[12] = -translation[0];
  inverse[13] = -translation[1];
  inverse[14] = -translation[2];
  return inverse;
}

/** Independent finite revolute/fixed constraint oracle using the admitted world joint origins/axes. */
export function expectedMotionLinkDisplacements(
  mechanism: NonNullable<MotionDrawObservation['mechanism']>,
  coordinates: Readonly<Record<string, number>>,
): ReadonlyMap<string, Matrix> {
  if (mechanism.units.length !== 'm' || mechanism.units.angle !== 'rad') {
    throw new Error('C6 expected canonical m/rad metadata.');
  }
  const values: Record<string, number> = { ...coordinates };
  for (const coupling of mechanism.couplings ?? []) {
    if (!('ratio' in coupling)) {
      throw new Error('C6 only admits its authored finite linear couplings.');
    }
    const driver = values[coupling.driver];
    if (driver === undefined || !Number.isFinite(driver)) {
      throw new Error('Missing actual driver coordinate.');
    }
    values[coupling.follower] = driver * coupling.ratio + (coupling.offset ?? 0);
  }
  const jointByChild = new Map(Object.entries(mechanism.joints).map(([id, joint]) => [joint.child, { id, joint }]));
  const result = new Map<string, Matrix>();
  const visiting = new Set<string>();
  const visit = (linkId: string): Matrix => {
    const retained = result.get(linkId);
    if (retained) {
      return retained;
    }
    if (visiting.has(linkId)) {
      throw new Error('Cyclic committed mechanism.');
    }
    visiting.add(linkId);
    const entry = jointByChild.get(linkId);
    if (!entry) {
      if (linkId !== mechanism.root) {
        throw new Error('Disconnected committed mechanism.');
      }
      result.set(linkId, motionIdentity);
      visiting.delete(linkId);
      return motionIdentity;
    }
    const { id, joint } = entry;
    let displacement: Matrix = motionIdentity;
    if (joint.type === 'revolute') {
      const angle = values[id];
      if (angle === undefined || !Number.isFinite(angle)) {
        throw new Error('Missing revolute coordinate.');
      }
      if (joint.limits && (angle < joint.limits.lower - 1e-12 || angle > joint.limits.upper + 1e-12)) {
        throw new RangeError('Committed pose violates authored limits.');
      }
      const length = Math.hypot(...joint.axis);
      if (!(length > 0)) {
        throw new RangeError('Joint axis is zero.');
      }
      const [x, y, z] = joint.axis.map((value) => value / length);
      const cosine = Math.cos(angle),
        sine = Math.sin(angle),
        complement = 1 - cosine;
      const rotation = [
        cosine + x! * x! * complement,
        y! * x! * complement + z! * sine,
        z! * x! * complement - y! * sine,
        0,
        x! * y! * complement - z! * sine,
        cosine + y! * y! * complement,
        z! * y! * complement + x! * sine,
        0,
        x! * z! * complement + y! * sine,
        y! * z! * complement - x! * sine,
        cosine + z! * z! * complement,
        0,
        0,
        0,
        0,
        1,
      ];
      const rotated = transformMotionPoint(rotation, joint.origin);
      rotation[12] = joint.origin[0] - rotated[0];
      rotation[13] = joint.origin[1] - rotated[1];
      rotation[14] = joint.origin[2] - rotated[2];
      displacement = rotation;
    } else if (joint.type !== 'fixed') {
      throw new Error('C6 fixture unexpectedly contains a non-revolute moving joint.');
    }
    const matrix = multiplyMotionMatrices(visit(joint.parent), displacement);
    result.set(linkId, matrix);
    visiting.delete(linkId);
    return matrix;
  };
  for (const id of Object.keys(mechanism.links)) {
    visit(id);
  }
  return result;
}

/** Data already retained by the real CAD actor; markers are origin + numeric span ID, not request IDs. */
export type MotionActivityObservation = Readonly<{
  telemetryEntries: readonly TelemetrySpanRecord[];
  lastRequestedRenderId?: number;
  lastSettledRenderId?: number;
}>;
export type MotionHeadlessRecord = Readonly<{
  name: string;
  startTime: number;
  duration: number;
  detail: Readonly<Record<string, unknown>>;
}>;
export type MotionMeasureObservation = Readonly<{
  isMeasureActive: boolean;
  cameraInteracting: boolean;
  measurementUiMeshCount: number;
  rendererGeometryCount: number;
  snapDistancePx: number;
  activeCandidateId: string | undefined;
  lockedTargetId: string | undefined;
  mode: string;
  candidates: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  currentStart: Vector | undefined;
  measurements: ReadonlyArray<
    Readonly<{
      id: string;
      distance: number;
      startPoint: Vector;
      endPoint: Vector;
      operation?: string;
      quality?: string;
      status?: string;
      unavailableReason?: string;
    }>
  >;
}>;

/** Bind a body catalog value to its actual installed draw owner; repeated names never select a different occurrence. */
export function getMotionBodyCandidate(
  row: Pick<MotionDrawObservation['surfaces'][number], 'objectUuid' | 'instanceId'>,
  catalog: MotionMeasureObservation['candidates'],
): string {
  const occurrence = row.instanceId === undefined ? row.objectUuid : `${row.objectUuid}@instance:${row.instanceId}`;
  const prefix = `${row.objectUuid}:${occurrence}:`;
  const candidates = catalog.filter(({ id }) => id.startsWith(prefix));
  if (candidates.length !== 1) {
    throw new Error('Expected one actual whole-body target for this canonical draw owner.');
  }
  return candidates[0]!.id;
}

/** Verify the serial runtime interval was drained by a real native STEP export, failing on reset, truncation or gaps. */
export function verifyDrainedMotionActivity(
  input: Readonly<{
    before: MotionActivityObservation;
    during: MotionActivityObservation;
    after: MotionActivityObservation;
    ingress?: Readonly<{ during: readonly TelemetrySpanRecord[]; after: readonly TelemetrySpanRecord[] }>;
    intervalStart: number;
    intervalEnd: number;
  }>,
): Readonly<{
  origin: string;
  beforeSpanId: number;
  afterSpanId: number;
  observedSpans: number;
  counts: Readonly<Record<string, number>>;
}> {
  const { before, intervalStart, intervalEnd, ingress } = input;
  const ordinary = [before, input.during, input.after] as const;
  if (ingress) {
    const baseline = before.telemetryEntries.findLast(({ name }) => name === 'export.exportSTEP');
    const identity = (entry: TelemetrySpanRecord): string =>
      `${entry.origin.instance}:${String(entry.detail?.['spanId'])}`;
    if (
      ingress.after.length > 2000 ||
      ingress.during.length > ingress.after.length ||
      ingress.during.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(ingress.after[index]))
    ) {
      throw new Error('Telemetry ingress was truncated, replaced or reached its evidence capacity.');
    }
    if (
      ingress.after.some(
        (entry) =>
          entry.origin.instance !== baseline?.origin.instance ||
          entry.origin.label !== baseline.origin.label ||
          !Number.isFinite(entry.epoch) ||
          entry.workerTimeOrigin !== baseline.workerTimeOrigin,
      )
    ) {
      throw new Error('Runtime producer changed during the observed interval.');
    }
    const captured = new Map([...before.telemetryEntries, ...ingress.after].map((entry) => [identity(entry), entry]));
    for (const [snapshot, frontier] of [
      [input.during, ingress.during],
      [input.after, ingress.after],
    ] as const) {
      const known = new Map([...before.telemetryEntries, ...frontier].map((entry) => [identity(entry), entry]));
      if (
        snapshot.telemetryEntries.some((entry) => JSON.stringify(known.get(identity(entry))) !== JSON.stringify(entry))
      ) {
        throw new Error('Ordinary CAD activity disagrees with captured telemetry ingress.');
      }
      const ordinaryIds = snapshot.telemetryEntries
        .filter((entry) => entry.origin.instance === baseline?.origin.instance)
        .map((entry) => Number(entry.detail?.['spanId']));
      const expectedIds = [...known.values()]
        .filter((entry) => entry.origin.instance === baseline?.origin.instance)
        .map((entry) => Number(entry.detail?.['spanId']));
      if (Math.max(...ordinaryIds) !== Math.max(...expectedIds)) {
        throw new Error('Ordinary CAD activity frontier disagrees with captured telemetry ingress.');
      }
    }
    if (captured.size !== before.telemetryEntries.length + ingress.after.length) {
      throw new Error('Duplicate runtime span identity.');
    }
  }
  const during = ingress
    ? { ...input.during, telemetryEntries: [...before.telemetryEntries, ...ingress.during] }
    : input.during;
  const after = ingress
    ? { ...input.after, telemetryEntries: [...before.telemetryEntries, ...ingress.after] }
    : input.after;
  const snapshots = [before, during, after] as const;
  if (!Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd) || intervalEnd <= intervalStart) {
    throw new RangeError('Missing finite animation interval.');
  }
  if (
    before.lastRequestedRenderId === undefined ||
    before.lastRequestedRenderId !== before.lastSettledRenderId ||
    snapshots.some(
      (snapshot) =>
        snapshot.lastRequestedRenderId !== before.lastRequestedRenderId ||
        snapshot.lastSettledRenderId !== before.lastSettledRenderId,
    )
  ) {
    throw new Error('CAD request or settled source changed during animation.');
  }
  const spanId = (entry: TelemetrySpanRecord): number => {
    const id = entry.detail?.['spanId'];
    if (
      typeof id !== 'string' ||
      !/^\d+$/u.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      !Number.isFinite(entry.startTime) ||
      !Number.isFinite(entry.duration) ||
      entry.duration < 0 ||
      !Number.isFinite(entry.epoch) ||
      !Number.isFinite(entry.workerTimeOrigin) ||
      !entry.origin.instance
    ) {
      throw new Error('Invalid or unqualified runtime span marker.');
    }
    return Number(id);
  };
  const baselineDrain = before.telemetryEntries.findLast(({ name }) => name === 'export.exportSTEP');
  if (!baselineDrain) {
    throw new Error('No completed native STEP drain marker before animation.');
  }
  const origin = baselineDrain.origin.instance;
  const prior = before.telemetryEntries.filter((entry) => entry.origin.instance === origin);
  const priorById = new Map(prior.map((entry) => [spanId(entry), entry]));
  const duringEntries = during.telemetryEntries.filter((entry) => entry.origin.instance === origin);
  const afterEntries = after.telemetryEntries.filter((entry) => entry.origin.instance === origin);
  const duringById = new Map(duringEntries.map((entry) => [spanId(entry), entry]));
  const afterById = new Map(afterEntries.map((entry) => [spanId(entry), entry]));
  if (
    priorById.size !== prior.length ||
    duringById.size !== duringEntries.length ||
    afterById.size !== afterEntries.length
  ) {
    throw new Error('Duplicate runtime span identity.');
  }
  if (
    ordinary.some(
      (snapshot) =>
        snapshot.telemetryEntries.length >= 2000 ||
        snapshot.telemetryEntries.filter((entry) => entry.detail?.['parentSpanId'] === undefined).length > 20,
    )
  ) {
    throw new Error('Runtime interval reached its retained evidence capacity.');
  }
  const traceRoot = (
    entry: TelemetrySpanRecord,
    entries: ReadonlyMap<number, TelemetrySpanRecord>,
  ): TelemetrySpanRecord => {
    let currentEntry = entry;
    while (currentEntry.detail?.['parentSpanId'] !== undefined) {
      const parent = currentEntry.detail['parentSpanId'];
      if (
        typeof parent !== 'string' ||
        !/^\d+$/u.test(parent) ||
        !Number.isSafeInteger(Number(parent)) ||
        Number(parent) >= spanId(currentEntry)
      ) {
        throw new Error('Invalid runtime span ancestry.');
      }
      const ancestor = entries.get(Number(parent));
      if (
        !ancestor ||
        ancestor.epoch !== entry.epoch ||
        ancestor.workerTimeOrigin !== entry.workerTimeOrigin ||
        ancestor.origin.instance !== entry.origin.instance ||
        ancestor.origin.label !== entry.origin.label
      ) {
        throw new Error('Incomplete or changed compound runtime trace.');
      }
      currentEntry = ancestor;
    }
    return currentEntry;
  };
  const beforeSpanId = Math.max(...priorById.keys());
  traceRoot(baselineDrain, priorById);
  const knownOrigins = new Set(before.telemetryEntries.map((entry) => entry.origin.instance));
  for (const [previous, next, previousById, nextById] of [
    [before, during, priorById, duringById],
    [during, after, duringById, afterById],
  ] as const) {
    const previousSpanId = Math.max(...previousById.keys());
    const nextSpanId = Math.max(...nextById.keys());
    if (!Number.isFinite(previousSpanId) || !Number.isFinite(nextSpanId)) {
      throw new TypeError('Runtime marker was lost, truncated or replaced.');
    }
    if (
      next.telemetryEntries.some(
        (entry) =>
          !knownOrigins.has(entry.origin.instance) ||
          (entry.origin.instance !== origin &&
            !previous.telemetryEntries.some((priorEntry) => JSON.stringify(priorEntry) === JSON.stringify(entry))),
      )
    ) {
      throw new Error('Runtime producer changed during the observed interval.');
    }
    const frontier = traceRoot(previousById.get(previousSpanId)!, previousById);
    for (const [id, entry] of previousById) {
      const retained = nextById.get(id);
      if (
        (retained !== undefined && JSON.stringify(retained) !== JSON.stringify(entry)) ||
        (!retained && traceRoot(entry, previousById) === frontier)
      ) {
        throw new Error('Runtime marker was lost, truncated or replaced.');
      }
    }
    for (let id = previousSpanId + 1; id <= nextSpanId; id++) {
      if (!nextById.has(id)) {
        throw new Error('Incomplete runtime span interval; unfinished or lost work is unknown.');
      }
    }
    for (const id of nextById.keys()) {
      if (id <= previousSpanId && !previousById.has(id)) {
        throw new Error('Work active before animation completed inside its evidence interval.');
      }
    }
  }
  const current = [...duringEntries, ...afterEntries.filter((entry) => !duringById.has(spanId(entry)))];
  const currentById = new Map(current.map((entry) => [spanId(entry), entry]));
  const drain = current.findLast((entry) => entry.name === 'export.exportSTEP' && spanId(entry) > beforeSpanId);
  if (!drain || drain.workerTimeOrigin !== baselineDrain.workerTimeOrigin) {
    throw new Error('No completed same-producer native STEP drain after animation.');
  }
  const beforeEnd =
    Math.max(baselineDrain.epoch, baselineDrain.workerTimeOrigin) + baselineDrain.startTime + baselineDrain.duration;
  const afterStart = Math.min(drain.epoch, drain.workerTimeOrigin) + drain.startTime;
  if (beforeEnd >= intervalStart || afterStart <= intervalEnd) {
    throw new Error('Native drain markers do not bracket the actual animation interval.');
  }
  const afterSpanId = Math.max(...currentById.keys());
  if (afterSpanId - beforeSpanId > 2000) {
    throw new Error('Runtime interval exceeds its retained evidence capacity.');
  }
  const forbidden = [...motionEvidenceRequirements.sourceSpanNames, 'replicad.run-main', 'kernel.export-compute'];
  const counts: Record<string, number> = Object.fromEntries(forbidden.map((name) => [name, 0]));
  const stepChildren = new Set([
    'step.product.prepare',
    'step.document.build',
    'step.writer.perform',
    'step.file.transfer',
  ]);
  for (const [id, entry] of currentById) {
    if (id <= beforeSpanId) {
      continue;
    }
    if (
      entry.workerTimeOrigin !== baselineDrain.workerTimeOrigin ||
      entry.origin.label !== baselineDrain.origin.label
    ) {
      throw new Error('Runtime producer clock or label changed during the observed interval.');
    }
    const root = traceRoot(entry, currentById);
    if (spanId(root) <= beforeSpanId) {
      throw new Error('New runtime work extends a baseline trace.');
    }
    const earliestStart = Math.min(entry.epoch, entry.workerTimeOrigin) + entry.startTime;
    const latestEnd = Math.max(entry.epoch, entry.workerTimeOrigin) + entry.startTime + entry.duration;
    if (earliestStart < intervalEnd && latestEnd > intervalStart) {
      throw new Error('Runtime work overlapped the actual animation interval.');
    }
    if (Object.hasOwn(counts, entry.name)) {
      counts[entry.name]! += 1;
      continue;
    }
    if (
      (entry.name === 'fs.read' && root === entry) ||
      (entry.name === 'export.exportSTEP' && root === entry) ||
      (stepChildren.has(entry.name) && root.name === 'export.exportSTEP' && root !== entry)
    ) {
      continue;
    }
    throw new Error(`Unclassified runtime work during animation: ${entry.name}`);
  }
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new Error(`Animation performed observed source/native/preview work: ${JSON.stringify(counts)}`);
  }
  return { origin, beforeSpanId, afterSpanId, observedSpans: afterSpanId - beforeSpanId, counts };
}

/** Existing bounded admission records prove absence only after actual warm completion and an idle retained baseline. */
export function verifyNoMotionThumbnailJobs(
  before: readonly MotionHeadlessRecord[],
  after: readonly MotionHeadlessRecord[],
): Readonly<{ admitted: number; completed: number; transcodes: number }> {
  if (before.length >= 512 || after.length >= 512) {
    throw new Error('Headless job evidence reached its retained capacity; admission history is unknown.');
  }
  if (
    after.length < before.length ||
    before.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(after[index]))
  ) {
    throw new Error('Headless job marker was lost, truncated or reset.');
  }
  const pending = new Map<string, number>();
  let warmed = false;
  for (const entry of before) {
    if (!['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete'].includes(entry.name)) {
      continue;
    }
    const { kind, identity } = entry.detail;
    if (
      (kind !== 'capture' && kind !== 'automatic-thumbnail' && kind !== 'manual-thumbnail') ||
      typeof identity !== 'string' ||
      identity.length === 0
    ) {
      throw new TypeError('Headless record omitted its actual job kind or identity.');
    }
    const key = JSON.stringify([kind, identity]);
    const count = pending.get(key) ?? 0;
    if (entry.name === 'queue.admit') {
      pending.set(key, count + 1);
    } else if (count === 0) {
      throw new Error('Headless execution or completion has no retained admission.');
    } else if (entry.name === 'job.complete') {
      pending.set(key, count - 1);
      warmed ||= entry.detail['success'] === true;
    }
  }
  if (!warmed) {
    throw new Error('Headless image evidence was not warmed through an actual completed admitted job.');
  }
  if ([...pending.values()].some((count) => count !== 0)) {
    throw new Error(
      'Headless image work was already pending at animation start; unresolved admissions remain unknown.',
    );
  }
  const appendedRecords = after.slice(before.length);
  for (const { name, detail } of appendedRecords) {
    if (
      ['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete'].includes(name) &&
      ((detail['kind'] !== 'capture' &&
        detail['kind'] !== 'automatic-thumbnail' &&
        detail['kind'] !== 'manual-thumbnail') ||
        typeof detail['identity'] !== 'string' ||
        detail['identity'].length === 0)
    ) {
      throw new TypeError('Appended headless work omitted its actual job kind or identity.');
    }
  }
  const appended = appendedRecords.filter(
    ({ detail }) => detail['kind'] === 'automatic-thumbnail' || detail['kind'] === 'manual-thumbnail',
  );
  const counts = {
    admitted: appended.filter(({ name }) => name === 'queue.admit').length,
    completed: appended.filter(({ name }) => name === 'job.complete').length,
    transcodes: appended.filter(({ name }) => name === 'runtime.transcode').length,
  };
  if (appended.some(({ name }) => name === 'queue.wait') || Object.values(counts).some((count) => count !== 0)) {
    throw new Error(`Animation admitted canonical thumbnail work: ${JSON.stringify(counts)}`);
  }
  return counts;
}

/** Copied debug-only full-pose export, acquired separately from the unchanged pair worker request. */
export type MotionPosedExport = Readonly<{
  root: PublishedPartAsset;
  projectId: string;
  sourceEntryPath: string;
  key: string;
  unitId: string;
  poseRevision: number;
  presentationRevision: number;
  candidateSceneId: string;
  coordinateSystem: 'y-up';
  canonicalIds: readonly string[];
  exportId: string;
  bytes: readonly number[];
}>;

/** Test-only evidence from the existing real AP242 worker; never a second export request. */
export type MotionExactBinding = Readonly<{
  key: string;
  unitId: string;
  poseRevision: number;
  candidateSceneId: string;
  names: readonly [string, string];
}>;
type MotionExactResponse = Readonly<{
  id: number;
  status: 'cad-geometry';
  distanceMeters: number;
  firstPointMeters: Vector;
  secondPointMeters: Vector;
  source: 'ap242';
}>;
export type MotionExactObservation = Readonly<{
  workerUrl: string;
  binding: MotionExactBinding;
  id: number;
  bytes: readonly number[];
  response: MotionExactResponse | undefined;
  failure: string | undefined;
}>;
export type MotionExactObservationWindow = MotionBrowserWindow & {
  __TAU_C6_EXACT_OBSERVATION__?: {
    arm(binding: MotionExactBinding): void;
    read(): MotionExactObservation | undefined;
  };
};

/** Installed only by this finite e2e test before navigation, using the exact source-mapped built asset path. */
export function installMotionExactWorkerObservation(assetPath: string): void {
  const browser: MotionExactObservationWindow = globalThis;
  let armed: MotionExactBinding | undefined;
  let observedWorker: Worker | undefined;
  let observation:
    | {
        workerUrl: string;
        binding: MotionExactBinding;
        id: number;
        bytes: number[];
        response: MotionExactResponse | undefined;
        failure: string | undefined;
      }
    | undefined;
  const current = (binding: MotionExactBinding): boolean => {
    const draw = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
    return (
      draw !== undefined &&
      draw.key === binding.key &&
      draw.unitId === binding.unitId &&
      draw.poseRevision === binding.poseRevision &&
      draw.candidateSceneId === binding.candidateSceneId
    );
  };
  browser.__TAU_C6_EXACT_OBSERVATION__ = {
    arm(binding) {
      if (armed !== undefined || observation !== undefined || !current(binding)) {
        throw new Error('Exact observation requires one coherent explicit measurement.');
      }
      armed = binding;
    },
    read() {
      return observation;
    },
  };
  const { Worker: nativeWorker } = globalThis;
  globalThis.Worker = class extends nativeWorker {
    public constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);
      const actualUrl = new URL(String(scriptURL), location.href);
      if (
        actualUrl.origin !== location.origin ||
        actualUrl.pathname !== assetPath ||
        actualUrl.search ||
        actualUrl.hash
      ) {
        return;
      }
      const { postMessage: nativePostMessage } = this;
      this.postMessage = new Proxy(nativePostMessage, {
        apply: (original, receiver: unknown, argumentsList: unknown[]) => {
          try {
            if (armed) {
              if (observation) {
                observation.failure = 'More than one matching native request was observed.';
              } else {
                if (receiver !== this) {
                  throw new Error('Native request receiver changed.');
                }
                const value: unknown = argumentsList[0];
                if (!value || typeof value !== 'object') {
                  throw new Error('Native request is absent.');
                }
                const request = value as Record<string, unknown>;
                const sourceValue = request['source'];
                if (!sourceValue || typeof sourceValue !== 'object') {
                  throw new Error('Native request source is absent.');
                }
                const source = sourceValue as Record<string, unknown>;
                const { occurrences } = request;
                const { id } = request;
                const { bytes } = source;
                if (
                  typeof id !== 'number' ||
                  !Number.isSafeInteger(id) ||
                  source['format'] !== 'ap242' ||
                  source['coordinateSystem'] !== 'y-up' ||
                  !(bytes instanceof Uint8Array) ||
                  bytes.byteLength === 0 ||
                  !Array.isArray(occurrences) ||
                  occurrences.length !== 2 ||
                  !occurrences.every(
                    (row: unknown, index) =>
                      row !== null &&
                      row !== undefined &&
                      typeof row === 'object' &&
                      'name' in row &&
                      row.name === armed?.names[index],
                  ) ||
                  !current(armed)
                ) {
                  throw new Error('Native request bytes/names/current pose are unqualified.');
                }
                // Copy before the original call. No argument, overload, transfer list, options or receiver is replaced.
                // Preserve the actual sender for response identity; the native forwarding receiver/overloads remain unchanged.
                /* oxlint-disable-next-line typescript/no-this-alias, unicorn/no-this-assignment -- The bounded worker observation retains the real native sender for its later response fence. */
                observedWorker = this;
                observation = {
                  workerUrl: actualUrl.href,
                  binding: armed,
                  id,
                  bytes: [...bytes],
                  response: undefined,
                  failure: undefined,
                };
              }
            }
          } catch (error) {
            if (armed && !observation) {
              observation = {
                workerUrl: actualUrl.href,
                binding: armed,
                id: -1,
                bytes: [],
                response: undefined,
                failure: error instanceof Error ? error.message : 'Exact request observation failed.',
              };
            } else if (observation) {
              observation.failure = error instanceof Error ? error.message : 'Exact request observation failed.';
            }
          }
          const result: unknown = Reflect.apply(original, receiver, argumentsList);
          return result;
        },
      });
      this.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (!observation || observedWorker !== this || observation.workerUrl !== actualUrl.href) {
          return;
        }
        try {
          const value: unknown = event.data;
          if (!value || typeof value !== 'object') {
            throw new Error('Actual native response is absent.');
          }
          const response = value as Record<string, unknown>;
          const pointA: unknown = response['pointAMeters'];
          const pointB: unknown = response['pointBMeters'];
          if (
            response['id'] !== observation.id ||
            response['status'] !== 'cad-geometry' ||
            typeof response['distanceMeters'] !== 'number' ||
            !Number.isFinite(response['distanceMeters']) ||
            response['source'] !== 'ap242' ||
            !Array.isArray(pointA) ||
            !Array.isArray(pointB) ||
            pointA.length !== 3 ||
            pointB.length !== 3 ||
            !pointA.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry)) ||
            !pointB.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry)) ||
            !current(observation.binding)
          ) {
            throw new Error('Native response or held pose is unqualified.');
          }
          const firstPointValues: readonly unknown[] = pointA;
          const secondPointValues: readonly unknown[] = pointB;
          // Individual scalar guards preserve the actual response; no native-coordinate conversion is repeated here.
          const [ax, ay, az] = firstPointValues,
            [bx, by, bz] = secondPointValues;
          if (
            typeof ax !== 'number' ||
            typeof ay !== 'number' ||
            typeof az !== 'number' ||
            typeof bx !== 'number' ||
            typeof by !== 'number' ||
            typeof bz !== 'number'
          ) {
            throw new TypeError('Native response points are not scalar.');
          }
          observation.response = {
            id: observation.id,
            status: 'cad-geometry',
            source: 'ap242',
            distanceMeters: response['distanceMeters'],
            firstPointMeters: [ax, ay, az],
            secondPointMeters: [bx, by, bz],
          };
        } catch (error) {
          observation.failure = error instanceof Error ? error.message : 'Exact response observation failed.';
        }
      });
    }
  };
}

/** Independently authored source-box corners: intrinsic native S is applied once before any occurrence pose. */
export function expectedMotionSourceCorners(name: string, driverRadians: number): readonly Vector[] {
  const link = /^Link c([0-4]) b([0-4])$/u.exec(name);
  const minimum: Vector = link ? [10 + Number(link[2]) * 22, Number(link[1]) * 40, 0] : [0, -12, -4];
  const maximum: Vector = link ? [minimum[0] + 16, minimum[1] + 8, 6] : [122, -4, 0];
  if (!link && name !== 'Ground') {
    throw new Error('Component is outside the exact frozen native fixture.');
  }
  if (!Number.isFinite(driverRadians) || Math.abs(driverRadians) > Math.PI / 18 + 1e-12) {
    throw new RangeError('Source driver coordinate violates the finite authored fixture.');
  }
  const ratios = [1, 0.5, -0.5, 0.25, -0.25];
  return Array.from({ length: 8 }, (_, mask) => {
    let point: Vector = [
      mask % 2 === 1 ? maximum[0] : minimum[0],
      Math.floor(mask / 2) % 2 === 1 ? maximum[1] : minimum[1],
      Math.floor(mask / 4) % 2 === 1 ? maximum[2] : minimum[2],
    ];
    if (link) {
      for (let joint = Number(link[2]); joint >= 0; joint--) {
        const angle = driverRadians * ratios[joint]!;
        const x = 10 + joint * 22,
          y = Number(link[1]) * 40;
        const dx = point[0] - x,
          dy = point[1] - y;
        point = [
          x + Math.cos(angle) * dx - Math.sin(angle) * dy,
          y + Math.sin(angle) * dx + Math.cos(angle) * dy,
          point[2],
        ];
      }
    }
    return motionNativeToGltfPoint(point);
  });
}

/** Independent Euclidean minimum for the disjoint rigid source boxes, from authored corners rather than native bounds. */
export function expectedMotionBoxMinimum(first: readonly Vector[], second: readonly Vector[]): number {
  const subtract = (left: Vector, right: Vector): Vector => [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
  const dot = (left: Vector, right: Vector) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const addScaled = (point: Vector, axis: Vector, scale: number): Vector => [
    point[0] + axis[0] * scale,
    point[1] + axis[1] * scale,
    point[2] + axis[2] * scale,
  ];
  const box = (corners: readonly Vector[]) => {
    if (corners.length !== 8 || corners.some((point) => point.some((value) => !Number.isFinite(value)))) {
      throw new Error('Expected eight finite independently authored box corners.');
    }
    const origin = corners[0]!;
    const axes = [1, 2, 4].map((index) => subtract(corners[index]!, origin));
    const squared = axes.map((axis) => dot(axis, axis));
    if (
      squared.some((value) => value <= 0) ||
      axes.some((axis, index) =>
        axes.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            Math.abs(dot(axis, other)) > Math.sqrt(squared[index]! * squared[otherIndex]!) * 1e-10,
        ),
      )
    ) {
      throw new Error('The finite native fixture requires nondegenerate rigid orthogonal boxes.');
    }
    for (let mask = 0; mask < 8; mask++) {
      let expected = origin;
      for (let axis = 0; axis < 3; axis++) {
        if (Math.floor(mask / 2 ** axis) % 2 === 1) {
          expected = addScaled(expected, axes[axis]!, 1);
        }
      }
      const delta = subtract(expected, corners[mask]!);
      if (dot(delta, delta) > Math.max(...squared) * 1e-20) {
        throw new Error('Box corner ordering does not match the frozen source bit masks.');
      }
    }
    const edges: Array<readonly [Vector, Vector]> = [];
    for (let mask = 0; mask < 8; mask++) {
      for (let axis = 0; axis < 3; axis++) {
        if (!(Math.floor(mask / 2 ** axis) % 2 === 1)) {
          edges.push([corners[mask]!, corners[mask + 2 ** axis]!]);
        }
      }
    }
    return { origin, axes, squared, edges };
  };
  const a = box(first),
    b = box(second);
  const vertexDistance = (point: Vector, target: ReturnType<typeof box>) => {
    const delta = subtract(point, target.origin);
    let nearest = target.origin;
    for (let axis = 0; axis < 3; axis++) {
      nearest = addScaled(
        nearest,
        target.axes[axis]!,
        Math.max(0, Math.min(1, dot(delta, target.axes[axis]!) / target.squared[axis]!)),
      );
    }
    const distance = subtract(point, nearest);
    return dot(distance, distance);
  };
  // For disjoint convex boxes the minimum is vertex-to-face or edge-to-edge. This pair's source chains are separated.
  let minimum = Math.min(
    ...first.map((point) => vertexDistance(point, b)),
    ...second.map((point) => vertexDistance(point, a)),
  );
  for (const [a0, a1] of a.edges) {
    for (const [b0, b1] of b.edges) {
      const u = subtract(a1, a0),
        v = subtract(b1, b0),
        w = subtract(a0, b0);
      const uu = dot(u, u),
        vv = dot(v, v),
        uv = dot(u, v),
        uw = dot(u, w),
        vw = dot(v, w);
      const denominator = uu * vv - uv * uv;
      // Parallel edges' endpoint minima are already represented by the vertex-to-box terms above.
      if (denominator <= uu * vv * Number.EPSILON * 64) {
        continue;
      }
      const alongA = (uv * vw - vv * uw) / denominator;
      const alongB = (uu * vw - uv * uw) / denominator;
      if (alongA < 0 || alongA > 1 || alongB < 0 || alongB > 1) {
        continue;
      }
      const delta = subtract(addScaled(a0, u, alongA), addScaled(b0, v, alongB));
      minimum = Math.min(minimum, dot(delta, delta));
    }
  }
  if (!(minimum > 0)) {
    throw new Error('This finite independent oracle is for the known separated chain pair only.');
  }
  return Math.sqrt(minimum);
}

export type MotionNativeOracleResult = Readonly<{
  subjectHash: string;
  canonicalIds: string[];
  geometryFrame: Readonly<{
    descriptor: Record<string, unknown>;
    actualByteCoordinateSystem: string;
    admission: string;
    expectedCornerCoordinateSystem: string;
  }>;
  minimumFrame: Readonly<{
    actualByteCoordinateSystem: string;
    admittedCoordinateSystem: string;
    witnessCoordinateSystem: MinimumDistanceFact['coordinateSystem'];
    unit: MinimumDistanceFact['unit'];
  }>;
  sourceCornerReport: Pick<GeoSpecCanonicalClaimReport, 'status' | 'claim'>;
  analyticMinimumMm: number;
  nativeCornerSupports: Readonly<{
    status: GeoSpecCanonicalClaimReport['status'];
    probes: number;
    supportsPerCorner: number;
    claim: GeoSpecCanonicalClaimReport['claim'];
  }>;
  minimum: MinimumDistanceFact;
}>;

/** Data-only input from the actual observed request and independently authored finite source oracle. */
export type MotionNativeOracleInput = Readonly<{
  observation: MotionExactObservation;
  expected: ReadonlyArray<Readonly<{ id: string; corners: readonly Vector[]; min: Vector; max: Vector }>>;
  expectedBodyCount?: 4;
  /** Full geometry evidence only; minimum distance still consumes the separately observed pair bytes. */
  posedExport?: MotionPosedExport;
}>;

/** Validate the separately copied full export against the actual worker-held pose, without inventing a request join. */
export function isMotionPosedExportQualified(input: MotionNativeOracleInput): boolean {
  const full = input.posedExport;
  if (!full) {
    return true;
  }
  const { binding } = input.observation;
  const copied: Readonly<{ coordinateSystem?: unknown }> = full;
  const expectedIds = new Set(input.expected.map(({ id }) => id));
  return (
    copied.coordinateSystem === 'y-up' &&
    full.root.digest === binding.key &&
    full.key === binding.key &&
    full.root.path.startsWith('.tau/artifacts/reusable-parts/') &&
    Number.isSafeInteger(full.root.byteLength) &&
    full.root.byteLength > 0 &&
    full.projectId.length > 0 &&
    full.sourceEntryPath.length > 0 &&
    full.exportId.length > 0 &&
    full.unitId === binding.unitId &&
    full.poseRevision === binding.poseRevision &&
    full.candidateSceneId === binding.candidateSceneId &&
    Number.isSafeInteger(full.presentationRevision) &&
    full.presentationRevision >= 0 &&
    full.canonicalIds.length === expectedIds.size &&
    new Set(full.canonicalIds).size === expectedIds.size &&
    full.canonicalIds.every((id) => expectedIds.has(id)) &&
    full.bytes.length > 0 &&
    full.bytes.length <= 67_108_864 &&
    full.bytes.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 255)
  );
}

/** Native query evidence from the command-owned Node engine; the command closes its engine after this subject drains. */
export async function queryObservedMotionNativeOracle(
  input: MotionNativeOracleInput & Readonly<{ isCurrent: () => Promise<boolean> }>,
  engine: HostEngine & HostSubjectLifecycle,
): Promise<MotionNativeOracleResult> {
  const { response } = input.observation;
  if (!isMotionPosedExportQualified(input)) {
    throw new Error('The separately captured full posed export is unqualified.');
  }
  if (
    Boolean(input.observation.failure) ||
    response?.status !== 'cad-geometry' ||
    response.id !== input.observation.id ||
    !Number.isSafeInteger(input.observation.id) ||
    !Number.isFinite(response.distanceMeters) ||
    !response.firstPointMeters.every((value) => Number.isFinite(value)) ||
    !response.secondPointMeters.every((value) => Number.isFinite(value)) ||
    !(await input.isCurrent())
  ) {
    throw new Error('Only a successful current actual request can enter the second native oracle.');
  }
  const expectedBodyCount = input.expectedBodyCount ?? 104;
  if (
    input.expected.length !== expectedBodyCount ||
    new Set(input.expected.map(({ id }) => id)).size !== expectedBodyCount
  ) {
    throw new Error('The independent oracle requires its exact finite canonical component set.');
  }
  const [{ createGeoSpecAssertionClient }, { queryDirectAp242MinimumDistance }] = await Promise.all([
    import('geospec/assertion-client'),
    import('@taucad/agent-tools/geospec'),
  ]);
  const encode = (method: string, requestId: string, extra: Record<string, unknown> = {}) =>
    new TextEncoder().encode(
      JSON.stringify({
        canonicalProfile: 'geospec-jcs-v1',
        protocolVersion: 3,
        registryVersion: 5,
        method,
        requestId,
        ...extra,
      }),
    );
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Native evidence is not a record.');
    }
    return value as Record<string, unknown>;
  };
  const decode = (bytes: Uint8Array<ArrayBuffer>) =>
    record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown);
  let handle: Record<string, unknown> | undefined;
  const releaseGeometrySubject = () => {
    if (!handle) {
      return;
    }
    const released = record(
      decode(engine.releaseSubject(encode('releaseSubject', 'c6-second-release', { subjectHandle: handle })))['result'],
    );
    if (released['released'] !== true) {
      throw new Error('Second native geometry subject release was not confirmed.');
    }
    handle = undefined;
  };
  const [primary] = await Promise.allSettled([
    (async (): Promise<MotionNativeOracleResult> => {
      if (!(await input.isCurrent())) {
        throw new Error('Presented root/unit/pose changed during assertion module acquisition.');
      }
      const bytes = Uint8Array.from(input.posedExport?.bytes ?? input.observation.bytes);
      // The observed export's numeric coordinates are Y-up millimetres. STEP ingestion does not rotate geometry.
      // Declaring z-up here deliberately admits those RAW coordinates for geometry-only probes; it does not
      // claim that the bytes are authored Z-up. Expected corners below are independently computed in byte space.
      // The actual Y-up/minimum route remains separate, because GeoSpec refuses other Y-up STEP capabilities.
      const admitted = decode(
        engine.ingestSubject(
          encode('ingestSubject', 'c6-second-admit', {
            format: 'step',
            frame: { coordinateSystem: 'z-up', sourceUnit: 'auto', outputUnit: 'mm' },
            ingestOptions: {},
            primaryByteLength: bytes.byteLength,
            resources: [],
          }),
          bytes,
          [],
        ),
      );
      if (admitted['requestId'] !== 'c6-second-admit') {
        throw new Error('Second native admission request identity changed.');
      }
      const subject = record(record(admitted['result'])['subject']);
      const { subjectHash } = subject;
      if (typeof subjectHash !== 'string' || !/^[a-f0-9]{64}$/u.test(subjectHash)) {
        throw new Error('Native subject digest is absent.');
      }
      const frame = record(record(subject['descriptor'])['frame']);
      if (
        frame['coordinateSystem'] !== 'z-up' ||
        frame['outputCoordinateSystem'] !== undefined ||
        frame['outputUnit'] !== 'mm' ||
        frame['uniformScale'] !== 1
      ) {
        throw new Error('Raw AP242 geometry admission must preserve numeric coordinates and millimetres.');
      }
      handle = record(
        record(decode(engine.subjectHandle(encode('subjectHandle', 'c6-second-handle', { subjectHash })))['result'])[
          'subjectHandle'
        ],
      );
      const client = createGeoSpecAssertionClient({ engine });
      // Ordinary Z-up admission returns identity only. The existing complete native report owns its source table.
      const inventory = await client.query({ capability: 'analyzeMesh', subject: { subjectHash }, payload: null });
      if (!(await input.isCurrent())) {
        throw new Error('Presented root/unit/pose changed during native occurrence inventory acquisition.');
      }
      if (
        inventory.status !== 'passed' ||
        inventory.canonicalPlan.byteLength > 1_048_576 ||
        inventory.canonicalClaim.byteLength > 1_048_576 ||
        inventory.canonicalResult.byteLength > 1_048_576
      ) {
        throw new Error('Native occurrence inventory report is incomplete or exceeds its metadata bound.');
      }
      const plan = record(decode(inventory.canonicalPlan)['plan']);
      const { subjects, claims } = plan;
      if (!Array.isArray(subjects) || subjects.length !== 1 || !Array.isArray(claims) || claims.length !== 1) {
        throw new Error('Native occurrence inventory plan has no unique current subject and claim.');
      }
      const binding = record(subjects[0]);
      const claim = record(claims[0]);
      const { subjectSlots } = inventory.claim;
      if (
        plan['evidenceProfile'] !== undefined ||
        binding['subjectHash'] !== subjectHash ||
        binding['contentHash'] !== undefined ||
        binding['slot'] !== 'subject' ||
        claim['claimId'] !== inventory.claimId ||
        claim['capability'] !== 'analyzeMesh' ||
        claim['polarity'] !== 'positive' ||
        claim['payload'] !== null ||
        inventory.claim['capability'] !== 'analyzeMesh' ||
        inventory.claim['polarity'] !== 'positive' ||
        inventory.claim['payload'] !== null ||
        !Array.isArray(subjectSlots) ||
        subjectSlots.length !== 1 ||
        subjectSlots[0] !== binding['slot'] ||
        !Array.isArray(claim['subjectSlots']) ||
        claim['subjectSlots'].length !== 1 ||
        claim['subjectSlots'][0] !== binding['slot']
      ) {
        throw new Error('Native occurrence inventory report is not bound to the actual admitted subject.');
      }
      const evidence = record(inventory.evidence);
      const reportedSubject = record(evidence['subject']);
      const step = record(reportedSubject['step']);
      const rows = record(step['xde'])['occurrences'];
      if (evidence['success'] !== true || reportedSubject['kind'] !== 'geometry-subject' || !Array.isArray(rows)) {
        throw new TypeError('Native occurrence inventory is absent.');
      }
      const canonical = new Map<string, string>();
      const paths = new Set<string>();
      for (const value of rows) {
        const row = record(value);
        const { instanceName: name, path } = row;
        if (typeof path !== 'string' || !path || paths.has(path)) {
          throw new Error('Native names/paths are not uniquely qualified.');
        }
        paths.add(path);
        if (name === undefined || name === null || name === '') {
          continue;
        } // Anonymous product wrappers are not canonical body entries.
        if (typeof name !== 'string' || canonical.has(name)) {
          throw new Error('Native names/paths are not uniquely qualified.');
        }
        canonical.set(name, path);
      }
      const expectedIds = new Set(input.expected.map(({ id }) => id));
      if (canonical.size !== expectedBodyCount || [...canonical.keys()].some((id) => !expectedIds.has(id))) {
        throw new Error('Native positive canonical body set differs from the admitted finite IDs.');
      }
      // Existing exact occurrence matcher checks independently posed source corners in raw AP242 Y-up millimetres.
      const corners = client.expectGeo({ subjectHash }).toHaveAssemblyOccurrences({
        uniqueNames: true,
        occurrences: input.expected.map(({ id, min, max }) => ({
          name: id,
          count: 1,
          bounds: { min: [...min], max: [...max], tolerance: 0.000001 },
        })),
      });
      if (corners.status !== 'passed') {
        throw new Error('Independent native source-corner oracle did not pass.');
      }
      // Each independently expected corner must lie on exactly three real planar supports of its canonical native body.
      // This is a real scoped analytic surface probe, rather than accepting an AABB as a corner relationship.
      const nativeCorners = await client.query({
        capability: 'inspectGeometry',
        subject: { subjectHash },
        payload: {
          selectors: input.expected.flatMap(({ id, corners }) =>
            corners.map((corner) => ({
              kind: 'face',
              query: {
                surfaceType: 'plane',
                containsPoint: [...corner],
                within: { kind: 'occurrence', path: canonical.get(id), expect: 'one' },
              },
              expect: { exactly: 3 },
            })),
          ),
          evidence: ['bounds', 'facts', 'frames'],
        },
      });
      const cornerEvidence = record(nativeCorners.evidence);
      const { selections } = cornerEvidence;
      if (
        nativeCorners.status !== 'passed' ||
        !Array.isArray(selections) ||
        selections.length !== expectedBodyCount * 8 ||
        selections.some((value: unknown) => {
          const row = record(value);
          return !Array.isArray(row['matches']) || row['matches'].length !== 3;
        })
      ) {
        throw new Error('Independent native corner-to-planar-support probes did not qualify all finite source boxes.');
      }
      const [nameA, nameB] = input.observation.binding.names;
      const expectedA = input.expected.find(({ id }) => id === nameA),
        expectedB = input.expected.find(({ id }) => id === nameB);
      if (!expectedA || !expectedB) {
        throw new Error('The observed native pair has no independent finite source corners.');
      }
      const analyticMinimumMm = expectedMotionBoxMinimum(expectedA.corners, expectedB.corners);
      if (!canonical.has(nameA) || !canonical.has(nameB)) {
        throw new Error('Actual request canonical pair is absent in the second engine.');
      }
      if (!(await input.isCurrent())) {
        throw new Error('Presented root/unit/pose changed before the separate Y-up minimum admission.');
      }
      // Retire full raw geometry before the existing adapter admits the original pair request bytes as genuine Y-up STEP.
      // This reuses the independently owned engine slot, does not export again, and bounds native overlap.
      releaseGeometrySubject();
      const minimum = await queryDirectAp242MinimumDistance({
        engine,
        ap242Bytes: Uint8Array.from(input.observation.bytes),
        nameA,
        nameB,
      });
      if (minimum.status !== 'complete') {
        throw new Error('Independent native minimum did not return exact witnesses.');
      }
      const toTauMeters = ([x, y, z]: readonly [number, number, number]): Vector => [x / 1000, y / 1000, z / 1000];
      const pointA = toTauMeters(minimum.fact.points[0]),
        pointB = toTauMeters(minimum.fact.points[1]);
      // Preserve qualification of actual native output even though the declared success contract uses literals.
      const actualFrame: Readonly<{ unit: unknown; coordinateSystem: unknown; source: unknown }> = minimum.fact;
      if (
        actualFrame.unit !== 'mm' ||
        actualFrame.coordinateSystem !== 'z-up' ||
        actualFrame.source !== 'ap242' ||
        Math.abs(minimum.fact.distance - analyticMinimumMm) > 0.000001 ||
        Math.abs(minimum.fact.distance / 1000 - response.distanceMeters) > 1e-9 ||
        Math.abs(Math.hypot(...pointA.map((value, index) => value - pointB[index]!)) - response.distanceMeters) > 1e-9
      ) {
        throw new Error('Independent native minimum/unit/witness differs from the actual measurement.');
      }
      if (!(await input.isCurrent())) {
        throw new Error('Presented root/unit/pose changed during the second native oracle.');
      }
      return {
        subjectHash,
        canonicalIds: [...canonical.keys()],
        geometryFrame: {
          descriptor: frame,
          actualByteCoordinateSystem: 'y-up',
          admission: 'raw-z-up-declaration-without-geometry-rotation',
          expectedCornerCoordinateSystem: 'actual-byte-y-up-mm',
        },
        minimumFrame: {
          actualByteCoordinateSystem: 'y-up',
          admittedCoordinateSystem: 'y-up',
          witnessCoordinateSystem: minimum.fact.coordinateSystem,
          unit: minimum.fact.unit,
        },
        sourceCornerReport: { status: corners.status, claim: corners.claim },
        analyticMinimumMm,
        nativeCornerSupports: {
          status: nativeCorners.status,
          probes: selections.length,
          supportsPerCorner: 3,
          claim: nativeCorners.claim,
        },
        minimum: minimum.fact,
      };
    })(),
  ]);
  const [released] = await Promise.allSettled([Promise.resolve().then(releaseGeometrySubject)]);
  if (primary.status === 'rejected') {
    const error: unknown = primary.reason;
    throw error;
  }
  if (released.status === 'rejected') {
    const error: unknown = released.reason;
    throw error;
  }
  return primary.value;
}
