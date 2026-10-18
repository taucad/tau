import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import type { TauCadTopologyPayload } from '#extensions/tau-cad-topology.types.js';
import { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';

const schema = JSON.parse(
  readFileSync(new URL('../../schema/tau-cad-topology.schema.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const validate = new Ajv2020({ strict: true, allErrors: true }).compile<TauCadTopologyPayload>(schema);
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

describe('physical rigid-body ownership', () => {
  const components = [...fixture.components, { id: 'cover', name: 'Cover', kind: 'part', selector: 'cover' }];
  const intent = fixture.mechanismIntent!;
  const rigidBodies = { a: ['a', 'cover'], b: ['b'] };
  const unsupported: TauCadTopologyPayload = {
    ...fixture,
    components,
    mechanismIntent: { ...intent, rigidBodies },
  };
  const compiled: TauCadTopologyPayload = {
    ...unsupported,
    mechanism: {
      schemaVersion: 1,
      units: { length: 'm', angle: 'deg' },
      root: 'a',
      links: { a: { components: ['cover', 'a'] }, b: { components: ['b'] } },
      joints: {
        mount: {
          type: 'prismatic',
          parent: 'a',
          child: 'b',
          origin: [0, 0, 0],
          axis: [0, 0, 1],
        },
      },
    },
  };

  it('should preserve distinct passive ownership when a mechanical loop cannot compile', () => {
    const alternative: TauCadTopologyPayload = {
      ...unsupported,
      mechanismIntent: {
        ...intent,
        rigidBodies: { a: ['a'], b: ['b', 'cover'] },
      },
    };
    for (const payload of [unsupported, alternative]) {
      const serialized = JSON.stringify(payload);
      const reopened: unknown = JSON.parse(serialized);
      expect(validate(reopened)).toBe(true);
      if (!validate(reopened)) {
        throw new Error('Serialized rigid-body intent failed schema validation');
      }
      expect(validateTauCadTopology(reopened, bounds)).toEqual([]);
      expect(reopened.mechanism).toBeUndefined();
      expect(reopened.mechanismIntent?.rigidBodies).toEqual(payload.mechanismIntent?.rigidBodies);
    }
    expect(unsupported.mechanismIntent?.rigidBodies).not.toEqual(alternative.mechanismIntent?.rigidBodies);
  });

  it('should admit partial known ownership, empty body membership and legacy intent', () => {
    const knownBodies: Array<NonNullable<TauCadTopologyPayload['mechanismIntent']>['rigidBodies']> = [
      { a: ['a'] },
      { a: [] },
      {},
    ];
    for (const known of knownBodies) {
      const partial = {
        ...unsupported,
        mechanismIntent: { ...intent, rigidBodies: known },
      };
      expect(validate(partial)).toBe(true);
      expect(validateTauCadTopology(partial, bounds)).toEqual([]);
    }
    expect(validate(fixture)).toBe(true);
    expect(validateTauCadTopology(fixture, bounds)).toEqual([]);
  });

  it('should reject unknown bodies, unknown members and duplicate membership across bodies', () => {
    const invalid = {
      ...unsupported,
      mechanismIntent: {
        ...intent,
        rigidBodies: { virtual: ['missing'], a: ['cover'], b: ['cover'] },
      },
    };
    expect(validateTauCadTopology(invalid, bounds)).toEqual(
      expect.arrayContaining([
        'mechanismIntent rigid body virtual references missing component',
        'mechanismIntent rigid body virtual references missing member missing',
        'mechanismIntent rigid body member cover is assigned more than once',
      ]),
    );
  });

  it('should reject malformed membership and repeated members within one body', () => {
    for (const invalid of [{ a: 'cover' }, { a: [42] }, { a: ['cover', 'cover'] }]) {
      expect(
        validate({
          ...unsupported,
          mechanismIntent: { ...intent, rigidBodies: invalid },
        }),
      ).toBe(false);
    }
    expect(
      validateTauCadTopology(
        {
          ...unsupported,
          mechanismIntent: {
            ...intent,
            rigidBodies: { a: ['cover', 'cover'] },
          },
        },
        bounds,
      ),
    ).toContain('mechanismIntent rigid body member cover is assigned more than once');
  });

  it('should match declared membership to playback without requiring order or every body', () => {
    expect(validate(compiled)).toBe(true);
    expect(validateTauCadTopology(compiled, bounds)).toEqual([]);
    expect(
      validateTauCadTopology(
        {
          ...compiled,
          mechanismIntent: { ...intent, rigidBodies: { a: ['a', 'cover'] } },
        },
        bounds,
      ),
    ).toEqual([]);
  });

  it('should reject missing playback bodies and different membership with equal or unequal counts', () => {
    const declarations: Array<Readonly<Record<string, readonly string[]>>> = [
      { a: ['a'] },
      { a: ['a', 'b'] },
      { cover: [] },
    ];
    for (const declared of declarations) {
      const [body] = Object.keys(declared);
      expect(
        validateTauCadTopology(
          {
            ...compiled,
            mechanismIntent: { ...intent, rigidBodies: declared },
          },
          bounds,
        ),
      ).toContain(`mechanismIntent rigid body ${body} membership differs from its playback link`);
    }
  });
});

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
