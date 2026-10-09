import { describe, expect, it, vi } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import {
  createGeoSpecAssertionClient,
  evaluateGeoSpecNativeQuery,
  GeoSpecAssertionError,
} from '#assertion-client/index.js';
import type { GeoSpecNativeEngine } from '#assertion-client/index.js';

const subject = { subjectHash: 'a'.repeat(64) };
const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array<ArrayBuffer>): Record<string, JSONValue> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, JSONValue>;

// This double records host transport only; it does not canonicalize or evaluate geometry.
const recordingEngine = (status = 'passed') => {
  const requests: Array<Record<string, JSONValue>> = [];
  const plans: Array<Uint8Array<ArrayBuffer>> = [];
  const results: Array<Uint8Array<ArrayBuffer>> = [];
  const engine: GeoSpecNativeEngine = {
    evaluateClaim(request) {
      requests.push(decode(request));
      plans.push(Uint8Array.from(request));
      const { plan: value } = decode(request);
      const { claims } = value as Record<string, JSONValue>;
      const [claim] = claims as Array<Record<string, JSONValue>>;
      results.push(
        encode({
          results: [
            { claimId: claim!['claimId'], status, diagnostics: [{ code: 'UNIT_RESULT' }], evidence: { raw: true } },
          ],
        }),
      );
      return { canonicalClaim: encode(claim), canonicalPlan: plans.at(-1)!, canonicalResult: results.at(-1)! };
    },
    processRequest: vi.fn(() =>
      encode({
        requestId: 'configuration',
        result: {
          canonicalProfile: 'geospec-jcs-v1',
          protocolVersion: 3,
          registryVersion: 5,
          configuration: { configurationProfile: 'geospec-entry-config-v1', defaultWorkUnitBudget: 8_000_000 },
        },
      }),
    ),
  };
  return { engine, requests, plans, results };
};

describe('positive ancillary query authoring', () => {
  it.each(['analyzeMesh', 'analyzeBrep', 'inspectGeometry', 'analyzeMeshOverlap', 'queryPmi'] as const)(
    'sends %s as a raw positive payload and retains the complete report',
    async (capability) => {
      const recorded = recordingEngine();
      const client = createGeoSpecAssertionClient({
        engine: recorded.engine,
        subjectSlot: 'part',
        workUnitLimit: 42,
      });
      const payload =
        capability === 'inspectGeometry'
          ? { selectors: ['housing.bore'], evidence: ['bounds'] }
          : capability === 'analyzeMeshOverlap'
            ? { pairs: [{ left: 'A', right: 'B' }], tolerance: 0.001 }
            : null;
      const report = await client.query({ subject, capability, payload, claimId: 'chosen' });

      expect(report.claim).toStrictEqual({
        claimId: 'chosen',
        capability,
        subjectSlots: ['part'],
        payload,
        polarity: 'positive',
        workUnitBudget: 42,
      });
      expect(report.canonicalClaim).toStrictEqual(encode(report.claim));
      expect(report.canonicalPlan).toStrictEqual(recorded.plans[0]);
      expect(report.canonicalResult).toStrictEqual(recorded.results[0]);
      expect(report.result).toStrictEqual({
        claimId: 'chosen',
        status: 'passed',
        diagnostics: [{ code: 'UNIT_RESULT' }],
        evidence: { raw: true },
      });
      expect(report.diagnostics).toBe(report.result['diagnostics']);
      expect(report.evidence).toBe(report.result['evidence']);
    },
  );

  it.each(['analyzeMesh', 'analyzeBrep', 'analyzeMeshOverlap', 'queryPmi'] as const)(
    'preserves null and omitted %s payloads without inventing defaults',
    async (capability) => {
      const { engine } = recordingEngine();
      const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
      const omitted = await client.query({ subject, capability, claimId: capability });
      const explicit = await client.query({ subject, capability, payload: null, claimId: capability });
      expect(omitted.claim['payload']).toBeNull();
      expect(omitted.canonicalPlan).toStrictEqual(explicit.canonicalPlan);
    },
  );

  it('serializes ordinary RegExp values in selector and overlap payloads', async () => {
    const { engine } = recordingEngine();
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
    const inspection = { selectors: [/^bolt/iu] };
    const overlap = { pairs: [{ left: /^A/u, right: /b$/i }] };
    const first = await client.query({ subject, capability: 'inspectGeometry', payload: inspection });
    const second = await client.query({ subject, capability: 'analyzeMeshOverlap', payload: overlap });
    expect(first.claim['payload']).toStrictEqual({
      selectors: [{ type: 'regexp', pattern: '^bolt', flags: 'iu' }],
    });
    expect(second.claim['payload']).toStrictEqual({
      pairs: [
        { left: { type: 'regexp', pattern: '^A', flags: 'u' }, right: { type: 'regexp', pattern: 'b$', flags: 'i' } },
      ],
    });
  });

  it('preserves literal payload keys and existing omitted-property serialization', async () => {
    const { engine } = recordingEngine();
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
    const report = await client.query({
      subject,
      capability: 'inspectGeometry',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Literal authored keys must survive transport unchanged.
      payload: { part_id: 1, partId: 2, nested: { optional: undefined, explicit: null } },
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Independent literal-key transport expectation.
    expect(report.claim['payload']).toStrictEqual({ part_id: 1, partId: 2, nested: { explicit: null } });
  });

  it.each(['failed', 'refused'])('returns %s query reports while matchers still reject', async (status) => {
    const { engine } = recordingEngine(status);
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
    await expect(client.query({ subject, capability: 'analyzeBrep' })).resolves.toMatchObject({ status });
    expect(
      evaluateGeoSpecNativeQuery({
        engine,
        capability: 'analyzeBrep',
        subject,
        claimId: 'raw',
        subjectSlot: 'subject',
        workUnitLimit: 1,
      }).status,
    ).toBe(status);
    expect(() => client.expectGeo(subject).toBeValidBrep()).toThrow(GeoSpecAssertionError);
  });

  it('shares the automatic sequence without consuming an explicit query ID', async () => {
    const { engine } = recordingEngine();
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
    const reports = [
      await client.query({ subject, capability: 'analyzeMesh' }),
      await client.query({ subject, capability: 'analyzeMesh', claimId: 'chosen' }),
      client.expectGeo(subject).toBeWatertight(),
      await client.query({ subject, capability: 'analyzeBrep' }),
    ];
    expect(reports.map((report) => report.claimId)).toStrictEqual([
      'geospec-claim-1',
      'chosen',
      'geospec-claim-2',
      'geospec-claim-3',
    ]);
  });

  it('keeps the matcher callback exclusive to matchers and initializes once across clients', async () => {
    const { engine } = recordingEngine();
    const claimId = vi.fn(() => 'custom');
    const client = createGeoSpecAssertionClient({ engine, claimId });
    await client.query({ subject, capability: 'analyzeMesh' });
    await client.query({ subject, capability: 'analyzeMesh', claimId: 'chosen' });
    const report = client.expectGeo(subject).toBeWatertight();
    const second = createGeoSpecAssertionClient({ engine });
    const query = await second.query({ subject, capability: 'analyzeBrep' });
    expect(claimId.mock.calls).toStrictEqual([['toBeWatertight', 2]]);
    expect(report.claimId).toBe('custom');
    expect(query.claim['workUnitBudget']).toBe(8_000_000);
    expect(engine.processRequest).toHaveBeenCalledTimes(1);
  });

  it('lets native malformed-payload errors escape unchanged', async () => {
    const { engine } = recordingEngine();
    const error = Object.assign(new Error('analyzeMesh payload must be null or omitted.'), { code: 'invalid-claim' });
    engine.evaluateClaim = (request) => {
      expect(new TextDecoder().decode(request)).toContain('"payload":{}');
      throw error;
    };
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1 });
    await expect(client.query({ subject, capability: 'analyzeMesh', payload: {} })).rejects.toBe(error);
  });
});
