import { describe, expect, it } from 'vitest';
import { boxContext, boxFacts, boxSelection, boxWorld } from '#proofs/testing/box-world.js';
import type { Box } from '#proofs/testing/box-world.js';
import {
  broadPhase,
  containmentSamples,
  foldedAngleDegrees,
  insertionStations,
  proveClearance,
  proveCoaxial,
  proveContact,
  proveContainment,
  proveCoplanar,
  proveDirectionAngle,
  proveInsertion,
  proveInterference,
  proveRelationship,
  resolveEndpoints,
} from '#proofs/relationship-proofs.js';
import type { RelationshipProofContext } from '#proofs/relationship-proofs.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import type { GeometryFacts, GeometrySelection } from '#selector/types.js';
import { selectorLabel } from '#proofs/context.js';

const unitBox: Box = { min: [0, 0, 0], max: [10, 10, 10] };
const farBox: Box = { min: [30, 0, 0], max: [40, 10, 10] };
const overlapBox: Box = { min: [8, 0, 0], max: [18, 10, 10] };

const prove = (
  expectation: GeoSpecSpatialRelationshipExpectation,
  options?: {
    boxes?: Box[];
    subject?: GeometrySelection;
    target?: GeometrySelection;
    context?: Partial<RelationshipProofContext>;
  },
) => {
  const boxes = options?.boxes ?? [unitBox, farBox];
  const context = boxContext(boxes, options?.context);
  return proveRelationship({
    subject: options?.subject ?? boxSelection(0, boxFacts(boxes[0]!)),
    target: options?.target ?? boxSelection(1, boxFacts(boxes[1]!)),
    expectation,
    context,
  });
};

describe('endpoint resolution and the evidence policy', () => {
  it('should render structured selectors as JSON in diagnostics', () => {
    expect(selectorLabel({ occurrence: 'head', face: 'mount' })).toBe('{"occurrence":"head","face":"mount"}');
  });

  it('should refuse an explicit fixture selection by stability', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'a', target: 'b' },
      { subject: boxSelection(0, boxFacts(unitBox), { stability: 'explicit' }) },
    );
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
    expect(evidence.diagnostics[0]?.message).toContain('evidence policy rejects');
  });

  it('should refuse an explicit fixture selection by source', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'a', target: 'b' },
      { target: boxSelection(1, boxFacts(farBox), { source: 'explicit' }) },
    );
    expect(evidence.verdict).toBe('unsupported');
    expect((evidence.diagnostics[0]?.details as { role: string } | undefined)?.role).toBe('target');
  });

  it('should refuse an unresolved selection', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'a', target: 'b' },
      { subject: boxSelection(0, boxFacts(unitBox), { status: 'ambiguous' }) },
    );
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain("status 'ambiguous'");
  });

  it('should refuse an entity whose occurrence the XDE structure does not know', () => {
    const selection = boxSelection(0, boxFacts(unitBox));
    selection.entities[0]!.occurrencePath = 'ghost';
    expect(prove({ kind: 'contact', subject: 'a', target: 'b' }, { subject: selection }).verdict).toBe('unsupported');
  });

  it('should refuse an entity with no occurrence path at all', () => {
    const selection = boxSelection(0, boxFacts(unitBox));
    delete selection.entities[0]!.occurrencePath;
    expect(prove({ kind: 'contact', subject: 'a', target: 'b' }, { subject: selection }).verdict).toBe('unsupported');
  });

  it('should refuse a selection that resolved to nothing', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'a', target: 'b' },
      { subject: boxSelection(0, boxFacts(unitBox), { entities: [] }) },
    );
    expect(evidence.diagnostics[0]?.message).toContain('no entities');
  });

  it('should resolve a face entity to its located face operand', () => {
    const context = boxContext([unitBox]);
    const resolved = resolveEndpoints(boxSelection(0, { ...boxFacts(unitBox), faceIndex: 7 }), context, 'subject');
    if (!('endpoints' in resolved)) {
      throw new Error('the face endpoint must resolve');
    }
    expect(resolved.endpoints).toHaveLength(1);
    expect(resolved.endpoints[0]?.occurrence).toBe(0);
    expect(resolved.endpoints[0]?.face).toBe(7);
  });
});

describe('the AABB broad phase', () => {
  it('should stay a candidate when an endpoint carries no bounds', () => {
    const record = broadPhase([{ occurrence: 0, face: -1, facts: {} }], [{ occurrence: 1, face: -1, facts: {} }], 0);
    expect(record.candidate).toBe(true);
    expect(record.detail).toContain('no bounds');
  });

  it('should measure the gap over the union of every entity bound', () => {
    const record = broadPhase(
      [
        { occurrence: 0, face: -1, facts: boxFacts(unitBox) },
        { occurrence: 0, face: -1, facts: {} },
      ],
      [{ occurrence: 1, face: -1, facts: boxFacts(farBox) }],
      0.02,
    );
    expect(record.candidate).toBe(false);
    expect(record.detail).toContain('20.0000');
  });

  it('should call an overlapping pair a candidate', () => {
    expect(
      broadPhase(
        [{ occurrence: 0, face: -1, facts: boxFacts(unitBox) }],
        [{ occurrence: 1, face: -1, facts: boxFacts(overlapBox) }],
        0,
      ).candidate,
    ).toBe(true);
  });
});

describe('contact', () => {
  it('should pass inside the tolerance with witnesses on both operands', () => {
    const evidence = prove({ kind: 'contact', subject: 'a', target: 'b', tolerance: 25 });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('extrema');
    expect(evidence.final?.witnesses).toHaveLength(2);
  });

  it('should fail beyond the tolerance and place the diagnostic between the witnesses', () => {
    const evidence = prove({ kind: 'contact', subject: 'a', target: 'b' });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.spatial?.center).toEqual([20, 5, 5]);
  });

  it('should default the tolerance to the shared linear tolerance', () => {
    expect(prove({ kind: 'contact', subject: 'a', target: 'b' }).final?.expected['tolerance']).toBe(0.02);
  });

  it('should answer unsupported when the exact extrema crossing fails', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'a', target: 'b' },
      { context: { native: boxWorld([unitBox, farBox], { fail: true }) } },
    );
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain('did not converge');
  });

  it('should reject a tilted planar face before a near-zero witness can pass', () => {
    const radians = Math.PI / 180;
    const face = (normal: [number, number, number]): GeometryFacts => ({
      faceIndex: 0,
      surfaceType: 'plane',
      normal,
      offset: normal[2] * 10,
      area: 100,
      centroid: [5, 5, 10],
      bounds: { min: [0, 0, 10], max: [10, 10, 10] },
    });
    const evidence = proveContact({
      subject: boxSelection(0, face([0, Math.sin(radians), Math.cos(radians)])),
      target: boxSelection(1, face([0, 0, -1])),
      expectation: {
        kind: 'contact',
        subject: 'runnerFlange.mount',
        target: 'head.port.mount',
        tolerance: 0.02,
        angularToleranceDegrees: 0.5,
      },
      context: boxContext([unitBox, unitBox]),
    });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['normalAngle']).toBeCloseTo(1, 9);
    expect(evidence.final?.measured['maxSeparationBound']).toBeGreaterThan(0.02);
    expect(evidence.diagnostics[0]?.message).toContain('runnerFlange.mount');
  });

  it('should refuse planar seating without complete positive-area face facts', () => {
    const incomplete: GeometryFacts = {
      faceIndex: 0,
      surfaceType: 'plane',
      normal: [0, 0, 1],
      offset: 10,
      centroid: [5, 5, 10],
      bounds: { min: [0, 0, 10], max: [10, 10, 10] },
      area: 0,
    };
    const evidence = proveContact({
      subject: boxSelection(0, incomplete),
      target: boxSelection(1, { ...incomplete, normal: [0, 0, -1], area: 100 }),
      expectation: { kind: 'contact', subject: 'a', target: 'b' },
      context: boxContext([unitBox, unitBox]),
    });
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain('positive-area');
  });

  it('should derive a missing subject-plane offset from its centroid', () => {
    const face = (normal: [number, number, number]): GeometryFacts => ({
      faceIndex: 0,
      surfaceType: 'plane',
      normal,
      area: 100,
      centroid: [5, 5, 10],
      bounds: { min: [0, 0, 10], max: [10, 10, 10] },
    });
    const radians = Math.PI / 180;
    const subjectNormal: [number, number, number] = [0, Math.sin(radians), Math.cos(radians)];
    const evidence = proveContact({
      subject: boxSelection(0, face(subjectNormal)),
      target: boxSelection(1, { ...face([0, 0, -1]), offset: -10 }),
      expectation: { kind: 'contact', subject: 'a', target: 'b' },
      context: boxContext([unitBox, unitBox]),
    });
    expect(evidence.final?.witnesses[0]?.kind).toBe('plane');
    expect(evidence.final?.witnesses[0]?.value[3]).toBeCloseTo(subjectNormal[1] * 5 + subjectNormal[2] * 10, 12);
  });

  it('should reject a degenerate planar normal without dividing by zero', () => {
    const facts: GeometryFacts = {
      faceIndex: 0,
      surfaceType: 'plane',
      normal: [0, 0, 0],
      offset: 0,
      area: 100,
      centroid: [5, 5, 10],
      bounds: { min: [0, 0, 10], max: [10, 10, 10] },
    };
    const evidence = proveContact({
      subject: boxSelection(0, facts),
      target: boxSelection(1, { ...facts, normal: [0, 0, -1], offset: -10 }),
      expectation: { kind: 'contact', subject: 'a', target: 'b' },
      context: boxContext([unitBox, unitBox]),
    });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['normalAngle']).toBe(90);
  });
});

describe('clearance', () => {
  it('should pass inside the declared band', () => {
    const evidence = proveClearance({
      subject: boxSelection(0, boxFacts(unitBox)),
      target: boxSelection(1, boxFacts(farBox)),
      expectation: { kind: 'clearance', subject: 'a', target: 'b', min: 19, max: 21 },
      context: boxContext([unitBox, farBox]),
    });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.expected).toEqual({ min: 19, max: 21 });
  });

  it('should name a too-tight fit', () => {
    const evidence = prove({ kind: 'clearance', subject: 'a', target: 'b', min: 30, tolerance: 0.5 });
    expect(evidence.diagnostics[0]?.message).toContain('too tight');
    expect(evidence.final?.expected).toEqual({ min: 30, tolerance: 0.5 });
  });

  it('should name a too-loose fit', () => {
    expect(prove({ kind: 'clearance', subject: 'a', target: 'b', max: 5 }).diagnostics[0]?.message).toContain(
      'too loose',
    );
  });

  it('should answer unsupported when the exact extrema crossing fails', () => {
    const evidence = prove(
      { kind: 'clearance', subject: 'a', target: 'b', min: 1 },
      { context: { native: boxWorld([unitBox, farBox], { fail: true }) } },
    );
    expect(evidence.verdict).toBe('unsupported');
  });
});

const axisFacts = (origin: [number, number, number], direction: [number, number, number]): GeometryFacts => ({
  surfaceType: 'cylinder',
  axisOrigin: origin,
  axisDirection: direction,
  radius: 1,
  bounds: unitBox,
});

describe('coaxial', () => {
  const coaxial = (
    subject: GeometryFacts,
    target: GeometryFacts,
    expectation?: Partial<GeoSpecSpatialRelationshipExpectation>,
  ) =>
    proveCoaxial({
      subject: boxSelection(0, subject),
      target: boxSelection(1, target),
      expectation: { kind: 'coaxial', subject: 'a', target: 'b', ...expectation },
      context: boxContext([unitBox, farBox]),
    });

  it('should refuse endpoints with no analytic axis', () => {
    expect(coaxial(boxFacts(unitBox), axisFacts([0, 0, 0], [0, 0, 1])).verdict).toBe('unsupported');
  });

  it('should pass two collinear axes', () => {
    const evidence = coaxial(axisFacts([0, 0, 0], [0, 0, 1]), axisFacts([0, 0, 5], [0, 0, 1]));
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['radialOffset']).toBeCloseTo(0, 12);
    expect(evidence.final?.witnesses[0]?.kind).toBe('axis');
  });

  it('should fail an offset axis and report the radial offset', () => {
    const evidence = coaxial(axisFacts([0, 0, 0], [0, 0, 1]), axisFacts([0.5, 0, 0], [0, 0, 1]));
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['radialOffset']).toBeCloseTo(0.5, 12);
  });

  it('should fail a tilted axis inside the radial band', () => {
    const evidence = coaxial(axisFacts([0, 0, 0], [0, 0, 1]), axisFacts([0, 0, 0], [0, 0.1, 1]));
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['angle']).toBeGreaterThan(0.5);
  });

  it('should tolerate a degenerate axis direction without dividing by zero', () => {
    const evidence = coaxial(axisFacts([0, 0, 0], [0, 0, 0]), axisFacts([0, 0, 0], [0, 0, 0]));
    expect(Number.isFinite(evidence.final?.measured['radialOffset'] ?? Number.NaN)).toBe(true);
  });
});

const planeFacts = (normal: [number, number, number], offset: number): GeometryFacts => ({
  surfaceType: 'plane',
  normal,
  offset,
  centroid: [0, 0, offset],
  bounds: unitBox,
});

describe('coplanar', () => {
  const coplanar = (subject: GeometryFacts, target: GeometryFacts) =>
    proveCoplanar({
      subject: boxSelection(0, subject),
      target: boxSelection(1, target),
      expectation: { kind: 'coplanar', subject: 'a', target: 'b' },
      context: boxContext([unitBox, farBox]),
    });

  it('should refuse endpoints with no analytic plane', () => {
    expect(coplanar(boxFacts(unitBox), planeFacts([0, 0, 1], 0)).verdict).toBe('unsupported');
  });

  it('should pass identical planes', () => {
    expect(coplanar(planeFacts([0, 0, 1], 4), planeFacts([0, 0, 1], 4)).verdict).toBe('pass');
  });

  it('should pass opposed normals describing the same plane', () => {
    const evidence = coplanar(planeFacts([0, 0, 1], 4), planeFacts([0, 0, -1], -4));
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['offsetDelta']).toBeCloseTo(0, 12);
  });

  it('should fail a parallel plane at a different offset', () => {
    const evidence = coplanar(planeFacts([0, 0, 1], 4), planeFacts([0, 0, 1], 6));
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.witnesses[0]?.kind).toBe('plane');
  });
});

describe('direction angle', () => {
  const angle = (options: {
    kind: 'parallel' | 'perpendicular' | 'angle';
    subject: GeometryFacts;
    target: GeometryFacts;
    angleDegrees?: number;
  }) =>
    proveDirectionAngle({
      subject: boxSelection(0, options.subject),
      target: boxSelection(1, options.target),
      expectation: {
        kind: options.kind,
        subject: 'a',
        target: 'b',
        ...(options.angleDegrees === undefined ? {} : { angleDegrees: options.angleDegrees }),
      },
      context: boxContext([unitBox, farBox]),
    });

  it('should refuse endpoints with no analytic direction', () => {
    expect(angle({ kind: 'parallel', subject: boxFacts(unitBox), target: planeFacts([0, 0, 1], 0) }).verdict).toBe(
      'unsupported',
    );
  });

  it('should pass parallel plane normals', () => {
    expect(
      angle({ kind: 'parallel', subject: planeFacts([0, 0, 1], 0), target: planeFacts([0, 0, 1], 9) }).verdict,
    ).toBe('pass');
  });

  it('should pass a perpendicular pair', () => {
    expect(
      angle({ kind: 'perpendicular', subject: planeFacts([0, 0, 1], 0), target: planeFacts([1, 0, 0], 0) }).verdict,
    ).toBe('pass');
  });

  it('should fail a declared angle the geometry does not meet', () => {
    const evidence = angle({
      kind: 'angle',
      subject: planeFacts([0, 0, 1], 0),
      target: planeFacts([1, 0, 0], 0),
      angleDegrees: 30,
    });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['deviation']).toBeCloseTo(60, 9);
  });

  it('should read a datum frame z axis when no surface direction exists', () => {
    const datum: GeometryFacts = { zAxis: [0, 0, 1], bounds: unitBox };
    expect(angle({ kind: 'parallel', subject: datum, target: datum }).verdict).toBe('pass');
  });

  it('should fold a zero-length direction to a zero angle', () => {
    expect(foldedAngleDegrees([0, 0, 0], [0, 0, 1])).toBe(0);
  });
});

describe('containment', () => {
  it('should pass when every exact sample classifies inside the target', () => {
    const evidence = prove(
      { kind: 'containment', subject: 'a', target: 'b' },
      {
        boxes: [{ min: [2, 2, 2], max: [8, 8, 8] }, unitBox],
        subject: boxSelection(0, boxFacts({ min: [2, 2, 2], max: [8, 8, 8] })),
        target: boxSelection(1, boxFacts(unitBox)),
      },
    );
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['outside']).toBe(0);
  });

  it('should fail with an outside witness and place the diagnostic on it', () => {
    const evidence = prove({ kind: 'containment', subject: 'a', target: 'b' });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    expect(evidence.diagnostics[0]?.spatial?.center).toBeDefined();
  });

  it('should take the best of a multi-solid target', () => {
    const inner = { min: [2, 2, 2], max: [8, 8, 8] } satisfies Box;
    const context = boxContext([inner, farBox, unitBox]);
    const evidence = proveContainment({
      subject: boxSelection(0, boxFacts(inner)),
      target: {
        ...boxSelection(1, boxFacts(farBox)),
        entities: [
          { id: 'far', entityType: 'occurrence', occurrencePath: 'box1', facts: boxFacts(farBox) },
          { id: 'host', entityType: 'occurrence', occurrencePath: 'box2', facts: boxFacts(unitBox) },
        ],
      },
      expectation: { kind: 'containment', subject: 'a', target: 'b' },
      context,
    });
    expect(evidence.verdict).toBe('pass');
  });

  it('should refuse a subject with no analytic samples', () => {
    const evidence = prove({ kind: 'containment', subject: 'a', target: 'b' }, { subject: boxSelection(0, {}) });
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain('analytic sample points');
  });

  it('should answer unsupported when the exact classification fails', () => {
    const evidence = prove(
      { kind: 'containment', subject: 'a', target: 'b' },
      { context: { native: boxWorld([unitBox, farBox], { fail: true }) } },
    );
    expect(evidence.verdict).toBe('unsupported');
  });

  it('should sample a planar face on its own plane, nine points', () => {
    const context = boxContext([unitBox]);
    const samples = containmentSamples({ occurrence: 0, face: 3, facts: planeFacts([0, 0, 1], 4) }, context);
    expect(samples).toHaveLength(9);
    expect(samples.every((sample) => Math.abs(sample[2] - 4) < 1e-12)).toBe(true);
  });

  it('should sample a face with no bounds by its centroid alone', () => {
    const context = boxContext([unitBox]);
    expect(containmentSamples({ occurrence: 0, face: 3, facts: { centroid: [1, 2, 3] } }, context)).toEqual([
      [1, 2, 3],
    ]);
    expect(containmentSamples({ occurrence: 0, face: 3, facts: {} }, context)).toEqual([]);
  });

  it('should sample a non-planar face by its inset bounds corners', () => {
    const context = boxContext([unitBox]);
    const samples = containmentSamples(
      { occurrence: 0, face: 3, facts: { centroid: [5, 5, 5], bounds: unitBox } },
      context,
    );
    expect(samples).toHaveLength(9);
  });

  it('should sample an occurrence by its face centroids plus inset corners', () => {
    const context = boxContext([unitBox, farBox]);
    context.index.faces.push({
      id: 'face:box0#0',
      occurrencePath: 'box0',
      faceIndex: 0,
      topologyRef: '#o1.f0',
      facts: { faceIndex: 0, surfaceType: 'plane', area: 1, centroid: [5, 5, 0], bounds: unitBox },
    });
    expect(containmentSamples({ occurrence: 0, face: -1, facts: boxFacts(unitBox) }, context)).toHaveLength(9);
    expect(containmentSamples({ occurrence: 0, face: -1, facts: {} }, context)).toHaveLength(1);
  });
});

describe('insertion', () => {
  it('should measure a full engaged span along the declared axis', () => {
    const evidence = prove(
      { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], min: 9, max: 11 },
      { boxes: [unitBox, unitBox], target: boxSelection(1, boxFacts(unitBox)) },
    );
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['depth']).toBeCloseTo(10, 6);
    expect(evidence.final?.witnesses).toHaveLength(2);
  });

  it('should report a disengaged pair as zero depth', () => {
    const evidence = prove({ kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], min: 1 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['depth']).toBe(0);
    expect(evidence.final?.witnesses).toEqual([]);
  });

  it('should refuse a claim with no declared axis', () => {
    expect(prove({ kind: 'insertion', subject: 'a', target: 'b' }).verdict).toBe('unsupported');
  });

  it('should refuse a claim whose subject has no bounds', () => {
    expect(
      prove({ kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0] }, { subject: boxSelection(0, {}) })
        .verdict,
    ).toBe('unsupported');
  });

  it('should refuse a degenerate axis', () => {
    const evidence = prove({ kind: 'insertion', subject: 'a', target: 'b', axis: [0, 0, 0] });
    expect(evidence.diagnostics[0]?.message).toContain('degenerate');
  });

  it('should answer unsupported when the exact classification fails', () => {
    const evidence = prove(
      { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0] },
      { context: { native: boxWorld([unitBox, farBox], { fail: true }) } },
    );
    expect(evidence.verdict).toBe('unsupported');
  });

  it('should pin the station count', () => {
    expect(insertionStations).toBe(64);
  });

  it('should charge one station of span per engaged station', () => {
    const evidence = proveInsertion({
      subject: boxSelection(0, boxFacts({ min: [0, 0, 0], max: [20, 10, 10] })),
      target: boxSelection(1, boxFacts(unitBox)),
      expectation: { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], min: 9, max: 11 },
      context: boxContext([{ min: [0, 0, 0], max: [20, 10, 10] }, unitBox]),
    });
    expect(evidence.final?.measured['depth']).toBeCloseTo(10, 1);
  });
});

describe('interference', () => {
  it('should pass a separated pair at exactly zero common volume', () => {
    const evidence = prove({ kind: 'interference', subject: 'a', target: 'b' });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('boolean-intersection');
    expect(evidence.final?.measured['volume']).toBe(0);
    expect(evidence.final?.expected).toEqual({ minVolume: 0, maxVolume: 0 });
  });

  it('should fail an overlap outside the declared allowance and witness its centroid', () => {
    const evidence = prove(
      { kind: 'interference', subject: 'a', target: 'b' },
      { boxes: [unitBox, overlapBox], target: boxSelection(1, boxFacts(overlapBox)) },
    );
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    expect(evidence.diagnostics[0]?.suggestion).toContain('Relieve');
  });

  it('should fail a declared press fit the geometry does not deliver', () => {
    const evidence = prove({ kind: 'interference', subject: 'a', target: 'b', minVolume: 1, maxVolume: 5 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.suggestion).toContain('Increase');
  });

  it('should pass an overlap inside the declared allowance', () => {
    const evidence = prove(
      { kind: 'interference', subject: 'a', target: 'b', minVolume: 100, maxVolume: 300 },
      { boxes: [unitBox, overlapBox], target: boxSelection(1, boxFacts(overlapBox)) },
    );
    expect(evidence.verdict).toBe('pass');
  });

  it('should answer unsupported when the exact boolean fails', () => {
    const evidence = prove(
      { kind: 'interference', subject: 'a', target: 'b' },
      { context: { native: boxWorld([unitBox, farBox], { fail: true }) } },
    );
    expect(evidence.verdict).toBe('unsupported');
  });
});

describe('dispatch', () => {
  it('should thread forensic observation through every exact native proof crossing', () => {
    const forensic = (): void => undefined;
    expect(prove({ kind: 'contact', subject: 'a', target: 'b' }, { context: { forensic } }).verdict).toBe('fail');
    expect(
      prove(
        { kind: 'containment', subject: 'a', target: 'b' },
        {
          boxes: [{ min: [2, 2, 2], max: [8, 8, 8] }, unitBox],
          target: boxSelection(1, boxFacts(unitBox)),
          context: { forensic },
        },
      ).verdict,
    ).toBe('pass');
    expect(
      prove(
        { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], min: 9 },
        { boxes: [unitBox, unitBox], target: boxSelection(1, boxFacts(unitBox)), context: { forensic } },
      ).verdict,
    ).toBe('pass');
    expect(
      prove(
        { kind: 'interference', subject: 'a', target: 'b' },
        { boxes: [unitBox, overlapBox], target: boxSelection(1, boxFacts(overlapBox)), context: { forensic } },
      ).verdict,
    ).toBe('fail');
  });

  it('should route every expectation kind to its proof', () => {
    const kinds: Array<GeoSpecSpatialRelationshipExpectation['kind']> = [
      'contact',
      'clearance',
      'coaxial',
      'concentric',
      'coplanar',
      'containment',
      'insertion',
      'interference',
      'parallel',
      'perpendicular',
      'angle',
    ];
    for (const kind of kinds) {
      expect(prove({ kind, subject: 'a', target: 'b' }).verdict).toBeTypeOf('string');
    }
  });

  it('should keep the named proofs reachable directly', () => {
    const context = boxContext([unitBox, farBox]);
    const input = {
      subject: boxSelection(0, boxFacts(unitBox)),
      target: boxSelection(1, boxFacts(farBox)),
      context,
    };
    expect(proveContact({ ...input, expectation: { kind: 'contact', subject: 'a', target: 'b' } }).verdict).toBe(
      'fail',
    );
    expect(
      proveInterference({ ...input, expectation: { kind: 'interference', subject: 'a', target: 'b' } }).verdict,
    ).toBe('pass');
  });
});

describe('every proof refuses an endpoint the evidence policy rejects', () => {
  const refused = boxSelection(0, boxFacts(unitBox), { stability: 'explicit' });
  const input = {
    subject: refused,
    target: boxSelection(1, boxFacts(farBox)),
    context: boxContext([unitBox, farBox]),
  };

  it('should refuse through every named proof', () => {
    const proofs = [
      [proveClearance, 'clearance'],
      [proveCoaxial, 'coaxial'],
      [proveCoplanar, 'coplanar'],
      [proveDirectionAngle, 'parallel'],
      [proveContainment, 'containment'],
      [proveInsertion, 'insertion'],
      [proveInterference, 'interference'],
    ] as const;
    for (const [proof, kind] of proofs) {
      expect(proof({ ...input, expectation: { kind, subject: 'a', target: 'b' } }).verdict).toBe('unsupported');
    }
  });
});

describe('multi-operand reduction', () => {
  it('should keep the nearest pair when a later pair is farther', () => {
    const near = { min: [11, 0, 0], max: [12, 10, 10] } satisfies Box;
    const context = boxContext([unitBox, near, farBox]);
    const evidence = proveContact({
      subject: boxSelection(0, boxFacts(unitBox)),
      target: {
        ...boxSelection(1, boxFacts(near)),
        entities: [
          { id: 'near', entityType: 'occurrence', occurrencePath: 'box1', facts: boxFacts(near) },
          { id: 'far', entityType: 'occurrence', occurrencePath: 'box2', facts: boxFacts(farBox) },
        ],
      },
      expectation: { kind: 'contact', subject: 'a', target: 'b', tolerance: 5 },
      context,
    });
    expect(evidence.final?.measured['distance']).toBeCloseTo(1, 9);
  });

  it('should keep the best-containing solid when a later target contains less', () => {
    const inner = { min: [2, 2, 2], max: [8, 8, 8] } satisfies Box;
    const context = boxContext([inner, unitBox, farBox]);
    const evidence = proveContainment({
      subject: boxSelection(0, boxFacts(inner)),
      target: {
        ...boxSelection(1, boxFacts(unitBox)),
        entities: [
          { id: 'host', entityType: 'occurrence', occurrencePath: 'box1', facts: boxFacts(unitBox) },
          { id: 'far', entityType: 'occurrence', occurrencePath: 'box2', facts: boxFacts(farBox) },
        ],
      },
      expectation: { kind: 'containment', subject: 'a', target: 'b' },
      context,
    });
    expect(evidence.verdict).toBe('pass');
  });
});

describe('insertion detail', () => {
  it('should report a partial engagement with a witness and no declared band', () => {
    const long = { min: [0, 0, 0], max: [30, 10, 10] } satisfies Box;
    const evidence = proveInsertion({
      subject: boxSelection(0, boxFacts(long)),
      target: boxSelection(1, boxFacts(unitBox)),
      expectation: { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], max: 2 },
      context: boxContext([long, unitBox], { subjectContentHash: 'sha256:a' }),
    });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.expected).toEqual({ max: 2 });
    expect(evidence.diagnostics[0]?.spatial?.center).toBeDefined();
  });

  it('should still measure depth when the exact extrema refuses', () => {
    const evidence = proveInsertion({
      subject: boxSelection(0, boxFacts(unitBox)),
      target: boxSelection(1, boxFacts(unitBox)),
      expectation: { kind: 'insertion', subject: 'a', target: 'b', axis: [1, 0, 0], min: 9 },
      context: boxContext([unitBox, unitBox], { native: boxWorld([unitBox, unitBox], { failExtrema: true }) }),
    });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['distance']).toBeUndefined();
  });
});

describe('containment against a bore region (cylindrical-face target)', () => {
  /** A cylindrical face along +X: radius `r`, spanning `[from, to]`. */
  const cylinder = (options: {
    radius: number;
    from: number;
    to: number;
    y?: number;
    axis?: [number, number, number];
  }): GeometryFacts => {
    const y = options.y ?? 0;
    const axis = options.axis ?? ([1, 0, 0] as [number, number, number]);
    const along = (t: number, component: number): number => axis[component]! * t;
    const min: [number, number, number] = [0, 1, 2].map(
      (component) =>
        Math.min(along(options.from, component), along(options.to, component)) -
        (axis[component] === 0 ? options.radius : 0) +
        (component === 1 ? y : 0),
    ) as [number, number, number];
    const max: [number, number, number] = [0, 1, 2].map(
      (component) =>
        Math.max(along(options.from, component), along(options.to, component)) +
        (axis[component] === 0 ? options.radius : 0) +
        (component === 1 ? y : 0),
    ) as [number, number, number];
    return {
      surfaceType: 'cylinder',
      axisOrigin: [0, y, 0],
      axisDirection: axis,
      radius: options.radius,
      bounds: { min, max },
      faceIndex: 0,
    };
  };

  const containment = (subject: GeometrySelection, target: GeometrySelection) =>
    proveContainment({
      subject,
      target,
      expectation: { kind: 'containment', subject: 'pin', target: 'bore' },
      context: boxContext([unitBox, unitBox]),
    });

  const bore = boxSelection(1, cylinder({ radius: 11.03, from: -30, to: -14 }));

  it('should pass a pin that fits the bore and engages it', () => {
    const evidence = containment(boxSelection(0, cylinder({ radius: 11, from: -32, to: 32 })), bore);
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('analytic');
    expect(evidence.final?.measured['engagement']).toBeCloseTo(16, 9);
  });

  it('should fail a pin that never reaches the bore', () => {
    const evidence = containment(boxSelection(0, cylinder({ radius: 11, from: 40, to: 60 })), bore);
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.message).toContain('never enters the bore');
  });

  it('should fail a pin that overruns the bore radius', () => {
    const evidence = containment(boxSelection(0, cylinder({ radius: 12, from: -32, to: 32 })), bore);
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.message).toContain('overruns the bore radius');
  });

  it('should refuse a subject that is not a coaxial analytic cylinder', () => {
    const evidence = containment(boxSelection(0, boxFacts(unitBox)), bore);
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain('coaxial analytic cylinder');
  });

  it('should refuse a multi-face subject against one bore', () => {
    const grouped = boxSelection(0, cylinder({ radius: 11, from: -32, to: 32 }));
    const evidence = containment({ ...grouped, entities: [grouped.entities[0]!, grouped.entities[0]!] }, bore);
    expect(evidence.verdict).toBe('unsupported');
    expect(evidence.diagnostics[0]?.message).toContain('exactly one subject operand');
  });

  it('should measure insertion depth as the bore-region engagement', () => {
    const evidence = proveInsertion({
      subject: boxSelection(0, cylinder({ radius: 11, from: -32, to: 32 })),
      target: bore,
      expectation: { kind: 'insertion', subject: 'pin', target: 'bore', axis: [1, 0, 0], min: 15, max: 17 },
      context: boxContext([unitBox, unitBox]),
    });
    expect(evidence.final?.method).toBe('analytic');
    expect(evidence.final?.measured['depth']).toBeCloseTo(16, 1);
    expect(evidence.verdict).toBe('pass');
  });
});
