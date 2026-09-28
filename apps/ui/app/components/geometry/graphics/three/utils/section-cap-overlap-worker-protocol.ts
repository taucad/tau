import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapResult } from '#components/geometry/graphics/three/utils/section-cap-overlap.js';
import type { PackedSectionCapGeometryBuffers } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import type {
  SectionCapBooleanOperationStats,
  SectionCapPackingStats,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { CapPolygonBooleanBackendInfo } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapMultiPolygon,
  SectionCapBbox,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

export type PlainSectionCutPlaneBasis = Readonly<{
  origin: readonly [number, number, number];
  normal: readonly [number, number, number];
  u: readonly [number, number, number];
  v: readonly [number, number, number];
  planeKey: string;
  normalizationOffset: readonly [number, number];
  normalizationScale: number;
}>;

export type SectionCapWorkerInputSource = Readonly<{
  sourceKey: string;
  ownerKey: string;
  geometryKey: string;
  sourcePolygon: CapMultiPolygon;
  bbox: SectionCapBbox;
  area: number;
  trueCut: boolean;
  meshWorldInverse: readonly number[];
}>;

/** One cut face's caps: its basis and the cap polygon of each source it cuts. */
export type SectionCapWorkerFaceInput = Readonly<{
  faceKey: string;
  basis: PlainSectionCutPlaneBasis;
  sources: readonly SectionCapWorkerInputSource[];
}>;

/**
 * Every cut face's caps in one request. The source arrays run face after face; `faceSourceOffsets` holds where each
 * face's sources start, then their end.
 */
export type SectionCapWorkerRequest = Readonly<{
  type: 'compute';
  sequence: number;
  requestKey: string;
  faceKeys: readonly string[];
  bases: readonly PlainSectionCutPlaneBasis[];
  faceSourceOffsets: Uint32Array;
  sourceKeys: readonly string[];
  ownerKeys: readonly string[];
  geometryKeys: readonly string[];
  trueCut: Uint8Array<ArrayBuffer>;
  areas: Float64Array;
  bboxes: Float64Array;
  meshWorldInverses: Float64Array;
  sourcePolygonOffsets: Uint32Array;
  polygonRingOffsets: Uint32Array;
  ringPointOffsets: Uint32Array;
  points: Float64Array;
}>;

export type SectionCapWorkerTimingSummary = Readonly<{
  overlapClassify: number;
  renderPartSplit: number;
  geometryPack: number;
  total: number;
}>;

/** Packed caps per face and source, in the request's face and source order. */
export type SectionCapWorkerSuccessResponse = Readonly<{
  type: 'result';
  sequence: number;
  requestKey: string;
  faceKeys: readonly string[];
  faceSourceOffsets: Uint32Array;
  sourceKeys: readonly string[];
  sourceVertexOffsets: Uint32Array;
  sourceIndexOffsets: Uint32Array;
  positions: Float32Array;
  planeUv: Float32Array;
  baseColors: Float32Array;
  stripeColors: Float32Array;
  patternStrengths: Float32Array;
  stripeAxes: Float32Array;
  regionKinds: Uint8Array<ArrayBuffer>;
  indices: Uint32Array;
  overlapDebug: SectionCapOverlapDebugSummary;
  overlapCounters: Pick<
    SectionCapOverlapResult,
    | 'sourcePairCount'
    | 'classifiableSourceCount'
    | 'trueCutPrunedRegionCount'
    | 'xPrunedPairCount'
    | 'ownerPrunedPairCount'
    | 'yPrunedPairCount'
    | 'candidatePointCount'
    | 'broadphaseCandidatePairCount'
    | 'exactIntersectionPairCount'
    | 'positiveAreaPairCount'
  >;
  booleanOperations: SectionCapBooleanOperationStats;
  booleanBackend: CapPolygonBooleanBackendInfo;
  packing: SectionCapPackingStats;
  timings: SectionCapWorkerTimingSummary;
}>;

export type SectionCapWorkerErrorResponse = Readonly<{
  type: 'error';
  sequence: number;
  requestKey: string;
  message: string;
}>;

export type SectionCapWorkerResponse = SectionCapWorkerSuccessResponse | SectionCapWorkerErrorResponse;

export type EncodedSectionCapWorkerRequest = Readonly<{
  request: SectionCapWorkerRequest;
  transfer: Transferable[];
}>;

type EncodeSectionCapWorkerRequestOptions = Readonly<{
  sequence: number;
  requestKey: string;
  faces: readonly SectionCapWorkerFaceInput[];
}>;

const pushMultiPolygon = (
  multiPolygon: CapMultiPolygon,
  state: {
    points: number[];
    ringPointOffsets: number[];
    polygonRingOffsets: number[];
  },
): void => {
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      for (const point of ring) {
        state.points.push(point[0], point[1]);
      }
      state.ringPointOffsets.push(state.points.length / 2);
    }
    state.polygonRingOffsets.push(state.ringPointOffsets.length - 1);
  }
};

export const encodeSectionCapWorkerRequest = (
  options: EncodeSectionCapWorkerRequestOptions,
): EncodedSectionCapWorkerRequest => {
  const sources = options.faces.flatMap((face) => face.sources);
  const faceSourceOffsets = new Uint32Array(options.faces.length + 1);
  for (const [faceIndex, face] of options.faces.entries()) {
    faceSourceOffsets[faceIndex + 1] = faceSourceOffsets[faceIndex]! + face.sources.length;
  }
  const sourceKeys: string[] = [];
  const ownerKeys: string[] = [];
  const geometryKeys: string[] = [];
  const trueCut = new Uint8Array(sources.length);
  const areas = new Float64Array(sources.length);
  const bboxes = new Float64Array(sources.length * 4);
  const meshWorldInverses = new Float64Array(sources.length * 16);
  const sourcePolygonOffsets: number[] = [0];
  const polygonRingOffsets: number[] = [0];
  const ringPointOffsets: number[] = [0];
  const points: number[] = [];

  for (const [sourceIndex, source] of sources.entries()) {
    sourceKeys.push(source.sourceKey);
    ownerKeys.push(source.ownerKey);
    geometryKeys.push(source.geometryKey);
    trueCut[sourceIndex] = source.trueCut ? 1 : 0;
    areas[sourceIndex] = source.area;
    bboxes.set([source.bbox.minX, source.bbox.minY, source.bbox.maxX, source.bbox.maxY], sourceIndex * 4);
    meshWorldInverses.set(source.meshWorldInverse, sourceIndex * 16);
    pushMultiPolygon(source.sourcePolygon, { points, ringPointOffsets, polygonRingOffsets });
    sourcePolygonOffsets.push(polygonRingOffsets.length - 1);
  }

  const request: SectionCapWorkerRequest = {
    type: 'compute',
    sequence: options.sequence,
    requestKey: options.requestKey,
    faceKeys: options.faces.map((face) => face.faceKey),
    bases: options.faces.map((face) => face.basis),
    faceSourceOffsets,
    sourceKeys,
    ownerKeys,
    geometryKeys,
    trueCut,
    areas,
    bboxes,
    meshWorldInverses,
    sourcePolygonOffsets: new Uint32Array(sourcePolygonOffsets),
    polygonRingOffsets: new Uint32Array(polygonRingOffsets),
    ringPointOffsets: new Uint32Array(ringPointOffsets),
    points: new Float64Array(points),
  };

  return {
    request,
    transfer: [
      request.faceSourceOffsets.buffer,
      request.trueCut.buffer,
      request.areas.buffer,
      request.bboxes.buffer,
      request.meshWorldInverses.buffer,
      request.sourcePolygonOffsets.buffer,
      request.polygonRingOffsets.buffer,
      request.ringPointOffsets.buffer,
      request.points.buffer,
    ],
  };
};

const decodeSourceMultiPolygon = (request: SectionCapWorkerRequest, sourceIndex: number): CapMultiPolygon => {
  const multiPolygon: CapMultiPolygon = [];
  const polygonStart = request.sourcePolygonOffsets[sourceIndex] ?? 0;
  const polygonEnd = request.sourcePolygonOffsets[sourceIndex + 1] ?? polygonStart;

  for (let polygonIndex = polygonStart; polygonIndex < polygonEnd; polygonIndex++) {
    const ringStart = request.polygonRingOffsets[polygonIndex] ?? 0;
    const ringEnd = request.polygonRingOffsets[polygonIndex + 1] ?? ringStart;
    const polygon: CapMultiPolygon[number] = [];
    for (let ringIndex = ringStart; ringIndex < ringEnd; ringIndex++) {
      const pointStart = request.ringPointOffsets[ringIndex] ?? 0;
      const pointEnd = request.ringPointOffsets[ringIndex + 1] ?? pointStart;
      const ring: CapMultiPolygon[number][number] = [];
      for (let pointIndex = pointStart; pointIndex < pointEnd; pointIndex++) {
        ring.push([request.points[pointIndex * 2] ?? 0, request.points[pointIndex * 2 + 1] ?? 0]);
      }
      polygon.push(ring);
    }
    multiPolygon.push(polygon);
  }

  return multiPolygon;
};

const decodeSource = (request: SectionCapWorkerRequest, sourceIndex: number): SectionCapWorkerInputSource => {
  const sourceKey = request.sourceKeys[sourceIndex]!;
  return {
    sourceKey,
    ownerKey: request.ownerKeys[sourceIndex] ?? sourceKey,
    geometryKey: request.geometryKeys[sourceIndex] ?? sourceKey,
    sourcePolygon: decodeSourceMultiPolygon(request, sourceIndex),
    bbox: {
      minX: request.bboxes[sourceIndex * 4] ?? 0,
      minY: request.bboxes[sourceIndex * 4 + 1] ?? 0,
      maxX: request.bboxes[sourceIndex * 4 + 2] ?? 0,
      maxY: request.bboxes[sourceIndex * 4 + 3] ?? 0,
    },
    area: request.areas[sourceIndex] ?? 0,
    trueCut: request.trueCut[sourceIndex] === 1,
    meshWorldInverse: [...request.meshWorldInverses.subarray(sourceIndex * 16, sourceIndex * 16 + 16)],
  };
};

export const decodeSectionCapWorkerFaces = (request: SectionCapWorkerRequest): SectionCapWorkerFaceInput[] =>
  request.faceKeys.map((faceKey, faceIndex) => {
    const start = request.faceSourceOffsets[faceIndex] ?? 0;
    const end = request.faceSourceOffsets[faceIndex + 1] ?? start;
    return {
      faceKey,
      basis: request.bases[faceIndex]!,
      sources: Array.from({ length: end - start }, (_, index) => decodeSource(request, start + index)),
    };
  });

export const transferablesForSectionCapWorkerResponse = (response: SectionCapWorkerSuccessResponse): Transferable[] => [
  response.faceSourceOffsets.buffer,
  response.sourceVertexOffsets.buffer,
  response.sourceIndexOffsets.buffer,
  response.positions.buffer,
  response.planeUv.buffer,
  response.baseColors.buffer,
  response.stripeColors.buffer,
  response.patternStrengths.buffer,
  response.stripeAxes.buffer,
  response.regionKinds.buffer,
  response.indices.buffer,
];

/** The packed cap of one source on one face, or `undefined` when the response has none. */
export const getSectionCapWorkerSourceGeometry = (
  response: SectionCapWorkerSuccessResponse,
  faceKey: string,
  sourceKey: string,
): PackedSectionCapGeometryBuffers | undefined => {
  const faceIndex = response.faceKeys.indexOf(faceKey);
  if (faceIndex === -1) {
    return undefined;
  }
  const faceStart = response.faceSourceOffsets[faceIndex] ?? 0;
  const faceEnd = response.faceSourceOffsets[faceIndex + 1] ?? faceStart;
  const sourceIndex = response.sourceKeys.indexOf(sourceKey, faceStart);
  if (sourceIndex === -1 || sourceIndex >= faceEnd) {
    return undefined;
  }

  const vertexStart = response.sourceVertexOffsets[sourceIndex] ?? 0;
  const vertexEnd = response.sourceVertexOffsets[sourceIndex + 1] ?? vertexStart;
  const indexStart = response.sourceIndexOffsets[sourceIndex] ?? 0;
  const indexEnd = response.sourceIndexOffsets[sourceIndex + 1] ?? indexStart;

  return {
    positions: response.positions.subarray(vertexStart * 3, vertexEnd * 3),
    planeUv: response.planeUv.subarray(vertexStart * 2, vertexEnd * 2),
    baseColors: response.baseColors.subarray(vertexStart * 3, vertexEnd * 3),
    stripeColors: response.stripeColors.subarray(vertexStart * 3, vertexEnd * 3),
    patternStrengths: response.patternStrengths.subarray(vertexStart, vertexEnd),
    stripeAxes: response.stripeAxes.subarray(vertexStart * 2, vertexEnd * 2),
    regionKinds: response.regionKinds.subarray(vertexStart, vertexEnd),
    indices: response.indices.subarray(indexStart, indexEnd),
  };
};
