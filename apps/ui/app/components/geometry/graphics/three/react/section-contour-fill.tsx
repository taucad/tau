import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
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
import {
  createSegmentScratch,
  extractSectionContours,
} from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { buildSectionCapBoundaryPositions } from '#components/geometry/graphics/three/utils/section-cap-boundary.js';
import { buildCurrentSectionBaseCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-current-base.js';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { hasSceneTag, sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { getModelComponentOwnerInHierarchy } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import type { ModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { isSectionSourceOnlyObject } from '#components/geometry/graphics/three/utils/section-source-only.js';
import {
  buildSectionCapPolygon,
  collectSectionCapWorldPoints,
  deriveSectionTrueCut,
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
import { useModelInteractionRef, useModelInteractionSelector } from '#hooks/use-graphics.js';
import { useFeature } from '#flags/use-feature.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';

const _inverseMeshWorld = /* @__PURE__ */ new THREE.Matrix4();
const _parentInverse = /* @__PURE__ */ new THREE.Matrix4();

type SectionMaterialGroup = Readonly<{
  start: number;
  count: number;
  materialIndex: number;
}>;

export type SectionSourceRecord = Readonly<{
  key: string;
  mesh: THREE.Mesh;
  material: THREE.Material;
  materialIndex: number;
  group: SectionMaterialGroup | undefined;
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

type ExtractSectionContoursResult = ReturnType<typeof extractSectionContours>;

type SectionSourceCapBuild = Readonly<{
  closedContours: ExtractSectionContoursResult['closedContours'];
  openPolylines: ExtractSectionContoursResult['openPolylines'];
  trueCut: boolean;
  meshWorldMatrix: THREE.Matrix4;
  meshWorldInverse: THREE.Matrix4;
}>;

type SectionFrameSource = Readonly<{
  record: SectionSourceRecord;
  helper: SectionHelperRecord;
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

function countCapRings(multiPolygon: CapMultiPolygon): number {
  return multiPolygon.reduce((sum, polygon) => sum + polygon.length, 0);
}

function countCapPoints(multiPolygon: CapMultiPolygon): number {
  return multiPolygon.reduce((sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0), 0);
}

function countOpenPolylineSegments(openPolylines: ExtractSectionContoursResult['openPolylines']): number {
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
}>;

function isDrawableSectionSourceMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh && Boolean(object.geometry) && Boolean(object.material);
}

function isVisibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }

    current = current.parent ?? undefined;
  }

  return true;
}

function materialOpacity(material: THREE.Material): number {
  if ('opacity' in material && typeof material.opacity === 'number') {
    return material.opacity;
  }

  return 1;
}

function isSectionSourceMaterialVisible(material: THREE.Material): boolean {
  return material.visible && materialOpacity(material) > 0;
}

function isRecordSectionSourceMaterialVisible(material: THREE.Material, sourceOnly: boolean): boolean {
  return sourceOnly || isSectionSourceMaterialVisible(material);
}

function extractTintHex(material: THREE.Material): number {
  return resolveModelMaterialBaseTintHex(material);
}

function getMaterialAtIndex(materials: readonly THREE.Material[], index: number): THREE.Material | undefined {
  return materials[index] ?? materials[0];
}

function makeRecordKey(mesh: THREE.Mesh, group: SectionMaterialGroup | undefined, materialIndex: number): string {
  if (!group) {
    return `${mesh.uuid}:all:${materialIndex}`;
  }

  return `${mesh.uuid}:group:${group.start}:${group.count}:${group.materialIndex}`;
}

function getSectionSourceOwner(mesh: THREE.Mesh): ModelComponentOwner | undefined {
  const owner = getModelComponentOwnerInHierarchy(mesh);
  const sectionOwnerComponentId = mesh.userData['tauSectionOwnerComponentId'] as unknown;
  if (!owner || typeof sectionOwnerComponentId !== 'string') {
    return owner;
  }

  return { unitId: owner.unitId, componentId: sectionOwnerComponentId };
}

export function collectSectionSourceRecords(root: THREE.Group): SectionSourceRecord[] {
  const result: SectionSourceRecord[] = [];

  root.traverse((child) => {
    if (hasSceneTag(child, sceneTag.sectionViewHelper) || !isVisibleInHierarchy(child)) {
      return;
    }

    if (!isDrawableSectionSourceMesh(child)) {
      return;
    }

    const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
    const sourceOnly = isSectionSourceOnlyObject(child);
    const { groups } = child.geometry;
    if (Array.isArray(child.material) && groups.length > 0) {
      for (const group of groups) {
        const materialIndex = group.materialIndex ?? 0;
        const material = getMaterialAtIndex(materials, materialIndex);
        if (!material || !isRecordSectionSourceMaterialVisible(material, sourceOnly)) {
          continue;
        }

        const sectionGroup = { start: group.start, count: group.count, materialIndex } satisfies SectionMaterialGroup;
        result.push({
          key: makeRecordKey(child, sectionGroup, materialIndex),
          mesh: child,
          material,
          materialIndex,
          group: sectionGroup,
          owner: getSectionSourceOwner(child),
          baseTintHex: extractTintHex(material),
        });
      }

      return;
    }

    const materialIndex = Math.max(
      0,
      materials.findIndex((material) => isRecordSectionSourceMaterialVisible(material, sourceOnly)),
    );
    const material = materials[materialIndex];
    if (!material || !isRecordSectionSourceMaterialVisible(material, sourceOnly)) {
      return;
    }

    result.push({
      key: makeRecordKey(child, undefined, materialIndex),
      mesh: child,
      material,
      materialIndex,
      group: undefined,
      owner: getSectionSourceOwner(child),
      baseTintHex: extractTintHex(material),
    });
  });

  const sourceOnlyOwnerKeys = new Set(
    result.filter((record) => isSectionSourceOnlyObject(record.mesh)).map((record) => ownerKeyForRecord(record)),
  );
  if (sourceOnlyOwnerKeys.size === 0) {
    return result;
  }

  return result.filter(
    (record) => isSectionSourceOnlyObject(record.mesh) || !sourceOnlyOwnerKeys.has(ownerKeyForRecord(record)),
  );
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

function geometryKey(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const index = geometry.getIndex() ?? undefined;
  return [
    geometry.uuid,
    position?.version ?? 0,
    position?.count ?? 0,
    index?.version ?? 0,
    index?.count ?? 0,
    geometry.drawRange.start,
    geometry.drawRange.count,
  ].join(':');
}

export function buildSectionFillGeometryKey(record: SectionSourceRecord, plane: THREE.Plane): string {
  return [
    record.key,
    geometryKey(record.mesh.geometry),
    matrixKey(record.mesh.matrixWorld),
    planeKey(plane),
    record.group ? `${record.group.start}:${record.group.count}:${record.group.materialIndex}` : 'all',
  ].join('|');
}

export function resolveSectionSourceTint(
  record: SectionSourceRecord,
  modelInteractionContext: ModelInteractionContext,
): number {
  const emphasis = record.owner
    ? resolveModelComponentEmphasis(
        getModelInteractionUnitState(modelInteractionContext, record.owner.unitId),
        record.owner.componentId,
      )
    : 'none';

  return mixModelEmphasisTint(record.baseTintHex, emphasis);
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

  if (record.group) {
    return `${record.owner.unitId}:${record.owner.componentId}:${record.key}`;
  }

  return `${record.owner.unitId}:${record.owner.componentId}`;
}

function triangleFilterForGroup(
  group: SectionMaterialGroup | undefined,
): ((triangleIndex: number) => boolean) | undefined {
  if (!group) {
    return undefined;
  }

  const firstTriangle = Math.floor(group.start / 3);
  const afterLastTriangle = Math.ceil((group.start + group.count) / 3);
  return (triangleIndex) => triangleIndex >= firstTriangle && triangleIndex < afterLastTriangle;
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

function updateHelperMatrix(helper: SectionHelperRecord, mesh: THREE.Mesh): void {
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
}: SectionContourFillsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  const { theme } = useTheme();
  const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
  const isTauDebugEnabled = useFeature('tauDebug');
  const modelInteractionRef = useModelInteractionRef();
  const modelInteractionRevision = useModelInteractionSelector((state) => state.context.revision);
  const { invalidate, size } = useThree();
  const resolution = React.useMemo(() => new THREE.Vector2(size.width, size.height), [size.height, size.width]);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  const rootRef = React.useRef<THREE.Group | null>(null);
  const helperBySourceKey = React.useRef(new Map<string, SectionHelperRecord>());
  const segmentScratchRef = React.useRef(createSegmentScratch());
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

  React.useEffect(() => {
    if (enabled) {
      invalidate();
    }
  }, [edgeColor, enabled, invalidate, modelInteractionRevision, resolution]);

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
      return;
    }

    root.visible = true;
    const performanceFrame = isTauDebugEnabled
      ? createSectionCapFramePerformance(++performanceFrameSequenceRef.current, performance.now())
      : undefined;
    const frameStartedAt = startSectionCapPhase(performanceFrame);
    const sourceCollectionStartedAt = startSectionCapPhase(performanceFrame);
    const sourceRecords = collectSectionSourceRecords(inner);
    endSectionCapPhase(performanceFrame, 'sourceCollection', sourceCollectionStartedAt);
    if (performanceFrame) {
      performanceFrame.counters.sourceCount = sourceRecords.length;
    }
    const modelInteractionContext = modelInteractionRef.getSnapshot().context;
    const seen = new Set<string>();
    const scratch = segmentScratchRef.current;
    const borderMaterial = resolveBorderMaterial(borderMaterialRef, {
      backend,
      edgeColor,
      resolution,
    });
    const frameSources: SectionFrameSource[] = [];
    const worldPoints: THREE.Vector3[] = [];

    for (const record of sourceRecords) {
      const { mesh } = record;
      seen.add(record.key);
      mesh.updateMatrixWorld();

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

      const nextGeometryKey = `${buildSectionFillGeometryKey(record, plane)}|border-backend:${backend}`;
      if (helper.geometryKey !== nextGeometryKey) {
        if (performanceFrame) {
          performanceFrame.counters.changedGeometryKeyCount++;
        }
        const triangleFilter = triangleFilterForGroup(record.group);
        const bvh = getOrBuildBvh(mesh.geometry);
        const extractionStartedAt = startSectionCapPhase(performanceFrame);
        const extractionResult = extractSectionContours({
          geometry: mesh.geometry,
          bvh,
          worldPlane: plane,
          meshWorldMatrix: mesh.matrixWorld,
          segmentScratch: scratch,
          triangleFilter,
        });
        endSectionCapPhase(performanceFrame, 'sourceExtraction', extractionStartedAt);
        if (performanceFrame) {
          performanceFrame.counters.closedContourCount += extractionResult.closedContours.length;
          performanceFrame.counters.openPolylineCount += extractionResult.openPolylines.length;
          performanceFrame.counters.segmentCount += extractionResult.segmentCount;
        }

        _inverseMeshWorld.copy(mesh.matrixWorld).invert();
        const trueCutStartedAt = startSectionCapPhase(performanceFrame);
        const trueCutEvidence = deriveSectionTrueCut({
          geometry: mesh.geometry,
          meshWorldMatrix: mesh.matrixWorld,
          worldPlane: plane,
          triangleFilter,
          closedContourCount: extractionResult.closedContours.length,
        });
        endSectionCapPhase(performanceFrame, 'trueCut', trueCutStartedAt);
        if (performanceFrame) {
          if (trueCutEvidence.method === 'bounds-reject') {
            performanceFrame.counters.trueCutBoundsRejectCount++;
          } else if (trueCutEvidence.method === 'contour-evidence') {
            performanceFrame.counters.trueCutContourEvidenceCount++;
          } else {
            performanceFrame.counters.trueCutTriangleFallbackCount++;
          }
        }
        helper.capBuild = {
          closedContours: extractionResult.closedContours,
          openPolylines: extractionResult.openPolylines,
          trueCut: trueCutEvidence.trueCut,
          meshWorldMatrix: mesh.matrixWorld.clone(),
          meshWorldInverse: _inverseMeshWorld.clone(),
        };

        helper.geometryKey = nextGeometryKey;
      }

      if (!helper.capBuild) {
        helper.fillMesh.visible = false;
        continue;
      }

      frameSources.push({ record, helper, capBuild: helper.capBuild });
      const worldPointStartedAt = startSectionCapPhase(performanceFrame);
      const capWorldPoints = collectSectionCapWorldPoints({
        contours: helper.capBuild.closedContours,
        meshWorldMatrix: helper.capBuild.meshWorldMatrix,
      });
      worldPoints.push(...capWorldPoints);
      endSectionCapPhase(performanceFrame, 'worldPointBasis', worldPointStartedAt);

      assignBorderMaterial(helper, borderMaterial);
      updateHelperMatrix(helper, mesh);
    }

    const basisStartedAt = startSectionCapPhase(performanceFrame);
    const planeBasis = createSectionCutPlaneBasis({ worldPlane: plane, worldPoints });
    endSectionCapPhase(performanceFrame, 'worldPointBasis', basisStartedAt);
    const capPolygonBuildStartedAt = startSectionCapPhase(performanceFrame);
    const capBuildResults: SectionCapBuildResult[] = frameSources.map(({ record, helper, capBuild }) =>
      buildSectionCapPolygon({
        sourceKey: record.key,
        ownerKey: ownerKeyForRecord(record),
        geometryKey: helper.geometryKey ?? record.key,
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
    const borderWriteStartedAt = startSectionCapPhase(performanceFrame);
    for (const [index, frameSource] of frameSources.entries()) {
      const { helper, capBuild } = frameSource;
      const capPolygon = capBuildResults[index]!.polygon;
      const boundary = buildSectionCapBoundaryPositions({
        multiPolygon: capPolygon.multiPolygon,
        basis: planeBasis,
        meshWorldInverse: capBuild.meshWorldInverse,
      });
      if (performanceFrame) {
        performanceFrame.counters.baseBoundarySegmentCount += boundary.stats.segmentCount;
        performanceFrame.counters.rawOpenPolylineSegmentCount += countOpenPolylineSegments(capBuild.openPolylines);
      }
      writeBorderSegments(root, helper, {
        backend,
        material: borderMaterial,
        positions: boundary.positions,
      });
      helper.borderSegments?.matrix.copy(helper.fillMesh.matrix);
      helper.borderSegments?.updateMatrixWorld(true);
    }
    endSectionCapPhase(performanceFrame, 'borderWrite', borderWriteStartedAt);
    const workerSources: SectionCapWorkerInputSource[] = frameSources.map(({ record, helper, capBuild }, index) => {
      const capPolygon = capBuildResults[index]!.polygon;
      return {
        sourceKey: record.key,
        ownerKey: ownerKeyForRecord(record),
        geometryKey: helper.geometryKey ?? record.key,
        sourcePolygon: capPolygon.multiPolygon,
        bbox: capPolygon.bbox,
        area: capPolygon.area,
        trueCut: capBuild.trueCut,
        meshWorldInverse: [...capBuild.meshWorldInverse.elements],
      };
    });
    const styleSources: SectionCapStyleSource[] = frameSources.map(({ record }) => ({
      sourceKey: record.key,
      tintHex: resolveSectionSourceTint(record, modelInteractionContext),
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

    for (const [index, frameSource] of frameSources.entries()) {
      const { record, helper, capBuild } = frameSource;

      const geometryPackStartedAt = startSectionCapPhase(performanceFrame);
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
      const buffers = exactBuffers ?? baseBuffers;
      endSectionCapPhase(performanceFrame, 'geometryPack', geometryPackStartedAt);

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
    endSectionCapPhase(performanceFrame, 'frameTotal', frameStartedAt);
    if (performanceFrame) {
      root.userData[sectionCapPerformanceDebugUserDataKey] = appendSectionCapPerformanceFrame(
        root.userData[sectionCapPerformanceDebugUserDataKey] as
          | ReturnType<typeof appendSectionCapPerformanceFrame>
          | undefined,
        performanceFrame,
      );
    } else {
      root.userData[sectionCapPerformanceDebugUserDataKey] = undefined;
    }
  });

  return (
    <group
      ref={rootRef}
      data-testid='tau-section-contour-fills-root'
      userData={sceneTagData(sceneTag.sectionViewHelper)}
    />
  );
}
