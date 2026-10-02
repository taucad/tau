import { expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient } from '#assertion-client/index.js';
import type { GeoSpecNativeEngine, MinimumDistanceQuery } from '#assertion-client/index.js';

const hash = 'a'.repeat(64);
const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const query: MinimumDistanceQuery = {
  capability: 'minimumDistance',
  subject: { subjectHash: hash },
  payload: { pair: [{ occurrencePath: 'assembly.A' }, { occurrencePath: 'assembly.B' }] },
};

const engine = (profile?: string, invalidSelection = false): GeoSpecNativeEngine & { calls: number } => ({
  calls: 0,
  processRequest() {
    return encode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        protocolVersion: 3,
        registryVersion: 5,
        configuration: { configurationProfile: 'geospec-entry-config-v1', defaultWorkUnitBudget: 100 },
        capabilities:
          profile === undefined
            ? []
            : [
                {
                  name: 'minimumDistance',
                  profile,
                  implementation: 'implemented',
                  registryVersion: 5,
                },
              ],
      },
    });
  },
  evaluateClaim(request) {
    this.calls += 1;
    const plan = JSON.parse(new TextDecoder().decode(request)) as { plan: { claims: [{ claimId: string }] } };
    const claim = plan.plan.claims[0];
    return {
      canonicalClaim: encode({ claimId: claim.claimId }),
      canonicalPlan: encode(plan),
      canonicalResult: encode({
        results: [
          {
            claimId: claim.claimId,
            status: invalidSelection ? 'refused' : 'passed',
            diagnostics: invalidSelection
              ? [{ code: 'GEOSPEC_INVALID_SELECTION', message: 'Unknown occurrence path.' }]
              : [],
            evidence: {
              profile: 'geospec-minimum-distance-v1',
              fact: {
                source: 'ap242',
                assurance: 'exact-brep',
                unit: 'mm',
                coordinateSystem: 'z-up',
                subjectHash: hash,
                algorithmProfile: 'geospec-minimum-distance-v1',
                occurrences: ['assembly.A', 'assembly.B'],
                distance: 5,
                points: [
                  [1, -3, 2],
                  [6, -3, 2],
                ],
              },
            },
          },
        ],
      }),
    };
  },
});

it('maps an unknown native occurrence path to invalid-selection', async () => {
  const backend = engine('geospec-minimum-distance-v1', true);
  await expect(createGeoSpecAssertionClient({ engine: backend }).query(query)).resolves.toMatchObject({
    status: 'refused',
    code: 'invalid-selection',
  });
  expect(backend.calls).toBe(1);
});

it('refuses old and wrong-profile engines before submitting a minimum query', async () => {
  await Promise.all(
    [undefined, 'geospec-minimum-distance-v0'].map(async (profile) => {
      const backend = engine(profile);
      const result = await createGeoSpecAssertionClient({ engine: backend }).query(query);
      expect(result).toMatchObject({ status: 'refused', code: 'unsupported-evidence' });
      expect(backend.calls).toBe(0);
    }),
  );
});

it('accepts a complete advertised fact with ordered canonical witnesses', async () => {
  const backend = engine('geospec-minimum-distance-v1');
  const result = await createGeoSpecAssertionClient({ engine: backend }).query(query);
  expect(result).toStrictEqual({
    status: 'complete',
    fact: {
      source: 'ap242',
      assurance: 'exact-brep',
      unit: 'mm',
      coordinateSystem: 'z-up',
      subjectHash: hash,
      algorithmProfile: 'geospec-minimum-distance-v1',
      occurrences: ['assembly.A', 'assembly.B'],
      distance: 5,
      points: [
        [1, -3, 2],
        [6, -3, 2],
      ],
    },
  });
  expect(backend.calls).toBe(1);
});

it('refuses malformed and duplicate paths before touching the engine', async () => {
  await Promise.all(
    [
      [{ occurrencePath: 'assembly.A' }, { occurrencePath: 'assembly.A' }],
      [{ occurrencePath: 'assembly.A' }, { occurrencePath: '' }],
      [{ occurrencePath: 'assembly.A' }, {}],
      [{ occurrencePath: 'assembly.A' }],
    ].map(async (pair) => {
      const backend = engine('geospec-minimum-distance-v1');
      const malformed = { ...query, payload: { pair } } as unknown as MinimumDistanceQuery;
      await expect(createGeoSpecAssertionClient({ engine: backend }).query(malformed)).resolves.toMatchObject({
        status: 'refused',
        code: 'invalid-selection',
      });
      expect(backend.calls).toBe(0);
    }),
  );
});
