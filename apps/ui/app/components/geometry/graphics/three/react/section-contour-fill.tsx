import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { toast } from '#components/ui/sonner.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import {
  mixModelEmphasisTint,
  resolveModelMaterialBaseTintHex,
  resolveModelComponentEmphasis,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import type { ModelComponentEmphasis } from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import {
  resolveSectionFaces,
  sectionHalfSpaceKey,
  sectionPiecesKey,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionFace, SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import {
  createVertexColoredSectionCapMaterial,
  markVertexColoredSectionCapMaterialInUse,
} from '#components/geometry/graphics/three/materials/striped-material-vertex-colored.js';
import type { ClosedContour, OpenPolyline } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { buildSectionCapBoundaryPositions } from '#components/geometry/graphics/three/utils/section-cap-boundary.js';
import { buildCurrentSectionBaseCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-current-base.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { ModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  boundsForCapMultiPolygon,
  buildSectionCapPolygon,
  buildSectionFaceEvidencePositions,
  createSectionCutPlaneBasis,
  measureCapMultiPolygonArea,
  sectionFaceWorldPlane,
  trimSectionCapPolygon,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  SectionCapPolygon,
  SectionCutPlaneBasis,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import { defaultSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import { createSectionCapPackedGeometryArena } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import type {
  PackedSectionCapGeometryBuffers,
  SectionCapPackedGeometryArena,
} from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import { applySectionCapStyleToPackedBuffers } from '#components/geometry/graphics/three/utils/section-cap-style.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import {
  addSectionCapFaceTiming,
  addSectionCapTiming,
  appendSectionCapPerformanceFrame,
  createSectionCapFramePerformance,
  getSectionCapFacePerformance,
  recordSectionCapPackedGeometry,
  sectionCapPerformanceDebugUserDataKey,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type {
  SectionCapFramePerformance,
  SectionCapPackingDebugSink,
  SectionCapPerformanceTimingPhase,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import {
  canUseSectionCapOverlapWorker,
  createSectionCapOverlapWorkerClient,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type { SectionCapOverlapWorkerClient } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import {
  encodeSectionCapWorkerRequest,
  getSectionCapWorkerSourceGeometry,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import type {
  PlainSectionCutPlaneBasis,
  SectionCapWorkerFaceInput,
  SectionCapWorkerInputSource,
  SectionCapWorkerSuccessResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { createGltfFatLineSegmentsFromPositions } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  createSectionContourOutlineMaterial,
  resolveSectionContourOutlineEmphasis,
  setSectionContourOutlineMaterialColor,
} from '#components/geometry/graphics/three/materials/section-contour-outline-material.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useGraphicsSelector, useModelInteractionRef, useModelInteractionSelector } from '#hooks/use-graphics.js';
import { useFeature } from '#flags/use-feature.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionContext, ModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  collectSectionSurfaceSources,
  getSectionSourceWorldMatrix,
  sliceSectionSurfaceSource,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import {
  commitSectionViewSafeSnapshot,
  getSectionViewSafeSnapshotDebugState,
  rejectSectionViewSafeSnapshot,
  resetSectionViewSafeSnapshot,
  sectionViewSafeSnapshotDebugUserDataKey,
} from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type {
  SectionCutSet,
  SectionViewSafeSnapshotStore,
} from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type {
  SectionSurfaceSource,
  SectionTopologyFailure,
  VisibleSectionSurfaceSource,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';

const _inverseMeshWorld = /* @__PURE__ */ new THREE.Matrix4();
const _parentInverse = /* @__PURE__ */ new THREE.Matrix4();
const _sourceWorld = /* @__PURE__ */ new THREE.Matrix4();

export type SectionSourceRecord = Readonly<{
  key: string;
  source: SectionSurfaceSource;
  visibleSource: VisibleSectionSurfaceSource;
  mesh: THREE.Mesh;
  material: THREE.Material;
  owner: ModelComponentOwner | undefined;
  baseTintHex: number;
}>;

export type SectionHelperRecord = {
  fillMesh: THREE.Mesh;
  borderSegments: ReturnType<typeof createGltfFatLineSegmentsFromPositions>;
  borderBackend: ResolvedGraphicsBackend | undefined;
  geometryKey: string | undefined;
  materialKey: string | undefined;
  // Backend + stripe params of the currently-bound fill material, so it can be
  // unpinned from the shared cache's in-use set on rebind / teardown.
  fillMaterialInUse: { backend: ResolvedGraphicsBackend; stripeFrequency: number; stripeWidth: number } | undefined;
  capBuild: SectionSourceCapBuild | undefined;
  packedGeometryArena: SectionCapPackedGeometryArena;
};

type SectionSourceCapBuild = Readonly<{
  closedContours: readonly ClosedContour[];
  openPolylines: readonly OpenPolyline[];
  trueCut: boolean;
  trueCutComponentCount: number;
  cappedTrueCutComponentCount: number;
  unresolvedTrueCutEdgeCount: number;
  topologyPath: 'extension' | 'fallback';
  baseTintHex: number;
  meshWorldMatrix: THREE.Matrix4;
  meshWorldInverse: THREE.Matrix4;
}>;

/** One source on one cut face this frame, drawn by its own helper. */
type SectionFrameSource = Readonly<{
  record: SectionSourceRecord;
  helper: SectionHelperRecord;
  /** `${faceKey}|${sourceKey}`. */
  helperKey: string;
  geometryKey: string;
  capBuild: SectionSourceCapBuild;
}>;

/** A source's cap on its face, trimmed to what the face shows. */
type SectionCappedSource = SectionFrameSource & Readonly<{ capPolygon: SectionCapPolygon }>;

type SectionFrameFace<Source> = Readonly<{ face: SectionFace; faceKey: string; sources: readonly Source[] }>;

type SectionCapStyleSource = Readonly<{
  sourceKey: string;
  tintHex: number;
}>;

/**
 * The cap outline materials in play this frame, one per colour the caps ask for: the theme edge
 * colour plus, while something is emphasised, the emphasis yellow.
 */
type SectionBorderMaterialState = {
  keyPrefix: string;
  byEdgeColor: Map<number, GltfFatLineMaterial>;
};

/** R8b: reused index/position/planeUv buffers with geometric grow + `setDrawRange`. */
function writePooledFillIndexedGeometry(fillMesh: THREE.Mesh, buffers: PackedSectionCapGeometryBuffers): void {
  const { positions, planeUv, baseColors, stripeColors, patternStrengths, stripeAxes, indices } = buffers;

  const geometry = fillMesh.geometry instanceof THREE.BufferGeometry ? fillMesh.geometry : new THREE.BufferGeometry();
  if (fillMesh.geometry !== geometry) {
    fillMesh.geometry = geometry;
  }

  const vertexCount = positions.length / 3;
  const indexCount = indices.length;

  let positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!positionAttribute || positionAttribute.count < vertexCount) {
    const newCapacity = positionAttribute
      ? Math.max(positionAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 3);
    positionAttribute = new THREE.BufferAttribute(array, 3);
    geometry.setAttribute('position', positionAttribute);
  }

  (positionAttribute.array as Float32Array).set(positions.subarray(0, positions.length), 0);
  positionAttribute.needsUpdate = true;

  let planeAttribute = geometry.getAttribute('aPlaneUv') as THREE.BufferAttribute | undefined;
  if (!planeAttribute || planeAttribute.count < vertexCount) {
    const newCapacity = planeAttribute ? Math.max(planeAttribute.count * 2, vertexCount) : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 2);
    planeAttribute = new THREE.BufferAttribute(array, 2);
    geometry.setAttribute('aPlaneUv', planeAttribute);
  }

  (planeAttribute.array as Float32Array).set(planeUv.subarray(0, planeUv.length), 0);
  planeAttribute.needsUpdate = true;

  let baseColorAttribute = geometry.getAttribute('aCapBaseColor') as THREE.BufferAttribute | undefined;
  if (!baseColorAttribute || baseColorAttribute.count < vertexCount) {
    const newCapacity = baseColorAttribute
      ? Math.max(baseColorAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 3);
    baseColorAttribute = new THREE.BufferAttribute(array, 3);
    geometry.setAttribute('aCapBaseColor', baseColorAttribute);
  }

  (baseColorAttribute.array as Float32Array).set(baseColors.subarray(0, baseColors.length), 0);
  baseColorAttribute.needsUpdate = true;

  let stripeColorAttribute = geometry.getAttribute('aCapStripeColor') as THREE.BufferAttribute | undefined;
  if (!stripeColorAttribute || stripeColorAttribute.count < vertexCount) {
    const newCapacity = stripeColorAttribute
      ? Math.max(stripeColorAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 3);
    stripeColorAttribute = new THREE.BufferAttribute(array, 3);
    geometry.setAttribute('aCapStripeColor', stripeColorAttribute);
  }

  (stripeColorAttribute.array as Float32Array).set(stripeColors.subarray(0, stripeColors.length), 0);
  stripeColorAttribute.needsUpdate = true;

  let patternStrengthAttribute = geometry.getAttribute('aCapPatternStrength') as THREE.BufferAttribute | undefined;
  if (!patternStrengthAttribute || patternStrengthAttribute.count < vertexCount) {
    const newCapacity = patternStrengthAttribute
      ? Math.max(patternStrengthAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity);
    patternStrengthAttribute = new THREE.BufferAttribute(array, 1);
    geometry.setAttribute('aCapPatternStrength', patternStrengthAttribute);
  }

  (patternStrengthAttribute.array as Float32Array).set(patternStrengths.subarray(0, patternStrengths.length), 0);
  patternStrengthAttribute.needsUpdate = true;

  let stripeAxisAttribute = geometry.getAttribute('aCapStripeAxis') as THREE.BufferAttribute | undefined;
  if (!stripeAxisAttribute || stripeAxisAttribute.count < vertexCount) {
    const newCapacity = stripeAxisAttribute
      ? Math.max(stripeAxisAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 2);
    stripeAxisAttribute = new THREE.BufferAttribute(array, 2);
    geometry.setAttribute('aCapStripeAxis', stripeAxisAttribute);
  }

  (stripeAxisAttribute.array as Float32Array).set(stripeAxes.subarray(0, stripeAxes.length), 0);
  stripeAxisAttribute.needsUpdate = true;

  let indexAttribute = geometry.getIndex() ?? undefined;
  if (!indexAttribute || indexAttribute.count < indexCount) {
    const newCapacity = indexAttribute ? Math.max(indexAttribute.count * 2, indexCount) : Math.max(128, indexCount);
    const array = new Uint32Array(newCapacity);
    indexAttribute = new THREE.BufferAttribute(array, 1);
    geometry.setIndex(indexAttribute);
  }

  (indexAttribute.array as Uint32Array).set(indices.subarray(0, indexCount), 0);
  indexAttribute.needsUpdate = true;

  geometry.setDrawRange(0, indexCount);
}

function fillGeometryBufferByteLength(buffers: PackedSectionCapGeometryBuffers): number {
  return (
    buffers.positions.byteLength +
    buffers.planeUv.byteLength +
    buffers.baseColors.byteLength +
    buffers.stripeColors.byteLength +
    buffers.patternStrengths.byteLength +
    buffers.stripeAxes.byteLength +
    buffers.regionKinds.byteLength +
    buffers.indices.byteLength
  );
}

function startSectionCapPhase(frame: SectionCapFramePerformance | undefined): number {
  return frame ? performance.now() : 0;
}

function endSectionCapPhase(
  frame: SectionCapFramePerformance | undefined,
  phase: SectionCapPerformanceTimingPhase,
  startedAt: number,
): void {
  if (!frame) {
    return;
  }

  addSectionCapTiming(frame, phase, performance.now() - startedAt);
}

/** Ends a phase of one face's work, counted for the frame and for the face. */
function endSectionCapFacePhase(
  frame: SectionCapFramePerformance | undefined,
  {
    faceKey,
    phase,
    startedAt,
  }: Readonly<{ faceKey: string; phase: SectionCapPerformanceTimingPhase; startedAt: number }>,
): void {
  if (!frame) {
    return;
  }

  addSectionCapFaceTiming(frame, { faceKey, phase, elapsed: performance.now() - startedAt });
}

function finishSectionCapPerformanceFrame(
  root: THREE.Group,
  frame: SectionCapFramePerformance | undefined,
  startedAt: number,
): void {
  endSectionCapPhase(frame, 'frameTotal', startedAt);
  root.userData[sectionCapPerformanceDebugUserDataKey] = frame
    ? appendSectionCapPerformanceFrame(
        root.userData[sectionCapPerformanceDebugUserDataKey] as
          | ReturnType<typeof appendSectionCapPerformanceFrame>
          | undefined,
        frame,
      )
    : undefined;
}

function countCapRings(multiPolygon: CapMultiPolygon): number {
  return multiPolygon.reduce((sum, polygon) => sum + polygon.length, 0);
}

function countCapPoints(multiPolygon: CapMultiPolygon): number {
  return multiPolygon.reduce((sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0), 0);
}

function countOpenPolylineSegments(openPolylines: readonly OpenPolyline[]): number {
  return openPolylines.reduce((sum, polyline) => sum + Math.max(0, polyline.length - 1), 0);
}

function createPackingDebugSink(frame: SectionCapFramePerformance | undefined): SectionCapPackingDebugSink | undefined {
  if (!frame) {
    return undefined;
  }

  return {
    recordPackedGeometry(stats) {
      recordSectionCapPackedGeometry(frame, stats);
    },
  };
}

const plainVector3 = (vector: THREE.Vector3): readonly [number, number, number] => [vector.x, vector.y, vector.z];

const plainBasisFromSectionCutPlaneBasis = (basis: SectionCutPlaneBasis): PlainSectionCutPlaneBasis => ({
  origin: plainVector3(basis.origin),
  normal: plainVector3(basis.normal),
  u: plainVector3(basis.u),
  v: plainVector3(basis.v),
  planeKey: basis.planeKey,
  normalizationOffset: [basis.normalizationOffset.x, basis.normalizationOffset.y],
  normalizationScale: basis.normalizationScale,
});

export const buildSectionCapTopologySourceSetKey = (sources: readonly SectionCapWorkerInputSource[]): string =>
  sources
    .map((source) =>
      [
        source.sourceKey,
        source.ownerKey,
        source.geometryKey,
        source.trueCut ? 'cut' : 'not-cut',
        source.area.toFixed(8),
        source.bbox.minX.toFixed(8),
        source.bbox.minY.toFixed(8),
        source.bbox.maxX.toFixed(8),
        source.bbox.maxY.toFixed(8),
        countCapRings(source.sourcePolygon),
        countCapPoints(source.sourcePolygon),
      ].join(':'),
    )
    .join('|');

export const buildSectionCapStyleKey = (
  sources: readonly SectionCapStyleSource[],
  options: {
    stripeFrequency: number;
    stripeWidth: number;
  },
): string =>
  [
    options.stripeFrequency,
    options.stripeWidth,
    ...sources.map((source) => `${source.sourceKey}:${source.tintHex}`),
  ].join('|');

const createPendingOverlapDebugSummary = (sourceCount: number): SectionCapOverlapDebugSummary => ({
  sourceCount,
  sourcePairCount: 0,
  broadphaseCandidatePairCount: 0,
  exactIntersectionPairCount: 0,
  positiveAreaPairCount: 0,
  renderedOverlapArea: 0,
  splitFailed: false,
  diagnostics: [
    {
      code: 'section-cap-overlap-pending',
      message: 'Exact section-cap overlap diagnostics are pending for the current topology.',
    },
  ],
});

const applyWorkerPerformanceToFrame = (
  frame: SectionCapFramePerformance | undefined,
  response: SectionCapWorkerSuccessResponse,
): void => {
  if (!frame) {
    return;
  }

  frame.counters.sourcePairCount = response.overlapCounters.sourcePairCount;
  frame.counters.classifiableSourceCount = response.overlapCounters.classifiableSourceCount;
  frame.counters.trueCutPrunedRegionCount = response.overlapCounters.trueCutPrunedRegionCount;
  frame.counters.xPrunedPairCount = response.overlapCounters.xPrunedPairCount;
  frame.counters.ownerPrunedPairCount = response.overlapCounters.ownerPrunedPairCount;
  frame.counters.yPrunedPairCount = response.overlapCounters.yPrunedPairCount;
  frame.counters.candidatePointCount = response.overlapCounters.candidatePointCount;
  frame.counters.broadphaseCandidatePairCount = response.overlapCounters.broadphaseCandidatePairCount;
  frame.counters.exactIntersectionPairCount = response.overlapCounters.exactIntersectionPairCount;
  frame.counters.positiveAreaPairCount = response.overlapCounters.positiveAreaPairCount;
  frame.counters.diagnosticsCount = response.overlapDebug.diagnostics.length;
  frame.booleanBackend = response.booleanBackend;
  for (const operation of ['intersection', 'union', 'difference'] as const) {
    frame.booleanOperations[operation].count += response.booleanOperations[operation].count;
    frame.booleanOperations[operation].total += response.booleanOperations[operation].total;
  }
  frame.packing.partCount += response.packing.partCount;
  frame.packing.triangulatedPolygonCount += response.packing.triangulatedPolygonCount;
  frame.packing.packedVertexCount += response.packing.packedVertexCount;
  frame.packing.packedIndexCount += response.packing.packedIndexCount;
  frame.packing.packedByteCount += response.packing.packedByteCount;
  addSectionCapTiming(frame, 'overlapClassify', response.timings.overlapClassify);
  addSectionCapTiming(frame, 'renderPartSplit', response.timings.renderPartSplit);
  addSectionCapTiming(frame, 'geometryPack', response.timings.geometryPack);
  addSectionCapTiming(frame, 'workerRoundTrip', response.timings.total);
};

/** What the caps committed: the cut list the clip, the caps and raycasts show, and whether the live list certified. */
export type SectionCertification = Readonly<{ status: 'exact' | 'rejected'; cuts: readonly SectionCut[] }>;

export type SectionContourFillsProperties = Readonly<{
  /** The live cut list and its pieces in the render frame, committed once every face of it certifies. */
  cutSet: SectionCutSet;
  enabled: boolean;
  stripeFrequency: number;
  stripeWidth: number;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
  /** Called from the frame in which the committed cut list or its certification changes. */
  onCertify: (certification: SectionCertification) => void;
}>;

const noCuts: readonly SectionCut[] = [];

/** Every face of the pieces, keyed by its cut and its place among the cut's faces, so the key survives a drag. */
const resolveSectionFaceEntries = (
  pieces: readonly SectionPiece[],
): Array<Readonly<{ face: SectionFace; faceKey: string }>> => {
  const faceCountByCutId = new Map<string, number>();
  return resolveSectionFaces(pieces).map((face) => {
    const index = faceCountByCutId.get(face.cutId) ?? 0;
    faceCountByCutId.set(face.cutId, index + 1);
    return { face, faceKey: `${face.cutId}:${index}` };
  });
};

function extractTintHex(material: THREE.Material): number {
  return resolveModelMaterialBaseTintHex(material);
}

export function collectSectionSourceRecords(root: THREE.Group): SectionSourceRecord[] {
  return collectSectionSurfaceSources(root).map((visibleSource) => {
    const { source } = visibleSource;
    const { mesh } = source.participants[0]!;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    return {
      key: source.key,
      source,
      visibleSource,
      mesh,
      material,
      owner: source.owner,
      baseTintHex: extractTintHex(material),
    };
  });
}

function numericKey(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : String(value);
}

function matrixKey(matrix: THREE.Matrix4): string {
  return matrix.elements.map(numericKey).join(',');
}

/** What a source's slice through a face is drawn from: the source as placed, and the face's plane. */
export function buildSectionFillGeometryKey(record: SectionSourceRecord, face: SectionFace): string {
  return [
    record.key,
    record.source.revision,
    // The source's own placement, so a posed part is recut where it now is.
    matrixKey(getSectionSourceWorldMatrix(record.source, _sourceWorld)),
    sectionHalfSpaceKey(face.plane),
    record.visibleSource.visibility,
  ].join('|');
}

/** The emphasis of the component a cut face belongs to, or `none` when it has no owner. */
export function resolveSectionSourceEmphasis(
  record: SectionSourceRecord,
  modelInteractionContext: ModelInteractionContext,
): ModelComponentEmphasis {
  return record.owner
    ? resolveModelComponentEmphasis(
        getModelInteractionUnitState(modelInteractionContext, record.owner.unitId),
        record.owner.componentId,
      )
    : 'none';
}

export function resolveSectionSourceTint(
  record: SectionSourceRecord,
  modelInteractionContext: ModelInteractionContext,
  baseTintHex = record.baseTintHex,
): number {
  return mixModelEmphasisTint(baseTintHex, resolveSectionSourceEmphasis(record, modelInteractionContext));
}

type MaterialKeyOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  stripeFrequency: number;
  stripeWidth: number;
}>;

function materialKey(options: MaterialKeyOptions): string {
  const { backend, stripeFrequency, stripeWidth } = options;
  return [backend, stripeFrequency, stripeWidth].join(':');
}

export function ownerKeyForRecord(record: SectionSourceRecord): string {
  if (!record.owner) {
    return record.key;
  }

  return `${record.owner.unitId}:${record.owner.componentId}`;
}

function createHelperRecord(root: THREE.Group): SectionHelperRecord {
  const fillMesh = new THREE.Mesh();
  fillMesh.frustumCulled = false;
  fillMesh.visible = false;
  fillMesh.matrixAutoUpdate = false;
  fillMesh.renderOrder = viewportRenderTiers.sectionCapFill;
  fillMesh.userData = { ...sceneTagData(sceneTag.sectionViewHelper) };

  root.add(fillMesh);

  return {
    fillMesh,
    borderSegments: undefined,
    borderBackend: undefined,
    geometryKey: undefined,
    materialKey: undefined,
    fillMaterialInUse: undefined,
    capBuild: undefined,
    packedGeometryArena: createSectionCapPackedGeometryArena(),
  };
}

function disposeBorderSegments(root: THREE.Group, helper: SectionHelperRecord): void {
  const { borderSegments } = helper;
  if (!borderSegments) {
    return;
  }

  root.remove(borderSegments);
  const { geometry } = borderSegments as { geometry?: THREE.BufferGeometry };
  geometry?.dispose();
  helper.borderSegments = undefined;
  helper.borderBackend = undefined;
}

function disposeHelperRecord(root: THREE.Group, helper: SectionHelperRecord): void {
  root.remove(helper.fillMesh);
  disposeBorderSegments(root, helper);
  helper.fillMesh.geometry.dispose();
  if (helper.fillMaterialInUse) {
    markVertexColoredSectionCapMaterialInUse(helper.fillMaterialInUse.backend, helper.fillMaterialInUse, false);
    helper.fillMaterialInUse = undefined;
  }
}

function updateHelperMatrix(helper: SectionHelperRecord, worldMatrix: THREE.Matrix4): void {
  const parentObject = helper.fillMesh.parent;
  if (parentObject) {
    _parentInverse.copy(parentObject.matrixWorld).invert();
    helper.fillMesh.matrix.multiplyMatrices(_parentInverse, worldMatrix);
    helper.borderSegments?.matrix.copy(helper.fillMesh.matrix);
  } else {
    helper.fillMesh.matrix.copy(worldMatrix);
    helper.borderSegments?.matrix.copy(worldMatrix);
  }

  helper.fillMesh.updateMatrixWorld(true);
  helper.borderSegments?.updateMatrixWorld(true);
}

function updateFillMaterial(
  helper: SectionHelperRecord,
  parameters: {
    backend: ResolvedGraphicsBackend;
    stripeFrequency: number;
    stripeWidth: number;
  },
): void {
  const nextMaterialKey = materialKey(parameters);
  if (helper.materialKey !== nextMaterialKey) {
    if (helper.materialKey === undefined) {
      const previousMaterial = helper.fillMesh.material;
      if (Array.isArray(previousMaterial)) {
        for (const material of previousMaterial) {
          material.dispose();
        }
      } else {
        previousMaterial.dispose();
      }
    }

    const nextInUse = {
      backend: parameters.backend,
      stripeFrequency: parameters.stripeFrequency,
      stripeWidth: parameters.stripeWidth,
    };
    helper.fillMesh.material = createVertexColoredSectionCapMaterial(nextInUse.backend, {
      stripeFrequency: nextInUse.stripeFrequency,
      stripeWidth: nextInUse.stripeWidth,
    });
    // Pin the new material and release the previous one so cache eviction
    // never disposes a material still bound to this mesh.
    markVertexColoredSectionCapMaterialInUse(nextInUse.backend, nextInUse, true);
    if (helper.fillMaterialInUse) {
      markVertexColoredSectionCapMaterialInUse(helper.fillMaterialInUse.backend, helper.fillMaterialInUse, false);
    }
    helper.fillMaterialInUse = nextInUse;
    helper.materialKey = nextMaterialKey;
  }
}

function resolveBorderMaterial(
  stateRef: React.RefObject<SectionBorderMaterialState | undefined>,
  parameters: {
    backend: ResolvedGraphicsBackend;
    edgeColor: number;
    resolution: THREE.Vector2;
  },
): GltfFatLineMaterial {
  const { backend, edgeColor, resolution } = parameters;
  const keyPrefix = [backend, resolution.x, resolution.y].join(':');
  if (stateRef.current?.keyPrefix !== keyPrefix) {
    for (const material of stateRef.current?.byEdgeColor.values() ?? []) {
      material.dispose();
    }
    stateRef.current = { keyPrefix, byEdgeColor: new Map() };
  }

  const existing = stateRef.current.byEdgeColor.get(edgeColor);
  if (existing) {
    setSectionContourOutlineMaterialColor(existing, edgeColor);
    return existing;
  }

  const material = createSectionContourOutlineMaterial({ backend, edgeColor, resolution });
  stateRef.current.byEdgeColor.set(edgeColor, material);
  return material;
}

function assignBorderMaterial(helper: SectionHelperRecord, material: GltfFatLineMaterial, renderOrder: number): void {
  if (!helper.borderSegments) {
    return;
  }

  (helper.borderSegments as unknown as { material: GltfFatLineMaterial }).material = material;
  helper.borderSegments.renderOrder = renderOrder;
}

export function writeBorderSegments(
  root: THREE.Group,
  helper: SectionHelperRecord,
  parameters: {
    backend: ResolvedGraphicsBackend;
    material: GltfFatLineMaterial;
    renderOrder: number;
    positions: Float32Array;
  },
): void {
  if (parameters.positions.length === 0) {
    disposeBorderSegments(root, helper);
    return;
  }

  const segmentCount = parameters.positions.length / 6;
  const existingSegments = helper.borderSegments;
  const instanceStart = existingSegments?.geometry.getAttribute('instanceStart');
  // WebGL caps an instanced geometry's draws at the size of its instance buffer when it is first
  // drawn (`_maxInstanceCount`, cleared only on dispose), so an outline is written into its buffer
  // while it fits, and a larger one gets a new geometry rather than a larger buffer.
  if (
    existingSegments &&
    helper.borderBackend === parameters.backend &&
    instanceStart instanceof THREE.InterleavedBufferAttribute &&
    segmentCount <= instanceStart.data.count
  ) {
    instanceStart.data.array.set(parameters.positions);
    instanceStart.data.addUpdateRange(0, parameters.positions.length);
    instanceStart.data.needsUpdate = true;
    // ponytail: the bounds stay those of the outline the geometry was created with. The outline is
    // never culled or picked, so they only order its opaque draws.
    existingSegments.geometry.instanceCount = segmentCount;
    assignBorderMaterial(helper, parameters.material, parameters.renderOrder);
    return;
  }

  disposeBorderSegments(root, helper);

  const borderSegments = createGltfFatLineSegmentsFromPositions({
    backend: parameters.backend,
    material: parameters.material,
    positions: parameters.positions,
  });
  if (!borderSegments) {
    return;
  }

  borderSegments.frustumCulled = false;
  borderSegments.matrixAutoUpdate = false;
  borderSegments.renderOrder = parameters.renderOrder;
  borderSegments.userData = { ...sceneTagData(sceneTag.sectionViewHelper) };
  root.add(borderSegments);
  helper.borderSegments = borderSegments;
  helper.borderBackend = parameters.backend;
}

export function SectionContourFills({
  cutSet,
  enabled,
  innerRef,
  stripeFrequency,
  stripeWidth,
  snapshotRef,
  onCertify,
}: SectionContourFillsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  const { theme } = useTheme();
  const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
  const isTauDebugEnabled = useFeature('tauDebug');
  const modelInteractionRef = useModelInteractionRef();
  const modelInteractionUnitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const modelInteractionUnitState = useModelInteractionSelector((state) =>
    modelInteractionUnitId ? getModelInteractionUnitState(state.context, modelInteractionUnitId) : undefined,
  );
  const { invalidate, size } = useThree();
  const resolution = React.useMemo(() => new THREE.Vector2(size.width, size.height), [size.height, size.width]);
  const invalidatedRenderStateRef = React.useRef<
    readonly [SectionCutSet, number, ModelInteractionUnitState | undefined, number, number] | undefined
  >(undefined);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  const rootRef = React.useRef<THREE.Group | null>(null);
  // One helper per source on each cut face, keyed `${faceKey}|${sourceKey}`.
  const helperByKey = React.useRef(new Map<string, SectionHelperRecord>());
  const borderMaterialRef = React.useRef<SectionBorderMaterialState | undefined>(undefined);
  const performanceFrameSequenceRef = React.useRef(0);
  const workerClientRef = React.useRef<SectionCapOverlapWorkerClient | undefined>(undefined);
  const workerSequenceRef = React.useRef(0);
  const latestWorkerRequestKeyRef = React.useRef<string | undefined>(undefined);
  const submittedWorkerRequestKeyRef = React.useRef<string | undefined>(undefined);
  const currentWorkerResponseRef = React.useRef<SectionCapWorkerSuccessResponse | undefined>(undefined);
  const lastAppliedTopologyKeyRef = React.useRef<string | undefined>(undefined);
  const lastAppliedStyleKeyRef = React.useRef<string | undefined>(undefined);
  const staleWorkerResponseCountRef = React.useRef(0);
  const topologyStaleWorkerResponseCountRef = React.useRef(0);
  const workerErrorCountRef = React.useRef(0);
  const reportedTopologyKeysRef = React.useRef(new Set<string>());
  const reportedFailureKeyRef = React.useRef<string | undefined>(undefined);
  const reportedCertificationRef = React.useRef<SectionCertification | undefined>(undefined);
  // What the caps were last built or refused from; a frame with the same inputs leaves them as they are.
  const appliedFrameRef = React.useRef<
    | Readonly<{
        key: string;
        workerResponse: SectionCapWorkerSuccessResponse | undefined;
        submittedWorkerRequestKey: string | undefined;
      }>
    | undefined
  >(undefined);

  const reportFailure = (status: 'unsupported' | 'failed', failure: SectionTopologyFailure): void => {
    const key = `${failure.sourceKey}|${failure.code}|${failure.message}`;
    if (reportedFailureKeyRef.current === key) {
      return;
    }
    reportedFailureKeyRef.current = key;
    const options = { description: failure.message };
    if (status === 'failed') {
      toast.error('Section view failed', options);
    } else {
      toast.warning('Section view unavailable', options);
    }
  };

  // A layout effect, so a cut step asks for its frame before the browser paints.
  React.useLayoutEffect(() => {
    if (!enabled) {
      invalidatedRenderStateRef.current = undefined;
      return;
    }
    const renderState = [cutSet, edgeColor, modelInteractionUnitState, resolution.x, resolution.y] as const;
    if (invalidatedRenderStateRef.current?.every((value, index) => Object.is(value, renderState[index])) !== true) {
      invalidatedRenderStateRef.current = renderState;
      invalidate();
    }
  }, [cutSet, edgeColor, enabled, invalidate, modelInteractionUnitState, resolution]);

  React.useEffect(
    () => () => {
      const root = rootRef.current;
      if (root) {
        for (const helper of helperByKey.current.values()) {
          disposeHelperRecord(root, helper);
        }
      }
      helperByKey.current.clear();
      for (const material of borderMaterialRef.current?.byEdgeColor.values() ?? []) {
        material.dispose();
      }
      borderMaterialRef.current = undefined;
      workerClientRef.current?.dispose();
      workerClientRef.current = undefined;
    },
    [],
  );

  useFrame(() => {
    const root = rootRef.current;
    const inner = innerRef.current;

    if (!root) {
      return;
    }

    if (!enabled || !inner) {
      root.visible = false;
      root.userData[sectionCapOverlapDebugUserDataKey] = undefined;
      root.userData[sectionCapPerformanceDebugUserDataKey] = undefined;
      latestWorkerRequestKeyRef.current = undefined;
      submittedWorkerRequestKeyRef.current = undefined;
      currentWorkerResponseRef.current = undefined;
      lastAppliedTopologyKeyRef.current = undefined;
      lastAppliedStyleKeyRef.current = undefined;
      reportedFailureKeyRef.current = undefined;
      reportedCertificationRef.current = undefined;
      appliedFrameRef.current = undefined;
      resetSectionViewSafeSnapshot(snapshotRef.current);
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(
        snapshotRef.current,
      );
      return;
    }

    root.visible = true;
    const performanceFrame = isTauDebugEnabled
      ? createSectionCapFramePerformance(++performanceFrameSequenceRef.current, performance.now())
      : undefined;
    const frameStartedAt = startSectionCapPhase(performanceFrame);
    const sourceCollectionStartedAt = startSectionCapPhase(performanceFrame);
    const sourceRecords = collectSectionSourceRecords(inner);
    for (const sourceRoot of new Set(sourceRecords.map((record) => record.source.root))) {
      sourceRoot.updateWorldMatrix(true, true);
    }
    const sourceIdentity = sourceRecords
      .map((record) =>
        [
          record.key,
          record.source.revision,
          matrixKey(getSectionSourceWorldMatrix(record.source, _sourceWorld)),
          record.visibleSource.visibility,
        ].join('|'),
      )
      .join(';');
    const { pieces } = cutSet;
    const candidateIdentity = `${sectionPiecesKey(pieces)}|${sourceIdentity}`;
    const modelInteractionContext = modelInteractionRef.getSnapshot().context;
    // Everything else the caps are drawn from: each source's emphasis (its fill tint, outline colour and
    // render order), the transform the helpers are placed under, and the fill and outline styles.
    const frameKey = [
      candidateIdentity,
      sourceRecords.map((record) => resolveSectionSourceEmphasis(record, modelInteractionContext)).join(','),
      matrixKey(root.matrixWorld),
      backend,
      edgeColor,
      resolution.x,
      resolution.y,
      stripeFrequency,
      stripeWidth,
      isTauDebugEnabled,
    ].join('|');
    endSectionCapPhase(performanceFrame, 'sourceCollection', sourceCollectionStartedAt);
    const appliedFrame = appliedFrameRef.current;
    const store = snapshotRef.current;
    if (
      appliedFrame?.key === frameKey &&
      appliedFrame.workerResponse === currentWorkerResponseRef.current &&
      appliedFrame.submittedWorkerRequestKey === submittedWorkerRequestKeyRef.current &&
      (store.rejection ? store.rejection.identity : store.committed?.identity) === candidateIdentity
    ) {
      if (performanceFrame) {
        performanceFrame.counters.skippedFrameCount = 1;
      }
      finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
      return;
    }
    if (performanceFrame) {
      performanceFrame.counters.sourceCount = sourceRecords.length;
      performanceFrame.counters.admittedSourceCount = sourceRecords.length;
      for (const { source } of sourceRecords) {
        if (source.topology.status !== 'ready') {
          performanceFrame.counters.unsupportedSourceCount++;
          continue;
        }
        if (source.topology.topology.path === 'extension') {
          performanceFrame.counters.extensionSourceCount++;
        } else {
          performanceFrame.counters.fallbackSourceCount++;
        }
        const topologyKey = `${source.key}|${source.revision}`;
        if (reportedTopologyKeysRef.current.has(topologyKey)) {
          performanceFrame.counters.topologyCacheHitCount++;
        } else {
          reportedTopologyKeysRef.current.add(topologyKey);
          performanceFrame.counters.topologyCacheMissCount++;
          addSectionCapTiming(performanceFrame, 'topologyBuild', source.topology.topology.buildMilliseconds);
        }
      }
    }

    // Tells the stage what is committed, only when that changes; the clip follows it within this frame.
    const reportCertification = (): void => {
      const { committed, rejection } = snapshotRef.current;
      const certification: SectionCertification = {
        status: rejection ? 'rejected' : 'exact',
        cuts: committed?.cutSet.cuts ?? noCuts,
      };
      const reported = reportedCertificationRef.current;
      if (reported?.status === certification.status && reported.cuts === certification.cuts) {
        return;
      }
      reportedCertificationRef.current = certification;
      onCertify(certification);
    };
    // All or nothing: a refused cut set leaves every drawn cap, and what is committed, as it was.
    const rejectCandidate = (status: 'unsupported' | 'failed', failure: SectionTopologyFailure): void => {
      rejectSectionViewSafeSnapshot(snapshotRef.current, { identity: candidateIdentity, sourceIdentity, failure });
      appliedFrameRef.current = {
        key: frameKey,
        workerResponse: currentWorkerResponseRef.current,
        submittedWorkerRequestKey: submittedWorkerRequestKeyRef.current,
      };
      reportFailure(status, failure);
      root.visible = Boolean(snapshotRef.current.committed);
      root.userData['sectionCapCompleteness'] = { status, failure };
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(
        snapshotRef.current,
      );
      if (performanceFrame) {
        performanceFrame.counters.unsupportedSourceCount++;
        performanceFrame.counters.safeSnapshotCurrentCount = snapshotRef.current.committed ? 1 : 0;
      }
      reportCertification();
      finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
    };

    // Slice each source through each face, reusing a slice while the source and the face's plane are unchanged, so
    // moving one cut re-slices only its own faces.
    const seen = new Set<string>();
    const slicedFaces: Array<SectionFrameFace<SectionFrameSource> & Readonly<{ worldPlane: THREE.Plane }>> = [];
    let candidateFailure: Readonly<{ status: 'unsupported' | 'failed'; failure: SectionTopologyFailure }> | undefined;
    for (const { face, faceKey } of resolveSectionFaceEntries(pieces)) {
      const worldPlane = sectionFaceWorldPlane(face);
      const sources: SectionFrameSource[] = [];
      for (const record of sourceRecords) {
        const helperKey = `${faceKey}|${record.key}`;
        const geometryKey = `${buildSectionFillGeometryKey(record, face)}|border-backend:${backend}`;
        seen.add(helperKey);
        let helper = helperByKey.current.get(helperKey);
        if (helper) {
          if (performanceFrame) {
            performanceFrame.counters.helperCacheHitCount++;
          }
        } else {
          if (performanceFrame) {
            performanceFrame.counters.helperCacheMissCount++;
          }
          helper = createHelperRecord(root);
          helperByKey.current.set(helperKey, helper);
        }

        let capBuild = helper.geometryKey === geometryKey ? helper.capBuild : undefined;
        if (capBuild) {
          if (performanceFrame) {
            performanceFrame.counters.closedContourCount += capBuild.closedContours.length;
            performanceFrame.counters.openPolylineCount += capBuild.openPolylines.length;
            performanceFrame.counters.segmentCount += capBuild.closedContours.reduce(
              (count, contour) => count + contour.length,
              0,
            );
            performanceFrame.counters.trueCutComponentCount += capBuild.trueCutComponentCount;
            performanceFrame.counters.cappedTrueCutComponentCount += capBuild.cappedTrueCutComponentCount;
            performanceFrame.counters.unresolvedTrueCutEdgeCount += capBuild.unresolvedTrueCutEdgeCount;
          }
        } else {
          const extractionStartedAt = startSectionCapPhase(performanceFrame);
          const slice = sliceSectionSurfaceSource({ visibleSource: record.visibleSource, worldPlane });
          endSectionCapFacePhase(performanceFrame, {
            faceKey,
            phase: 'sourceExtraction',
            startedAt: extractionStartedAt,
          });
          if (slice.status !== 'complete') {
            candidateFailure = { status: slice.status, failure: slice.failure };
            break;
          }
          if (performanceFrame) {
            performanceFrame.counters.changedGeometryKeyCount++;
            performanceFrame.counters.closedContourCount += slice.closedContours.length;
            performanceFrame.counters.openPolylineCount += slice.openPolylines.length;
            performanceFrame.counters.segmentCount += slice.segmentCount;
            performanceFrame.counters.trueCutComponentCount += slice.trueCutComponentCount;
            performanceFrame.counters.cappedTrueCutComponentCount += slice.cappedTrueCutComponentCount;
            performanceFrame.counters.unresolvedTrueCutEdgeCount += slice.unresolvedTrueCutEdgeCount;
            getSectionCapFacePerformance(performanceFrame, faceKey).slicedSourceCount++;
            addSectionCapFaceTiming(performanceFrame, {
              faceKey,
              phase: 'candidateBroadphase',
              elapsed: slice.candidateBroadphaseMilliseconds,
            });
            addSectionCapFaceTiming(performanceFrame, {
              faceKey,
              phase: 'topologySlice',
              elapsed: slice.topologySliceMilliseconds,
            });
          }
          const sourceWorld = getSectionSourceWorldMatrix(record.source);
          _inverseMeshWorld.copy(sourceWorld).invert();
          capBuild = {
            closedContours: slice.closedContours,
            openPolylines: slice.openPolylines,
            trueCut: slice.trueCutComponentCount > 0,
            trueCutComponentCount: slice.trueCutComponentCount,
            cappedTrueCutComponentCount: slice.cappedTrueCutComponentCount,
            unresolvedTrueCutEdgeCount: slice.unresolvedTrueCutEdgeCount,
            topologyPath: record.source.topology.status === 'ready' ? record.source.topology.topology.path : 'fallback',
            baseTintHex: extractTintHex(slice.dominantMaterial),
            meshWorldMatrix: sourceWorld,
            meshWorldInverse: _inverseMeshWorld.clone(),
          };
        }
        sources.push({ record, helper, helperKey, geometryKey, capBuild });
      }
      if (candidateFailure) {
        break;
      }
      slicedFaces.push({ face, faceKey, worldPlane, sources });
    }
    if (candidateFailure) {
      rejectCandidate(candidateFailure.status, candidateFailure.failure);
      return;
    }

    // Each face's caps in its own basis, trimmed to what the face shows among the other cuts.
    const cappedFaces: Array<SectionFrameFace<SectionCappedSource> & Readonly<{ basis: SectionCutPlaneBasis }>> = [];
    for (const { face, faceKey, worldPlane, sources } of slicedFaces) {
      const basisStartedAt = startSectionCapPhase(performanceFrame);
      const basis = createSectionCutPlaneBasis({ worldPlane, sources: sources.map(({ capBuild }) => capBuild) });
      endSectionCapFacePhase(performanceFrame, { faceKey, phase: 'worldPointBasis', startedAt: basisStartedAt });
      const capPolygonBuildStartedAt = startSectionCapPhase(performanceFrame);
      const cappedSources: SectionCappedSource[] = [];
      for (const source of sources) {
        const { record, geometryKey, capBuild } = source;
        const { polygon } = buildSectionCapPolygon({
          sourceKey: record.key,
          ownerKey: ownerKeyForRecord(record),
          geometryKey,
          contours: capBuild.closedContours,
          meshWorldMatrix: capBuild.meshWorldMatrix,
          planeBasis: basis,
          trueCut: capBuild.trueCut,
        });
        if (
          capBuild.trueCut &&
          (capBuild.trueCutComponentCount !== capBuild.cappedTrueCutComponentCount ||
            capBuild.unresolvedTrueCutEdgeCount !== 0 ||
            polygon.multiPolygon.length === 0)
        ) {
          candidateFailure = {
            status: 'failed',
            failure: {
              sourceKey: record.key,
              code: 'slice-invariant',
              message: `Section topology ${record.key}: did not produce a complete cap polygon`,
            },
          };
          break;
        }
        const trimmed = trimSectionCapPolygon({
          multiPolygon: polygon.multiPolygon,
          basis,
          face,
          pieces,
          booleanOperations: defaultSectionCapBooleanOperations,
        });
        const [booleanFailure] = trimmed.diagnostics;
        if (booleanFailure) {
          candidateFailure = {
            status: 'failed',
            failure: {
              sourceKey: record.key,
              code: 'slice-invariant',
              message: `Section topology ${record.key}: its cap could not be trimmed to the other cuts: ${booleanFailure.message}`,
            },
          };
          break;
        }
        const capPolygon =
          trimmed.multiPolygon === polygon.multiPolygon
            ? polygon
            : {
                ...polygon,
                multiPolygon: trimmed.multiPolygon,
                bbox: boundsForCapMultiPolygon(trimmed.multiPolygon),
                area: measureCapMultiPolygonArea(trimmed.multiPolygon),
              };
        if (performanceFrame) {
          const capPointCount = countCapPoints(capPolygon.multiPolygon);
          performanceFrame.counters.capPolygonCount += capPolygon.multiPolygon.length;
          performanceFrame.counters.capRingCount += countCapRings(capPolygon.multiPolygon);
          performanceFrame.counters.capPointCount += capPointCount;
          getSectionCapFacePerformance(performanceFrame, faceKey).capPointCount += capPointCount;
        }
        cappedSources.push({ ...source, capPolygon });
      }
      endSectionCapFacePhase(performanceFrame, {
        faceKey,
        phase: 'capPolygonBuild',
        startedAt: capPolygonBuildStartedAt,
      });
      if (candidateFailure) {
        break;
      }
      cappedFaces.push({ face, faceKey, basis, sources: cappedSources });
    }
    if (candidateFailure) {
      rejectCandidate(candidateFailure.status, candidateFailure.failure);
      return;
    }

    // One exact overlap request for every face, answered per face and source.
    const workerFaces: SectionCapWorkerFaceInput[] = cappedFaces.map(({ faceKey, basis, sources }) => ({
      faceKey,
      basis: plainBasisFromSectionCutPlaneBasis(basis),
      sources: sources.map(({ record, geometryKey, capBuild, capPolygon }) => ({
        sourceKey: record.key,
        ownerKey: ownerKeyForRecord(record),
        geometryKey,
        sourcePolygon: capPolygon.multiPolygon,
        bbox: capPolygon.bbox,
        area: capPolygon.area,
        trueCut: capBuild.trueCut,
        // Read only when a request is encoded, which copies it; the build's matrix is never mutated.
        meshWorldInverse: capBuild.meshWorldInverse.elements,
      })),
    }));
    const styleSources: SectionCapStyleSource[] = cappedFaces.flatMap(({ sources }) =>
      sources.map(({ record, helperKey, capBuild }) => ({
        sourceKey: helperKey,
        tintHex: resolveSectionSourceTint(record, modelInteractionContext, capBuild.baseTintHex),
      })),
    );
    const tintByHelperKey = new Map(styleSources.map((source) => [source.sourceKey, source.tintHex] as const));
    const frameSourceCount = styleSources.length;
    const requestKey = workerFaces
      .map(
        ({ faceKey, basis, sources }) => `${faceKey}:${basis.planeKey}|${buildSectionCapTopologySourceSetKey(sources)}`,
      )
      .join('||');
    const styleKey = buildSectionCapStyleKey(styleSources, { stripeFrequency, stripeWidth });
    latestWorkerRequestKeyRef.current = requestKey;
    const currentResponse =
      currentWorkerResponseRef.current?.requestKey === requestKey ? currentWorkerResponseRef.current : undefined;
    let exactResponse = currentResponse;
    const isStyleOnlyUpdate = Boolean(
      exactResponse &&
      lastAppliedTopologyKeyRef.current === requestKey &&
      lastAppliedStyleKeyRef.current !== undefined &&
      lastAppliedStyleKeyRef.current !== styleKey,
    );
    if (!exactResponse && frameSourceCount > 0 && submittedWorkerRequestKeyRef.current !== requestKey) {
      const sequence = ++workerSequenceRef.current;
      const encoded = encodeSectionCapWorkerRequest({ sequence, requestKey, faces: workerFaces });

      if (canUseSectionCapOverlapWorker()) {
        workerClientRef.current ??= createSectionCapOverlapWorkerClient({
          onResponse(response) {
            if (response.type === 'error') {
              workerErrorCountRef.current++;
              if (response.requestKey === submittedWorkerRequestKeyRef.current) {
                submittedWorkerRequestKeyRef.current = undefined;
              }
              invalidate();
              return;
            }

            if (response.requestKey !== latestWorkerRequestKeyRef.current) {
              // The discarded result is no longer in flight, so returning to its cuts requests it again.
              if (response.requestKey === submittedWorkerRequestKeyRef.current) {
                submittedWorkerRequestKeyRef.current = undefined;
              }
              staleWorkerResponseCountRef.current++;
              topologyStaleWorkerResponseCountRef.current++;
              invalidate();
              return;
            }

            currentWorkerResponseRef.current = response;
            if (submittedWorkerRequestKeyRef.current === response.requestKey) {
              submittedWorkerRequestKeyRef.current = undefined;
            }
            invalidate();
          },
          onError() {
            workerErrorCountRef.current++;
            submittedWorkerRequestKeyRef.current = undefined;
            invalidate();
          },
        });

        workerClientRef.current.post(encoded.request, encoded.transfer);
        submittedWorkerRequestKeyRef.current = requestKey;
        if (performanceFrame) {
          performanceFrame.counters.workerRequestCount++;
          performanceFrame.counters.topologyWorkerRequestCount++;
        }
      } else {
        exactResponse = computeSectionCapWorkerResponse(encoded.request);
        currentWorkerResponseRef.current = exactResponse;
        submittedWorkerRequestKeyRef.current = undefined;
      }
    }

    if (performanceFrame) {
      const pendingReason = exactResponse
        ? 'none'
        : submittedWorkerRequestKeyRef.current === requestKey
          ? 'duplicate-in-flight'
          : frameSourceCount > 0
            ? 'topology-change'
            : 'none';
      performanceFrame.counters.workerStaleResponseCount = staleWorkerResponseCountRef.current;
      performanceFrame.counters.workerTopologyStaleResponseCount = topologyStaleWorkerResponseCountRef.current;
      performanceFrame.counters.workerErrorCount = workerErrorCountRef.current;
      performanceFrame.counters.styleOnlyUpdateCount = isStyleOnlyUpdate ? 1 : 0;
      performanceFrame.topologyKey = requestKey;
      performanceFrame.styleKey = styleKey;
      performanceFrame.baseCapTopologyKey = requestKey;
      performanceFrame.baseCapFrameTopologyKey = requestKey;
      performanceFrame.baseCapIsCurrent = true;
      performanceFrame.exactDiagnosticIsCurrent = Boolean(exactResponse);
      if (exactResponse?.requestKey) {
        performanceFrame.exactDiagnosticTopologyKey = exactResponse.requestKey;
      }
      if (currentWorkerResponseRef.current?.requestKey) {
        performanceFrame.committedTopologyKey = currentWorkerResponseRef.current.requestKey;
      }
      if (submittedWorkerRequestKeyRef.current) {
        performanceFrame.pendingTopologyKey = submittedWorkerRequestKeyRef.current;
      }
      performanceFrame.pendingReason = pendingReason;
    }

    if (exactResponse) {
      root.userData[sectionCapOverlapDebugUserDataKey] = exactResponse.overlapDebug;
      if (performanceFrame) {
        performanceFrame.counters.workerCurrentResponseCount++;
        applyWorkerPerformanceToFrame(performanceFrame, exactResponse);
      }
    } else {
      const pendingSummary = createPendingOverlapDebugSummary(frameSourceCount);
      root.userData[sectionCapOverlapDebugUserDataKey] = pendingSummary;
      if (performanceFrame) {
        performanceFrame.counters.workerPendingFrameCount++;
        performanceFrame.counters.exactDiagnosticPendingFrameCount++;
        performanceFrame.counters.diagnosticsCount = pendingSummary.diagnostics.length;
      }
    }

    // The exact caps when the worker answered these cuts, else base caps built here.
    const buffersByHelperKey = new Map<string, PackedSectionCapGeometryBuffers>();
    let incompleteSourceKey: string | undefined;
    for (const { faceKey, basis, sources } of cappedFaces) {
      const geometryPackStartedAt = startSectionCapPhase(performanceFrame);
      for (const { record, helper, helperKey, capBuild, capPolygon } of sources) {
        const exactBuffers = exactResponse
          ? getSectionCapWorkerSourceGeometry(exactResponse, faceKey, record.key)
          : undefined;
        const baseBuffers = exactBuffers
          ? undefined
          : buildCurrentSectionBaseCapGeometry({
              multiPolygon: capPolygon.multiPolygon,
              basis,
              meshWorldInverse: capBuild.meshWorldInverse,
              arena: helper.packedGeometryArena,
              debugSink: createPackingDebugSink(performanceFrame),
            });
        const buffers = exactBuffers ?? baseBuffers;
        if (buffers) {
          buffersByHelperKey.set(helperKey, buffers);
        }
        if (
          !exactResponse &&
          capBuild.trueCut &&
          capPolygon.multiPolygon.length > 0 &&
          (!buffers || buffers.positions.length === 0 || buffers.indices.length === 0)
        ) {
          incompleteSourceKey ??= record.key;
        }
      }
      endSectionCapFacePhase(performanceFrame, { faceKey, phase: 'geometryPack', startedAt: geometryPackStartedAt });
    }
    if (incompleteSourceKey !== undefined) {
      rejectCandidate('failed', {
        sourceKey: incompleteSourceKey,
        code: 'slice-invariant',
        message: `Section topology ${incompleteSourceKey}: complete contours did not produce renderable cap geometry`,
      });
      return;
    }

    // Every face certified: draw its cap edges, then its caps.
    for (const { face, faceKey, basis, sources } of cappedFaces) {
      const borderWriteStartedAt = startSectionCapPhase(performanceFrame);
      for (const { record, helper, geometryKey, capBuild, capPolygon } of sources) {
        helper.capBuild = capBuild;
        helper.geometryKey = geometryKey;
        // The cut face belongs to the component, so its outline wears the component's emphasis.
        const outline = resolveSectionContourOutlineEmphasis(
          resolveSectionSourceEmphasis(record, modelInteractionContext),
          edgeColor,
        );
        const borderMaterial = resolveBorderMaterial(borderMaterialRef, {
          backend,
          edgeColor: outline.edgeColor,
          resolution,
        });
        assignBorderMaterial(helper, borderMaterial, outline.renderOrder);
        updateHelperMatrix(helper, capBuild.meshWorldMatrix);
        // Every boundary ring of the trimmed cap: where the face meets the part, and where it folds into another face.
        const boundary = buildSectionCapBoundaryPositions({
          multiPolygon: capPolygon.multiPolygon,
          basis,
          meshWorldInverse: capBuild.meshWorldInverse,
        });
        const geometricEvidence = buildSectionFaceEvidencePositions({
          openPolylines: capBuild.openPolylines,
          meshWorldMatrix: capBuild.meshWorldMatrix,
          meshWorldInverse: capBuild.meshWorldInverse,
          face,
          pieces,
          basis,
        });
        let borderPositions = boundary.positions;
        if (geometricEvidence.length > 0) {
          borderPositions = new Float32Array(boundary.positions.length + geometricEvidence.length);
          borderPositions.set(boundary.positions);
          borderPositions.set(geometricEvidence, boundary.positions.length);
        }
        if (performanceFrame) {
          performanceFrame.counters.baseBoundarySegmentCount += boundary.stats.segmentCount;
          performanceFrame.counters.rawOpenPolylineSegmentCount += countOpenPolylineSegments(capBuild.openPolylines);
          getSectionCapFacePerformance(performanceFrame, faceKey).boundarySegmentCount += boundary.stats.segmentCount;
        }
        writeBorderSegments(root, helper, {
          backend,
          material: borderMaterial,
          renderOrder: outline.renderOrder,
          positions: borderPositions,
        });
        helper.borderSegments?.matrix.copy(helper.fillMesh.matrix);
        helper.borderSegments?.updateMatrixWorld(true);
      }
      endSectionCapFacePhase(performanceFrame, { faceKey, phase: 'borderWrite', startedAt: borderWriteStartedAt });
    }

    for (const { faceKey, sources } of cappedFaces) {
      for (const { record, helper, helperKey } of sources) {
        const buffers = buffersByHelperKey.get(helperKey);
        if (!buffers || buffers.positions.length === 0 || buffers.indices.length === 0) {
          helper.fillMesh.visible = false;
          if (performanceFrame) {
            performanceFrame.counters.hiddenFillCount++;
          }
        } else {
          helper.fillMesh.visible = true;
          if (performanceFrame) {
            performanceFrame.counters.visibleFillCount++;
            performanceFrame.counters.baseFillVertexCount += buffers.positions.length / 3;
            performanceFrame.counters.uploadedByteCount += fillGeometryBufferByteLength(buffers);
          }
          applySectionCapStyleToPackedBuffers(buffers, {
            tintHex: tintByHelperKey.get(helperKey) ?? record.baseTintHex,
            stripeFrequency,
            stripeWidth,
          });
          const gpuBufferWriteStartedAt = startSectionCapPhase(performanceFrame);
          writePooledFillIndexedGeometry(helper.fillMesh, buffers);
          endSectionCapFacePhase(performanceFrame, {
            faceKey,
            phase: 'gpuBufferWrite',
            startedAt: gpuBufferWriteStartedAt,
          });
        }

        const materialUpdateStartedAt = startSectionCapPhase(performanceFrame);
        updateFillMaterial(helper, { backend, stripeFrequency, stripeWidth });
        endSectionCapFacePhase(performanceFrame, {
          faceKey,
          phase: 'materialUpdate',
          startedAt: materialUpdateStartedAt,
        });
      }
    }

    let trueCutComponentCount = 0;
    let cappedTrueCutComponentCount = 0;
    for (const { sources } of cappedFaces) {
      for (const { capBuild } of sources) {
        trueCutComponentCount += capBuild.trueCutComponentCount;
        cappedTrueCutComponentCount += capBuild.cappedTrueCutComponentCount;
      }
    }
    commitSectionViewSafeSnapshot(snapshotRef.current, {
      identity: candidateIdentity,
      sourceIdentity,
      kind: trueCutComponentCount > 0 ? 'complete' : 'uncut',
      cutSet,
    });
    // Recorded after this frame's own worker post or synchronous result, so only a later change re-applies.
    appliedFrameRef.current = {
      key: frameKey,
      workerResponse: currentWorkerResponseRef.current,
      submittedWorkerRequestKey: submittedWorkerRequestKeyRef.current,
    };
    reportedFailureKeyRef.current = undefined;
    const extensionSourceCount = sourceRecords.filter(
      ({ source }) => source.topology.status === 'ready' && source.topology.topology.path === 'extension',
    ).length;
    root.userData['sectionCapCompleteness'] = {
      status: 'complete',
      admittedSourceCount: sourceRecords.length,
      extensionSourceCount,
      fallbackSourceCount: sourceRecords.length - extensionSourceCount,
      trueCutComponentCount,
      cappedTrueCutComponentCount,
      unresolvedTrueCutEdgeCount: 0,
      unsupportedSourceCount: 0,
    };
    root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(snapshotRef.current);
    if (performanceFrame) {
      performanceFrame.counters.safeSnapshotCurrentCount = 1;
    }

    if (exactResponse) {
      lastAppliedTopologyKeyRef.current = requestKey;
      lastAppliedStyleKeyRef.current = styleKey;
    }

    const staleHelperCleanupStartedAt = startSectionCapPhase(performanceFrame);
    for (const [key, helper] of helperByKey.current) {
      if (!seen.has(key)) {
        disposeHelperRecord(root, helper);
        helperByKey.current.delete(key);
      }
    }
    endSectionCapPhase(performanceFrame, 'staleHelperCleanup', staleHelperCleanupStartedAt);
    reportCertification();
    finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
  }, -1);

  return (
    <group
      ref={rootRef}
      data-testid='tau-section-contour-fills-root'
      userData={sceneTagData(sceneTag.sectionViewHelper)}
    />
  );
}
