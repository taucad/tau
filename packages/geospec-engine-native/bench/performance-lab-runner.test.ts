import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Private bench test consumes the public protocol types.
import type { GeoSpecEngineImplementation, GeoSpecEngineProtocol } from 'geospec/engine';
import {
  numericProfileOfCanonicalResult,
  parsePerformanceLabRunInput,
  runPerformanceLabCell,
} from '#bench/performance-lab-runner';

const bytes = new TextEncoder().encode('ordinary fixture bytes');
const sha256 = async (): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

const input = async () =>
  parsePerformanceLabRunInput({
    engine: 'legacy-wasm',
    fixture: { id: 'ordinary-step', format: 'step', sourceUnit: 'auto', bytes, sha256: await sha256() },
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
        subject: { kind: 'geometry-subject-reference', subjectId: 'subject-1', contentHash },
      })),
      submitClaims: vi.fn<GeoSpecEngineProtocol['submitClaims']>(({ requestId, claims }) => {
        const claim = JSON.parse(new TextDecoder().decode(claims[0])) as { claimId: string };
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
