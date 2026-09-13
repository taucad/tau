import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '#assertion-client/index.js';
import type { GeoSpecNativeEngine } from '#assertion-client/index.js';
import { evaluateGeoSpecNativeClaim } from '#engine/client.js';
import { geoSpecMatcherDescriptors, geoSpecNativeMatcherDescriptors } from '#engine/matchers.js';
import { createGeoSpecVitestAdapter } from '#vitest/index.js';

const hash = 'f'.repeat(64);
const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): JSONValue => JSON.parse(new TextDecoder().decode(value)) as JSONValue;

const record = (value: JSONValue): Record<string, JSONValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
};

class FixedContractEngine implements GeoSpecNativeEngine {
  public request?: Record<string, JSONValue>;
  public returnedPlan?: Uint8Array<ArrayBuffer>;
  public returnedResult?: Uint8Array<ArrayBuffer>;
  private readonly status: 'failed' | 'passed';

  public constructor(status: 'failed' | 'passed' = 'passed') {
    this.status = status;
  }

  public canonicalPlan(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.request = record(decode(request));
    this.returnedPlan = encode({ plan: this.request['plan']! });
    return this.returnedPlan;
  }

  public evaluatePlan(_plan: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const plan = record(this.request?.['plan'] ?? null);
    const { claims } = plan;
    const claim = record(Array.isArray(claims) ? claims[0]! : null);
    this.returnedResult = encode({
      results: [
        {
          claimId: claim['claimId']!,
          status: this.status,
          diagnostics:
            this.status === 'passed'
              ? []
              : [{ code: 'GEOSPEC_RATIONAL_PLATE_MISMATCH', severity: 'error', message: 'plate mismatch' }],
          evidence: { positiveSatisfied: this.status === 'passed' },
        },
      ],
    });
    return this.returnedResult;
  }

  public processRequest(_request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    throw new Error('Explicit test budgets do not initialize the engine.');
  }
}

const createClient = (engine: GeoSpecNativeEngine) =>
  createGeoSpecAssertionClient({
    canonicalize: (input) => Uint8Array.from(input),
    claimId: () => 'f1-public-authoring',
    engine,
    subjectSlot: 'part',
    workUnitLimit: 10_000,
  });

describe('fixed rational-plate public authoring', () => {
  it('should retain F1 after the unchanged legacy 24 and before F2', () => {
    const legacyNames = Object.keys(geoSpecMatcherDescriptors);

    expect(legacyNames).toHaveLength(24);
    expect(Object.keys(geoSpecNativeMatcherDescriptors)).toStrictEqual([
      ...legacyNames,
      'toSatisfyRationalPlate',
      'toSatisfyParallelPlaneDistance',
    ]);
    expect(Object.keys(createGeoSpecVitestAdapter(createClient(new FixedContractEngine())).matchers)).toStrictEqual([
      ...legacyNames,
      'toSatisfyRationalPlate',
      'toSatisfyParallelPlaneDistance',
    ]);
  });

  it.each(['positive', 'negative'] as const)(
    'should emit only the fixed contract for %s polarity',
    async (polarity) => {
      const engine = new FixedContractEngine();
      const chain = createClient(engine).expectGeo({ subjectHash: hash });
      const report = await (polarity === 'positive'
        ? chain.toSatisfyRationalPlate()
        : chain.not.toSatisfyRationalPlate());
      const plan = record(engine.request?.['plan'] ?? null);
      const { claims } = plan;

      expect(Array.isArray(claims) ? claims[0] : undefined).toStrictEqual({
        claimId: 'f1-public-authoring',
        capability: 'toSatisfyRationalPlate',
        subjectSlots: ['part'],
        payload: { contract: 'geospec.plate-two-windows/v1' },
        polarity,
        workUnitBudget: 10_000,
      });
      expect(report.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(report.canonicalResult).toStrictEqual(engine.returnedResult);
    },
  );

  it('should reject user arguments before invoking the native engine', () => {
    const engine = new FixedContractEngine();
    const matcher = createClient(engine).expectGeo({ subjectHash: hash }).toSatisfyRationalPlate;

    expect(() => {
      Reflect.apply(matcher, undefined, [{}]);
    }).toThrow('does not accept arguments');
    expect(engine.request).toBeUndefined();
    expect(() =>
      evaluateGeoSpecNativeClaim({
        arguments: [{}],
        canonicalize: (input) => input,
        capability: 'toSatisfyRationalPlate',
        claimId: 'direct-arity',
        engine,
        polarity: 'positive',
        subject: { subjectHash: hash },
        subjectSlot: 'part',
        workUnitLimit: 10_000,
      }),
    ).toThrow('does not accept arguments');
  });

  it('should retain the complete failed report on the standalone assertion error', async () => {
    const engine = new FixedContractEngine('failed');

    try {
      await createClient(engine).expectGeo({ subjectHash: hash }).toSatisfyRationalPlate();
      expect.fail('The failed core report should reject the assertion.');
    } catch (error) {
      expect(error).toBeInstanceOf(GeoSpecAssertionError);
      if (!(error instanceof GeoSpecAssertionError)) {
        throw error;
      }
      expect(error.report.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(error.report.canonicalResult).toStrictEqual(engine.returnedResult);
      expect(error.report.result).toStrictEqual({
        claimId: 'f1-public-authoring',
        status: 'failed',
        diagnostics: [{ code: 'GEOSPEC_RATIONAL_PLATE_MISMATCH', severity: 'error', message: 'plate mismatch' }],
        evidence: { positiveSatisfied: false },
      });
    }
  });
});
