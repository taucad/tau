import { expect, it } from 'vitest';
import { queryDirectAp242MinimumDistance } from '#geospec/exact-ap242-minimum.js';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';

const hash = 'b'.repeat(64);
const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> => JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
const ap242Bytes = new TextEncoder().encode('AP242 fixture bytes');

type Stub = GeoSpecNativeModelEngine & { closed: number; released: number; submitted: number; frame?: unknown; close(): void };

const backend = (options: { duplicate?: boolean; malformed?: boolean; badUnit?: boolean; handleFailure?: boolean; releaseFailure?: boolean; supported?: boolean } = {}): Stub => ({
  closed: 0,
  released: 0,
  submitted: 0,
  frame: undefined,
  close() { this.closed += 1; },
  processRequest() {
    return encode({ requestId: 'configuration', result: {
      canonicalProfile: 'geospec-jcs-v1', protocolVersion: 3, registryVersion: 5,
      configuration: { configurationProfile: 'geospec-entry-config-v1', defaultWorkUnitBudget: 100 },
      capabilities: options.supported === false ? [] : [
        { name: 'minimumDistance', profile: 'geospec-minimum-distance-v1', implementation: 'implemented', registryVersion: 5 },
      ],
    } });
  },
  ingestSubject(request) {
    this.frame = decode(request)['frame'];
    return encode({ result: { subject: { subjectHash: hash,
      descriptor: { frame: { coordinateSystem: 'y-up', outputCoordinateSystem: 'z-up', outputUnit: 'mm', uniformScale: options.badUnit ? 1000 : 1 } },
      occurrences: options.malformed ? [{ instanceName: 'A' }] : [
        { instanceName: 'A', occurrencePath: 'root.A' },
        { instanceName: options.duplicate ? 'A' : 'B', occurrencePath: 'root.B' },
      ],
    } } });
  },
  subjectHandle() {
    if (options.handleFailure) {
      throw new Error('handle unavailable');
    }
    return encode({ result: { subjectHandle: { owner: '1', generation: '1', subjectHash: hash } } });
  },
  releaseSubject() { this.released += 1; return encode({ result: { released: !options.releaseFailure } }); },
  evaluateClaim(request) {
    this.submitted += 1;
    const plan = decode(request)['plan'] as { claims: [{ claimId: string }] };
    return {
      canonicalClaim: encode({ claimId: plan.claims[0].claimId }),
      canonicalPlan: encode(plan),
      canonicalResult: encode({ results: [{ claimId: plan.claims[0].claimId, status: 'passed', diagnostics: [], evidence: {
        profile: 'geospec-minimum-distance-v1', fact: {
          source: 'ap242', assurance: 'exact-brep', unit: 'mm', coordinateSystem: 'z-up',
          subjectHash: hash, algorithmProfile: 'geospec-minimum-distance-v1', occurrences: ['root.A', 'root.B'],
          distance: 2, points: [[0, 0, 0], [0, 0, 2]],
        },
      } }] }),
    };
  },
});

const query = async (engine: Stub) => queryDirectAp242MinimumDistance({ engine, ap242Bytes, nameA: 'A', nameB: 'B' });

it('admits declared Y-up bytes, resolves unique names, queries and releases', async () => {
  const engine = backend();
  expect(await query(engine)).toMatchObject({ status: 'complete', fact: { distance: 2, occurrences: ['root.A', 'root.B'] } });
  expect(engine.frame).toStrictEqual({ coordinateSystem: 'y-up', sourceUnit: 'auto', outputUnit: 'mm' });
  expect(engine.submitted).toBe(1);
  expect(engine.released).toBe(1);
  expect(engine.closed).toBe(0);
});

it('refuses old engines before admission or query', async () => {
  const engine = backend({ supported: false });
  expect(await query(engine)).toMatchObject({ status: 'refused', code: 'unsupported-evidence' });
  expect(engine.frame).toBeUndefined();
  expect(engine.submitted).toBe(0);
});

it('refuses ambiguous names and releases the subject', async () => {
  const engine = backend({ duplicate: true });
  expect(await query(engine)).toMatchObject({ status: 'refused', code: 'invalid-selection' });
  expect(engine.released).toBe(1);
  expect(engine.closed).toBe(0);
});

it('closes admitted engine when metadata or handle cannot establish cleanup', async () => {
  await Promise.all([{ badUnit: true }, { handleFailure: true }].map(async (options) => {
    const engine = backend(options);
    await query(engine);
    expect(engine.closed).toBe(1);
    expect(engine.released).toBe(0);
    expect(engine.submitted).toBe(0);
  }));
});

it('releases subject even when occurrence metadata is malformed', async () => {
  const engine = backend({ malformed: true });
  expect(await query(engine)).toMatchObject({ status: 'interrupted', code: 'engine-error' });
  expect(engine.released).toBe(1);
  expect(engine.closed).toBe(0);
});

it('closes the slot if native release is not confirmed', async () => {
  const engine = backend({ releaseFailure: true });
  expect(await query(engine)).toMatchObject({ status: 'interrupted', code: 'engine-error' });
  expect(engine.released).toBe(1);
  expect(engine.closed).toBe(1);
});
