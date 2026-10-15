import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import type { TauCadTopologyPayload } from '#extensions/tau-cad-topology.types.js';
import { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';

const schema = JSON.parse(
  readFileSync(new URL('../../schema/tau-cad-topology.schema.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const fixture: TauCadTopologyPayload = {
  schemaVersion: 1,
  components: ['a', 'b'].map((id) => ({
    id,
    name: 'Repeated label',
    kind: 'part',
    selector: id,
    placement: identity,
    jointInterfaces: { mount: { kind: 'prismatic', frame: identity, ranges: { distance: { lower: 0 } } } },
  })),
  mechanismIntent: {
    schemaVersion: 1,
    units: { length: 'm', angle: 'deg' },
    ground: 'a',
    connections: [
      {
        id: 'connection',
        parent: { componentId: 'a', interfaceId: 'mount' },
        child: { componentId: 'b', interfaceId: 'mount' },
        coordinateChart: 'axis',
        referenceCoordinates: { distance: 0 },
      },
    ],
  },
  mechanismDiagnostics: [
    {
      code: 'UNSUPPORTED_MECHANISM',
      path: '/mechanismIntent',
      message: 'Unsupported mechanical loop',
      recovery: 'Retain intent for inspection',
    },
  ],
};
const bounds = { nodes: [], meshes: [] };

describe('physical mechanism intent', () => {
  it('should retain inspectable intent with an explicit unsupported outcome', () => {
    expect(validate(fixture)).toBe(true);
    expect(validateTauCadTopology(fixture, bounds)).toEqual([]);
    expect(validateTauCadTopology({ ...fixture, mechanismDiagnostics: [] }, bounds)).toContain(
      'mechanismIntent requires playback or an explicit unsupported diagnostic',
    );
  });
  it('should reject product hierarchy cycles without rejecting mechanical loops', () => {
    const cyclic = {
      ...fixture,
      components: fixture.components.map((component, index) => ({ ...component, parentId: index === 0 ? 'b' : 'a' })),
    };
    expect(validateTauCadTopology(cyclic, bounds).some((issue) => issue.includes('hierarchy cycle'))).toBe(true);
  });
  it('should validate both attachment frames and referenced interfaces', () => {
    const invalid: TauCadTopologyPayload = {
      ...fixture,
      components: [{ ...fixture.components[0]!, placement: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    };
    expect(validateTauCadTopology(invalid, bounds)).toEqual(
      expect.arrayContaining([
        'a placement must be a proper rigid frame',
        'mechanismIntent connection connection references missing interface b/mount',
      ]),
    );
    expect(validate({ ...fixture, mechanismIntent: { ...fixture.mechanismIntent, unexpected: true } })).toBe(false);
    expect(
      validate({
        ...fixture,
        components: [
          {
            ...fixture.components[0],
            jointInterfaces: {
              mount: { kind: 'spherical', frame: identity, ranges: { x: {}, y: {}, z: {} }, chart: 'intrinsic-xyz' },
            },
          },
        ],
      }),
    ).toBe(true);
  });
});

it('should reject malformed supplementary motion on unsupported physical graphs', () => {
  const base = fixture.mechanismIntent!;
  const intent = {
    ...base,
    connections: base.connections.map((connection) => ({ ...connection, playbackCoordinates: { distance: 'travel' } })),
  };
  const invalidCoupling = {
    ...fixture,
    mechanismIntent: { ...intent, couplings: [{ driver: 'travel', follower: 'travel', ratio: 0 }] },
  };
  expect(
    validateTauCadTopology(invalidCoupling, bounds).some((issue) =>
      issue.includes('mechanismIntent/couplings/0/ratio'),
    ),
  ).toBe(true);
  const invalidClip = {
    ...fixture,
    mechanismIntent: {
      ...intent,
      animations: [{ id: 'move', duration: 1, keyframes: [{ time: 2, coordinates: { travel: 1 } }] }],
    },
  };
  expect(
    validateTauCadTopology(invalidClip, bounds).some((issue) =>
      issue.includes('mechanismIntent/animations/0/keyframes/0/time'),
    ),
  ).toBe(true);
  const validClip = {
    ...fixture,
    mechanismIntent: {
      ...intent,
      animations: [{ id: 'move', duration: 1, keyframes: [{ time: 1, coordinates: { travel: 1 } }] }],
    },
  };
  expect(validateTauCadTopology(validClip, bounds)).toEqual([]);
});
