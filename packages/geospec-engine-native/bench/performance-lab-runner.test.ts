import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Private bench test consumes the public protocol types.
import type { GeoSpecEngineImplementation, GeoSpecEngineProtocol } from 'geospec/engine';
import {
  numericProfileOfCanonicalResult,
  parsePerformanceLabRunInput,
  runPerformanceLabCell,
  withTwoCallClaims,
} from '#bench/performance-lab-runner';
import type { PerformanceLabEngineModule, PerformanceLabWasmExecution } from '#bench/performance-lab-runner';

const bytes = new TextEncoder().encode('ordinary fixture bytes');
const sha256 = async (): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

const input = async () =>
  parsePerformanceLabRunInput({
    engine: 'legacy-wasm',
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

  it('should admit once and preserve authored legacy claim payloads and ordinary outcomes', async () => {
    const protocol = mock<GeoSpecEngineProtocol>({
      initialize: vi.fn<GeoSpecEngineProtocol['initialize']>(() => ({
        protocolVersion: 2,
        engine: { name: 'legacy', version: 'test' },
        determinism: 'reference-wasm',
        capabilities: [
          { name: 'toHaveBoundingBox', registryVersion: 3 },
          { name: 'analyzeMesh', registryVersion: 3 },
        ],
        provenance: {},
      })),
      ingestSubject: vi.fn<GeoSpecEngineProtocol['ingestSubject']>(async ({ requestId, contentHash }) => ({
        requestId,
        subject: {
          kind: 'geometry-subject-reference',
          subjectId: 'subject-1',
          contentHash,
        },
      })),
      submitClaims: vi.fn<GeoSpecEngineProtocol['submitClaims']>(({ requestId, claims }) => {
        const claim = JSON.parse(new TextDecoder().decode(claims[0])) as {
          claimId: string;
        };
        return {
          requestId,
          results: [
            {
              claimId: claim.claimId,
              status: claim.claimId.startsWith('bounds') ? 'passed' : 'failed',
              diagnostics: [],
              provenance: {},
            },
          ],
        };
      }),
      releaseSubject: vi.fn<GeoSpecEngineProtocol['releaseSubject']>(({ requestId }) => ({
        requestId,
        released: true,
      })),
    });
    const implementation = mock<GeoSpecEngineImplementation>({ protocol });
    const result = await runPerformanceLabCell(await input(), {
      legacy: async () => ({ geoSpecEngineImplementation: implementation }),
    });
    expect(protocol.ingestSubject).toHaveBeenCalledTimes(1);
    expect(protocol.submitClaims).toHaveBeenCalledTimes(2);
    expect(protocol.releaseSubject).toHaveBeenCalledTimes(1);
    expect(result.perCase.map(({ status }) => status)).toEqual(['passed', 'failed']);
    expect(result.initializationTiming).toBe('lazy-in-admission-or-evaluation');
    expect(JSON.parse(result.perCase[0]!.canonicalClaimUtf8!)).toEqual({
      claimId: 'bounds-authority',
      capability: 'toHaveBoundingBox',
      subjectIds: ['subject-1'],
      payload: { kind: 'boundingBox', expected: { size: [10, 20, 30] } },
      workUnitBudget: 10_000,
    });
    expect(result.perCase.every(({ canonicalResultSha256 }) => typeof canonicalResultSha256 === 'string')).toBe(true);
  });
});
