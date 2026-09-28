import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '#assertion-client/index.js';
import type { GeoSpecNativeClaimEvaluation, GeoSpecNativeEngine } from '#assertion-client/index.js';
import { evaluateGeoSpecNativeClaim } from '#engine/client.js';

const hash = 'e'.repeat(64);
const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): JSONValue => JSON.parse(new TextDecoder().decode(value)) as JSONValue;

const record = (value: JSONValue): Record<string, JSONValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
};

class ParallelPlaneDistanceEngine implements GeoSpecNativeEngine {
  public initializeCount = 0;
  public request?: Record<string, JSONValue>;
  public returnedPlan?: Uint8Array<ArrayBuffer>;
  public returnedResult?: Uint8Array<ArrayBuffer>;
  private readonly status: 'failed' | 'passed';

  public constructor(status: 'failed' | 'passed' = 'passed') {
    this.status = status;
  }

  public evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation {
    this.request = record(decode(request));
    this.returnedPlan = encode({ plan: this.request['plan']! });
    const plan = record(this.request['plan']!);
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
              : [
                  {
                    code: 'GEOSPEC_PARALLEL_PLANE_DISTANCE_MISMATCH',
                    severity: 'error',
                    message: 'distance mismatch',
                  },
                ],
          evidence: { positiveSatisfied: this.status === 'passed' },
        },
      ],
    });
    return { canonicalClaim: encode(claim), canonicalPlan: this.returnedPlan, canonicalResult: this.returnedResult };
  }

  public processRequest(_request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.initializeCount += 1;
    return encode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        protocolVersion: 3,
        registryVersion: 5,
        configuration: {
          configurationProfile: 'geospec-entry-config-v1',
          defaultWorkUnitBudget: 12_345,
        },
      },
    });
  }
}

const createClient = (engine: GeoSpecNativeEngine, claimId?: () => string) =>
  createGeoSpecAssertionClient({
    ...(claimId === undefined ? {} : { claimId }),
    engine,
    subjectSlot: 'part',
  });

describe('fixed parallel-plane-distance public authoring', () => {
  it.each([
    {
      claimId: undefined,
      expectedClaimId: 'geospec-claim-1',
      polarity: 'positive',
    },
    {
      claimId: () => 'f2-explicit-negative',
      expectedClaimId: 'f2-explicit-negative',
      polarity: 'negative',
    },
  ] as const)(
    'should preserve the fixed payload, $polarity polarity, IDs, budget and canonical bytes',
    async (testCase) => {
      const engine = new ParallelPlaneDistanceEngine();
      const chain = createClient(engine, testCase.claimId).expectGeo({
        subjectHash: hash,
      });
      const report = await (testCase.polarity === 'positive'
        ? chain.toSatisfyParallelPlaneDistance()
        : chain.not.toSatisfyParallelPlaneDistance());
      const plan = record(engine.request?.['plan'] ?? null);
      const { claims } = plan;

      expect(Array.isArray(claims) ? claims[0] : undefined).toStrictEqual({
        claimId: testCase.expectedClaimId,
        capability: 'toSatisfyParallelPlaneDistance',
        subjectSlots: ['part'],
        payload: { contract: 'geospec.pmi.parallel-plane-distance/v1' },
        polarity: testCase.polarity,
        workUnitBudget: 12_345,
      });
      expect(engine.initializeCount).toBe(1);
      expect(report.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(report.canonicalResult).toStrictEqual(engine.returnedResult);
    },
  );

  it('should reject user arguments before invoking the native engine', () => {
    const engine = new ParallelPlaneDistanceEngine();
    const matcher = createClient(engine).expectGeo({
      subjectHash: hash,
    }).toSatisfyParallelPlaneDistance;

    expect(() => {
      Reflect.apply(matcher, undefined, [{}]);
    }).toThrow('does not accept arguments');
    expect(engine.request).toBeUndefined();
    expect(() =>
      evaluateGeoSpecNativeClaim({
        arguments: [{}],
        capability: 'toSatisfyParallelPlaneDistance',
        claimId: 'direct-arity',
        engine,
        polarity: 'positive',
        subject: { subjectHash: hash },
        subjectSlot: 'part',
        workUnitLimit: 12_345,
      }),
    ).toThrow('does not accept arguments');
  });

  it('should retain the complete failed report on the standalone assertion error', async () => {
    const engine = new ParallelPlaneDistanceEngine('failed');

    try {
      await createClient(engine, () => 'f2-failed')
        .expectGeo({ subjectHash: hash })
        .toSatisfyParallelPlaneDistance();
      expect.fail('The failed core report should reject the assertion.');
    } catch (error) {
      expect(error).toBeInstanceOf(GeoSpecAssertionError);
      if (!(error instanceof GeoSpecAssertionError)) {
        throw error;
      }
      expect(error.report.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(error.report.canonicalResult).toStrictEqual(engine.returnedResult);
      expect(error.report.result).toStrictEqual({
        claimId: 'f2-failed',
        status: 'failed',
        diagnostics: [
          {
            code: 'GEOSPEC_PARALLEL_PLANE_DISTANCE_MISMATCH',
            severity: 'error',
            message: 'distance mismatch',
          },
        ],
        evidence: { positiveSatisfied: false },
      });
    }
  });
});
