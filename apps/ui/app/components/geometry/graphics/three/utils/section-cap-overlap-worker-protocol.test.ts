// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import {
  decodeSectionCapWorkerFaces,
  encodeSectionCapWorkerRequest,
  getSectionCapWorkerSourceGeometry,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import type {
  PlainSectionCutPlaneBasis,
  SectionCapWorkerInputSource,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { createSectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

type Bounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

const square = (bounds: Bounds): CapMultiPolygon => [
  [
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY],
    ],
  ],
];

const plainBasis = (worldPlane: THREE.Plane): PlainSectionCutPlaneBasis => {
  const basis = createSectionCutPlaneBasis({ worldPlane });
  return {
    origin: [basis.origin.x, basis.origin.y, basis.origin.z],
    normal: [basis.normal.x, basis.normal.y, basis.normal.z],
    u: [basis.u.x, basis.u.y, basis.u.z],
    v: [basis.v.x, basis.v.y, basis.v.z],
    planeKey: basis.planeKey,
    normalizationOffset: [basis.normalizationOffset.x, basis.normalizationOffset.y],
    normalizationScale: basis.normalizationScale,
  };
};

const squareSource = (key: string, bounds: Bounds): SectionCapWorkerInputSource => ({
  sourceKey: key,
  ownerKey: `owner-${key}`,
  geometryKey: `geometry-${key}`,
  sourcePolygon: square(bounds),
  bbox: bounds,
  area: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
  trueCut: true,
  meshWorldInverse: new THREE.Matrix4().elements,
});

describe('section cap overlap worker protocol', () => {
  it('should encode flat polygon buffers and compute exact packed overlap output', () => {
    const encoded = encodeSectionCapWorkerRequest({
      sequence: 7,
      requestKey: 'request:current',
      faces: [
        {
          faceKey: 'face-a',
          basis: plainBasis(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)),
          sources: [
            squareSource('a', { minX: 0, minY: 0, maxX: 1, maxY: 1 }),
            squareSource('b', { minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
          ],
        },
      ],
    });

    expect(encoded.transfer.length).toBeGreaterThan(0);
    expect('tintHexes' in encoded.request).toBe(false);
    expect('stripeFrequency' in encoded.request).toBe(false);
    expect('stripeWidth' in encoded.request).toBe(false);
    expect(
      decodeSectionCapWorkerFaces(encoded.request).flatMap((face) => face.sources.map((source) => source.sourceKey)),
    ).toEqual(['a', 'b']);

    const response = computeSectionCapWorkerResponse(encoded.request);
    const sourceAlphaGeometry = getSectionCapWorkerSourceGeometry(response, 'face-a', 'a');

    expect(response.type).toBe('result');
    expect(response.sequence).toBe(7);
    expect(response.requestKey).toBe('request:current');
    expect(response.overlapDebug.positiveAreaPairCount).toBe(1);
    expect(response.overlapCounters.broadphaseCandidatePairCount).toBe(1);
    expect(response.booleanOperations.intersection.count).toBe(1);
    expect(response.booleanOperations.difference.count).toBe(2);
    expect(response.booleanBackend).toMatchObject({
      name: 'clipper2-ts',
      target: 'js',
      version: '2.0.1-17',
    });
    expect(sourceAlphaGeometry?.positions.length).toBeGreaterThan(0);
    expect(sourceAlphaGeometry?.indices.length).toBeGreaterThan(0);
    expect(sourceAlphaGeometry?.regionKinds.length).toBe(sourceAlphaGeometry!.positions.length / 3);
    expect(new Set(sourceAlphaGeometry?.regionKinds)).toEqual(new Set([0, 1]));
  });

  it('should classify and return each face on its own when a source is cut by several faces', () => {
    const encoded = encodeSectionCapWorkerRequest({
      sequence: 1,
      requestKey: 'request:faces',
      faces: [
        {
          faceKey: 'face-a',
          basis: plainBasis(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)),
          sources: [
            squareSource('a', { minX: 0, minY: 0, maxX: 1, maxY: 1 }),
            squareSource('b', { minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
          ],
        },
        {
          faceKey: 'face-b',
          basis: plainBasis(new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)),
          sources: [squareSource('a', { minX: 0, minY: 0, maxX: 1, maxY: 1 })],
        },
      ],
    });

    expect(
      decodeSectionCapWorkerFaces(encoded.request).map((face) => [
        face.faceKey,
        face.basis.planeKey,
        face.sources.map((source) => source.sourceKey),
      ]),
    ).toEqual([
      ['face-a', encoded.request.bases[0]!.planeKey, ['a', 'b']],
      ['face-b', encoded.request.bases[1]!.planeKey, ['a']],
    ]);

    const response = computeSectionCapWorkerResponse(encoded.request);
    const overlappedCap = getSectionCapWorkerSourceGeometry(response, 'face-a', 'a');
    const loneCap = getSectionCapWorkerSourceGeometry(response, 'face-b', 'a');

    expect(response.overlapCounters.sourcePairCount).toBe(1);
    expect(response.overlapDebug.positiveAreaPairCount).toBe(1);
    expect(new Set(overlappedCap?.regionKinds)).toEqual(new Set([0, 1]));
    expect(loneCap?.indices.length).toBeGreaterThan(0);
    expect(new Set(loneCap?.regionKinds)).toEqual(new Set([0]));
    expect(getSectionCapWorkerSourceGeometry(response, 'face-b', 'b')).toBeUndefined();
    expect(getSectionCapWorkerSourceGeometry(response, 'face-c', 'a')).toBeUndefined();
  });
});
