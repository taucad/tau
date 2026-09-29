import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '#assertion-client/index.js';
import type { GeoSpecNativeClaimEvaluation, GeoSpecNativeEngine } from '#assertion-client/index.js';
import { geoSpecNativeMatcherDescriptors } from '#engine/matchers.js';
import type { GeoSpecVolumeExpectation } from '#runner/types.js';
import { createGeoSpecVitestAdapter } from '#vitest/index.js';
import type { MatcherState } from 'vitest';

const hash = 'b'.repeat(64);
const subject = { subjectHash: hash };
const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): JSONValue => JSON.parse(new TextDecoder().decode(value)) as JSONValue;

const record = (value: JSONValue): Record<string, JSONValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
};

class PolarityEngine implements GeoSpecNativeEngine {
  public evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation {
    const plan = record(record(decode(request))['plan'] ?? null);
    const { claims } = plan;
    const [claimValue] = Array.isArray(claims) ? claims : [];
    const claim = record(claimValue ?? null);
    const payload = record(claim['payload']!);
    const { arguments: arguments_ } = payload;
    const [expected] = Array.isArray(arguments_) ? arguments_ : [];
    const expectedRecord = expected === undefined ? undefined : record(expected);
    const disposition = expectedRecord?.['disposition'];
    const positiveSatisfied = expectedRecord?.['value'] !== 0;
    const { polarity } = claim;
    const passed = positiveSatisfied === (polarity === 'positive');
    const diagnostic = (code: string): JSONValue[] => [{ code, severity: 'error', message: code.toLowerCase() }];
    const canonicalResult = encode({
      results: [
        disposition === 'refused'
          ? {
              claimId: claim['claimId']!,
              status: 'refused',
              diagnostics: diagnostic('GEOSPEC_CAPABILITY_UNAVAILABLE'),
            }
          : disposition === 'missing'
            ? {
                claimId: claim['claimId']!,
                status: 'failed',
                diagnostics: diagnostic('GEOSPEC_EVIDENCE_MISSING'),
              }
            : disposition === 'contradictory'
              ? {
                  claimId: claim['claimId']!,
                  status: 'failed',
                  diagnostics: diagnostic('GEOSPEC_EVIDENCE_CONTRADICTORY'),
                  evidence: { positiveSatisfied: polarity === 'positive' },
                }
              : {
                  claimId: claim['claimId']!,
                  status: passed ? 'passed' : 'failed',
                  diagnostics: passed ? [] : diagnostic('MISMATCH'),
                  evidence: { positiveSatisfied },
                },
      ],
    });
    return { canonicalClaim: encode(claim), canonicalPlan: Uint8Array.from(request), canonicalResult };
  }

  public processRequest(_request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    throw new Error('Explicit test budgets do not initialize the engine.');
  }
}

const install = () => {
  const client = createGeoSpecAssertionClient({
    engine: new PolarityEngine(),
    workUnitLimit: 10_000,
  });
  const adapter = createGeoSpecVitestAdapter(client);
  expect.extend(adapter.matchers);
  return adapter;
};

describe('GeoSpec Vitest adapter', () => {
  it('registers the same complete matcher catalog as standalone GeoSpec', () => {
    const adapter = install();

    expect(Object.keys(adapter.matchers)).toStrictEqual(Object.keys(geoSpecNativeMatcherDescriptors));
  });

  it('returns the same canonical plan and result bytes as standalone assertions', async () => {
    const createClient = () =>
      createGeoSpecAssertionClient({
        claimId: () => 'shared-parity-claim',
        engine: new PolarityEngine(),
        workUnitLimit: 10_000,
      });
    const standalone = await createClient().expectGeo(subject).toHaveVolume({ value: 1 });
    const adapter = createGeoSpecVitestAdapter(createClient());
    const matcher = adapter.matchers['toHaveVolume']!;
    const state = { assertion: {}, isNot: false } as unknown as MatcherState;
    const framework = await matcher.call(state, subject, { value: 1 });

    expect(framework.actual.canonicalPlan).toStrictEqual(standalone.canonicalPlan);
    expect(framework.actual.canonicalResult).toStrictEqual(standalone.canonicalResult);
    expect(framework.actual.result).toStrictEqual(standalone.result);
  });

  it('applies positive and negative assertions exactly once', async () => {
    install();

    await expect(subject).toHaveVolume({ value: 1 });
    await expect(subject).not.toHaveVolume({ value: 0 });
    await expect(expect(subject).toHaveVolume({ value: 0 })).rejects.toThrow('MISMATCH');
    await expect(expect(subject).not.toHaveVolume({ value: 1 })).rejects.toThrow('MISMATCH');
  });

  it.each([
    ['refused', 'GEOSPEC_CAPABILITY_UNAVAILABLE'],
    ['missing', 'GEOSPEC_EVIDENCE_MISSING'],
    ['contradictory', 'GEOSPEC_EVIDENCE_CONTRADICTORY'],
  ] as const)('fails %s reports under both host polarities', async (disposition, code) => {
    install();
    const expectation = { disposition } as unknown as GeoSpecVolumeExpectation;

    await expect(expect(subject).toHaveVolume(expectation)).rejects.toThrow(code);
    await expect(expect(subject).not.toHaveVolume(expectation)).rejects.toThrow(code);
  });

  it('resolves promised subjects and preserves rejected loader errors', async () => {
    install();

    await expect(Promise.resolve(subject)).toHaveVolume({ value: 1 });
    await expect(expect(Promise.reject(new Error('subject load failed'))).toHaveVolume({ value: 1 })).rejects.toThrow(
      'subject load failed',
    );
  });

  it('should preserve Vitest promise modifiers', async () => {
    install();

    await expect(Promise.resolve(subject)).resolves.toHaveVolume({ value: 1 });
    await expect(
      expect(Promise.reject(new Error('subject load failed'))).resolves.toHaveVolume({ value: 1 }),
    ).rejects.toThrow('subject load failed');
  });

  it('preserves arbitrary engine exceptions instead of treating them as assertion reports', async () => {
    install();
    const operation = expect({ subjectHash: 'bad' }).toBeWatertight();

    await expect(operation).rejects.toThrow(TypeError);
    await expect(operation).rejects.toThrow('64 lowercase hexadecimal characters');
  });

  it('settles operations started through the adapter lifecycle', async () => {
    const adapter = install();
    let resolveSubject: ((value: typeof subject) => void) | undefined;
    const delayed = new Promise<typeof subject>((resolve) => {
      resolveSubject = resolve;
    });
    const raw = adapter.matchers['toHaveVolume']!;
    const state = { assertion: {}, isNot: false } as unknown as MatcherState;
    const operation = raw.call(state, delayed, { value: 1 });
    const flushed = adapter.flush();

    resolveSubject!(subject);
    await expect(flushed).resolves.toBeUndefined();
    await expect(operation).resolves.toMatchObject({ pass: true });
  });

  it('should reject an unbound non-passed report during explicit lifecycle settlement', async () => {
    const adapter = install();
    const raw = adapter.matchers['toHaveVolume']!;
    const state = { assertion: {}, isNot: false } as unknown as MatcherState;

    void raw.call(state, subject, { value: 0 });

    await expect(adapter.flush()).rejects.toThrow(GeoSpecAssertionError);
    await expect(adapter.flush()).resolves.toBeUndefined();
  });

  it('rejects asynchronous GeoSpec matchers in asymmetric positions', () => {
    install();
    const asymmetric = Reflect.get(expect, 'toHaveVolume') as (expected: unknown) => unknown;

    expect(() => {
      expect(subject).toEqual(asymmetric({ value: 1 }));
    }).toThrow('GeoSpec Vitest matchers do not support asymmetric use.');
  });
});
