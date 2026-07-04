import { describe, expect, it } from 'vitest';
import { buildFixtureIndex } from '#selector/__fixtures__/two-cube-fixture.js';
import { resolve } from '#selector/resolve.js';
import { resolveTolerances } from '#selector/tolerances.js';
import type { GeometrySelection, GeometrySelector } from '#selector/types.js';
import { proveContact, proveRelationship } from '#proofs/relationship-proofs.js';
import type { RelationshipProofContext, RelationshipProofNative } from '#proofs/relationship-proofs.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';

const index = buildFixtureIndex();

/** Analytic proofs are pure TS over SB3 facts: any native call is a bug. */
const throwingNative: RelationshipProofNative = {
  extrema: () => {
    throw new Error('analytic proofs must not call native extrema');
  },
  classifyPoints: () => {
    throw new Error('analytic proofs must not call native classifyPoints');
  },
  commonVolume: () => {
    throw new Error('analytic proofs must not call native commonVolume');
  },
  faceFacts: () => {
    throw new Error('analytic proofs must not call native faceFacts');
  },
};

const context: RelationshipProofContext = {
  native: throwingNative,
  index,
  occurrenceIndexByPath: new Map([
    ['cubeA', 0],
    ['cubeB', 1],
    ['bolt[1]', 2],
    ['bolt[2]', 3],
  ]),
  tolerances: resolveTolerances(),
};

const resolved = (selector: GeometrySelector): GeometrySelection => {
  const selection = resolve(selector, index);
  expect(selection.status).toBe('resolved');
  return selection;
};

const prove = (options: {
  kind: GeoSpecSpatialRelationshipExpectation['kind'];
  subject: GeometrySelection;
  target: GeometrySelection;
  expectation?: Partial<GeoSpecSpatialRelationshipExpectation>;
}) =>
  proveRelationship({
    subject: options.subject,
    target: options.target,
    expectation: {
      kind: options.kind,
      subject: 'unused-by-proofs',
      target: 'unused-by-proofs',
      ...options.expectation,
    },
    context,
  });

const smallBoreAxis = () => resolved({ kind: 'axis', of: 'cubeA', query: { radius: 1, near: { x: 2, y: 2 } } });
const centerBoreAxis = () => resolved({ kind: 'axis', of: 'cubeA', query: { radius: 2 } });
const sideBoreAxis = () => resolved({ kind: 'axis', of: 'cubeB' });
const topPlane = () => resolved('cubeA.face.top');
const secondTopPlane = () => resolved('cubeB.face.a');
const bottomPlane = () => resolved({ kind: 'plane', of: 'cubeA', query: { normal: { direction: [0, 0, -1] } } });

describe('analytic relationship proofs', () => {
  it('should pass parallel and fail coaxial for offset parallel axes with measured radial offset', () => {
    const parallel = prove({ kind: 'parallel', subject: smallBoreAxis(), target: centerBoreAxis() });
    expect(parallel.verdict).toBe('pass');
    expect(parallel.final?.method).toBe('analytic');

    const coaxial = prove({ kind: 'coaxial', subject: smallBoreAxis(), target: centerBoreAxis() });
    expect(coaxial.verdict).toBe('fail');
    expect(coaxial.final?.measured['radialOffset']).toBeCloseTo(Math.hypot(3, 3), 6);
    expect(coaxial.final?.measured['angle']).toBeCloseTo(0, 6);
    expect(coaxial.diagnostics[0]?.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
  });

  it('should prove concentric with the same axis evidence as coaxial', () => {
    const concentric = prove({ kind: 'concentric', subject: centerBoreAxis(), target: centerBoreAxis() });
    expect(concentric.verdict).toBe('pass');
    expect(concentric.final?.measured).toEqual({ angle: 0, radialOffset: 0 });
  });

  it('should measure perpendicular and declared-angle relationships between axis directions', () => {
    expect(prove({ kind: 'perpendicular', subject: sideBoreAxis(), target: centerBoreAxis() }).verdict).toBe('pass');

    const rightAngle = prove({
      kind: 'angle',
      subject: sideBoreAxis(),
      target: centerBoreAxis(),
      expectation: { angleDegrees: 90 },
    });
    expect(rightAngle.verdict).toBe('pass');

    const wrongAngle = prove({
      kind: 'angle',
      subject: sideBoreAxis(),
      target: centerBoreAxis(),
      expectation: { angleDegrees: 45 },
    });
    expect(wrongAngle.verdict).toBe('fail');
    expect(wrongAngle.final?.measured['angle']).toBeCloseTo(90, 6);
    expect(wrongAngle.final?.expected['angle']).toBe(45);
  });

  it('should return unsupported when angle is declared without angleDegrees', () => {
    const missing = prove({ kind: 'angle', subject: sideBoreAxis(), target: centerBoreAxis() });
    expect(missing.verdict).toBe('unsupported');
    expect(missing.diagnostics[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
  });

  it('should prove coplanar planes and fail offset planes with the measured offset delta', () => {
    const coplanar = prove({ kind: 'coplanar', subject: topPlane(), target: secondTopPlane() });
    expect(coplanar.verdict).toBe('pass');

    const offsetPlanes = prove({ kind: 'coplanar', subject: topPlane(), target: bottomPlane() });
    expect(offsetPlanes.verdict).toBe('fail');
    expect(offsetPlanes.final?.measured['offsetDelta']).toBeCloseTo(10, 6);
    expect(offsetPlanes.final?.measured['angle']).toBeCloseTo(0, 6);
    expect(offsetPlanes.final?.witnesses.map((witness) => witness.kind)).toEqual(['plane', 'plane']);
  });

  it('should carry both endpoint resolutions with stability in failure diagnostics', () => {
    const failure = prove({ kind: 'coaxial', subject: smallBoreAxis(), target: centerBoreAxis() });
    const details = failure.diagnostics[0]?.details as {
      subject: { stability: string; entities: Array<{ topologyRef?: string }> };
      target: { stability: string };
      evidence: { final: { method: string } };
      measured: Record<string, number>;
      expected: Record<string, number>;
    };
    expect(details.subject.stability).toBe('derived-query');
    expect(details.target.stability).toBe('derived-query');
    expect(details.subject.entities[0]?.topologyRef).toMatch(/^#o/);
    expect(details.evidence.final.method).toBe('analytic');
    expect(details.measured).toBeDefined();
    expect(details.expected).toBeDefined();
  });

  it('should return unsupported for endpoints without the needed analytic facts', () => {
    const occurrence = resolved({ kind: 'occurrence', name: 'cubeA' });
    const unsupported = prove({ kind: 'parallel', subject: occurrence, target: centerBoreAxis() });
    expect(unsupported.verdict).toBe('unsupported');
    expect(unsupported.diagnostics[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
    expect(unsupported.diagnostics[0]?.message).toContain('direction');
  });

  it('should reject unbound explicit endpoints through the evidence policy', () => {
    const explicit: GeometrySelection = {
      selector: { kind: 'axis' },
      status: 'resolved',
      entities: [
        { id: 'explicit:axis', entityType: 'axis', facts: { axisOrigin: [0, 0, 0], axisDirection: [0, 0, 1] } },
      ],
      expected: 'one',
      source: 'explicit',
      stability: 'explicit',
      diagnostics: [],
    };
    const rejected = prove({ kind: 'coaxial', subject: explicit, target: centerBoreAxis() });
    expect(rejected.verdict).toBe('unsupported');
    expect(rejected.diagnostics[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
    expect(rejected.diagnostics[0]?.message).toContain('evidence policy');
  });

  it('should return unsupported for multi-entity endpoints instead of picking one', () => {
    const group = resolve('cubeA.bore[*]', index);
    expect(group.status).toBe('resolved');
    expect(group.entities.length).toBeGreaterThan(1);
    const unsupported = prove({ kind: 'parallel', subject: group, target: centerBoreAxis() });
    expect(unsupported.verdict).toBe('unsupported');
    expect(unsupported.diagnostics[0]?.message).toContain('exactly one entity');
  });

  it('should report unsupported for a minContactArea subject that exposes no samplable face', () => {
    // A whole-occurrence subject carries no single-face area/bounds to sample,
    // so the patch cannot be estimated — an honest unsupported before any
    // native classification (the throwing native proves no call is made).
    const unsupported = proveContact({
      subject: resolved({ kind: 'occurrence', name: 'cubeA' }),
      target: resolved({ kind: 'occurrence', name: 'cubeB' }),
      expectation: { kind: 'contact', subject: 's', target: 't', minContactArea: 20 },
      context,
    });
    expect(unsupported.verdict).toBe('unsupported');
    expect(unsupported.final).toBeUndefined();
    expect(unsupported.diagnostics[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
    expect(unsupported.diagnostics[0]?.message).toContain('samplable face');
  });
});
