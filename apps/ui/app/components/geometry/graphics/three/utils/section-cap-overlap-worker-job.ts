import * as THREE from 'three';
import { classifySectionCapOverlaps } from '#components/geometry/graphics/three/utils/section-cap-overlap.js';
import { buildPackedSectionCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import { defaultSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import {
  createSectionCapBooleanOperationStats,
  createSectionCapPackingStats,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { buildSectionCapRenderParts } from '#components/geometry/graphics/three/utils/section-cap-render-parts.js';
import type {
  SectionCapPolygon,
  SectionCutPlaneBasis,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { SectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { SectionCapDiagnostic } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import { decodeSectionCapWorkerFaces } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import type {
  PlainSectionCutPlaneBasis,
  SectionCapWorkerRequest,
  SectionCapWorkerSuccessResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';

const toVector3 = (values: readonly [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(values[0], values[1], values[2]);

const toVector2 = (values: readonly [number, number]): THREE.Vector2 => new THREE.Vector2(values[0], values[1]);

const toBasis = (plain: PlainSectionCutPlaneBasis): SectionCutPlaneBasis => ({
  origin: toVector3(plain.origin),
  normal: toVector3(plain.normal),
  u: toVector3(plain.u),
  v: toVector3(plain.v),
  planeKey: plain.planeKey,
  normalizationOffset: toVector2(plain.normalizationOffset),
  normalizationScale: plain.normalizationScale,
});

const toMatrix4 = (elements: readonly number[]): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  matrix.fromArray(elements);
  return matrix;
};

const appendFloat32 = (target: number[], source: Float32Array): void => {
  for (const value of source) {
    target.push(value);
  }
};

const appendUint32 = (target: number[], source: Uint32Array): void => {
  for (const value of source) {
    target.push(value);
  }
};

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());
const neutralWorkerStripeFrequency = 1;
const neutralWorkerStripeWidth = 0.1;
const neutralWorkerTintHex = 0xff_ff_ff;

/**
 * Classifies overlaps, splits render parts and packs geometry for every face of a request. Sources overlap only within
 * a face, so each face is classified on its own; the counters and diagnostics add up over the faces.
 */
export const computeSectionCapWorkerResponse = (
  request: SectionCapWorkerRequest,
  options: Readonly<{
    booleanOperations?: SectionCapBooleanOperations;
  }> = {},
): SectionCapWorkerSuccessResponse => {
  const totalStartedAt = now();
  const faces = decodeSectionCapWorkerFaces(request);
  const sectionCapBooleanOperations = options.booleanOperations ?? defaultSectionCapBooleanOperations;
  const booleanOperations = createSectionCapBooleanOperationStats();
  const packing = createSectionCapPackingStats();
  const booleanDebugSink = {
    recordBooleanOperation(operation: keyof typeof booleanOperations, elapsed: number): void {
      const stats = booleanOperations[operation];
      stats.count++;
      if (Number.isFinite(elapsed) && elapsed >= 0) {
        stats.total += elapsed;
      }
    },
  };
  const packingDebugSink = {
    recordPackedGeometry(stats: typeof packing): void {
      packing.partCount += stats.partCount;
      packing.triangulatedPolygonCount += stats.triangulatedPolygonCount;
      packing.packedVertexCount += stats.packedVertexCount;
      packing.packedIndexCount += stats.packedIndexCount;
      packing.packedByteCount += stats.packedByteCount;
    },
  };

  const overlapCounters: Mutable<SectionCapWorkerSuccessResponse['overlapCounters']> = {
    sourcePairCount: 0,
    classifiableSourceCount: 0,
    trueCutPrunedRegionCount: 0,
    xPrunedPairCount: 0,
    ownerPrunedPairCount: 0,
    yPrunedPairCount: 0,
    candidatePointCount: 0,
    broadphaseCandidatePairCount: 0,
    exactIntersectionPairCount: 0,
    positiveAreaPairCount: 0,
  };
  let renderedOverlapArea = 0;
  let splitFailed = false;
  const diagnostics: SectionCapDiagnostic[] = [];
  const timings = { overlapClassify: 0, renderPartSplit: 0, geometryPack: 0 };

  const sourceVertexOffsets: number[] = [0];
  const sourceIndexOffsets: number[] = [0];
  const positions: number[] = [];
  const planeUv: number[] = [];
  const baseColors: number[] = [];
  const stripeColors: number[] = [];
  const patternStrengths: number[] = [];
  const stripeAxes: number[] = [];
  const regionKinds: number[] = [];
  const indices: number[] = [];

  for (const face of faces) {
    const basis = toBasis(face.basis);
    const regions: SectionCapPolygon[] = face.sources.map((source) => ({
      sourceKey: source.sourceKey,
      ownerKey: source.ownerKey,
      geometryKey: source.geometryKey,
      multiPolygon: source.sourcePolygon,
      bbox: source.bbox,
      area: source.area,
      trueCut: source.trueCut,
      diagnostics: [],
    }));

    const classifyStartedAt = now();
    const overlapResult = classifySectionCapOverlaps(regions, {
      booleanOperations: sectionCapBooleanOperations,
      debugSink: booleanDebugSink,
    });
    timings.overlapClassify += now() - classifyStartedAt;
    for (const counter of Object.keys(overlapCounters) as Array<keyof typeof overlapCounters>) {
      overlapCounters[counter] += overlapResult[counter];
    }

    const splitStartedAt = now();
    const renderPartsResult = buildSectionCapRenderParts({
      stripeFrequency: neutralWorkerStripeFrequency,
      stripeWidth: neutralWorkerStripeWidth,
      booleanOperations: sectionCapBooleanOperations,
      debugSink: booleanDebugSink,
      sources: face.sources.map((source) => ({
        sourceKey: source.sourceKey,
        sourcePolygon: source.sourcePolygon,
        overlapPolygon: overlapResult.overlapBySourceKey.get(source.sourceKey),
        visibleOverlapPolygon: overlapResult.visibleOverlapBySourceKey.get(source.sourceKey),
        tintHex: neutralWorkerTintHex,
      })),
    });
    timings.renderPartSplit += now() - splitStartedAt;
    renderedOverlapArea += renderPartsResult.renderedOverlapArea;
    splitFailed ||= renderPartsResult.splitFailed;
    diagnostics.push(...overlapResult.diagnostics, ...renderPartsResult.diagnostics);

    const packStartedAt = now();
    for (const source of face.sources) {
      const buffers = buildPackedSectionCapGeometry({
        parts: renderPartsResult.partsBySourceKey.get(source.sourceKey) ?? [],
        basis,
        meshWorldInverse: toMatrix4(source.meshWorldInverse),
        debugSink: packingDebugSink,
      });

      appendFloat32(positions, buffers.positions);
      appendFloat32(planeUv, buffers.planeUv);
      appendFloat32(baseColors, buffers.baseColors);
      appendFloat32(stripeColors, buffers.stripeColors);
      appendFloat32(patternStrengths, buffers.patternStrengths);
      appendFloat32(stripeAxes, buffers.stripeAxes);
      for (const regionKind of buffers.regionKinds) {
        regionKinds.push(regionKind);
      }
      appendUint32(indices, buffers.indices);
      sourceVertexOffsets.push(positions.length / 3);
      sourceIndexOffsets.push(indices.length);
    }
    timings.geometryPack += now() - packStartedAt;
  }

  return {
    type: 'result',
    sequence: request.sequence,
    requestKey: request.requestKey,
    faceKeys: request.faceKeys,
    faceSourceOffsets: new Uint32Array(request.faceSourceOffsets),
    sourceKeys: request.sourceKeys,
    sourceVertexOffsets: new Uint32Array(sourceVertexOffsets),
    sourceIndexOffsets: new Uint32Array(sourceIndexOffsets),
    positions: new Float32Array(positions),
    planeUv: new Float32Array(planeUv),
    baseColors: new Float32Array(baseColors),
    stripeColors: new Float32Array(stripeColors),
    patternStrengths: new Float32Array(patternStrengths),
    stripeAxes: new Float32Array(stripeAxes),
    regionKinds: new Uint8Array(regionKinds),
    indices: new Uint32Array(indices),
    overlapDebug: {
      sourceCount: request.sourceKeys.length,
      sourcePairCount: overlapCounters.sourcePairCount,
      broadphaseCandidatePairCount: overlapCounters.broadphaseCandidatePairCount,
      exactIntersectionPairCount: overlapCounters.exactIntersectionPairCount,
      positiveAreaPairCount: overlapCounters.positiveAreaPairCount,
      renderedOverlapArea,
      splitFailed,
      diagnostics,
    },
    overlapCounters,
    booleanOperations,
    booleanBackend: sectionCapBooleanOperations.info,
    packing,
    timings: { ...timings, total: now() - totalStartedAt },
  };
};
