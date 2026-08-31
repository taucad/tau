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
import {
  createVertexColoredSectionCapMaterial,
  markVertexColoredSectionCapMaterialInUse,
} from '#components/geometry/graphics/three/materials/striped-material-vertex-colored.js';
import type { ClosedContour, OpenPolyline } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { buildSectionCapBoundaryPositions } from '#components/geometry/graphics/three/utils/section-cap-boundary.js';
import { buildSectionContourBorderPositions } from '#components/geometry/graphics/three/utils/section-contour-border.js';
import { buildCurrentSectionBaseCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-current-base.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { ModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  buildSectionCapPolygon,
  collectSectionCapWorldPoints,
  createSectionCutPlaneBasis,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  SectionCapBuildResult,
  SectionCutPlaneBasis,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import { createSectionCapPackedGeometryArena } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import type {
  PackedSectionCapGeometryBuffers,
  SectionCapPackedGeometryArena,
} from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import { applySectionCapStyleToPackedBuffers } from '#components/geometry/graphics/three/utils/section-cap-style.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import {
  addSectionCapTiming,
  appendSectionCapPerformanceFrame,
  createSectionCapFramePerformance,
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
  SectionCapWorkerInputSource,
  SectionCapWorkerSuccessResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { createGltfFatLineSegmentsFromPositions } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  createSectionContourOutlineMaterial,
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
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import {
  collectSectionSurfaceSources,
  sliceSectionSurfaceSource,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import {
  commitSectionViewSafeSnapshot,
  getSectionViewSafeSnapshotDebugState,
  rejectSectionViewSafeSnapshot,
  resetSectionViewSafeSnapshot,
  sectionViewSafeSnapshotDebugUserDataKey,
} from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type {
  SectionSurfaceSource,
  SectionTopologyFailure,
  VisibleSectionSurfaceSource,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';

const _inverseMeshWorld = /* @__PURE__ */ new THREE.Matrix4();
const _parentInverse = /* @__PURE__ */ new THREE.Matrix4();

export type SectionSourceRecord = Readonly<{
  key: string;
  source: SectionSurfaceSource;
  visibleSource: VisibleSectionSurfaceSource;
  mesh: THREE.Mesh;
  material: THREE.Material;
  owner: ModelComponentOwner | undefined;
  baseTintHex: number;
}>;

type SectionHelperRecord = {
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

type SectionFrameSource = Readonly<{
  record: SectionSourceRecord;
  helper: SectionHelperRecord;
  geometryKey: string;
  capBuild: SectionSourceCapBuild;
}>;

type SectionCapStyleSource = Readonly<{
  sourceKey: string;
  tintHex: number;
}>;

type SectionBorderMaterialState = {
  key: string;
  material: GltfFatLineMaterial;
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

/**
 * @remarks Multi-plane section view: each fill is built in mesh-local space from one world plane;
 * composing multiple planes is a future `ClippingGroup` nesting concern (see canonical reference F3).
 */
export type SectionContourFillsProperties = Readonly<{
  plane: THREE.Plane;
  enabled: boolean;
  stripeFrequency: number;
  stripeWidth: number;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
}>;

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

function planeKey(plane: THREE.Plane): string {
  return [
    numericKey(plane.normal.x),
    numericKey(plane.normal.y),
    numericKey(plane.normal.z),
    numericKey(plane.constant),
  ].join(',');
}

export function buildSectionFillGeometryKey(record: SectionSourceRecord, plane: THREE.Plane): string {
  return [
    record.key,
    record.source.revision,
    matrixKey(record.source.root.matrixWorld),
    planeKey(plane),
    record.visibleSource.visibility,
  ].join('|');
}

export function resolveSectionSourceTint(
  record: SectionSourceRecord,
  modelInteractionContext: ModelInteractionContext,
  baseTintHex = record.baseTintHex,
): number {
  const emphasis = record.owner
    ? resolveModelComponentEmphasis(
        getModelInteractionUnitState(modelInteractionContext, record.owner.unitId),
        record.owner.componentId,
      )
    : 'none';

  return mixModelEmphasisTint(baseTintHex, emphasis);
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

function updateHelperMatrix(helper: SectionHelperRecord, mesh: THREE.Object3D): void {
  const parentObject = helper.fillMesh.parent;
  if (parentObject) {
    _parentInverse.copy(parentObject.matrixWorld).invert();
    helper.fillMesh.matrix.multiplyMatrices(_parentInverse, mesh.matrixWorld);
    helper.borderSegments?.matrix.copy(helper.fillMesh.matrix);
  } else {
    helper.fillMesh.matrix.copy(mesh.matrixWorld);
    helper.borderSegments?.matrix.copy(mesh.matrixWorld);
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
  const key = [backend, edgeColor, resolution.x, resolution.y].join(':');
  if (stateRef.current?.key === key) {
    setSectionContourOutlineMaterialColor(stateRef.current.material, edgeColor);
    return stateRef.current.material;
  }

  const previous = stateRef.current;
  const material = createSectionContourOutlineMaterial({
    backend,
    edgeColor,
    resolution,
  });
  stateRef.current = { key, material };
  previous?.material.dispose();
  return material;
}

function assignBorderMaterial(helper: SectionHelperRecord, material: GltfFatLineMaterial): void {
  if (!helper.borderSegments) {
    return;
  }

  (helper.borderSegments as unknown as { material: GltfFatLineMaterial }).material = material;
  helper.borderSegments.renderOrder = viewportRenderTiers.sectionContourOutline;
}

function writeBorderSegments(
  root: THREE.Group,
  helper: SectionHelperRecord,
  parameters: {
    backend: ResolvedGraphicsBackend;
    material: GltfFatLineMaterial;
    positions: Float32Array;
  },
): void {
  if (parameters.positions.length === 0) {
    disposeBorderSegments(root, helper);
    return;
  }

  const existingGeometry = helper.borderSegments?.geometry;
  if (helper.borderSegments && helper.borderBackend === parameters.backend && existingGeometry?.setPositions) {
    existingGeometry.setPositions(parameters.positions);
    (helper.borderSegments as unknown as { material: GltfFatLineMaterial }).material = parameters.material;
    helper.borderSegments.renderOrder = viewportRenderTiers.sectionContourOutline;
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
  borderSegments.renderOrder = viewportRenderTiers.sectionContourOutline;
  borderSegments.userData = { ...sceneTagData(sceneTag.sectionViewHelper) };
  root.add(borderSegments);
  helper.borderSegments = borderSegments;
  helper.borderBackend = parameters.backend;
}

export function SectionContourFills({
  plane,
  enabled,
  innerRef,
  stripeFrequency,
  stripeWidth,
  snapshotRef,
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
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  const rootRef = React.useRef<THREE.Group | null>(null);
  const helperBySourceKey = React.useRef(new Map<string, SectionHelperRecord>());
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

  React.useEffect(() => {
    if (enabled) {
      invalidate();
    }
  }, [edgeColor, enabled, invalidate, modelInteractionUnitState, resolution]);

  React.useEffect(
    () => () => {
      const root = rootRef.current;
      if (root) {
        for (const helper of helperBySourceKey.current.values()) {
          disposeHelperRecord(root, helper);
        }
      }
      helperBySourceKey.current.clear();
      borderMaterialRef.current?.material.dispose();
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
          matrixKey(record.source.root.matrixWorld),
          record.visibleSource.visibility,
        ].join('|'),
      )
      .join(';');
    const candidateIdentity = `${planeKey(plane)}|${sourceIdentity}`;
    endSectionCapPhase(performanceFrame, 'sourceCollection', sourceCollectionStartedAt);
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
    const modelInteractionContext = modelInteractionRef.getSnapshot().context;
    const seen = new Set<string>();
    const borderMaterial = resolveBorderMaterial(borderMaterialRef, {
      backend,
      edgeColor,
      resolution,
    });
    const frameSources: SectionFrameSource[] = [];
    const worldPoints: THREE.Vector3[] = [];
    const candidateBuilds = new Map<string, Readonly<{ geometryKey: string; capBuild: SectionSourceCapBuild }>>();
    let candidateFailure: Readonly<{ status: 'unsupported' | 'failed'; failure: SectionTopologyFailure }> | undefined;

    for (const record of sourceRecords) {
      const nextGeometryKey = `${buildSectionFillGeometryKey(record, plane)}|border-backend:${backend}`;
      const helper = helperBySourceKey.current.get(record.key);
      if (helper?.geometryKey === nextGeometryKey && helper.capBuild) {
        candidateBuilds.set(record.key, { geometryKey: nextGeometryKey, capBuild: helper.capBuild });
        if (performanceFrame) {
          performanceFrame.counters.closedContourCount += helper.capBuild.closedContours.length;
          performanceFrame.counters.openPolylineCount += helper.capBuild.openPolylines.length;
          performanceFrame.counters.segmentCount += helper.capBuild.closedContours.reduce(
            (count, contour) => count + contour.length,
            0,
          );
          performanceFrame.counters.trueCutComponentCount += helper.capBuild.trueCutComponentCount;
          performanceFrame.counters.cappedTrueCutComponentCount += helper.capBuild.cappedTrueCutComponentCount;
          performanceFrame.counters.unresolvedTrueCutEdgeCount += helper.capBuild.unresolvedTrueCutEdgeCount;
        }
        continue;
      }

      const extractionStartedAt = startSectionCapPhase(performanceFrame);
      const slice = sliceSectionSurfaceSource({ visibleSource: record.visibleSource, worldPlane: plane });
      endSectionCapPhase(performanceFrame, 'sourceExtraction', extractionStartedAt);
      if (slice.status !== 'complete') {
        candidateFailure = { status: slice.status, failure: slice.failure };
        break;
      }
      if (performanceFrame) {
        performanceFrame.counters.closedContourCount += slice.closedContours.length;
        performanceFrame.counters.openPolylineCount += slice.openPolylines.length;
        performanceFrame.counters.segmentCount += slice.segmentCount;
        performanceFrame.counters.trueCutComponentCount += slice.trueCutComponentCount;
        performanceFrame.counters.cappedTrueCutComponentCount += slice.cappedTrueCutComponentCount;
        performanceFrame.counters.unresolvedTrueCutEdgeCount += slice.unresolvedTrueCutEdgeCount;
        addSectionCapTiming(performanceFrame, 'candidateBroadphase', slice.candidateBroadphaseMilliseconds);
        addSectionCapTiming(performanceFrame, 'topologySlice', slice.topologySliceMilliseconds);
      }
      _inverseMeshWorld.copy(record.source.root.matrixWorld).invert();
      candidateBuilds.set(record.key, {
        geometryKey: nextGeometryKey,
        capBuild: {
          closedContours: slice.closedContours,
          openPolylines: slice.openPolylines,
          trueCut: slice.trueCutComponentCount > 0,
          trueCutComponentCount: slice.trueCutComponentCount,
          cappedTrueCutComponentCount: slice.cappedTrueCutComponentCount,
          unresolvedTrueCutEdgeCount: slice.unresolvedTrueCutEdgeCount,
          topologyPath: record.source.topology.status === 'ready' ? record.source.topology.topology.path : 'fallback',
          baseTintHex: extractTintHex(slice.dominantMaterial),
          meshWorldMatrix: record.source.root.matrixWorld.clone(),
          meshWorldInverse: _inverseMeshWorld.clone(),
        },
      });
    }

    if (candidateFailure) {
      rejectSectionViewSafeSnapshot(snapshotRef.current, {
        identity: candidateIdentity,
        sourceIdentity,
        failure: candidateFailure.failure,
      });
      reportFailure(candidateFailure.status, candidateFailure.failure);
      root.visible = Boolean(snapshotRef.current.committed);
      root.userData['sectionCapCompleteness'] = {
        status: candidateFailure.status,
        failure: candidateFailure.failure,
      };
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(
        snapshotRef.current,
      );
      if (performanceFrame) {
        performanceFrame.counters.unsupportedSourceCount++;
        performanceFrame.counters.safeSnapshotCurrentCount = snapshotRef.current.committed ? 1 : 0;
      }
      finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
      return;
    }

    for (const record of sourceRecords) {
      seen.add(record.key);

      let helper = helperBySourceKey.current.get(record.key);
      if (!helper) {
        if (performanceFrame) {
          performanceFrame.counters.helperCacheMissCount++;
        }
        helper = createHelperRecord(root);
        helperBySourceKey.current.set(record.key, helper);
      } else if (performanceFrame) {
        performanceFrame.counters.helperCacheHitCount++;
      }

      const candidate = candidateBuilds.get(record.key)!;
      const nextGeometryKey = candidate.geometryKey;
      if (helper.geometryKey !== nextGeometryKey && performanceFrame) {
        performanceFrame.counters.changedGeometryKeyCount++;
      }

      const { capBuild } = candidate;
      frameSources.push({ record, helper, geometryKey: candidate.geometryKey, capBuild });
      const worldPointStartedAt = startSectionCapPhase(performanceFrame);
      const capWorldPoints = collectSectionCapWorldPoints({
        contours: capBuild.closedContours,
        meshWorldMatrix: capBuild.meshWorldMatrix,
      });
      worldPoints.push(...capWorldPoints);
      endSectionCapPhase(performanceFrame, 'worldPointBasis', worldPointStartedAt);
    }

    const basisStartedAt = startSectionCapPhase(performanceFrame);
    const planeBasis = createSectionCutPlaneBasis({ worldPlane: plane, worldPoints });
    endSectionCapPhase(performanceFrame, 'worldPointBasis', basisStartedAt);
    const capPolygonBuildStartedAt = startSectionCapPhase(performanceFrame);
    const capBuildResults: SectionCapBuildResult[] = frameSources.map(({ record, geometryKey, capBuild }) =>
      buildSectionCapPolygon({
        sourceKey: record.key,
        ownerKey: ownerKeyForRecord(record),
        geometryKey,
        contours: capBuild.closedContours,
        meshWorldMatrix: capBuild.meshWorldMatrix,
        planeBasis,
        trueCut: capBuild.trueCut,
      }),
    );
    endSectionCapPhase(performanceFrame, 'capPolygonBuild', capPolygonBuildStartedAt);
    if (performanceFrame) {
      for (const { polygon } of capBuildResults) {
        performanceFrame.counters.capPolygonCount += polygon.multiPolygon.length;
        performanceFrame.counters.capRingCount += countCapRings(polygon.multiPolygon);
        performanceFrame.counters.capPointCount += countCapPoints(polygon.multiPolygon);
      }
    }
    const incompleteSourceIndex = frameSources.findIndex(({ capBuild }, index) => {
      if (!capBuild.trueCut) {
        return false;
      }
      return (
        capBuild.trueCutComponentCount !== capBuild.cappedTrueCutComponentCount ||
        capBuild.unresolvedTrueCutEdgeCount !== 0 ||
        capBuildResults[index]!.polygon.multiPolygon.length === 0
      );
    });
    if (incompleteSourceIndex !== -1) {
      const sourceKey = frameSources[incompleteSourceIndex]!.record.key;
      const failure: SectionTopologyFailure = {
        sourceKey,
        code: 'slice-invariant',
        message: `Section topology ${sourceKey}: did not produce a complete cap polygon`,
      };
      rejectSectionViewSafeSnapshot(snapshotRef.current, { identity: candidateIdentity, sourceIdentity, failure });
      reportFailure('failed', failure);
      root.visible = Boolean(snapshotRef.current.committed);
      root.userData['sectionCapCompleteness'] = { status: 'failed', failure };
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(
        snapshotRef.current,
      );
      if (performanceFrame) {
        performanceFrame.counters.unsupportedSourceCount++;
        performanceFrame.counters.safeSnapshotCurrentCount = snapshotRef.current.committed ? 1 : 0;
      }
      finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
      return;
    }
    const workerSources: SectionCapWorkerInputSource[] = frameSources.map(
      ({ record, geometryKey, capBuild }, index) => {
        const capPolygon = capBuildResults[index]!.polygon;
        return {
          sourceKey: record.key,
          ownerKey: ownerKeyForRecord(record),
          geometryKey,
          sourcePolygon: capPolygon.multiPolygon,
          bbox: capPolygon.bbox,
          area: capPolygon.area,
          trueCut: capBuild.trueCut,
          meshWorldInverse: [...capBuild.meshWorldInverse.elements],
        };
      },
    );
    const styleSources: SectionCapStyleSource[] = frameSources.map(({ record, capBuild }) => ({
      sourceKey: record.key,
      tintHex: resolveSectionSourceTint(record, modelInteractionContext, capBuild.baseTintHex),
    }));
    const tintBySourceKey = new Map(styleSources.map((source) => [source.sourceKey, source.tintHex] as const));
    const sourceSetKey = buildSectionCapTopologySourceSetKey(workerSources);
    const requestKey = `${planeBasis.planeKey}|${sourceSetKey}`;
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
    if (!exactResponse && workerSources.length > 0 && submittedWorkerRequestKeyRef.current !== requestKey) {
      const sequence = ++workerSequenceRef.current;
      const encoded = encodeSectionCapWorkerRequest({
        sequence,
        requestKey,
        planeKey: planeBasis.planeKey,
        sourceSetKey,
        basis: plainBasisFromSectionCutPlaneBasis(planeBasis),
        sources: workerSources,
      });

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
          : workerSources.length > 0
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
      const pendingSummary = createPendingOverlapDebugSummary(frameSources.length);
      root.userData[sectionCapOverlapDebugUserDataKey] = pendingSummary;
      if (performanceFrame) {
        performanceFrame.counters.workerPendingFrameCount++;
        performanceFrame.counters.exactDiagnosticPendingFrameCount++;
        performanceFrame.counters.diagnosticsCount = pendingSummary.diagnostics.length;
      }
    }

    const geometryPackStartedAt = startSectionCapPhase(performanceFrame);
    const geometryBuffers = frameSources.map(({ record, helper, capBuild }, index) => {
      const exactBuffers = exactResponse ? getSectionCapWorkerSourceGeometry(exactResponse, record.key) : undefined;
      const baseBuffers = exactBuffers
        ? undefined
        : buildCurrentSectionBaseCapGeometry({
            multiPolygon: capBuildResults[index]!.polygon.multiPolygon,
            basis: planeBasis,
            meshWorldInverse: capBuild.meshWorldInverse,
            arena: helper.packedGeometryArena,
            debugSink: createPackingDebugSink(performanceFrame),
          });
      return exactBuffers ?? baseBuffers;
    });
    endSectionCapPhase(performanceFrame, 'geometryPack', geometryPackStartedAt);
    const missingBufferIndex = frameSources.findIndex(({ capBuild }, index) => {
      const buffers = geometryBuffers[index];
      return Boolean(
        !exactResponse &&
        capBuild.trueCut &&
        (!buffers || buffers.positions.length === 0 || buffers.indices.length === 0),
      );
    });
    if (missingBufferIndex !== -1) {
      const sourceKey = frameSources[missingBufferIndex]!.record.key;
      const failure: SectionTopologyFailure = {
        sourceKey,
        code: 'slice-invariant',
        message: `Section topology ${sourceKey}: complete contours did not produce renderable cap geometry`,
      };
      rejectSectionViewSafeSnapshot(snapshotRef.current, { identity: candidateIdentity, sourceIdentity, failure });
      reportFailure('failed', failure);
      root.visible = Boolean(snapshotRef.current.committed);
      root.userData['sectionCapCompleteness'] = { status: 'failed', failure };
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(
        snapshotRef.current,
      );
      if (performanceFrame) {
        performanceFrame.counters.unsupportedSourceCount++;
        performanceFrame.counters.safeSnapshotCurrentCount = snapshotRef.current.committed ? 1 : 0;
      }
      finishSectionCapPerformanceFrame(root, performanceFrame, frameStartedAt);
      return;
    }

    const borderWriteStartedAt = startSectionCapPhase(performanceFrame);
    for (const [index, frameSource] of frameSources.entries()) {
      const { record, helper, capBuild } = frameSource;
      helper.capBuild = capBuild;
      helper.geometryKey = candidateBuilds.get(record.key)!.geometryKey;
      assignBorderMaterial(helper, borderMaterial);
      updateHelperMatrix(helper, record.source.root);
      const boundary = buildSectionCapBoundaryPositions({
        multiPolygon: capBuildResults[index]!.polygon.multiPolygon,
        basis: planeBasis,
        meshWorldInverse: capBuild.meshWorldInverse,
      });
      const geometricEvidence = buildSectionContourBorderPositions({
        closedContours: [],
        openPolylines: capBuild.openPolylines,
      });
      const borderPositions = new Float32Array(boundary.positions.length + geometricEvidence.length);
      borderPositions.set(boundary.positions);
      borderPositions.set(geometricEvidence, boundary.positions.length);
      if (performanceFrame) {
        performanceFrame.counters.baseBoundarySegmentCount += boundary.stats.segmentCount;
        performanceFrame.counters.rawOpenPolylineSegmentCount += countOpenPolylineSegments(capBuild.openPolylines);
      }
      writeBorderSegments(root, helper, {
        backend,
        material: borderMaterial,
        positions: borderPositions,
      });
      helper.borderSegments?.matrix.copy(helper.fillMesh.matrix);
      helper.borderSegments?.updateMatrixWorld(true);
    }
    endSectionCapPhase(performanceFrame, 'borderWrite', borderWriteStartedAt);

    for (const [index, frameSource] of frameSources.entries()) {
      const { record, helper } = frameSource;
      const buffers = geometryBuffers[index];

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
          tintHex: tintBySourceKey.get(record.key) ?? record.baseTintHex,
          stripeFrequency,
          stripeWidth,
        });
        const gpuBufferWriteStartedAt = startSectionCapPhase(performanceFrame);
        writePooledFillIndexedGeometry(helper.fillMesh, buffers);
        endSectionCapPhase(performanceFrame, 'gpuBufferWrite', gpuBufferWriteStartedAt);
      }

      const materialUpdateStartedAt = startSectionCapPhase(performanceFrame);
      updateFillMaterial(helper, { backend, stripeFrequency, stripeWidth });
      endSectionCapPhase(performanceFrame, 'materialUpdate', materialUpdateStartedAt);
    }

    const trueCutComponentCount = frameSources.reduce(
      (count, { capBuild }) => count + capBuild.trueCutComponentCount,
      0,
    );
    const cappedTrueCutComponentCount = frameSources.reduce(
      (count, { capBuild }) => count + capBuild.cappedTrueCutComponentCount,
      0,
    );
    commitSectionViewSafeSnapshot(snapshotRef.current, {
      identity: candidateIdentity,
      sourceIdentity,
      kind: trueCutComponentCount > 0 ? 'complete' : 'uncut',
      plane,
    });
    reportedFailureKeyRef.current = undefined;
    root.userData['sectionCapCompleteness'] = {
      status: 'complete',
      admittedSourceCount: frameSources.length,
      extensionSourceCount: frameSources.filter(({ capBuild }) => capBuild.topologyPath === 'extension').length,
      fallbackSourceCount: frameSources.filter(({ capBuild }) => capBuild.topologyPath === 'fallback').length,
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
    for (const [key, helper] of helperBySourceKey.current) {
      if (!seen.has(key)) {
        disposeHelperRecord(root, helper);
        helperBySourceKey.current.delete(key);
      }
    }
    endSectionCapPhase(performanceFrame, 'staleHelperCleanup', staleHelperCleanupStartedAt);
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
