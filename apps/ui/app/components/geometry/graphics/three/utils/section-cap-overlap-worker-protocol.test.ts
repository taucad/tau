// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import {
  decodeSectionCapWorkerSources,
  encodeSectionCapWorkerRequest,
  getSectionCapWorkerSourceGeometry,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { createSectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const square = (
  bounds: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>,
): CapMultiPolygon => [
  [
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY],
    ],
  ],
];

describe('section cap overlap worker protocol', () => {
  it('should encode flat polygon buffers and compute exact packed overlap output', () => {
    const basis = createSectionCutPlaneBasis({
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    });
    const encoded = encodeSectionCapWorkerRequest({
      sequence: 7,
      requestKey: 'request:current',
      planeKey: basis.planeKey,
      sourceSetKey: 'source-set',
      basis: {
        origin: [basis.origin.x, basis.origin.y, basis.origin.z],
        normal: [basis.normal.x, basis.normal.y, basis.normal.z],
        u: [basis.u.x, basis.u.y, basis.u.z],
        v: [basis.v.x, basis.v.y, basis.v.z],
        planeKey: basis.planeKey,
        normalizationOffset: [basis.normalizationOffset.x, basis.normalizationOffset.y],
        normalizationScale: basis.normalizationScale,
      },
      sources: [
        {
          sourceKey: 'a',
          ownerKey: 'owner-a',
          geometryKey: 'geometry-a',
          sourcePolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
          bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
          area: 1,
          trueCut: true,
          meshWorldInverse: new THREE.Matrix4().elements,
        },
        {
          sourceKey: 'b',
          ownerKey: 'owner-b',
          geometryKey: 'geometry-b',
          sourcePolygon: square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
          bbox: { minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 },
          area: 1,
          trueCut: true,
          meshWorldInverse: new THREE.Matrix4().elements,
        },
      ],
    });

    expect(encoded.transfer.length).toBeGreaterThan(0);
    expect('tintHexes' in encoded.request).toBe(false);
    expect('stripeFrequency' in encoded.request).toBe(false);
    expect('stripeWidth' in encoded.request).toBe(false);
    expect(decodeSectionCapWorkerSources(encoded.request).map((source) => source.sourceKey)).toEqual(['a', 'b']);

    const response = computeSectionCapWorkerResponse(encoded.request);
    const sourceAlphaGeometry = getSectionCapWorkerSourceGeometry(response, 'a');

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
});
