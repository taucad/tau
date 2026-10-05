import React, { useEffect } from 'react';
import * as THREE from 'three';
import { createRenderFrameTimer } from '#components/geometry/graphics/three/render-frame-timing.js';
import { useFrame, useThree } from '@react-three/fiber';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import type { SnapshotFrom } from 'xstate';
import { perspectiveVerticalSpan } from '@taucad/camera';
import type { CameraBounds } from '@taucad/camera';
import { assertRootedPath, normalizePath } from '@taucad/utils/path';
import { canonicalJson } from '@taucad/utils/hash';
import type { RenderFrame } from '@taucad/spatial';
import type { GeometryComponentKind } from '@taucad/types';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useFeature } from '#flags/use-feature.js';
import { readMeasurementCatalogObservation } from '#components/geometry/graphics/three/react/measure-tool.js';
import type { MeasurementCatalogObservation } from '#components/geometry/graphics/three/react/measure-tool.js';
import { useProject } from '#hooks/use-project.js';
import { useCad } from '#hooks/use-cad.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { workbenchPaths } from '@taucad/workbench';
import { digestBytes } from '#utils/crypto.utils.js';
import type { ProjectContext } from '#machines/project.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import { selectCadDisplay } from '#machines/cad.machine.js';
import type { CadAssemblyDisplay, CadContext, LatestRenderingOutcome } from '#machines/cad.machine.js';
import { graphicsSettingsForView } from '#workbench-records/projection.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import type { GraphicsContext } from '#machines/graphics.machine.js';
import { isAssemblyDetailCalibration } from '#machines/graphics.machine.js';
import { rendererSpans } from '#lib/renderer-telemetry.js';
import {
  armGltfAssemblyAdmissionResourceInventory,
  captureCommittedGltfDrawInventory,
  captureLiveGltfAssemblyResourceInventory,
  captureRequestedGltfAssemblyPreparation,
  clearGltfAssemblyAdmissionResourceInventory,
  collectModelPickableSurfaceMeshes,
  resolveModelComponentHitFromRay,
} from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import { getGltfOccurrenceEdgeBatch } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { getGltfAssemblySource } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { areSectionCutsEqual, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionPiece,
  SectionPlane,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionHandleTarget } from '#components/geometry/graphics/three/controls/section-handles.js';
import {
  useCameraConnectorRef,
  useCameraRig,
  useGraphics,
  useModelInteractionRef,
  useSetRenderFrame,
  useViewCameraFraming,
} from '#hooks/use-graphics.js';
import {
  getModelComponentHitOwner,
  getModelComponentInstanceSlots,
  getModelComponentIdInHierarchy,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { createRaycastClipTest } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { getGltfOccurrenceLayers } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { resolveSectionViewRaycastClip } from '#components/geometry/graphics/three/use-section-view.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import { captureGltfAssemblyPlacements } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import type { KinematicsPoseUnit } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import type { PublishedPartAsset } from '@taucad/runtime/types';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  getControlsDistance,
  resolveCameraUp,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import { sectionCapPerformanceDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapPerformanceDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import { getSceneRenderRoots } from '#components/geometry/graphics/three/scene-overlay.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

/**
 * A cut to add: what is left out takes the Add menu's default with no view (a plane through the bounds centre,
 * unflipped; a 90° cutaway from angle zero). A cutaway passes through the bounds centre.
 */
export type SectionViewTestCut =
  | Readonly<{ kind: 'plane'; plane: SectionPlane; offset?: number; isFlipped?: boolean }>
  | Readonly<{ kind: 'revolution'; axis: SectionAxis; start?: number; sweep?: number }>;

export type SectionViewTestSectionState = Readonly<{
  isActive: boolean;
  cuts: readonly SectionCut[];
  selectedCutId: string | undefined;
  hoveredCutId: string | undefined;
  /** The cuts the caps last certified, which picking and captures read, and the pieces they remove. */
  committedCuts: readonly SectionCut[];
  committedPieces: readonly SectionPiece[];
  certification: GraphicsContext['sectionCertification'];
  /** Whether the committed cuts hold the live cuts' values: the caps have caught up with the last edit. */
  isCommitted: boolean;
}>;

export type SectionViewTestCamera = Readonly<{
  position: readonly [number, number, number];
  /** Explicit comparison bounds are applied through the canonical camera owner. */
  bounds?: CameraBounds;
  target?: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  rollRadians?: number;
}>;

export type SectionViewTestCameraState = Readonly<{
  bounds: CameraBounds;
  actorStatus: string;
  actorError?: string;
  projection: 'orthographic' | 'perspective';
  requestedFov: number;
  requestedPerspectiveZoom: number;
  handoffFov?: number;
  verticalSpan: number;
  /** Copied current authored camera actor controls, distinct from the native camera quaternion. */
  direction: readonly [number, number, number];
  up: readonly [number, number, number];
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  target: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  aspect: number;
  controlsDistance: number;
  controlsEnabled: boolean;
  viewportGizmoLockActive: boolean;
  clipping: Readonly<{ near: number; far: number }>;
  nativeClipping: Readonly<{ near: number; far: number }>;
}>;

export type SectionViewTestCameraTransitionDiagnostics = Readonly<{
  requests: number;
  frames: number;
  actorSyncFailures: number;
  averageRequestToActorSyncMilliseconds: number;
  maximumRequestToActorSyncMilliseconds: number;
  maximumRequestToFrameMilliseconds: number;
  staleFrames: number;
}>;

export type SectionViewTestHelperSummary = Readonly<{
  sectionHelperMeshCount: number;
  sectionHelperLineSegments2Count: number;
  sectionHelperContourSegmentCount: number;
  sectionHelperRenderOrders: Readonly<{
    meshes: readonly number[];
    lineSegments2: readonly number[];
  }>;
  sectionHelperMaterialStates: readonly SectionViewTestHelperMaterialState[];
}>;

export type SectionViewTestHelperMaterialState = Readonly<{
  objectType: string;
  materialType: string;
  renderOrder: number;
  transparent: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}>;

export type SectionViewTestProjectedPoint = Readonly<{
  x: number;
  y: number;
  visible: boolean;
}>;

export type SectionViewTestModelHoverState = Readonly<{
  activeUnitId: string | undefined;
  hoveredComponentId: string | undefined;
  selectedComponentIds?: readonly string[];
  rayParity?: Readonly<{
    candidateSceneId: string;
    pointer: readonly [number, number];
    ray: Readonly<{
      origin: readonly number[];
      direction: readonly number[];
      near: number;
      far: number | string;
      layers: number;
    }>;
    camera: SectionViewTestCameraState;
    cameraMatrixWorld: readonly number[];
    cameraProjectionMatrix: readonly number[];
    candidateMatrixWorld: readonly number[];
    pickableMeshCount: number;
    rendererFrame: number;
    presentationRevision: number;
    poseRevision: number;
    surfaceMeshes: ReadonlyArray<
      Readonly<{
        id: string;
        matrixWorld: readonly number[];
        visible: boolean;
        layers: number;
        localBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | undefined;
        slots: readonly string[] | undefined;
      }>
    >;
    clippingEnabled: boolean;
    stockComponentId: string | undefined;
    unclippedStockComponentId: string | undefined;
    tauComponentId: string | undefined;
  }>;
}>;

export type SectionViewTestModelComponent = Readonly<{
  id: string;
  name: string;
  kind: GeometryComponentKind | undefined;
  primitiveReferenceCount: number;
}>;

export type SectionViewTestModelVisibility = Readonly<{
  hiddenComponentIds: readonly string[];
  isolatedComponentIds: readonly string[];
}>;

export type SectionViewTestRenderedModelComponentState = Readonly<{
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

export type SectionViewTestCapCompleteness =
  | Readonly<{
      status: 'complete';
      admittedSourceCount: number;
      extensionSourceCount: number;
      fallbackSourceCount: number;
      trueCutComponentCount: number;
      cappedTrueCutComponentCount: number;
      unresolvedTrueCutEdgeCount: number;
      unsupportedSourceCount: number;
    }>
  | Readonly<{
      status: 'unsupported' | 'failed';
      failure: Readonly<{ sourceKey: string; code: string; message: string }>;
    }>;

export type SectionViewTestMeasureState = Readonly<{
  isMeasureActive: boolean;
  /** True while camera controls own the pointer; a measure gesture started here is discarded. */
  cameraInteracting: boolean;
  /** Meshes the measure tool has drawn into the scene: snap indicators, lines and labels. */
  measurementUiMeshCount: number;
  rendererGeometryCount: number;
  snapDistancePx: number;
  candidates: GraphicsContext['measureCandidates'];
  measureFilter: GraphicsContext['measureFilter'];
  measureOperation: GraphicsContext['measureOperation'];
  measureCatalogRequest: GraphicsContext['measureCatalogRequest'];
  measureCatalogHasMore: GraphicsContext['measureCatalogHasMore'];
  measureMessage: GraphicsContext['measureMessage'];
  catalogObservation: MeasurementCatalogObservation | undefined;
  activeCandidateId: string | undefined;
  lockedTargetId: string | undefined;
  mode: GraphicsContext['measureMode'];
  currentStart: readonly [number, number, number] | undefined;
  measurements: ReadonlyArray<
    Readonly<{
      id: string;
      distance: number;
      startPoint: readonly [number, number, number];
      endPoint: readonly [number, number, number];
      operation?: string;
      quality?: string;
      status?: string;
      unavailableReason?: string;
    }>
  >;
}>;

type SectionViewTestCommittedAssembly = Readonly<{
  assemblyDisplay: CadAssemblyDisplay | undefined;
  diagnostics: Readonly<{
    projectId: string | undefined;
    outcome: LatestRenderingOutcome;
    requestedRenderId: number | undefined;
    settledRenderId: number | undefined;
    requestedKey: string | undefined;
    presentedKey: string | undefined;
    requestedRevision: number;
    presentedRevision: number;
    sourceEntryPath: string | undefined;
    sourceGeometryHash: string | undefined;
  }>;
  /** Re-read the captured project, selected CAD slot, and committed viewport before and after async work. */
  isCurrent(): boolean;
  /** Captured existing content authority, confined to this pin's managed parent; no writes. */
  readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
}>;

/** Copied result of an explicit debug-only full current-pose export; distinct from the pair measurement request. */
export type SectionViewTestPosedExport = Readonly<{
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

/** Export real admitted native components at the captured solver pose, without changing the pair consumer. */
export async function exportSectionViewTestPosedAssembly(
  input: Readonly<{
    source: NonNullable<ReturnType<typeof getGltfAssemblySource>>;
    unit: KinematicsPoseUnit;
    binding: Omit<SectionViewTestPosedExport, 'canonicalIds' | 'exportId' | 'bytes'>;
    isCurrent(): boolean;
  }>,
): Promise<SectionViewTestPosedExport> {
  if (
    !input.isCurrent() ||
    input.source.display.root.path !== input.binding.root.path ||
    input.source.display.root.digest !== input.binding.root.digest ||
    input.source.display.root.byteLength !== input.binding.root.byteLength ||
    input.binding.key !== input.binding.root.digest ||
    !input.binding.projectId ||
    !input.binding.sourceEntryPath
  ) {
    throw new Error('Full posed export requires the actual current admitted source and solver pose.');
  }
  const components = input.source.metadata.components.filter(
    ({ component }) => component.kind === 'part' && Boolean(component.primitiveRefs?.length),
  );
  const canonicalIds = components.map(({ component }) => component.id);
  if (
    canonicalIds.length === 0 ||
    new Set(canonicalIds).size !== canonicalIds.length ||
    components.some(({ sourceComponentId }) => !sourceComponentId) ||
    (input.source.metadata.mechanism && (!input.unit.mechanism || !input.unit.pose))
  ) {
    throw new Error('Full posed export requires unique actual admitted native components.');
  }
  const placements = captureGltfAssemblyPlacements(input.source, canonicalIds, input.unit);
  if (!placements || placements.length !== canonicalIds.length || !input.isCurrent()) {
    throw new Error('Full posed export lost its complete admitted placement capture.');
  }
  const exported = await input.source.display.document.exportPublished({
    format: 'step',
    publishedAssembly: { root: input.source.display.root, placements },
    exportOptions: { coordinateSystem: 'y-up' },
  });
  if (!input.isCurrent()) {
    throw new Error('Full posed export subject changed during native export.');
  }
  const file = exported.success && exported.files.length === 1 ? exported.files[0] : undefined;
  if (
    !exported.success ||
    !exported.exportId ||
    !file ||
    file.name.length === 0 ||
    (file.mimeType !== 'model/step' && file.mimeType !== 'application/step') ||
    file.bytes.byteLength === 0 ||
    file.bytes.byteLength > 67_108_864
  ) {
    const observation = {
      success: exported.success,
      exportIdPresent: exported.success && Boolean(exported.exportId),
      fileCount: exported.success ? exported.files.length : 0,
      files: exported.success
        ? exported.files.map(({ name, mimeType, bytes: exportedBytes }) => ({
            name,
            mimeType,
            byteLength: exportedBytes.byteLength,
          }))
        : [],
      issues: exported.issues.map(({ code, severity, type }) => ({ code, severity, type })),
    };
    throw new Error(`Full posed export did not return one bounded actual STEP file: ${JSON.stringify(observation)}`);
  }
  const bytes = [...file.bytes];
  if (!input.isCurrent()) {
    throw new Error('Full posed export subject changed before copied delivery.');
  }
  return { ...input.binding, root: { ...input.binding.root }, canonicalIds, exportId: exported.exportId, bytes };
}

/** Coherence only: the caller must first obtain its display from the actual CAD admission selector. */
export const isSectionViewTestAssemblyCurrent = (
  state: Readonly<{
    live: boolean;
    projectCurrent: boolean;
    cadActive: boolean;
    graphicsActive: boolean;
    selectedDisplay: Record<string, unknown> | undefined;
    capturedDisplay: Record<string, unknown>;
    capturedKey: string;
    presentedKey: string | undefined;
    outcome: LatestRenderingOutcome;
    requestedRenderId: number | undefined;
    settledRenderId: number | undefined;
    capturedRenderId: number;
  }>,
): boolean =>
  state.live &&
  state.projectCurrent &&
  state.cadActive &&
  state.graphicsActive &&
  state.selectedDisplay === state.capturedDisplay &&
  state.presentedKey === state.capturedKey &&
  state.outcome === 'success' &&
  state.requestedRenderId === state.capturedRenderId &&
  state.settledRenderId === state.capturedRenderId;

/** Binary read through the caller's captured existing service; both sides of the await fence its lifetime. */
export const readSectionViewTestAssemblyBytes = async (
  path: string,
  authority: Readonly<{
    parent: string;
    fileSystemRoot: string;
    isCurrent(): boolean;
    readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  if (!authority.isCurrent()) {
    throw new Error('Committed assembly changed before reading.');
  }
  const relative = assertRootedPath(path);
  if (!authority.parent.startsWith('.tau/artifacts/reusable-parts/') || !relative.startsWith(authority.parent)) {
    throw new Error('Committed assembly read escapes its managed parent.');
  }
  const bytes = await authority.readRawBytes(relative);
  if (!authority.isCurrent()) {
    throw new Error('Committed assembly changed during reading.');
  }
  return bytes;
};

/** Only this live viewport's current committed candidate may supply retained resource evidence. */
export const readSectionViewTestAssemblyResourceTelemetry = (
  authority: Readonly<{
    viewportActorSessionId: string;
    candidateSceneId: string;
    key: string;
    revision: number;
    backend: 'webgl' | 'webgpu';
    isCurrent(): boolean;
  }>,
): ReturnType<typeof rendererSpans> => {
  if (!authority.isCurrent()) {
    return [];
  }
  const records = rendererSpans().filter(
    ({ name, detail }) =>
      name === 'renderer.presentation' &&
      detail?.['viewportActorSessionId'] === authority.viewportActorSessionId &&
      detail['candidateSceneId'] === authority.candidateSceneId &&
      detail['key'] === authority.key &&
      detail['revision'] === authority.revision &&
      detail['backend'] === authority.backend,
  );
  return authority.isCurrent() ? records : [];
};

/** One explicitly requested observation frame, excluded from all timing intervals. */
type SectionViewTestBackendBindings = Readonly<{
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

/**
 * Temporarily observes existing callbacks for one real viewport frame. No fake renderer or new loop.
 * Buffer references exist only in this bounded request, never in a registry or serialized result.
 */
export const observeSectionViewTestBackendBindings = async (
  input: Readonly<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    candidateSceneId: string;
    objects: readonly THREE.Object3D[];
    backend: 'webgl' | 'webgpu';
    signal: AbortSignal;
    isCurrent(): boolean;
    invalidate(): void;
  }>,
): Promise<SectionViewTestBackendBindings> => {
  input.signal.throwIfAborted();
  if (!input.isCurrent()) {
    throw new Error('Backend observation subject is no longer current.');
  }
  const objects = [...new Set(input.objects)];
  if (objects.length > 4096) {
    throw new RangeError('Backend observation exceeds its object cap.');
  }
  const bufferObjects: Array<WebGLBuffer | GPUBuffer> = [];
  const bufferRows: Array<SectionViewTestBackendBindings['buffers'][number]> = [];
  const samples: Array<SectionViewTestBackendBindings['samples'][number]> = [];
  const restorers: Array<() => boolean> = [];
  let callbackOwnershipLost = false;
  const observation = { active: true };
  let observationTimeout: ReturnType<typeof setTimeout> | undefined;
  let rejectObservation: ((error: unknown) => void) | undefined;
  const record = (buffer: WebGLBuffer | GPUBuffer, bytes: number, usage?: number): number => {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new TypeError('Backend returned an invalid buffer size.');
    }
    const existing = bufferObjects.indexOf(buffer);
    if (existing !== -1) {
      if (bufferRows[existing]?.bytes !== bytes) {
        throw new Error('Buffer size changed during observation.');
      }
      return existing;
    }
    if (bufferObjects.length >= 4096) {
      throw new RangeError('Backend observation exceeds its buffer cap.');
    }
    const ordinal = bufferObjects.length;
    bufferObjects.push(buffer);
    bufferRows.push({ ordinal, bytes, usage });
    return ordinal;
  };
  const capture = (object: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material): void => {
    if (!input.isCurrent()) {
      throw new Error('Backend observation subject changed during its frame.');
    }
    if (samples.length >= 8192) {
      throw new RangeError('Backend observation exceeds its draw sample cap.');
    }
    const bindings: Array<SectionViewTestBackendBindings['samples'][number]['buffers'][number]> = [];
    const missingRecords: string[] = [];
    if (input.backend === 'webgl') {
      const gl = input.renderer.getContext();
      if (!(gl instanceof WebGL2RenderingContext) || gl.isContextLost()) {
        throw new Error('Backend observation requires the live viewport WebGL2 context.');
      }
      const previous: unknown = gl.getParameter(gl.COPY_READ_BUFFER_BINDING);
      const limit: unknown = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      const element: unknown = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
      const asBuffer = (value: unknown): WebGLBuffer | undefined => {
        if (value === null) {
          return undefined;
        }
        if (typeof value !== 'object' || !gl.isBuffer(value)) {
          throw new TypeError('Invalid actual WebGL buffer.');
        }
        return value;
      };
      const priorCopyRead = asBuffer(previous);
      const elementBuffer = asBuffer(element);
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 64) {
        throw new RangeError('Unexpected WebGL vertex attribute limit.');
      }
      const readBuffer = ({
        buffer,
        binding,
        slot,
        divisor,
      }: {
        buffer: WebGLBuffer;
        binding: string;
        slot?: number;
        divisor?: number;
      }): void => {
        gl.bindBuffer(gl.COPY_READ_BUFFER, buffer);
        const bytes: unknown = gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE);
        if (typeof bytes !== 'number') {
          throw new TypeError('Unexpected WebGL buffer size.');
        }
        bindings.push({ ordinal: record(buffer, bytes), binding, slot, divisor });
      };
      try {
        for (let slot = 0; slot < limit; slot++) {
          const enabled: unknown = gl.getVertexAttrib(slot, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
          if (typeof enabled !== 'boolean') {
            throw new TypeError('Unexpected WebGL enabled attribute.');
          }
          if (!enabled) {
            continue;
          }
          const buffer: unknown = gl.getVertexAttrib(slot, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
          const divisor: unknown = gl.getVertexAttrib(slot, gl.VERTEX_ATTRIB_ARRAY_DIVISOR);
          const actualBuffer = asBuffer(buffer);
          if (!actualBuffer || typeof divisor !== 'number' || !Number.isInteger(divisor) || divisor < 0) {
            throw new TypeError('Unexpected WebGL vertex binding.');
          }
          readBuffer({ buffer: actualBuffer, binding: 'vertex', slot, divisor });
        }
        if (elementBuffer) {
          readBuffer({ buffer: elementBuffer, binding: 'element' });
        }
      } finally {
        gl.bindBuffer(gl.COPY_READ_BUFFER, priorCopyRead ?? null);
      }
      if (gl.isContextLost()) {
        throw new Error('Viewport context was lost during observation.');
      }
    } else {
      const backend: unknown = 'backend' in input.renderer ? input.renderer.backend : undefined;
      const data: unknown = backend && typeof backend === 'object' && 'data' in backend ? backend.data : undefined;
      if (!(data instanceof WeakMap)) {
        throw new Error('Actual WebGPU backend records are unavailable.');
      }
      const attributes: Array<readonly [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute]> = [];
      if (geometry.index) {
        attributes.push(['index', geometry.index]);
      }
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        attributes.push([name, attribute]);
      }
      if (object instanceof THREE.InstancedMesh) {
        attributes.push(['originalInstanceMatrix', object.instanceMatrix]);
        if (object.instanceColor) {
          attributes.push(['originalInstanceColor', object.instanceColor]);
        }
      }
      if (attributes.length > 64) {
        throw new RangeError('Backend observation exceeds its attribute cap.');
      }
      for (const [name, attribute] of attributes) {
        const key = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute;
        const entry: unknown = data.get(key);
        const buffer: unknown = entry && typeof entry === 'object' && 'buffer' in entry ? entry.buffer : undefined;
        if (typeof GPUBuffer === 'undefined' || !(buffer instanceof GPUBuffer)) {
          missingRecords.push(name);
          continue;
        }
        bindings.push({ ordinal: record(buffer, buffer.size, buffer.usage), binding: name });
      }
    }
    samples.push({ objectUuid: object.uuid, materialUuid: material.uuid, buffers: bindings, missingRecords });
  };
  const restore = (): void => {
    if (!observation.active) {
      return;
    }
    observation.active = false;
    clearTimeout(observationTimeout);
    input.signal.removeEventListener('abort', onAbort);
    for (const restoreCallback of restorers.reverse()) {
      try {
        if (!restoreCallback()) {
          callbackOwnershipLost = true;
        }
      } catch {
        callbackOwnershipLost = true;
      }
    }
  };
  const fail = (error: unknown): void => {
    restore();
    rejectObservation?.(error);
  };
  const onAbort = (): void => {
    fail(input.signal.reason);
  };
  try {
    return await new Promise<SectionViewTestBackendBindings>((resolve, reject) => {
      rejectObservation = reject;
      input.signal.addEventListener('abort', onAbort, { once: true });
      for (const object of objects) {
        const original = object.onAfterRender;
        const wrapper: typeof original = function (this: THREE.Object3D, ...args) {
          if (!observation.active) {
            original.apply(this, args);
            return;
          }
          let observationError: unknown;
          let captureFailed = false;
          // Query BEFORE the original callback can change VAO/binding state. Forward regardless of a query failure.
          if (args[0] === input.renderer && args[2] === input.camera) {
            try {
              capture(object, args[3], args[4]);
            } catch (error) {
              captureFailed = true;
              observationError = error;
            }
          }
          try {
            original.apply(this, args);
          } catch (error) {
            fail(error);
            throw error;
          }
          if (captureFailed) {
            fail(observationError);
          }
        };
        object.onAfterRender = wrapper;
        restorers.push(() => {
          if (object.onAfterRender !== wrapper) {
            return false;
          }
          object.onAfterRender = original;
          return true;
        });
      }
      const originalScene = input.scene.onAfterRender;
      const sceneWrapper: typeof originalScene = function (this: THREE.Scene, ...args) {
        try {
          originalScene.apply(this, args);
        } catch (error) {
          fail(error);
          throw error;
        }
        if (!observation.active || args[0] !== input.renderer || args[2] !== input.camera) {
          return;
        }
        let current = false;
        try {
          current = input.isCurrent();
        } catch (error) {
          fail(error);
          return;
        }
        restore();
        try {
          current = current && input.isCurrent();
        } catch (error) {
          fail(error);
          return;
        }
        if (!current) {
          reject(new Error('Backend observation subject changed before frame completion.'));
        } else if (samples.length === 0) {
          reject(new Error('Backend observation frame contained no qualifying draw callbacks.'));
        } else if (callbackOwnershipLost) {
          reject(new Error('Backend observation callback ownership changed.'));
        } else {
          resolve({
            backend: input.backend,
            candidateSceneId: input.candidateSceneId,
            samples,
            buffers: bufferRows,
            uniqueObservedBufferBytes: bufferRows.reduce((sum, row) => sum + row.bytes, 0),
            completeResidentInventory: false,
            uploadedBytes: undefined,
          });
        }
      };
      input.scene.onAfterRender = sceneWrapper;
      restorers.push(() => {
        if (input.scene.onAfterRender !== sceneWrapper) {
          return false;
        }
        input.scene.onAfterRender = originalScene;
        return true;
      });
      observationTimeout = setTimeout(() => {
        fail(new Error('Backend observation frame timed out.'));
      }, 10_000);
      input.signal.throwIfAborted();
      if (!input.isCurrent()) {
        throw new Error('Backend observation subject changed before invalidation.');
      }
      input.invalidate();
    });
  } finally {
    restore();
  }
};

type CommittedDrawInventory = NonNullable<ReturnType<typeof captureCommittedGltfDrawInventory>>;

type SectionViewTestDrawProjection = Readonly<{
  intersectsFrustum: boolean;
  finiteProjection: boolean;
  corners: ReadonlyArray<Readonly<{ x: number; y: number; depth: number }>>;
}>;

/** Project actual renderer-world canonical bounds; these corners do not measure raster coverage or occlusion. */
export function projectSectionViewTestDrawBounds(
  bounds: CommittedDrawInventory['surfaces'][number]['canonicalRenderBounds'],
  camera: THREE.Camera,
  viewport: Readonly<{ width: number; height: number }>,
): SectionViewTestDrawProjection {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  if (
    minX === undefined ||
    minY === undefined ||
    minZ === undefined ||
    maxX === undefined ||
    maxY === undefined ||
    maxZ === undefined ||
    ![minX, minY, minZ, maxX, maxY, maxZ, viewport.width, viewport.height].every((value) => Number.isFinite(value)) ||
    minX > maxX ||
    minY > maxY ||
    minZ > maxZ ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new RangeError('Draw projection requires finite bounds and a positive viewport.');
  }
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    projection,
    camera.coordinateSystem,
    camera.reversedDepth,
  );
  const corners: Array<SectionViewTestDrawProjection['corners'][number]> = [];
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        corners.push({
          x: ((point.x + 1) * viewport.width) / 2,
          y: ((1 - point.y) * viewport.height) / 2,
          depth: point.z,
        });
      }
    }
  }
  return {
    intersectsFrustum: frustum.intersectsBox(box),
    finiteProjection: corners.every(
      ({ x, y, depth }) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(depth),
    ),
    corners,
  };
}

type SectionViewTestDrawInventory = Readonly<
  Omit<CommittedDrawInventory, 'display' | 'metadata' | 'isCurrent' | 'surfaces'> & {
    mechanism: CommittedDrawInventory['metadata']['mechanism'];
    canonicalComponents: ReadonlyArray<
      Readonly<{
        ancestry: CommittedDrawInventory['metadata']['components'][number]['ancestry'];
        component: Pick<CommittedDrawInventory['metadata']['components'][number]['component'], 'id' | 'name'>;
      }>
    >;
    surfaces: ReadonlyArray<
      Omit<CommittedDrawInventory['surfaces'][number], 'canonicalBvhIdentity'> & {
        projection: SectionViewTestDrawProjection;
      }
    >;
    canvas: Readonly<{ cssWidth: number; cssHeight: number; bufferWidth: number; bufferHeight: number }>;
    frustumSurfaceTriangleUpperBound: number;
    residentMandatoryEdgeTriangles: number;
  }
>;

type SectionViewTestRenderDeviceIdentity =
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

/** Opt-in native reads only; a drawn, initialized viewport must already own the context and device. */
export const readSectionViewTestRenderDeviceIdentity = (
  input: Readonly<{
    renderer: unknown;
    api: 'webgl' | 'webgpu';
    frame: number;
    includeRenderDevice?: boolean;
  }>,
): SectionViewTestRenderDeviceIdentity | undefined => {
  if (input.includeRenderDevice !== true) {
    return undefined;
  }
  const unavailable = (reason: string): SectionViewTestRenderDeviceIdentity => ({ status: 'unavailable', reason });
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
  if (!Number.isFinite(input.frame) || input.frame <= 0) {
    return unavailable('NO_OBSERVED_DRAW');
  }
  try {
    const { renderer } = input;
    if (!isObject(renderer)) {
      return unavailable('NATIVE_IDENTITY_READ_FAILED');
    }
    const canvas: unknown = Reflect.get(renderer, 'domElement');
    const getContext: unknown = Reflect.get(renderer, 'getContext');
    if (!isObject(canvas) || typeof getContext !== 'function') {
      return unavailable('CONTEXT_UNSUPPORTED');
    }
    if (input.api === 'webgpu') {
      const hasInitialized: unknown = Reflect.get(renderer, 'hasInitialized');
      // Three's getContext may configure the canvas lazily. Never use it to initialize evidence.
      if (typeof hasInitialized !== 'function' || Reflect.apply(hasInitialized, renderer, []) !== true) {
        return unavailable('RENDERER_NOT_INITIALIZED');
      }
    }
    const context: unknown = Reflect.apply(getContext, renderer, []);
    if (!isObject(context) || Reflect.get(context, 'canvas') !== canvas) {
      return unavailable('CANVAS_MISMATCH');
    }
    const constructorName = input.api === 'webgpu' ? 'GPUCanvasContext' : 'WebGL2RenderingContext';
    const nativeConstructor: unknown = Reflect.get(globalThis, constructorName);
    if (typeof nativeConstructor !== 'function' || !(context instanceof nativeConstructor)) {
      return unavailable('NATIVE_CONTEXT_UNSUPPORTED');
    }
    if (input.api === 'webgpu') {
      const getConfiguration: unknown = Reflect.get(context, 'getConfiguration');
      if (typeof getConfiguration !== 'function') {
        return unavailable('CONFIGURATION_UNSUPPORTED');
      }
      const configuration: unknown = Reflect.apply(getConfiguration, context, []);
      const device: unknown = isObject(configuration) ? Reflect.get(configuration, 'device') : undefined;
      const backend: unknown = Reflect.get(renderer, 'backend');
      if (!isObject(device) || !isObject(backend) || Reflect.get(backend, 'device') !== device) {
        return unavailable('CONFIGURED_DEVICE_MISMATCH');
      }
      const deviceConstructor: unknown = Reflect.get(globalThis, 'GPUDevice');
      if (typeof deviceConstructor !== 'function' || !(device instanceof deviceConstructor)) {
        return unavailable('NATIVE_DEVICE_UNSUPPORTED');
      }
      const info: unknown = Reflect.get(device, 'adapterInfo');
      if (!isObject(info)) {
        return unavailable('DEVICE_INFO_UNSUPPORTED');
      }
      const vendor: unknown = Reflect.get(info, 'vendor');
      const architecture: unknown = Reflect.get(info, 'architecture');
      const deviceName: unknown = Reflect.get(info, 'device');
      const description: unknown = Reflect.get(info, 'description');
      const fallback: unknown = Reflect.get(info, 'isFallbackAdapter');
      // Narrow each native field explicitly; no separate adapter is requested or inferred.
      if (
        typeof vendor !== 'string' ||
        typeof architecture !== 'string' ||
        typeof deviceName !== 'string' ||
        typeof description !== 'string'
      ) {
        return unavailable('DEVICE_INFO_UNSUPPORTED');
      }
      const after: unknown = Reflect.apply(getConfiguration, context, []);
      if (
        !isObject(after) ||
        Reflect.get(after, 'device') !== device ||
        Reflect.get(backend, 'device') !== device ||
        Reflect.get(renderer, 'backend') !== backend ||
        Reflect.get(context, 'canvas') !== canvas ||
        Reflect.get(renderer, 'domElement') !== canvas
      ) {
        return unavailable('DEVICE_CHANGED_DURING_READ');
      }
      return {
        status: 'observed',
        source: 'mounted-webgpu-canvas-device',
        canvasMatches: true,
        configuredDeviceMatches: true,
        vendor,
        architecture,
        device: deviceName,
        description,
        isFallbackAdapter: typeof fallback === 'boolean' ? fallback : undefined,
        identityFieldsComplete: Boolean(
          vendor && architecture && deviceName && description && typeof fallback === 'boolean',
        ),
      };
    }
    const isContextLost: unknown = Reflect.get(context, 'isContextLost');
    const getExtension: unknown = Reflect.get(context, 'getExtension');
    const getParameter: unknown = Reflect.get(context, 'getParameter');
    if (
      typeof isContextLost !== 'function' ||
      typeof getExtension !== 'function' ||
      typeof getParameter !== 'function'
    ) {
      return unavailable('CONTEXT_UNSUPPORTED');
    }
    if (Reflect.apply(isContextLost, context, []) !== false) {
      return unavailable('CONTEXT_LOST');
    }
    const debug: unknown = Reflect.apply(getExtension, context, ['WEBGL_debug_renderer_info']);
    if (!isObject(debug)) {
      return unavailable('UNMASKED_IDENTITY_UNAVAILABLE');
    }
    const vendor: unknown = Reflect.apply(getParameter, context, [Reflect.get(debug, 'UNMASKED_VENDOR_WEBGL')]);
    const description: unknown = Reflect.apply(getParameter, context, [Reflect.get(debug, 'UNMASKED_RENDERER_WEBGL')]);
    if (typeof vendor !== 'string' || typeof description !== 'string') {
      return unavailable('UNMASKED_IDENTITY_UNAVAILABLE');
    }
    if (
      Reflect.apply(isContextLost, context, []) !== false ||
      Reflect.get(context, 'canvas') !== canvas ||
      Reflect.get(renderer, 'domElement') !== canvas
    ) {
      return unavailable('CONTEXT_CHANGED_DURING_READ');
    }
    return {
      status: 'observed',
      source: 'mounted-webgl-context',
      canvasMatches: true,
      configuredDeviceMatches: undefined,
      vendor,
      architecture: '',
      device: '',
      description,
      isFallbackAdapter: undefined,
      identityFieldsComplete: Boolean(vendor && description),
    };
  } catch {
    return unavailable('NATIVE_IDENTITY_READ_FAILED');
  }
};

type SectionViewTestDocument = Readonly<{
  documentId?: string;
  evaluationId: string;
  requestId: string;
  key: string;
  sourceFiles: Readonly<Record<string, string>>;
}>;

/** Read the retained committed document tuple; parked units do not reopen their document. */
export function readSectionViewTestDocument(context: CadContext): SectionViewTestDocument | undefined {
  const { committedRendering: rendering, evaluation } = context;
  if (
    !rendering?.success ||
    rendering.transient ||
    !evaluation?.success ||
    evaluation.transient ||
    evaluation.id !== rendering.evaluationId ||
    !rendering.sourceRevision?.files
  ) {
    return undefined;
  }
  return {
    ...(context.document ? { documentId: context.document.id } : {}),
    evaluationId: rendering.evaluationId,
    requestId: rendering.requestId,
    key: rendering.hash,
    sourceFiles: rendering.sourceRevision.files,
  };
}

/** Project a real pane request only while its document, source and displayed presentation remain current. */
export function readSectionViewTestDisplayedDocument(
  context: CadContext,
  graphics: GraphicsContext,
): SectionViewTestDocument | undefined {
  const { paneRendering, gltfPresentation } = graphics;
  const { document, evaluation, entryPath, latestRenderingOutcome, lastRequestedRenderId, lastSettledRenderId } =
    context;
  if (
    !paneRendering ||
    !document ||
    document.id !== paneRendering.documentId ||
    !evaluation?.success ||
    evaluation.transient ||
    evaluation.id !== paneRendering.evaluationId ||
    paneRendering.sourceRevision.entry !== entryPath ||
    !evaluation.sourceRevision ||
    canonicalJson(paneRendering.sourceRevision) !== canonicalJson(evaluation.sourceRevision) ||
    latestRenderingOutcome !== 'success' ||
    lastRequestedRenderId <= 0 ||
    lastRequestedRenderId !== lastSettledRenderId ||
    !paneRendering.isCurrent() ||
    graphics.artifact?.mimeType !== 'model/gltf-binary' ||
    graphics.artifactSourceFile !== entryPath ||
    graphics.artifactKey !== paneRendering.hash ||
    gltfPresentation.requestedKey !== paneRendering.hash ||
    gltfPresentation.presentedKey !== paneRendering.hash ||
    gltfPresentation.requestedRevision !== gltfPresentation.presentedRevision
  ) {
    return undefined;
  }
  return {
    documentId: paneRendering.documentId,
    evaluationId: paneRendering.evaluationId,
    requestId: paneRendering.requestId,
    key: paneRendering.hash,
    sourceFiles: paneRendering.sourceRevision.files,
  };
}

export type SectionViewTestBridgeApi = Readonly<{
  /** Actual host-admitted pin, readable only while this viewport presents the same settled project subject. */
  getCommittedAssembly(): SectionViewTestCommittedAssembly;
  /** Actual committed candidate rows; no facade or metadata object crosses the data-only transport. */
  getCommittedDrawInventory(): SectionViewTestDrawInventory | undefined;
  /** Explicit untimed debug acquisition through the actual held published document and complete solver pose. */
  exportCurrentPosedAssembly(): Promise<SectionViewTestPosedExport>;
  /** Explicit untimed one-frame buffer observation; no upload-byte or complete residency claim. */
  observeBackendBindings(options?: Readonly<{ signal?: AbortSignal }>): Promise<SectionViewTestBackendBindings>;
  /** Retained worker spans; an explicit owned entry may be parked and grants no live watch or reader. */
  getCadActivity(options?: Readonly<{ entryPath: string }>):
    | Readonly<
        Pick<CadContext, 'telemetryEntries' | 'lastRequestedRenderId' | 'lastSettledRenderId'> & {
          document?: SectionViewTestDocument;
          /** The actual displayed pane request; the default document tuple above remains unchanged. */
          displayedDocument?: SectionViewTestDocument;
          owner?: Readonly<{
            entryPath: string;
            actorSessionId: string;
            state: 'idle' | 'parked';
            fileSystemRoot: string;
            committedKey: string;
          }>;
        }
      >
    | undefined;
  /** Existing actor calibration gesture; undefined clears to full canonical detail. */
  setAssemblyDetailCalibration(calibration: unknown): void;
  /** Current viewport/candidate records only; first-frame timings describe PRE-DRAW callbacks, not browser paint. */
  getAssemblyResourceTelemetry(): ReturnType<typeof rendererSpans>;
  getGraphicsBackend(): 'webgl' | 'webgpu';
  /** Identity from this viewport's renderer, never a separately created probe context. */
  getRendererIdentity(options?: Readonly<{ includeRenderDevice?: boolean; includeRendererName?: boolean }>): Readonly<{
    api: 'webgl' | 'webgpu';
    name: string;
    frame: number;
    renderDevice?: SectionViewTestRenderDeviceIdentity;
  }>;
  /** Warmed full R3F frame submission and completion latency, in milliseconds; excludes RAF/vsync. */
  measureRenderFrames(options?: Readonly<{ gpuTiming?: boolean; orbit?: boolean }>): Promise<
    Readonly<{
      submission: readonly number[];
      completion: readonly number[];
      gpu: ReadonlyArray<number | undefined>;
      gpuMethod: string;
      firstSubmission: number;
      geometries: number;
      textures: number;
      drawCalls: number;
      triangles: number;
      revision: string;
      width: number;
      height: number;
      pixelRatio: number;
    }>
  >;
  getViewportCanvas(): HTMLCanvasElement;
  /** The durable record this view persists, for revisit-equals-reload assertions (Law 4). */
  getViewSettings(): GraphicsViewSettings | undefined;
  isGeometryFramed(): boolean;
  /** Checks the current view record against its applied revision, including observed absence. */
  isViewRecordApplied(): Promise<boolean>;
  /** Replaces the cuts, none selected, turning Section on (off for none); returns the ids of those added. */
  setSectionCuts(cuts: readonly SectionViewTestCut[]): string[];
  /** Adds a cut, selected, turning Section on; undefined when the list is full. */
  addSectionCut(cut: SectionViewTestCut): string | undefined;
  updateSectionCut(id: string, patch: SectionCutPatch): void;
  /** Removing the last cut turns Section off. */
  removeSectionCut(id: string): void;
  selectSectionCut(id: string | undefined): void;
  /** On with no cuts adds the default plane. */
  setSectionViewActive(active: boolean): void;
  getSectionState(): SectionViewTestSectionState;
  /** Where a drawn handle is on screen; only the selected cut has drag handles. */
  projectSectionHandle(kind: SectionHandleTarget['kind'], cutId: string): SectionViewTestProjectedPoint | undefined;
  setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
  setPostProcessingEnabled(enabled: boolean): void;
  setGridPresentationClipPolicy(policy: Readonly<{ far: boolean; near: boolean }>): void;
  getModelComponents(): SectionViewTestModelComponent[];
  getModelVisibility(): SectionViewTestModelVisibility;
  getRenderedModelComponentState(componentId: string): SectionViewTestRenderedModelComponentState;
  projectModelComponent(componentId: string): SectionViewTestProjectedPoint[];
  hideModelComponent(componentId: string): void;
  isolateModelComponent(componentId: string): void;
  resetModelVisibility(): void;
  setCamera(camera: SectionViewTestCamera): void;
  setFovAngle(angle: number): void;
  getCamera(): SectionViewTestCameraState;
  getCameraTransitionDiagnostics(): SectionViewTestCameraTransitionDiagnostics;
  resetCameraTransitionDiagnostics(): void;
  getRenderFrame(): RenderFrame;
  setRenderFrame(renderFrame: RenderFrame): void;
  projectWorldPoint(point: readonly [number, number, number]): SectionViewTestProjectedPoint;
  getModelHoverState(): SectionViewTestModelHoverState;
  setMeasureActive(active: boolean): void;
  getMeasureState(): SectionViewTestMeasureState;
  getSectionHelperSummary(): SectionViewTestHelperSummary;
  /** Current mounted helper CPU views only; returns no census for a retired presentation. */
  getTaggedResourceInventory(): SectionViewTestTaggedResourceInventory | undefined;
  /** Live committed/candidate/retired assembly-owned CPU buffers; excludes textures, demand, WASM and driver memory. */
  getLiveAssemblyResourceInventory(): ReturnType<typeof captureLiveGltfAssemblyResourceInventory>;
  /** One explicitly armed historical admission-boundary sample, with no retained scene references. */
  armAssemblyAdmissionResourceInventory(): boolean;
  takeAssemblyAdmissionResourceInventory():
    | Readonly<{
        held: Readonly<{ key: string; sceneId: string; revision: number; unitId: string; poseRevision: number }>;
        resources: NonNullable<ReturnType<typeof captureLiveGltfAssemblyResourceInventory>>;
      }>
    | undefined;
  clearAssemblyAdmissionResourceInventory(): void;
  /** Requested assembly preparation only; may exist before a current committed draw. */
  getRequestedAssemblyPreparation(): ReturnType<typeof captureRequestedGltfAssemblyPreparation>;
  getSectionCapCompleteness(): SectionViewTestCapCompleteness | undefined;
  getSectionCapOverlapDiagnostics(): SectionCapOverlapDebugSummary | undefined;
  getSectionCapPerformanceDiagnostics(): SectionCapPerformanceDebugSummary | undefined;
}>;

type SectionViewTestGlobal = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: SectionViewTestBridgeApi;
  __TAU_SECTION_VIEW_TEST_BRIDGES__?: SectionViewTestBridgeApi[];
};

function isActuallyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }
  return true;
}

function getRenderedModelComponentState(
  scene: THREE.Object3D,
  componentId: string,
): SectionViewTestRenderedModelComponentState {
  let meshCount = 0;
  let visibleMeshCount = 0;
  const materialOpacities: number[] = [];
  const edgeMaterials: Array<SectionViewTestRenderedModelComponentState['edgeMaterials'][number]> = [];
  scene.traverse((object) => {
    const ownsComponent = getModelComponentIdInHierarchy(object) === componentId;
    if (object instanceof THREE.Mesh && ownsComponent) {
      meshCount++;
      if (isActuallyVisible(object)) {
        visibleMeshCount++;
        materialOpacities.push(...getObjectMaterials(object).map((material) => material.opacity));
      }
    }
    const batch = getGltfOccurrenceEdgeBatch(object);
    if (!ownsComponent && !batch?.segments.some((segment) => segment.componentId === componentId)) {
      return;
    }
    for (const material of getObjectMaterials(object)) {
      if (material instanceof Line2NodeMaterial) {
        edgeMaterials.push({
          objectId: object.uuid,
          materialId: material.uuid,
          visible: isActuallyVisible(object),
          linewidth: material.linewidth,
          alphaToCoverage: material.alphaToCoverage,
          side: material.side,
          depthWrite: material.depthWrite,
          depthTest: material.depthTest,
          transparent: material.transparent,
          edgePresentationCoverage: material.edgePresentationCoverage,
          edgePresentationLineWidth: material.edgePresentationLineWidth,
          edgePresentationCoverageGamma: material.edgePresentationCoverageGamma,
          useViewportSrgbBlend: material.useViewportSrgbBlend,
        });
      }
    }
  });
  return { meshCount, visibleMeshCount, materialOpacities, edgeMaterials };
}

/** Readonly standard Three triangle query over the real consumer mesh set, never the root's Tau raycast override. */
export function getSectionViewTestStockComponentHit(
  raycaster: THREE.Raycaster,
  meshes: readonly THREE.Mesh[],
  clipping?: RaycastClipState,
): string | undefined {
  const hits: THREE.Intersection[] = [];
  const kept = createRaycastClipTest(clipping);
  for (const mesh of meshes) {
    if (!isActuallyVisible(mesh) || !raycaster.layers.test(getGltfOccurrenceLayers(mesh))) {
      continue;
    }
    if (mesh instanceof THREE.InstancedMesh) {
      THREE.InstancedMesh.prototype.raycast.call(mesh, raycaster, hits);
    } else {
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, hits);
    }
  }
  hits.sort((left, right) => left.distance - right.distance);
  const hit = hits.find((entry) => !kept || kept(entry.point));
  return hit
    ? hit.object instanceof THREE.InstancedMesh
      ? getModelComponentHitOwner(hit)?.componentId
      : getModelComponentIdInHierarchy(hit.object)
    : undefined;
}

export const getSectionViewTestControlState = ({
  controls,
  interactionLock,
}: {
  readonly controls: unknown;
  readonly interactionLock: Pick<ViewportGizmoInteractionLock, 'activeRef'>;
}): Pick<SectionViewTestCameraState, 'controlsEnabled' | 'viewportGizmoLockActive'> => {
  const enabled = (controls as { enabled?: unknown } | undefined)?.enabled;

  return {
    controlsEnabled: typeof enabled === 'boolean' ? enabled : true,
    viewportGizmoLockActive: interactionLock.activeRef.current,
  };
};

export const getSectionViewTestMeasurementUiMeshCount = (scene: THREE.Object3D): number => {
  const meshes = new Set<THREE.Object3D>();

  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && hasSceneTag(child, sceneTag.measurementUi)) {
        meshes.add(child);
      }
    });
  }

  return meshes.size;
};

type TaggedResourceCounts = Readonly<{
  objectCount: number;
  geometryCount: number;
  materialCount: number;
  attributeHandleCount: number;
  bufferCount: number;
  backingBytes: number;
  payloadBytes: number;
}>;

export type SectionViewTestTaggedResourceInventory = Readonly<{
  measurementUi: TaggedResourceCounts;
  sectionViewHelper: TaggedResourceCounts;
  union: TaggedResourceCounts;
}>;

/** On-demand census of mounted helper objects. Detached worker, WASM and renderer storage are excluded. */
export const getSectionViewTestTaggedResourceInventory = (
  scene: THREE.Object3D,
  isCurrent: () => boolean,
): SectionViewTestTaggedResourceInventory | undefined => {
  if (!isCurrent()) {
    return undefined;
  }
  const measurement = new Set<THREE.Object3D>();
  const section = new Set<THREE.Object3D>();
  const hasTag = (object: THREE.Object3D, tag: (typeof sceneTag)['measurementUi' | 'sectionViewHelper']): boolean => {
    let owner: THREE.Object3D | undefined = object;
    while (owner) {
      if (hasSceneTag(owner, tag)) {
        return true;
      }
      owner = owner.parent ?? undefined;
    }
    return false;
  };
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse((object) => {
      if (hasTag(object, sceneTag.measurementUi)) {
        measurement.add(object);
      }
      if (hasTag(object, sceneTag.sectionViewHelper)) {
        section.add(object);
      }
    });
  }
  const count = (objects: ReadonlySet<THREE.Object3D>): TaggedResourceCounts => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const attributes = new Set<unknown>();
    const ranges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    for (const object of objects) {
      const geometry: unknown = 'geometry' in object ? object.geometry : undefined;
      if (geometry instanceof THREE.BufferGeometry) {
        geometries.add(geometry as THREE.BufferGeometry);
      }
      for (const material of getObjectMaterials(object)) {
        materials.add(material);
      }
    }
    for (const geometry of geometries) {
      for (const attribute of [
        ...Object.values(geometry.attributes),
        ...(geometry.index ? [geometry.index] : []),
        ...Object.values(geometry.morphAttributes).flat(),
      ]) {
        const owner = 'data' in attribute ? attribute.data : attribute;
        attributes.add(owner);
        const { array } = owner;
        const views = ranges.get(array.buffer) ?? [];
        views.push([array.byteOffset, array.byteOffset + array.byteLength]);
        ranges.set(array.buffer, views);
      }
    }
    let backingBytes = 0;
    let payloadBytes = 0;
    for (const [buffer, views] of ranges) {
      backingBytes += buffer.byteLength;
      let end = 0;
      for (const [start, stop] of views.toSorted((left, right) => left[0] - right[0])) {
        payloadBytes += Math.max(0, stop - Math.max(start, end));
        end = Math.max(end, stop);
      }
    }
    return {
      objectCount: objects.size,
      geometryCount: geometries.size,
      materialCount: materials.size,
      attributeHandleCount: attributes.size,
      bufferCount: ranges.size,
      backingBytes,
      payloadBytes,
    };
  };
  const result = {
    measurementUi: count(measurement),
    sectionViewHelper: count(section),
    union: count(new Set([...measurement, ...section])),
  };
  return isCurrent() ? result : undefined;
};

/** A point in normalized device coordinates, in viewport pixels; visible inside the view volume. */
const toProjectedPoint = (
  projected: THREE.Vector3,
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>,
): SectionViewTestProjectedPoint => ({
  x: rect.left + ((projected.x + 1) / 2) * rect.width,
  y: rect.top + ((1 - projected.y) / 2) * rect.height,
  visible:
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1 &&
    projected.z >= -1 &&
    projected.z <= 1,
});

function getLineSegments2SegmentCount(object: THREE.Object3D): number {
  const attributes = (object as { geometry?: THREE.BufferGeometry }).geometry?.attributes;
  const instanceStartCount = attributes?.['instanceStart']?.count;
  if (typeof instanceStartCount === 'number') {
    return instanceStartCount;
  }

  const positionCount = attributes?.['position']?.count;
  return typeof positionCount === 'number' ? Math.floor(positionCount / 2) : 0;
}

function getObjectMaterials(object: THREE.Object3D): THREE.Material[] {
  const { material } = object as { material?: THREE.Material | THREE.Material[] };
  if (!material) {
    return [];
  }

  return Array.isArray(material) ? material : [material];
}

export const getSectionViewTestHelperSummary = (scene: THREE.Object3D): SectionViewTestHelperSummary => {
  let sectionHelperMeshCount = 0;
  let sectionHelperLineSegments2Count = 0;
  let sectionHelperContourSegmentCount = 0;
  const meshRenderOrders: number[] = [];
  const lineSegments2RenderOrders: number[] = [];
  const sectionHelperMaterialStates: SectionViewTestHelperMaterialState[] = [];

  const visitSectionHelper = (child: THREE.Object3D): void => {
    if (!hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if (child.type === 'LineSegments2') {
      sectionHelperLineSegments2Count++;
      sectionHelperContourSegmentCount += getLineSegments2SegmentCount(child);
      lineSegments2RenderOrders.push(child.renderOrder);
    } else if (child instanceof THREE.Mesh) {
      sectionHelperMeshCount++;
      meshRenderOrders.push(child.renderOrder);
    }

    for (const material of getObjectMaterials(child)) {
      sectionHelperMaterialStates.push({
        objectType: child.type,
        materialType: material.type,
        renderOrder: child.renderOrder,
        transparent: material.transparent,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
      });
    }
  };
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse(visitSectionHelper);
  }

  return {
    sectionHelperMeshCount,
    sectionHelperLineSegments2Count,
    sectionHelperContourSegmentCount,
    sectionHelperRenderOrders: {
      meshes: meshRenderOrders,
      lineSegments2: lineSegments2RenderOrders,
    },
    sectionHelperMaterialStates,
  };
};

/**
 * Where a section handle is on screen: the centre of the bounds of its hit meshes, which the handles name
 * `kind:cutId`; undefined while none is drawn.
 */
export const projectSectionViewTestHandle = ({
  target,
  camera,
  rect,
  scene,
}: {
  readonly target: SectionHandleTarget;
  readonly camera: THREE.Camera;
  readonly rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
  readonly scene: THREE.Object3D;
}): SectionViewTestProjectedPoint | undefined => {
  const name = `${target.kind}:${target.cutId}`;
  const bounds = new THREE.Box3();
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (child.name === name && hasSceneTag(child, sceneTag.sectionViewHelper) && isActuallyVisible(child)) {
        bounds.expandByObject(child);
      }
    });
  }
  return bounds.isEmpty() ? undefined : toProjectedPoint(bounds.getCenter(new THREE.Vector3()).project(camera), rect);
};

export const getSectionViewTestCapOverlapDiagnostics = (
  scene: THREE.Object3D,
): SectionCapOverlapDebugSummary | undefined => {
  let summary: SectionCapOverlapDebugSummary | undefined;

  scene.traverse((child) => {
    const candidate = (child.userData as Record<string, unknown>)[sectionCapOverlapDebugUserDataKey];
    if (candidate && typeof candidate === 'object') {
      summary = candidate as SectionCapOverlapDebugSummary;
    }
  });

  return summary;
};

export const getSectionViewTestCapPerformanceDiagnostics = (
  scene: THREE.Object3D,
): SectionCapPerformanceDebugSummary | undefined => {
  let summary: SectionCapPerformanceDebugSummary | undefined;

  scene.traverse((child) => {
    const candidate = (child.userData as Record<string, unknown>)[sectionCapPerformanceDebugUserDataKey];
    if (candidate && typeof candidate === 'object') {
      summary = candidate as SectionCapPerformanceDebugSummary;
    }
  });

  return summary;
};

export function SectionViewTestBridge({ isGeometryFramed }: { readonly isGeometryFramed: boolean }): React.ReactNode {
  const isTauDebugEnabled = useFeature('tauDebug');
  const graphicsActor = useGraphics();
  const project = useProject({ enableNoContext: true });
  const projectId = project?.projectId;
  const projectRef = project?.projectRef;
  const viewRecords = project?.viewRecords;
  const appliedWorkbenchRevisions = project?.appliedWorkbenchRevisions;
  // Record persistence and bounds readiness do not replace this viewport’s read authority.
  const presentationRef = React.useRef({ viewRecords, appliedWorkbenchRevisions, isGeometryFramed });
  React.useLayoutEffect(() => {
    presentationRef.current = { viewRecords, appliedWorkbenchRevisions, isGeometryFramed };
  }, [viewRecords, appliedWorkbenchRevisions, isGeometryFramed]);
  const cadRef = useCad();
  const cameraRig = useCameraRig();
  const cameraFraming = useViewCameraFraming();
  const cameraConnectorRef = useCameraConnectorRef();
  const setRenderFrame = useSetRenderFrame();
  const modelInteractionRef = useModelInteractionRef();
  const get = useThree((state) => state.get);
  const interactionLock = useViewportGizmoInteractionLock();
  const pendingCameraTransitionRef = React.useRef<
    { readonly camera: THREE.Camera; readonly requestedAt: number } | undefined
  >(undefined);
  const cameraTransitionDiagnosticsRef = React.useRef<SectionViewTestCameraTransitionDiagnostics>({
    requests: 0,
    frames: 0,
    actorSyncFailures: 0,
    averageRequestToActorSyncMilliseconds: 0,
    maximumRequestToActorSyncMilliseconds: 0,
    maximumRequestToFrameMilliseconds: 0,
    staleFrames: 0,
  });

  useFrame((state) => {
    const pending = pendingCameraTransitionRef.current;
    if (!pending) {
      return;
    }
    const controlsCamera =
      (state.controls as { camera?: unknown; object?: unknown } | undefined)?.camera ??
      (state.controls as { object?: unknown } | undefined)?.object;
    const isStale =
      state.camera !== pending.camera ||
      cameraRig.activeCamera !== pending.camera ||
      (controlsCamera !== undefined && controlsCamera !== pending.camera);
    const elapsed = performance.now() - pending.requestedAt;
    const diagnostics = cameraTransitionDiagnosticsRef.current;
    cameraTransitionDiagnosticsRef.current = {
      ...diagnostics,
      frames: diagnostics.frames + 1,
      maximumRequestToFrameMilliseconds: Math.max(diagnostics.maximumRequestToFrameMilliseconds, elapsed),
      staleFrames: diagnostics.staleFrames + (isStale ? 1 : 0),
    };
    pendingCameraTransitionRef.current = undefined;
  }, 4);

  useEffect(() => {
    if (!isTauDebugEnabled) {
      return undefined;
    }

    let live = true;
    let backendObservationAbort: AbortController | undefined;
    const { scene } = get();
    let armedAdmissionSceneId: string | undefined;
    let admissionObservation:
      | Readonly<{
          held: Readonly<{ key: string; sceneId: string; revision: number; unitId: string; poseRevision: number }>;
          resources: NonNullable<ReturnType<typeof captureLiveGltfAssemblyResourceInventory>>;
        }>
      | undefined;
    const bridgeGlobal = globalThis as SectionViewTestGlobal;
    const getActiveUnitId = (): string | undefined => graphicsActor.getSnapshot().context.modelInteractionUnitId;
    const setFovAngle = (angle: number): void => {
      const expectedCamera = angle === 0 ? cameraRig.orthographicCamera : cameraRig.perspectiveCamera;
      const requestedAt = performance.now();
      pendingCameraTransitionRef.current = { camera: expectedCamera, requestedAt };
      cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: angle });
      const elapsed = performance.now() - requestedAt;
      const diagnostics = cameraTransitionDiagnosticsRef.current;
      const requests = diagnostics.requests + 1;
      const actorSynced =
        cameraRig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView === angle &&
        cameraRig.activeCamera === expectedCamera;
      cameraTransitionDiagnosticsRef.current = {
        ...diagnostics,
        requests,
        actorSyncFailures: diagnostics.actorSyncFailures + (actorSynced ? 0 : 1),
        averageRequestToActorSyncMilliseconds:
          (diagnostics.averageRequestToActorSyncMilliseconds * diagnostics.requests + elapsed) / requests,
        maximumRequestToActorSyncMilliseconds: Math.max(diagnostics.maximumRequestToActorSyncMilliseconds, elapsed),
      };
    };
    const addSectionCut = (cut: SectionViewTestCut): string | undefined => {
      const count = graphicsActor.getSnapshot().context.sectionCuts.length;
      graphicsActor.send({
        type: 'addSectionCut',
        payload: cut.kind === 'plane' ? { kind: 'plane', plane: cut.plane } : { kind: 'revolution', axis: cut.axis },
      });
      const added = graphicsActor.getSnapshot().context.sectionCuts[count];
      if (added) {
        // The cut is its own patch: a patch ignores `kind`, and a value left out keeps the default.
        graphicsActor.send({ type: 'updateSectionCut', payload: { id: added.id, patch: cut } });
      }
      return added?.id;
    };
    const bridge: SectionViewTestBridgeApi = {
      getCommittedAssembly() {
        const snapshot = cadRef?.getSnapshot();
        const selected = snapshot && selectCadDisplay(snapshot);
        const assemblyDisplay = selected && 'admitted' in selected ? selected : undefined;
        const graphics = graphicsActor.getSnapshot();
        const displayedDocument = snapshot && readSectionViewTestDisplayedDocument(snapshot.context, graphics.context);
        const diagnostics = {
          projectId,
          outcome: snapshot?.context.latestRenderingOutcome,
          requestedRenderId: snapshot?.context.lastRequestedRenderId,
          settledRenderId: snapshot?.context.lastSettledRenderId,
          requestedKey: graphics.context.gltfPresentation.requestedKey,
          presentedKey: graphics.context.gltfPresentation.presentedKey,
          requestedRevision: graphics.context.gltfPresentation.requestedRevision,
          presentedRevision: graphics.context.gltfPresentation.presentedRevision,
          sourceEntryPath: snapshot?.context.entryPath,
          sourceGeometryHash:
            selected &&
            !('admitted' in selected) &&
            selected.success &&
            selected === snapshot.context.committedRendering
              ? graphics.context.paneRendering
                ? displayedDocument?.key
                : selected.hash
              : undefined,
        };
        const unavailableRead = async (): Promise<Uint8Array<ArrayBuffer>> => {
          throw new Error('Committed assembly read authority is unavailable.');
        };
        const fileManagerRef = snapshot?.context.fileManagerRef;
        const fileManager: SnapshotFrom<typeof fileManagerMachine> | undefined = fileManagerRef?.getSnapshot();
        const contentService: FileContentService | undefined = fileManager?.matches('ready')
          ? fileManager.context.contentService
          : undefined;
        if (
          !assemblyDisplay ||
          !snapshot ||
          !cadRef ||
          projectId === undefined ||
          !projectRef ||
          !fileManagerRef ||
          !fileManager ||
          !contentService
        ) {
          return { assemblyDisplay: undefined, diagnostics, isCurrent: () => false, readRawBytes: unavailableRead };
        }
        const { fileSystemRoot } = snapshot.context;
        const rootDirectory: unknown = fileManager.context.rootDirectory;
        if (typeof rootDirectory !== 'string') {
          return { assemblyDisplay: undefined, diagnostics, isCurrent: () => false, readRawBytes: unavailableRead };
        }
        const contentServiceRoot = normalizePath(rootDirectory);
        const parent = assemblyDisplay.root.path.slice(0, assemblyDisplay.root.path.lastIndexOf('/') + 1);
        const capturedRenderId = snapshot.context.lastRequestedRenderId;
        const isCurrent = (): boolean => {
          const current = cadRef.getSnapshot();
          const currentProject = projectRef.getSnapshot();
          const projectContext: ProjectContext = currentProject.context;
          const currentGraphics = graphicsActor.getSnapshot();
          const { entryPath } = current.context;
          const currentFiles = fileManagerRef.getSnapshot();
          const currentRootDirectory: unknown = currentFiles.context.rootDirectory;
          return isSectionViewTestAssemblyCurrent({
            live,
            projectCurrent:
              currentProject.status === 'active' &&
              currentProject.matches('ready') &&
              projectContext.projectId === projectId &&
              projectContext.fileManagerRef === fileManagerRef &&
              projectContext.fileSystemRoot === fileSystemRoot &&
              current.context.fileManagerRef === fileManagerRef &&
              current.context.fileSystemRoot === fileSystemRoot &&
              currentFiles.status === 'active' &&
              currentFiles.matches('ready') &&
              currentFiles.context.contentService === contentService &&
              typeof currentRootDirectory === 'string' &&
              normalizePath(currentRootDirectory) === contentServiceRoot &&
              parent.startsWith('.tau/artifacts/reusable-parts/') &&
              entryPath !== undefined &&
              projectContext.geometryUnits.get(entryPath) === cadRef &&
              [...projectContext.viewGraphics.values()].includes(graphicsActor),
            cadActive: current.status === 'active',
            graphicsActive: currentGraphics.status === 'active',
            selectedDisplay: selectCadDisplay(current),
            capturedDisplay: assemblyDisplay,
            capturedKey: assemblyDisplay.root.digest,
            presentedKey: currentGraphics.context.gltfPresentation.presentedKey,
            outcome: current.context.latestRenderingOutcome,
            requestedRenderId: current.context.lastRequestedRenderId,
            settledRenderId: current.context.lastSettledRenderId,
            capturedRenderId,
          });
        };
        const readRawBytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
          readSectionViewTestAssemblyBytes(path, {
            parent,
            fileSystemRoot,
            isCurrent,
            readRawBytes: async (rootedPath) => {
              const selectedPath = normalizePath(`${fileSystemRoot}/${assertRootedPath(rootedPath)}`);
              const prefix = contentServiceRoot === '/' ? '/' : `${contentServiceRoot}/`;
              if (!selectedPath.startsWith(prefix)) {
                throw new Error('Committed assembly read escapes its captured file content authority.');
              }
              return contentService.readRawBytes(assertRootedPath(selectedPath.slice(prefix.length)));
            },
          });
        return { assemblyDisplay: isCurrent() ? assemblyDisplay : undefined, diagnostics, isCurrent, readRawBytes };
      },
      getViewSettings() {
        if (!projectRef) {
          return undefined;
        }
        /* The view id is the Dockview panel id the project keyed this graphics actor by, so the
         * bridge finds its own record without a prop drilled through the whole R3F tree. */
        const viewId = [...projectRef.getSnapshot().context.viewGraphics.entries()].find(
          ([, actor]) => actor === graphicsActor,
        )?.[0];
        const record = viewId === undefined ? undefined : presentationRef.current.viewRecords?.get(viewId);
        return record ? graphicsSettingsForView(record) : undefined;
      },
      getCommittedDrawInventory() {
        const subject = bridge.getCommittedAssembly();
        const capture = captureCommittedGltfDrawInventory(scene);
        const { camera, gl } = get();
        if (
          !capture ||
          !subject.assemblyDisplay ||
          !subject.isCurrent() ||
          capture.display !== subject.assemblyDisplay
        ) {
          return undefined;
        }
        const isCurrent = (): boolean => {
          const graphics = graphicsActor.getSnapshot();
          let matchingSource = false;
          scene.traverse((object) => {
            const source = getGltfAssemblySource(object);
            if (source?.display === capture.display && source.metadata === capture.metadata) {
              matchingSource = true;
            }
          });
          return (
            live &&
            subject.isCurrent() &&
            capture.isCurrent() &&
            matchingSource &&
            graphics.status === 'active' &&
            graphics.context.gltfPresentation.presentedKey === capture.key &&
            graphics.context.gltfPresentation.presentedRevision === capture.presentationRevision &&
            graphics.context.modelInteractionUnitId === capture.unitId &&
            graphics.context.kinematicsRef.getSnapshot().context.revision === capture.poseRevision
          );
        };
        if (!isCurrent()) {
          return undefined;
        }
        const rect = gl.domElement.getBoundingClientRect();
        const surfaces = capture.surfaces.map(({ canonicalBvhIdentity: _canonicalBvhIdentity, ...row }) => ({
          ...row,
          projection: projectSectionViewTestDrawBounds(row.canonicalRenderBounds, camera, rect),
        }));
        const {
          display: _display,
          metadata: _metadata,
          isCurrent: _captureCurrent,
          surfaces: _surfaces,
          ...data
        } = capture;
        const result = {
          ...data,
          mechanism: capture.metadata.mechanism,
          canonicalComponents: capture.metadata.components.map(({ ancestry, component: { id, name } }) => ({
            ancestry,
            component: { id, name },
          })),
          surfaces,
          canvas: {
            cssWidth: rect.width,
            cssHeight: rect.height,
            bufferWidth: gl.domElement.width,
            bufferHeight: gl.domElement.height,
          },
          // Broad-phase upper bound includes partly clipped and occluded surfaces.
          frustumSurfaceTriangleUpperBound: surfaces.reduce(
            (sum, row) => sum + (row.visible && row.projection.intersectsFrustum ? row.drawTriangles : 0),
            0,
          ),
          // Keep every visible resident edge batch; do not undercount fat edges with a surface proxy.
          residentMandatoryEdgeTriangles: capture.edges.reduce(
            (sum, row) => sum + (row.visible ? row.mandatoryTriangles : 0),
            0,
          ),
        };
        return isCurrent() ? result : undefined;
      },
      async exportCurrentPosedAssembly() {
        const subject = bridge.getCommittedAssembly();
        const capture = captureCommittedGltfDrawInventory(scene);
        const graphics = graphicsActor.getSnapshot();
        const client = cadRef?.getSnapshot().context.kernelClient;
        const { gl } = get();
        const { frame } = bridge.getRendererIdentity({ includeRendererName: false });
        const display = subject.assemblyDisplay;
        const { projectId: heldProjectId, sourceEntryPath } = subject.diagnostics;
        if (
          !capture ||
          !display ||
          !client ||
          !subject.isCurrent() ||
          capture.display !== display ||
          !gl.domElement.isConnected ||
          !Number.isFinite(frame) ||
          frame <= 0 ||
          !heldProjectId ||
          !sourceEntryPath ||
          graphics.status !== 'active' ||
          graphics.context.modelInteractionUnitId !== capture.unitId
        ) {
          throw new Error('Full posed export requires a coherent committed assembly.');
        }
        const candidate = scene.getObjectByProperty('uuid', capture.candidateSceneId);
        const source = candidate && getGltfAssemblySource(candidate);
        if (!candidate || !source || source.display !== display || source.metadata !== capture.metadata) {
          throw new Error('Full posed export cannot locate the actual admitted candidate source.');
        }
        const kinematics = graphics.context.kinematicsRef;
        const unit = getKinematicsUnitState(kinematics.getSnapshot().context, capture.unitId);
        const isCurrent = (): boolean => {
          const fresh = captureCommittedGltfDrawInventory(scene);
          const currentGraphics = graphicsActor.getSnapshot();
          const current = bridge.getCommittedAssembly();
          return (
            live &&
            subject.isCurrent() &&
            current.isCurrent() &&
            current.assemblyDisplay === display &&
            cadRef.getSnapshot().context.kernelClient === client &&
            get().gl === gl &&
            gl.domElement.isConnected &&
            bridge.getRendererIdentity({ includeRendererName: false }).frame >= frame &&
            current.diagnostics.projectId === heldProjectId &&
            current.diagnostics.sourceEntryPath === sourceEntryPath &&
            capture.isCurrent() &&
            fresh?.display === display &&
            fresh.metadata === source.metadata &&
            fresh.candidateSceneId === capture.candidateSceneId &&
            fresh.key === capture.key &&
            fresh.unitId === capture.unitId &&
            fresh.poseRevision === capture.poseRevision &&
            fresh.presentationRevision === capture.presentationRevision &&
            scene.getObjectByProperty('uuid', capture.candidateSceneId) === candidate &&
            getGltfAssemblySource(candidate) === source &&
            currentGraphics.status === 'active' &&
            currentGraphics.context.kinematicsRef === kinematics &&
            currentGraphics.context.modelInteractionUnitId === capture.unitId &&
            currentGraphics.context.gltfPresentation.requestedKey === capture.key &&
            currentGraphics.context.gltfPresentation.presentedKey === capture.key &&
            currentGraphics.context.gltfPresentation.requestedRevision === capture.presentationRevision &&
            currentGraphics.context.gltfPresentation.presentedRevision === capture.presentationRevision &&
            kinematics.getSnapshot().status === 'active' &&
            kinematics.getSnapshot().context.revision === capture.poseRevision &&
            getKinematicsUnitState(kinematics.getSnapshot().context, capture.unitId) === unit
          );
        };
        return exportSectionViewTestPosedAssembly({
          source,
          unit,
          isCurrent,
          binding: {
            root: display.root,
            projectId: heldProjectId,
            sourceEntryPath,
            key: capture.key,
            unitId: capture.unitId,
            poseRevision: capture.poseRevision,
            presentationRevision: capture.presentationRevision,
            candidateSceneId: capture.candidateSceneId,
            coordinateSystem: 'y-up',
          },
        });
      },
      async observeBackendBindings(options) {
        if (backendObservationAbort) {
          throw new Error('This viewport is already observing backend bindings.');
        }
        const subject = bridge.getCommittedAssembly();
        const capture = captureCommittedGltfDrawInventory(scene);
        const { camera, gl, size } = get();
        if (
          !capture ||
          !subject.assemblyDisplay ||
          !subject.isCurrent() ||
          capture.display !== subject.assemblyDisplay
        ) {
          throw new Error('Backend observation requires a coherent committed assembly.');
        }
        const root = scene.getObjectByProperty('uuid', capture.candidateSceneId);
        if (!root) {
          throw new Error('Backend observation cannot locate the actual committed scene.');
        }
        const ids = new Set([
          ...capture.surfaces.map((row) => row.objectId),
          ...capture.edges.map((row) => row.objectId),
        ]);
        const objects: THREE.Object3D[] = [];
        root.traverse((object) => {
          if (ids.has(object.id)) {
            objects.push(object);
          }
        });
        camera.updateMatrixWorld(true);
        const world = [...camera.matrixWorld.elements];
        const projection = [...camera.projectionMatrix.elements];
        const { width } = size;
        const { height } = size;
        const bufferWidth = gl.domElement.width;
        const bufferHeight = gl.domElement.height;
        const backend = bridge.getGraphicsBackend();
        const isCurrent = (): boolean => {
          const viewport = get();
          const fresh = captureCommittedGltfDrawInventory(scene);
          return (
            live &&
            subject.isCurrent() &&
            capture.isCurrent() &&
            fresh?.candidateSceneId === capture.candidateSceneId &&
            fresh.display === capture.display &&
            fresh.presentationRevision === capture.presentationRevision &&
            fresh.poseRevision === capture.poseRevision &&
            fresh.unitId === capture.unitId &&
            viewport.gl === gl &&
            viewport.camera === camera &&
            viewport.size.width === width &&
            viewport.size.height === height &&
            gl.domElement.width === bufferWidth &&
            gl.domElement.height === bufferHeight &&
            bridge.getGraphicsBackend() === backend &&
            camera.matrixWorld.elements.every((value, index) => value === world[index]) &&
            camera.projectionMatrix.elements.every((value, index) => value === projection[index])
          );
        };
        const abort = new AbortController();
        backendObservationAbort = abort;
        const cancel = (): void => {
          abort.abort(options?.signal?.reason);
        };
        options?.signal?.addEventListener('abort', cancel, { once: true });
        try {
          options?.signal?.throwIfAborted();
          return await observeSectionViewTestBackendBindings({
            renderer: gl,
            scene,
            camera,
            candidateSceneId: capture.candidateSceneId,
            objects,
            backend,
            signal: abort.signal,
            isCurrent,
            invalidate: () => {
              get().invalidate();
            },
          });
        } finally {
          options?.signal?.removeEventListener('abort', cancel);
          if (backendObservationAbort === abort) {
            backendObservationAbort = undefined;
          }
        }
      },
      getCadActivity(options) {
        const subject = bridge.getCommittedAssembly();
        const snapshot = cadRef?.getSnapshot();
        if (!snapshot || !cadRef) {
          return undefined;
        }
        const ordinaryCurrent = (): boolean => {
          const project = projectRef?.getSnapshot();
          const projectContext: ProjectContext | undefined = project?.context;
          const graphics = graphicsActor.getSnapshot();
          const selected = selectCadDisplay(snapshot);
          const displayedDocument = readSectionViewTestDisplayedDocument(snapshot.context, graphics.context);
          if (graphics.context.paneRendering !== undefined && displayedDocument === undefined) {
            return false;
          }
          const displayedKey =
            displayedDocument?.key ??
            (selected && !('admitted' in selected) && selected.success ? selected.hash : undefined);
          const { entryPath, fileManagerRef, fileSystemRoot, lastRequestedRenderId, lastSettledRenderId } =
            snapshot.context;
          const files: SnapshotFrom<typeof fileManagerMachine> | undefined = fileManagerRef?.getSnapshot();
          const contentRoot: unknown = files?.context.rootDirectory;
          if (!project || !projectContext || !files) {
            return false;
          }
          return (
            live &&
            projectId !== undefined &&
            snapshot.status === 'active' &&
            project.status === 'active' &&
            project.matches('ready') &&
            projectContext.projectId === projectId &&
            projectContext.fileManagerRef === fileManagerRef &&
            projectContext.fileSystemRoot === fileSystemRoot &&
            entryPath !== undefined &&
            projectContext.geometryUnits.get(entryPath) === cadRef &&
            [...projectContext.viewGraphics.values()].includes(graphicsActor) &&
            graphics.status === 'active' &&
            files.status === 'active' &&
            files.matches('ready') &&
            typeof contentRoot === 'string' &&
            normalizePath(contentRoot) === normalizePath(fileSystemRoot) &&
            selected !== undefined &&
            !('admitted' in selected) &&
            selected.success &&
            selected === snapshot.context.committedRendering &&
            snapshot.context.latestRenderingOutcome === 'success' &&
            lastRequestedRenderId > 0 &&
            lastRequestedRenderId === lastSettledRenderId &&
            graphics.context.gltfPresentation.presentedKey === displayedKey &&
            graphics.context.gltfPresentation.requestedKey === displayedKey &&
            graphics.context.gltfPresentation.requestedRevision ===
              graphics.context.gltfPresentation.presentedRevision &&
            cadRef.getSnapshot() === snapshot
          );
        };
        const isCurrent = (): boolean => subject.isCurrent() || ordinaryCurrent();
        if (!isCurrent()) {
          return undefined;
        }
        if (options) {
          const project = projectRef?.getSnapshot();
          const projectContext: ProjectContext | undefined = project?.context;
          const ownedRef = projectContext?.geometryUnits.get(options.entryPath);
          const owned = ownedRef?.getSnapshot();
          const files: SnapshotFrom<typeof fileManagerMachine> | undefined =
            owned?.context.fileManagerRef?.getSnapshot();
          const contentRoot: unknown = files?.context.rootDirectory;
          const selected = owned ? selectCadDisplay(owned) : undefined;
          const actorSessionId: unknown = ownedRef ? Reflect.get(ownedRef, 'sessionId') : undefined;
          if (
            !project ||
            !projectContext ||
            !ownedRef ||
            !owned ||
            !files ||
            !selected ||
            typeof actorSessionId !== 'string'
          ) {
            return undefined;
          }
          const state = owned.matches('idle') ? 'idle' : owned.matches('parked') ? 'parked' : undefined;
          const {
            entryPath,
            fileManagerRef,
            fileSystemRoot,
            telemetryEntries,
            lastRequestedRenderId,
            lastSettledRenderId,
          } = owned.context;
          const committed =
            'admitted' in selected
              ? selected === owned.context.committedAssemblyDisplay
              : selected === owned.context.committedRendering;
          const committedKey =
            'admitted' in selected ? selected.root.digest : selected.success ? selected.hash : undefined;
          const ownedCurrent = (): boolean =>
            live &&
            isCurrent() &&
            state !== undefined &&
            owned.status === 'active' &&
            projectId !== undefined &&
            project.status === 'active' &&
            project.matches('ready') &&
            projectContext.projectId === projectId &&
            entryPath === options.entryPath &&
            projectContext.geometryUnits.get(options.entryPath) === ownedRef &&
            projectContext.fileManagerRef === fileManagerRef &&
            snapshot.context.fileManagerRef === fileManagerRef &&
            projectContext.fileSystemRoot === fileSystemRoot &&
            snapshot.context.fileSystemRoot === fileSystemRoot &&
            files.status === 'active' &&
            files.matches('ready') &&
            typeof contentRoot === 'string' &&
            normalizePath(contentRoot) === normalizePath(fileSystemRoot) &&
            committed &&
            owned.context.latestRenderingOutcome === 'success' &&
            lastRequestedRenderId > 0 &&
            lastRequestedRenderId === lastSettledRenderId &&
            projectRef?.getSnapshot() === project &&
            ownedRef.getSnapshot() === owned &&
            fileManagerRef.getSnapshot() === files;
          if (!state || committedKey === undefined || !ownedCurrent()) {
            return undefined;
          }
          return {
            telemetryEntries,
            lastRequestedRenderId,
            lastSettledRenderId,
            ...('admitted' in selected ? {} : { document: readSectionViewTestDocument(owned.context) }),
            owner: { entryPath: options.entryPath, actorSessionId, state, fileSystemRoot, committedKey },
          };
        }
        const { telemetryEntries, lastRequestedRenderId, lastSettledRenderId } = snapshot.context;
        const selected = selectCadDisplay(snapshot);
        const displayedDocument = readSectionViewTestDisplayedDocument(
          snapshot.context,
          graphicsActor.getSnapshot().context,
        );
        return isCurrent()
          ? {
              telemetryEntries,
              lastRequestedRenderId,
              lastSettledRenderId,
              ...(selected && !('admitted' in selected)
                ? { document: readSectionViewTestDocument(snapshot.context) }
                : {}),
              ...(displayedDocument ? { displayedDocument } : {}),
            }
          : undefined;
      },
      setAssemblyDetailCalibration(calibration) {
        if (calibration !== undefined && !isAssemblyDetailCalibration(calibration)) {
          throw new TypeError('Invalid assembly detail calibration.');
        }
        graphicsActor.send({ type: 'setAssemblyDetailCalibration', calibration });
      },
      getAssemblyResourceTelemetry() {
        const subject = bridge.getCommittedAssembly();
        const capture = captureCommittedGltfDrawInventory(scene);
        const { gl, size } = get();
        const { width, height } = size;
        const bufferWidth = gl.domElement.width;
        const bufferHeight = gl.domElement.height;
        if (!capture || !subject.assemblyDisplay || capture.display !== subject.assemblyDisplay) {
          return [];
        }
        const backend = bridge.getGraphicsBackend();
        const isCurrent = (): boolean => {
          const graphics = graphicsActor.getSnapshot();
          const viewport = get();
          return (
            live &&
            width > 0 &&
            height > 0 &&
            viewport.gl === gl &&
            viewport.size.width === width &&
            viewport.size.height === height &&
            gl.domElement.width === bufferWidth &&
            gl.domElement.height === bufferHeight &&
            bridge.getGraphicsBackend() === backend &&
            subject.isCurrent() &&
            capture.isCurrent() &&
            graphics.status === 'active' &&
            graphics.context.gltfPresentation.presentedKey === capture.key &&
            graphics.context.gltfPresentation.presentedRevision === capture.presentationRevision &&
            graphics.context.modelInteractionUnitId === capture.unitId &&
            graphics.context.kinematicsRef.getSnapshot().context.revision === capture.poseRevision
          );
        };
        const viewportActorSessionId: unknown = Reflect.get(graphicsActor, 'sessionId');
        if (typeof viewportActorSessionId !== 'string') {
          throw new TypeError('Expected actual graphics actor session ID.');
        }
        return readSectionViewTestAssemblyResourceTelemetry({
          viewportActorSessionId,
          candidateSceneId: capture.candidateSceneId,
          key: capture.key,
          revision: capture.presentationRevision,
          backend,
          isCurrent,
        });
      },
      getGraphicsBackend() {
        const renderer = get().gl as unknown as { readonly backend?: { readonly isWebGPUBackend?: boolean } };
        return renderer.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl';
      },
      getRendererIdentity(options) {
        const { gl } = get();
        const api = bridge.getGraphicsBackend();
        // Three's common renderer also drives WebGL; the class flag does not name the backend.
        const context =
          options?.includeRendererName !== false && api === 'webgl' && typeof gl.getContext === 'function'
            ? gl.getContext()
            : undefined;
        const debug = context?.getExtension('WEBGL_debug_renderer_info');
        const frame = 'frame' in gl.info && typeof gl.info.frame === 'number' ? gl.info.frame : gl.info.render.frame;
        return {
          api,
          name: debug ? String(context?.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '') : '',
          frame,
          ...(options?.includeRenderDevice === true
            ? {
                renderDevice: readSectionViewTestRenderDeviceIdentity({
                  renderer: gl,
                  api,
                  frame,
                  includeRenderDevice: true,
                }),
              }
            : {}),
        };
      },
      async measureRenderFrames(options = {}) {
        const state = get();
        const initialCamera = bridge.getCamera();
        const offset = new THREE.Vector3(...initialCamera.position).sub(new THREE.Vector3(...initialCamera.target));
        const renderer = state.gl as RendererInstance;
        const previousFrameloop = state.frameloop;
        const previousAutoReset = renderer.info.autoReset;
        const timer = createRenderFrameTimer(renderer, options.gpuTiming === true);
        const gpu: Array<number | undefined> = [];
        let firstSubmission = 0;
        const submission: number[] = [];
        const completion: number[] = [];
        // Three exposes the native device on its backend; its declaration omits the device field.
        const device =
          'backend' in renderer
            ? (Reflect.get(renderer.backend, 'device') as {
                queue: { onSubmittedWorkDone(): Promise<void> };
              })
            : undefined;
        let drawCalls = 0;
        let triangles = 0;
        state.setFrameloop('never');
        renderer.info.autoReset = false;
        try {
          // oxlint-disable-next-line no-await-in-loop -- serialize frames so completion covers this frame alone.
          for (let index = 0; index < 140; index++) {
            // Three advances its FRAME node cache on RAF; exclude pacing from the measured work.
            // oxlint-disable-next-line no-await-in-loop -- each sample must render a fresh scene pass.
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
            renderer.info.reset();
            if (options.orbit) {
              const position = offset.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), index * 0.005);
              position.add(new THREE.Vector3(...initialCamera.target));
              bridge.setCamera({
                position: [position.x, position.y, position.z],
                target: initialCamera.target,
                zoom: initialCamera.zoom,
              });
            }
            timer.begin();
            const startedAt = performance.now();
            state.advance(startedAt / 1000, false);
            const submittedAt = performance.now();
            timer.end();
            if (index === 0) {
              firstSubmission = submittedAt - startedAt;
            }
            if (device) {
              // oxlint-disable-next-line no-await-in-loop -- completion fence for the measured frame.
              await device.queue.onSubmittedWorkDone();
            } else if (renderer instanceof THREE.WebGLRenderer) {
              renderer.getContext().finish();
            }
            const completedAt = performance.now();
            // oxlint-disable-next-line no-await-in-loop -- resolve all passes from this frame before the next.
            const gpuDuration = await timer.resolve();
            if (index >= 20) {
              gpu.push(gpuDuration);
              submission.push(submittedAt - startedAt);
              completion.push(completedAt - startedAt);
            }
            drawCalls =
              'drawCalls' in renderer.info.render ? renderer.info.render.drawCalls : renderer.info.render.calls;
            triangles = renderer.info.render.triangles;
          }
        } finally {
          renderer.info.autoReset = previousAutoReset;
          timer.dispose();
          if (options.orbit) {
            bridge.setCamera({
              position: initialCamera.position,
              target: initialCamera.target,
              zoom: initialCamera.zoom,
            });
          }
          state.setFrameloop(previousFrameloop);
          state.invalidate();
        }
        return {
          submission,
          completion,
          gpu,
          gpuMethod: timer.method,
          firstSubmission,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          drawCalls,
          triangles,
          revision: THREE.REVISION,
          width: renderer.domElement.width,
          height: renderer.domElement.height,
          pixelRatio: renderer.getPixelRatio(),
        };
      },
      getViewportCanvas() {
        return get().gl.domElement;
      },
      isGeometryFramed() {
        const { size } = get();
        const cameraSnapshot = cameraRig.actorRef.getSnapshot();
        return (
          presentationRef.current.isGeometryFramed &&
          cameraFraming.initialized &&
          cameraConnectorRef.current !== undefined &&
          cameraSnapshot.status === 'active' &&
          cameraSnapshot.context.view.viewport.width === size.width &&
          cameraSnapshot.context.view.viewport.height === size.height
        );
      },
      async isViewRecordApplied() {
        const currentProject = projectRef?.getSnapshot();
        const viewId =
          currentProject && [...currentProject.context.viewGraphics].find(([, actor]) => actor === graphicsActor)?.[0];
        const cad = cadRef?.getSnapshot();
        const fileManagerRef = cad?.context.fileManagerRef;
        const files: SnapshotFrom<typeof fileManagerMachine> | undefined = fileManagerRef?.getSnapshot();
        const contentService: FileContentService | undefined = files?.matches('ready')
          ? files.context.contentService
          : undefined;
        const contentRoot = files?.context.rootDirectory;
        if (
          !viewId ||
          !cad ||
          !cadRef ||
          !projectRef ||
          !fileManagerRef ||
          !contentService ||
          typeof contentRoot !== 'string'
        ) {
          return false;
        }
        const { entryPath, fileSystemRoot } = cad.context;
        if (entryPath === undefined) {
          return false;
        }
        const path = workbenchPaths.view(viewId);
        const record = presentationRef.current.viewRecords?.get(viewId);
        const applied = presentationRef.current.appliedWorkbenchRevisions?.get(path);
        const selectedPath = normalizePath(`${fileSystemRoot}/${path}`);
        const prefix = normalizePath(contentRoot) === '/' ? '/' : `${normalizePath(contentRoot)}/`;
        if (!selectedPath.startsWith(prefix)) {
          return false;
        }
        const isCurrent = (): boolean => {
          const currentCad = cadRef.getSnapshot();
          const currentFiles = fileManagerRef.getSnapshot();
          const currentProject = projectRef.getSnapshot();
          return (
            live &&
            cameraFraming.initialized &&
            currentProject.status === 'active' &&
            currentProject.context.projectId === projectId &&
            graphicsActor.getSnapshot().status === 'active' &&
            currentCad.status === 'active' &&
            currentCad.context.entryPath === entryPath &&
            currentCad.context.fileSystemRoot === fileSystemRoot &&
            currentCad.context.fileManagerRef === fileManagerRef &&
            currentProject.context.viewGraphics.get(viewId) === graphicsActor &&
            currentProject.context.geometryUnits.get(entryPath) === cadRef &&
            currentFiles.status === 'active' &&
            currentFiles.matches('ready') &&
            currentFiles.context.contentService === contentService &&
            currentFiles.context.rootDirectory === contentRoot &&
            presentationRef.current.viewRecords?.get(viewId) === record &&
            presentationRef.current.appliedWorkbenchRevisions?.get(path) === applied
          );
        };
        if (!isCurrent()) {
          return false;
        }
        try {
          const bytes = await contentService.readRawBytes(assertRootedPath(selectedPath.slice(prefix.length)));
          const digest = await digestBytes(bytes);
          return isCurrent() && record?.entryPath === entryPath && applied === digest;
        } catch (error) {
          if (error instanceof FileNotFoundError) {
            return isCurrent() && record === undefined && applied === undefined;
          }
          throw error;
        }
      },
      setSectionCuts(cuts) {
        for (const { id } of graphicsActor.getSnapshot().context.sectionCuts) {
          graphicsActor.send({ type: 'removeSectionCut', payload: id });
        }
        const ids = cuts.flatMap((cut) => addSectionCut(cut) ?? []);
        graphicsActor.send({ type: 'selectSectionCut', payload: undefined });
        return ids;
      },
      addSectionCut,
      updateSectionCut(id, patch) {
        graphicsActor.send({ type: 'updateSectionCut', payload: { id, patch } });
      },
      removeSectionCut(id) {
        graphicsActor.send({ type: 'removeSectionCut', payload: id });
      },
      selectSectionCut(id) {
        graphicsActor.send({ type: 'selectSectionCut', payload: id });
      },
      setSectionViewActive(active) {
        graphicsActor.send({ type: 'setSectionViewActive', payload: active });
      },
      getSectionState() {
        const { context } = graphicsActor.getSnapshot();
        return {
          isActive: context.isSectionViewActive,
          cuts: context.sectionCuts,
          selectedCutId: context.selectedSectionCutId,
          hoveredCutId: context.hoveredSectionCutId,
          committedCuts: context.committedSectionCuts,
          committedPieces: resolveSectionPieces(context.committedSectionCuts),
          certification: context.sectionCertification,
          isCommitted: areSectionCutsEqual(context.committedSectionCuts, context.sectionCuts),
        };
      },
      projectSectionHandle(kind, cutId) {
        const { camera, gl } = get();
        return projectSectionViewTestHandle({
          target: { kind, cutId },
          camera,
          rect: gl.domElement.getBoundingClientRect(),
          scene,
        });
      },
      setPresentation(presentation) {
        graphicsActor.send({ type: 'setSurfaceVisibility', payload: presentation.surfaces });
        graphicsActor.send({ type: 'setLinesVisibility', payload: presentation.lines });
        // A repeated test gesture requests a fresh demand frame even when both values are unchanged.
        get().invalidate();
      },
      setPostProcessingEnabled(enabled) {
        graphicsActor.send({ type: 'setPostProcessingVisibility', payload: enabled });
      },
      setGridPresentationClipPolicy(policy) {
        const { upDirection } = graphicsActor.getSnapshot().context;
        cameraRig.setClipPlanes(
          policy.far || policy.near
            ? {
                farPaddingVerticalSpans: policy.far ? infiniteGridFadeEndVisibleSpans : 0,
                ...(policy.near ? { presentationPlane: infiniteGridPresentationPlaneByUpDirection[upDirection] } : {}),
              }
            : undefined,
        );
      },
      getModelComponents() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const unit = activeUnitId ? getModelInteractionUnitState(context, activeUnitId) : undefined;
        return (unit?.manifest?.nodeOrder ?? [])
          .filter((id) => id !== unit?.manifest?.rootId)
          .map((id) => ({
            id,
            name: unit?.manifest?.nodesById[id]?.name ?? id,
            kind: unit?.manifest?.nodesById[id]?.kind,
            primitiveReferenceCount: unit?.manifest?.nodesById[id]?.primitiveRefs?.length ?? 0,
          }));
      },
      getModelVisibility() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const unit = activeUnitId ? getModelInteractionUnitState(context, activeUnitId) : undefined;
        return {
          hiddenComponentIds: [...(unit?.hiddenComponentIds ?? [])],
          isolatedComponentIds: [...(unit?.isolatedComponentIds ?? [])],
        };
      },
      getRenderedModelComponentState(componentId) {
        return getRenderedModelComponentState(scene, componentId);
      },
      projectModelComponent(componentId) {
        const { camera, gl } = get();
        const rect = gl.domElement.getBoundingClientRect();
        const points: SectionViewTestProjectedPoint[] = [];
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        scene.traverse((object) => {
          if (
            !(object instanceof THREE.Mesh) ||
            object.type === 'LineSegments2' ||
            getModelComponentIdInHierarchy(object) !== componentId
          ) {
            return;
          }

          const geometry = object.geometry as THREE.BufferGeometry;
          const position = geometry.getAttribute('position');
          const { index } = geometry;
          const triangleCount = Math.floor((index?.count ?? position.count) / 3);
          const sampleStep = Math.max(1, Math.floor(triangleCount / 24));
          for (let triangle = 0; triangle < triangleCount && points.length < 24; triangle += sampleStep) {
            const vertices = [0, 1, 2].map((offset) =>
              new THREE.Vector3()
                .fromBufferAttribute(position, index?.getX(triangle * 3 + offset) ?? triangle * 3 + offset)
                .applyMatrix4(object.matrixWorld),
            );
            const projected = vertices[0]!
              .add(vertices[1]!)
              .add(vertices[2]!)
              .multiplyScalar(1 / 3)
              .project(camera);
            points.push(toProjectedPoint(projected, rect));
          }
        });
        return points;
      },
      hideModelComponent(componentId) {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({ type: 'hideModelComponent', unitId: activeUnitId, componentId, source: 'screenshot' });
        }
      },
      isolateModelComponent(componentId) {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({
            type: 'isolateModelComponent',
            unitId: activeUnitId,
            componentId,
            source: 'screenshot',
          });
        }
      },
      resetModelVisibility() {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({ type: 'showHiddenModelComponents', unitId: activeUnitId, source: 'screenshot' });
          graphicsActor.send({ type: 'clearModelComponentIsolation', unitId: activeUnitId, source: 'screenshot' });
        }
      },
      setCamera(nextCamera) {
        const currentView = cameraRig.actorRef.getSnapshot().context.view;
        const target = new THREE.Vector3(...(nextCamera.target ?? [0, 0, 0]));
        const position = new THREE.Vector3(...nextCamera.position);
        const offset = position.sub(target);
        const distance = offset.length();
        if (distance <= 0) {
          throw new RangeError('Section view test camera position must differ from its target.');
        }
        const direction = offset.normalize();
        const up = resolveCameraUp({
          direction,
          preferredUp: new THREE.Vector3(...currentView.up),
        }).applyAxisAngle(direction, nextCamera.rollRadians ?? 0);
        const requestedFov = nextCamera.fov ?? currentView.requestedVerticalFieldOfView;
        const verticalSpan =
          requestedFov > 0
            ? perspectiveVerticalSpan({
                distance,
                verticalFieldOfView: requestedFov,
                zoom: nextCamera.zoom ?? 1,
              })
            : currentView.verticalSpan / (nextCamera.zoom ?? 1);
        if (nextCamera.bounds !== undefined) {
          cameraRig.actorRef.send({ type: 'setBounds', bounds: nextCamera.bounds });
        }
        cameraRig.actorRef.send({
          type: 'setView',
          target: [target.x, target.y, target.z],
          direction: [direction.x, direction.y, direction.z],
          up: [up.x, up.y, up.z],
          verticalSpan,
          ...(requestedFov > 0 ? { perspectiveZoom: nextCamera.zoom ?? 1 } : {}),
        });
        if (nextCamera.fov !== undefined) {
          setFovAngle(nextCamera.fov);
        }
      },
      setFovAngle(angle) {
        setFovAngle(angle);
      },
      getCamera() {
        const { camera, controls } = get();
        const actorSnapshot = cameraRig.actorRef.getSnapshot();
        const cameraContext = actorSnapshot.context;
        const cameraView = cameraContext.view;
        const physicalCamera = cameraRig.readState();
        const controlState = getSectionViewTestControlState({ controls, interactionLock });
        const state: SectionViewTestCameraState = {
          bounds: cameraView.bounds,
          actorStatus: actorSnapshot.status,
          actorError:
            actorSnapshot.error instanceof Error
              ? `${actorSnapshot.error.name}: ${actorSnapshot.error.message}`
              : undefined,
          projection: camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
          requestedFov: cameraView.requestedVerticalFieldOfView,
          requestedPerspectiveZoom: cameraView.perspectiveZoom,
          handoffFov: cameraContext.handoffVerticalFieldOfView,
          verticalSpan: cameraView.verticalSpan,
          direction: [...cameraView.direction],
          up: [...cameraView.up],
          position: physicalCamera.position,
          quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
          target: physicalCamera.target,
          controlsDistance:
            getControlsDistance({ camera, controls: controls ?? undefined }) *
            cameraRig.renderFrame.metersPerRenderUnit,
          fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined,
          zoom:
            camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
              ? camera.zoom
              : undefined,
          aspect:
            camera instanceof THREE.PerspectiveCamera
              ? camera.aspect
              : camera instanceof THREE.OrthographicCamera
                ? (camera.right - camera.left) / (camera.top - camera.bottom)
                : 1,
          clipping: physicalCamera.clipping,
          nativeClipping: { near: camera.near, far: camera.far },
          ...controlState,
        };

        return state;
      },
      getCameraTransitionDiagnostics() {
        return cameraTransitionDiagnosticsRef.current;
      },
      resetCameraTransitionDiagnostics() {
        pendingCameraTransitionRef.current = undefined;
        cameraTransitionDiagnosticsRef.current = {
          requests: 0,
          frames: 0,
          actorSyncFailures: 0,
          averageRequestToActorSyncMilliseconds: 0,
          maximumRequestToActorSyncMilliseconds: 0,
          maximumRequestToFrameMilliseconds: 0,
          staleFrames: 0,
        };
      },
      getRenderFrame() {
        return cameraRig.renderFrame;
      },
      setRenderFrame(nextRenderFrame) {
        setRenderFrame(nextRenderFrame);
      },
      projectWorldPoint(point) {
        const { camera, gl } = get();
        const rect = gl.domElement.getBoundingClientRect();
        const projected = toThreeRenderPoint({ renderFrame: cameraRig.renderFrame, pointMeters: point }).project(
          camera,
        );

        return toProjectedPoint(projected, rect);
      },
      getModelHoverState() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const hoveredComponentId = activeUnitId
          ? getModelInteractionUnitState(context, activeUnitId).hoveredComponentId
          : undefined;

        const selectedComponentIds = activeUnitId
          ? getModelInteractionUnitState(context, activeUnitId).selectedComponentIds
          : [];
        const draw = captureCommittedGltfDrawInventory(scene);
        const subject = bridge.getCommittedAssembly();
        if (
          !draw ||
          draw.unitId !== activeUnitId ||
          draw.display !== subject.assemblyDisplay ||
          !draw.isCurrent() ||
          !subject.isCurrent()
        ) {
          return { activeUnitId, hoveredComponentId, selectedComponentIds };
        }
        const candidate = scene.getObjectByProperty('uuid', draw.candidateSceneId);
        if (!candidate) {
          return { activeUnitId, hoveredComponentId, selectedComponentIds };
        }
        const { raycaster: actualRaycaster, pointer, camera } = get();
        const surfaceMeshes: Array<NonNullable<SectionViewTestModelHoverState['rayParity']>['surfaceMeshes'][number]> =
          [];
        candidate.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) {
            return;
          }
          const bounds = object.geometry.boundingBox;
          surfaceMeshes.push({
            id: object.uuid,
            matrixWorld: [...object.matrixWorld.elements],
            visible: isActuallyVisible(object),
            layers: object.layers.mask,
            localBounds: bounds ? { min: bounds.min.toArray(), max: bounds.max.toArray() } : undefined,
            slots: getModelComponentInstanceSlots(object)?.map(({ owner }) => owner.componentId),
          });
        });
        const raycaster = new THREE.Raycaster();
        raycaster.ray.copy(actualRaycaster.ray);
        raycaster.near = actualRaycaster.near;
        raycaster.far = actualRaycaster.far;
        raycaster.layers.mask = actualRaycaster.layers.mask;
        const clipping = resolveSectionViewRaycastClip(graphicsActor.getSnapshot().context, cameraRig.renderFrame);
        const meshes = collectModelPickableSurfaceMeshes(candidate);
        const stockComponentId = getSectionViewTestStockComponentHit(raycaster, meshes, clipping);
        const unclippedStockComponentId = getSectionViewTestStockComponentHit(raycaster, meshes);
        const tauComponentId = resolveModelComponentHitFromRay({ raycaster, meshes, clipping });
        if (!draw.isCurrent() || !subject.isCurrent()) {
          return { activeUnitId, hoveredComponentId, selectedComponentIds };
        }
        return {
          activeUnitId,
          hoveredComponentId,
          selectedComponentIds,
          rayParity: {
            candidateSceneId: draw.candidateSceneId,
            pointer: [pointer.x, pointer.y] as const,
            ray: {
              origin: raycaster.ray.origin.toArray(),
              direction: raycaster.ray.direction.toArray(),
              near: raycaster.near,
              far: Number.isFinite(raycaster.far) ? raycaster.far : String(raycaster.far),
              layers: raycaster.layers.mask,
            },
            camera: bridge.getCamera(),
            cameraMatrixWorld: [...camera.matrixWorld.elements],
            cameraProjectionMatrix: [...camera.projectionMatrix.elements],
            candidateMatrixWorld: [...candidate.matrixWorld.elements],
            pickableMeshCount: meshes.length,
            rendererFrame: bridge.getRendererIdentity({ includeRendererName: false }).frame,
            presentationRevision: draw.presentationRevision,
            poseRevision: draw.poseRevision,
            surfaceMeshes,
            clippingEnabled: clipping?.enabled ?? false,
            stockComponentId,
            unclippedStockComponentId,
            tauComponentId,
          },
        };
      },
      setMeasureActive(active) {
        graphicsActor.send({ type: 'setMeasureActive', payload: active });
      },
      getMeasureState() {
        const { context } = graphicsActor.getSnapshot();
        return {
          isMeasureActive: context.isMeasureActive,
          cameraInteracting: context.cameraInteracting,
          measurementUiMeshCount: getSectionViewTestMeasurementUiMeshCount(scene),
          rendererGeometryCount: get().gl.info.memory.geometries,
          snapDistancePx: context.measureSnapDistance,
          candidates: context.measureCandidates,
          measureFilter: context.measureFilter,
          measureOperation: context.measureOperation,
          measureCatalogRequest: context.measureCatalogRequest,
          measureCatalogHasMore: context.measureCatalogHasMore,
          measureMessage: context.measureMessage,
          catalogObservation: readMeasurementCatalogObservation(scene),
          activeCandidateId: context.measureActiveCandidateId,
          lockedTargetId: context.measureLockedTargetId,
          mode: context.measureMode,
          currentStart: context.currentMeasurementStart,
          measurements: context.measurements.map(
            ({ id, distance, startPoint, endPoint, operation, quality, status, unavailableReason }) => ({
              id,
              distance,
              startPoint,
              endPoint,
              operation,
              quality,
              status,
              unavailableReason,
            }),
          ),
        };
      },
      getSectionHelperSummary() {
        return getSectionViewTestHelperSummary(scene);
      },
      getTaggedResourceInventory() {
        const draw = bridge.getCommittedDrawInventory();
        if (!draw) {
          return undefined;
        }
        return getSectionViewTestTaggedResourceInventory(scene, () => {
          const current = bridge.getCommittedDrawInventory();
          return (
            current !== undefined &&
            current.candidateSceneId === draw.candidateSceneId &&
            current.key === draw.key &&
            current.presentationRevision === draw.presentationRevision &&
            current.poseRevision === draw.poseRevision &&
            current.unitId === draw.unitId
          );
        });
      },
      getLiveAssemblyResourceInventory() {
        const subject = bridge.getCommittedAssembly();
        const draw = bridge.getCommittedDrawInventory();
        if (!subject.assemblyDisplay || !subject.isCurrent() || !draw) {
          return undefined;
        }
        const resources = captureLiveGltfAssemblyResourceInventory(scene);
        const current = bridge.getCommittedDrawInventory();
        return resources &&
          subject.isCurrent() &&
          current?.key === draw.key &&
          current.candidateSceneId === draw.candidateSceneId &&
          current.presentationRevision === draw.presentationRevision &&
          current.unitId === draw.unitId &&
          current.poseRevision === draw.poseRevision &&
          resources.key === draw.key &&
          resources.candidateSceneId === draw.candidateSceneId &&
          resources.presentationRevision === draw.presentationRevision &&
          resources.unitId === draw.unitId
          ? resources
          : undefined;
      },
      armAssemblyAdmissionResourceInventory() {
        bridge.clearAssemblyAdmissionResourceInventory();
        const subject = bridge.getCommittedAssembly();
        const draw = bridge.getCommittedDrawInventory();
        if (!live || !subject.assemblyDisplay || !subject.isCurrent() || !draw) {
          return false;
        }
        const held = {
          key: draw.key,
          sceneId: draw.candidateSceneId,
          revision: draw.presentationRevision,
          unitId: draw.unitId,
          poseRevision: draw.poseRevision,
        };
        if (held.key !== subject.assemblyDisplay.root.digest) {
          return false;
        }
        const armed = armGltfAssemblyAdmissionResourceInventory(scene, held.sceneId, (resources) => {
          armedAdmissionSceneId = undefined;
          const current = bridge.getCommittedDrawInventory();
          const owner = bridge.getCommittedAssembly();
          if (
            !live ||
            !owner.assemblyDisplay ||
            !owner.isCurrent() ||
            owner.assemblyDisplay.root.digest !== held.key ||
            current?.candidateSceneId !== held.sceneId ||
            current.presentationRevision !== held.revision ||
            current.unitId !== held.unitId ||
            current.poseRevision !== held.poseRevision ||
            resources.key !== held.key ||
            resources.candidateSceneId !== held.sceneId ||
            resources.presentationRevision !== held.revision ||
            resources.unitId !== held.unitId ||
            resources.candidate?.key !== held.key ||
            resources.candidate.unitId !== held.unitId
          ) {
            return;
          }
          admissionObservation = { held, resources };
        });
        armedAdmissionSceneId = armed ? held.sceneId : undefined;
        return armed;
      },
      takeAssemblyAdmissionResourceInventory() {
        const captured = admissionObservation;
        if (!captured) {
          return undefined;
        }
        const { candidate } = captured.resources;
        const current = bridge.getCommittedDrawInventory();
        if (!current || current.candidateSceneId === captured.held.sceneId) {
          return undefined;
        }
        admissionObservation = undefined;
        const subject = bridge.getCommittedAssembly();
        return live &&
          candidate &&
          subject.assemblyDisplay &&
          subject.isCurrent() &&
          subject.assemblyDisplay.root.digest === captured.held.key &&
          current.key === captured.held.key &&
          current.candidateSceneId === candidate.sceneId &&
          current.presentationRevision === candidate.revision &&
          current.unitId === captured.held.unitId &&
          current.poseRevision === captured.held.poseRevision
          ? captured
          : undefined;
      },
      clearAssemblyAdmissionResourceInventory() {
        if (armedAdmissionSceneId) {
          clearGltfAssemblyAdmissionResourceInventory(scene, armedAdmissionSceneId);
        }
        armedAdmissionSceneId = undefined;
        admissionObservation = undefined;
      },
      getRequestedAssemblyPreparation() {
        const cad = cadRef?.getSnapshot();
        const selected = cad && selectCadDisplay(cad);
        const display = selected && 'admitted' in selected ? selected : undefined;
        const key = display?.root.digest;
        const revision = graphicsActor.getSnapshot().context.gltfPresentation.requestedRevision;
        const entryPath = cad?.context.entryPath;
        const fileManagerRef = cad?.context.fileManagerRef;
        const files: SnapshotFrom<typeof fileManagerMachine> | undefined = fileManagerRef?.getSnapshot();
        const contentService: FileContentService | undefined = files?.matches('ready')
          ? files.context.contentService
          : undefined;
        const rootDirectory: unknown = files?.context.rootDirectory;
        if (
          !display ||
          !key ||
          !entryPath ||
          !fileManagerRef ||
          !cadRef ||
          !projectRef ||
          !contentService ||
          typeof rootDirectory !== 'string'
        ) {
          return undefined;
        }
        const contentServiceRoot = normalizePath(rootDirectory);
        const isRequestedCurrent = (): boolean => {
          const currentCad = cadRef.getSnapshot();
          const currentProject = projectRef.getSnapshot();
          const projectContext: ProjectContext = currentProject.context;
          const currentFiles = fileManagerRef.getSnapshot();
          const currentRootDirectory: unknown = currentFiles.context.rootDirectory;
          const currentGraphics = graphicsActor.getSnapshot();
          return (
            live &&
            currentCad.status === 'active' &&
            currentProject.status === 'active' &&
            currentProject.matches('ready') &&
            currentFiles.status === 'active' &&
            currentFiles.matches('ready') &&
            currentFiles.context.contentService === contentService &&
            typeof currentRootDirectory === 'string' &&
            normalizePath(currentRootDirectory) === contentServiceRoot &&
            currentGraphics.status === 'active' &&
            projectContext.projectId === projectId &&
            projectContext.geometryUnits.get(entryPath) === cadRef &&
            [...projectContext.viewGraphics.values()].includes(graphicsActor) &&
            currentCad.context.fileManagerRef === fileManagerRef &&
            projectContext.fileManagerRef === fileManagerRef &&
            currentCad.context.fileSystemRoot === projectContext.fileSystemRoot &&
            currentCad.context.entryPath === entryPath &&
            currentCad.context.latestRenderingOutcome === 'success' &&
            currentCad.context.lastRequestedRenderId === currentCad.context.lastSettledRenderId &&
            selectCadDisplay(currentCad) === display &&
            currentGraphics.context.gltfPresentation.requestedKey === key &&
            currentGraphics.context.gltfPresentation.requestedRevision === revision
          );
        };
        if (!isRequestedCurrent()) {
          return undefined;
        }
        const progress = captureRequestedGltfAssemblyPreparation(scene, { display, key, revision });
        return isRequestedCurrent() ? progress : undefined;
      },
      getSectionCapCompleteness() {
        let completeness: SectionViewTestCapCompleteness | undefined;
        scene.traverse((child) => {
          completeness =
            (child.userData['sectionCapCompleteness'] as SectionViewTestCapCompleteness | undefined) ?? completeness;
        });
        return completeness;
      },
      getSectionCapOverlapDiagnostics() {
        return getSectionViewTestCapOverlapDiagnostics(scene);
      },
      getSectionCapPerformanceDiagnostics() {
        return getSectionViewTestCapPerformanceDiagnostics(scene);
      },
    };

    const bridges = bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
    bridges.push(bridge);
    bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__ = bridges;
    bridgeGlobal.__TAU_SECTION_VIEW_TEST__ = bridge;

    return () => {
      live = false;
      bridge.clearAssemblyAdmissionResourceInventory();
      backendObservationAbort?.abort(new Error('Backend observation viewport was torn down.'));
      const index = bridges.indexOf(bridge);
      if (index !== -1) {
        bridges.splice(index, 1);
      }
      if (bridgeGlobal.__TAU_SECTION_VIEW_TEST__ === bridge) {
        bridgeGlobal.__TAU_SECTION_VIEW_TEST__ = bridges.at(-1);
      }
      if (bridges.length === 0) {
        delete bridgeGlobal.__TAU_SECTION_VIEW_TEST__;
        delete bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__;
      }
    };
  }, [
    cadRef,
    cameraConnectorRef,
    cameraFraming,
    cameraRig,
    get,
    graphicsActor,
    interactionLock,
    isTauDebugEnabled,
    modelInteractionRef,
    projectId,
    projectRef,
    setRenderFrame,
  ]);

  return undefined;
}
