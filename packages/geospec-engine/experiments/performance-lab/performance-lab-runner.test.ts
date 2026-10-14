import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { HostEngine, HostSubjectLifecycle } from '@taucad/geospec-engine-native/node';
import {
  numericProfileOfCanonicalResult,
  parsePerformanceLabRunInput,
  runPerformanceLabCell,
  withTwoCallClaims,
} from '#experiments/performance-lab/performance-lab-runner.js';
import type {
  PerformanceLabEngineModule,
  PerformanceLabWasmExecution,
} from '#experiments/performance-lab/performance-lab-runner.js';

const bytes = new TextEncoder().encode('ordinary fixture bytes');
const sha256 = async (): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

const input = async () =>
  parsePerformanceLabRunInput({
    engine: 'native-desktop',
    fixture: {
      id: 'ordinary-step',
      format: 'step',
      sourceUnit: 'auto',
      bytes,
      sha256: await sha256(),
    },
    cases: [
      {
        id: 'bounds',
        kind: 'matcher',
        matcher: 'toHaveBoundingBox',
        arguments: [{ size: [10, 20, 30] }],
        payload: { kind: 'boundingBox', expected: { size: [10, 20, 30] } },
        claimId: 'bounds-authority',
        subjectSlot: 'part',
        workUnitBudget: 10_000,
        polarity: 'positive',
        expectedStatus: 'passed',
      },
      {
        id: 'query',
        kind: 'query',
        matcher: 'analyzeMesh',
        arguments: [],
        payload: null,
        polarity: 'positive',
        expectedStatus: 'failed',
      },
    ],
    repeats: 1,
    cache: 'cold',
  });

describe('ordinary performance lab runner', () => {
  it('should discard prewarm reports without omitting calls, refusals or cleanup', async () => {
    const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
    const calls: string[] = [];
    const engine = mock<HostEngine & HostSubjectLifecycle>({
      ingestSubject: vi.fn(() => {
        calls.push('admit');
        return encode({ result: { subject: { subjectHash: '0'.repeat(64) } } });
      }),
      subjectHandle: vi.fn(() => encode({ result: { subjectHandle: { id: 1 } } })),
      releaseSubject: vi.fn(() => {
        calls.push('release');
        return encode({});
      }),
      close: vi.fn(() => {
        calls.push('close');
      }),
      observations: vi.fn(() => encode({})),
      evaluateClaim: vi.fn<HostEngine['evaluateClaim']>((request) => {
        const decoded = JSON.parse(new TextDecoder().decode(request)) as {
          plan: { claims: Array<{ claimId: string }> };
        };
        const claim = decoded.plan.claims[0]!;
        calls.push(claim.claimId);
        return {
          canonicalPlan: encode({}),
          canonicalClaim: encode(claim),
          canonicalResult: encode({
            numericProfile: 'profile',
            results: [
              { claimId: claim.claimId, status: claim.claimId === 'query' ? 'refused' : 'passed', diagnostics: [] },
            ],
          }),
        };
      }),
    });
    Object.assign(engine, { cacheProducerIdentity: () => encode({}) });
    const module = mock<PerformanceLabEngineModule>({
      Engine: vi.fn(function createEngine() {
        return engine;
      }),
    });
    const base = await input();
    const ordinary = {
      ...base,
      engine: 'native-desktop',
      fixture: { ...base.fixture, format: 'rational-plate' },
      cases: base.cases.map((entry) => ({ ...entry, claimId: entry.claimId ?? 'query', workUnitBudget: 10_000 })),
    } as const;
    const decodeSpy = vi.spyOn(TextDecoder.prototype, 'decode');
    try {
      const discarded = await runPerformanceLabCell(ordinary, { native: async () => module }, 'discard');
      expect(discarded.perCase).toEqual([]);
      expect(discarded.profile).toBeNull();
      expect(engine.observations).not.toHaveBeenCalled();
      expect(calls).toEqual(['admit', 'bounds-authority', 'query', 'release', 'close']);
      const discardedDecodes = decodeSpy.mock.calls.length;
      calls.length = 0;
      decodeSpy.mockClear();
      const complete = await runPerformanceLabCell(ordinary, { native: async () => module });
      expect(complete.perCase.map(({ status }) => status)).toEqual(['passed', 'refused']);
      expect(complete.perCase[0]!.result).toEqual({ claimId: 'bounds-authority', status: 'passed', diagnostics: [] });
      expect(JSON.parse(complete.perCase[0]!.canonicalResultUtf8!)).toEqual({
        numericProfile: 'profile',
        results: [{ claimId: 'bounds-authority', status: 'passed', diagnostics: [] }],
      });
      expect(engine.observations).toHaveBeenCalledOnce();
      expect(
        complete.perCase.every(
          ({ canonicalResultUtf8, canonicalResultSha256 }) =>
            typeof canonicalResultUtf8 === 'string' && typeof canonicalResultSha256 === 'string',
        ),
      ).toBe(true);
      expect(calls).toEqual(['admit', 'bounds-authority', 'query', 'release', 'close']);
      expect(decodeSpy.mock.calls.length).toBeGreaterThan(discardedDecodes);
      calls.length = 0;
      engine.evaluateClaim.mockImplementation(() => {
        throw new TypeError('claim failed');
      });
      await expect(runPerformanceLabCell(ordinary, { native: async () => module }, 'discard')).rejects.toThrow(
        new TypeError('claim failed'),
      );
      expect(calls).toEqual(['admit', 'release', 'close']);
    } finally {
      decodeSpy.mockRestore();
    }
  });
  it('requires an explicit valid MT receipt and confines execution to combined WASM', async () => {
    const ordinary = await input();
    const combined = { ...ordinary, engine: 'combined-wasm' };
    const mt = {
      variant: 'mt',
      permits: 4,
      receipt: 'https://tau.example/geospec-mt/permits-4/geospec_engine_native.mt.json',
    };
    await expect(parsePerformanceLabRunInput({ ...combined, execution: mt })).resolves.toMatchObject({ execution: mt });
    const desktop = {
      ...mt,
      receipt: 'app://tau/geospec-mt/permits-4/geospec_engine_native.mt.json',
    };
    await expect(parsePerformanceLabRunInput({ ...combined, execution: desktop })).resolves.toMatchObject({
      execution: desktop,
    });
    await expect(
      parsePerformanceLabRunInput({
        ...combined,
        execution: { variant: 'st' },
      }),
    ).resolves.toMatchObject({ execution: { variant: 'st' } });
    for (const execution of [
      { ...mt, permits: 0 },
      { ...mt, permits: 4_294_967_296 },
      { ...mt, receipt: '/relative.json' },
      { ...mt, receipt: 'app://other/geospec_engine_native.mt.json' },
      { ...mt, receipt: 'app://tau:123/geospec_engine_native.mt.json' },
      { ...mt, receipt: 'app://user@tau/geospec_engine_native.mt.json' },
      { ...mt, receipt: 'file:///tmp/geospec_engine_native.mt.json' },
      { variant: 'mt', permits: 4 },
      { variant: 'st', permits: 4 },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each malformed request must be refused independently.
      await expect(parsePerformanceLabRunInput({ ...combined, execution })).rejects.toThrow();
    }
    await expect(parsePerformanceLabRunInput({ ...ordinary, execution: mt })).rejects.toThrow();
  });

  it('passes the same MT selection to initialization and construction without ST fallback', async () => {
    const execution: PerformanceLabWasmExecution = {
      variant: 'mt',
      permits: 4,
      receipt: 'https://tau.example/geospec-mt/permits-4/geospec_engine_native.mt.json',
    };
    const initialize = vi.fn(async (_input?: undefined, selected?: PerformanceLabWasmExecution): Promise<void> => {
      expect(selected).toEqual(execution);
    });
    const engineConstructor = function refusingEngine(selected?: PerformanceLabWasmExecution): never {
      expect(selected).toEqual(execution);
      throw new Error('MT construction refused');
    } as unknown as PerformanceLabEngineModule['Engine'];
    const combined: PerformanceLabEngineModule = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
      Engine: engineConstructor,
      initialize,
      canonicalize: (value) => value,
    };
    await expect(
      runPerformanceLabCell(
        { ...(await input()), engine: 'combined-wasm', execution },
        {
          combined: async () => combined,
        },
      ),
    ).rejects.toThrow('MT construction refused');
    expect(initialize).toHaveBeenCalledExactlyOnceWith(undefined, execution);
  });
  it('should replay canonicalPlan, canonicalize and evaluatePlan for an add-on without evaluateClaim', () => {
    const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
    const decode = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes);
    const plan = '{"plan":{"claims":[{"claimId":"c","payload":null}],"subjects":[]}}';
    const calls: string[] = [];
    class OlderEngine {
      public canonicalPlan(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
        calls.push(`canonicalPlan ${decode(request)}`);
        return encode(plan);
      }

      public evaluatePlan(input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
        calls.push(`evaluatePlan ${decode(input)}`);
        return encode('{"results":[]}');
      }
    }
    const older: PerformanceLabEngineModule = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
      Engine: OlderEngine as unknown as PerformanceLabEngineModule['Engine'],
      canonicalize: (bytes) => {
        calls.push(`canonicalize ${decode(bytes)}`);
        return encode('claim');
      },
    };

    const evaluation = new (withTwoCallClaims(older).Engine)().evaluateClaim(encode('request'));

    expect(calls).toEqual([
      'canonicalPlan request',
      'canonicalize {"claimId":"c","payload":null}',
      `evaluatePlan ${plan}`,
    ]);
    expect(
      [evaluation.canonicalPlan, evaluation.canonicalClaim, evaluation.canonicalResult].map((bytes) => decode(bytes)),
    ).toEqual([plan, 'claim', '{"results":[]}']);
  });

  it('should read numeric profile from the actual canonical result envelope', () => {
    const envelope = {
      numericProfile: 'geospec-st-prototypes-v4',
      results: [{ claimId: 'ordinary', status: 'passed', diagnostics: [] }],
    };
    expect(numericProfileOfCanonicalResult(new TextEncoder().encode(JSON.stringify(envelope)))).toBe(
      'geospec-st-prototypes-v4',
    );
    expect(
      numericProfileOfCanonicalResult(
        new TextEncoder().encode(JSON.stringify({ results: [{ numericProfile: 'wrong-level' }] })),
      ),
    ).toBeNull();
  });
});
