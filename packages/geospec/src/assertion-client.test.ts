import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '#assertion-client/index.js';
import type { GeoSpecNativeEngine } from '#assertion-client/index.js';
import { evaluateGeoSpecNativeClaim } from '#engine/client.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';

const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): JSONValue => JSON.parse(new TextDecoder().decode(value)) as JSONValue;
const recordingCanonicalize = (input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => Uint8Array.from(input);

const record = (value: JSONValue): Record<string, JSONValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
};

class RecordingEngine implements GeoSpecNativeEngine {
  public canonicalInput?: JSONValue;
  public evaluatedPlan?: Uint8Array<ArrayBuffer>;
  public initializeCalls = 0;
  public returnedPlan?: Uint8Array<ArrayBuffer>;
  public returnedResult?: Uint8Array<ArrayBuffer>;
  private readonly defaultWorkUnitBudget: unknown;
  private readonly status: 'failed' | 'passed' | 'refused';

  public constructor(defaultWorkUnitBudget: unknown = 8_000_000, status: 'failed' | 'passed' | 'refused' = 'passed') {
    this.defaultWorkUnitBudget = defaultWorkUnitBudget;
    this.status = status;
  }

  public canonicalPlan(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.canonicalInput = decode(request);
    const requestRecord = record(this.canonicalInput);
    this.returnedPlan = encode({
      canonicalProfile: 'geospec-jcs-v1',
      normalizedBy: 'rust',
      plan: requestRecord['plan']!,
    });
    return this.returnedPlan;
  }

  public evaluatePlan(plan: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.evaluatedPlan = Uint8Array.from(plan);
    const request = record(this.canonicalInput!);
    const authoredPlan = record(request['plan']!);
    const { claims } = authoredPlan;
    const [claimValue] = Array.isArray(claims) ? claims : [];
    const claim = record(claimValue ?? null);
    this.returnedResult = encode({
      results: [
        {
          claimId: claim['claimId']!,
          status: this.status,
          diagnostics:
            this.status === 'passed'
              ? []
              : [{ code: 'GEOSPEC_TEST_RESULT', severity: 'error', message: `core ${this.status}` }],
          evidence: { positiveSatisfied: true, source: 'native-core' },
        },
      ],
    });
    return this.returnedResult;
  }

  public processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.initializeCalls += 1;
    expect(new TextDecoder().decode(request)).toBe(
      '{"canonicalProfile":"geospec-jcs-v1","method":"initialize","protocolVersion":3,"registryVersion":5,"requestId":"configuration"}',
    );
    return encode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        configuration: {
          configurationProfile: 'geospec-entry-config-v1',
          defaultWorkUnitBudget: this.defaultWorkUnitBudget as JSONValue,
        },
        protocolVersion: 3,
        registryVersion: 5,
      },
    });
  }
}

const hash = 'a'.repeat(64);

describe('runner-independent GeoSpec assertion client', () => {
  it('executes the 24 legacy matchers and both fixed native contracts', async () => {
    const engine = new RecordingEngine();
    const client = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine, workUnitLimit: 50_000 });
    const matchers = client.expectGeo({ subjectHash: hash });
    const names = [
      ...Object.keys(geoSpecMatcherDescriptors),
      'toSatisfyRationalPlate',
      'toSatisfyParallelPlaneDistance',
    ];

    expect(Object.keys(matchers)).toStrictEqual([...names, 'not']);
    await Promise.all(
      names.map(async (name) => {
        const matcher = Reflect.get(matchers, name) as (...arguments_: readonly unknown[]) => Promise<unknown>;
        await matcher();
      }),
    );
  });

  it('sends authored arguments and core polarity, then retains exact returned bytes', async () => {
    const engine = new RecordingEngine();
    const client = createGeoSpecAssertionClient({
      canonicalize: recordingCanonicalize,
      claimId: (matcher, sequence) => `${matcher}-${sequence}`,
      engine,
      subjectSlot: 'part',
      workUnitLimit: 123_456,
    });

    const report = await client.expectGeo({ subjectHash: hash }).not.toHaveBoundingBox([0, 0, 0], [1, 2, 3]);
    const request = record(engine.canonicalInput!);
    const plan = record(request['plan']!);
    const { claims } = plan;

    expect(plan['subjects']).toStrictEqual([{ slot: 'part', subjectHash: hash }]);
    expect(Array.isArray(claims) ? claims[0] : undefined).toStrictEqual({
      claimId: 'toHaveBoundingBox-1',
      capability: 'toHaveBoundingBox',
      subjectSlots: ['part'],
      payload: {
        kind: 'boundingBox',
        arguments: [
          [0, 0, 0],
          [1, 2, 3],
        ],
      },
      polarity: 'negative',
      workUnitBudget: 123_456,
    });
    expect(engine.evaluatedPlan).toStrictEqual(engine.returnedPlan);
    expect(report.claim).toStrictEqual(Array.isArray(claims) ? claims[0] : undefined);
    expect(report.canonicalClaim).toStrictEqual(recordingCanonicalize(encode(report.claim)));
    expect(report.canonicalPlan).toStrictEqual(engine.returnedPlan);
    expect(report.canonicalResult).toStrictEqual(engine.returnedResult);
    expect(report.canonicalPlan).not.toBe(engine.returnedPlan);
    expect(report.canonicalResult).not.toBe(engine.returnedResult);
    expect(report.result).toStrictEqual({
      claimId: 'toHaveBoundingBox-1',
      status: 'passed',
      diagnostics: [],
      evidence: { positiveSatisfied: true, source: 'native-core' },
    });
  });

  it.each([
    { polarity: 'positive', status: 'failed' },
    { polarity: 'negative', status: 'failed' },
    { polarity: 'positive', status: 'refused' },
    { polarity: 'negative', status: 'refused' },
  ] as const)('rejects a $polarity $status core report with the exact report bytes', async ({ polarity, status }) => {
    const engine = new RecordingEngine(8_000_000, status);
    const client = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine, workUnitLimit: 10_000 });
    const chain = client.expectGeo({ subjectHash: hash });
    const operation = polarity === 'positive' ? chain.toBeWatertight() : chain.not.toBeWatertight();

    try {
      await operation;
      expect.fail('The standalone assertion should reject a non-passed core report.');
    } catch (error) {
      expect(error).toBeInstanceOf(GeoSpecAssertionError);
      if (!(error instanceof GeoSpecAssertionError)) {
        throw error;
      }
      expect(error.report.status).toBe(status);
      expect(error.report.polarity).toBe(polarity);
      expect(error.diagnostics).toBe(error.report.diagnostics);
      expect(error.claim).toBe(error.report.claim);
      expect(error.canonicalClaim).toBe(error.report.canonicalClaim);
      expect(error.canonicalPlan).toBe(error.report.canonicalPlan);
      expect(error.canonicalResult).toBe(error.report.canonicalResult);
      expect(error.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(error.canonicalResult).toStrictEqual(engine.returnedResult);
    }
  });

  it('returns a failed core report as data from the lower-level evaluator', () => {
    const engine = new RecordingEngine(8_000_000, 'failed');
    const report = evaluateGeoSpecNativeClaim({
      arguments: [],
      canonicalize: recordingCanonicalize,
      capability: 'toBeWatertight',
      claimId: 'raw-failure',
      engine,
      kind: 'watertight',
      polarity: 'positive',
      subject: { subjectHash: hash },
      subjectSlot: 'subject',
      workUnitLimit: 10_000,
    });

    expect(report.status).toBe('failed');
    expect(report.canonicalPlan).toStrictEqual(engine.returnedPlan);
    expect(report.canonicalResult).toStrictEqual(engine.returnedResult);
  });

  it('preserves native canonicalization errors unchanged', async () => {
    const nativeError = new Error('native canonicalization failed');
    const client = createGeoSpecAssertionClient({
      canonicalize: () => {
        throw nativeError;
      },
      engine: new RecordingEngine(),
      workUnitLimit: 10_000,
    });

    try {
      await client.expectGeo({ subjectHash: hash }).toBeWatertight();
      expect.fail('The native canonicalization error should reject the assertion.');
    } catch (error) {
      expect(error).toBe(nativeError);
    }
  });

  it.each([
    {
      arguments: [{ z: 1, a: { y: 2, b: 3 } }],
      canonicalClaim:
        '{"capability":"toHaveVolume","claimId":"literal-nested","payload":{"arguments":[{"a":{"b":3,"y":2},"z":1}],"kind":"volume"},"polarity":"positive","subjectSlots":["subject"],"workUnitBudget":10000}',
      claimId: 'literal-nested',
      label: 'nested keys',
    },
    {
      arguments: [{ z: '雪', a: [3, 2, 1] }],
      canonicalClaim:
        '{"capability":"toHaveVolume","claimId":"literal-unicode","payload":{"arguments":[{"a":[3,2,1],"z":"雪"}],"kind":"volume"},"polarity":"positive","subjectSlots":["subject"],"workUnitBudget":10000}',
      claimId: 'literal-unicode',
      label: 'Unicode values',
    },
  ])(
    'retains exact native-codec claim bytes for independent $label literals',
    ({ arguments: arguments_, canonicalClaim, claimId }) => {
      const engine = new RecordingEngine();
      const expectedClaim = record(JSON.parse(canonicalClaim) as JSONValue);
      const report = evaluateGeoSpecNativeClaim({
        arguments: arguments_,
        canonicalize: (input) => {
          expect(decode(input)).toStrictEqual(expectedClaim);
          return new TextEncoder().encode(canonicalClaim);
        },
        capability: 'toHaveVolume',
        claimId,
        engine,
        kind: 'volume',
        polarity: 'positive',
        subject: { subjectHash: hash },
        subjectSlot: 'subject',
        workUnitLimit: 10_000,
      });

      expect(report.claim).toStrictEqual(expectedClaim);
      expect(new TextDecoder().decode(report.canonicalClaim)).toBe(canonicalClaim);
      expect(report.canonicalPlan).toStrictEqual(engine.returnedPlan);
      expect(report.canonicalResult).toStrictEqual(engine.returnedResult);
    },
  );

  it('preserves the raw mesh content-hash namespace', async () => {
    const engine = new RecordingEngine();
    const client = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine, workUnitLimit: 1 });

    await client.expectGeo({ contentHash: hash }).toBeWatertight();
    const request = record(engine.canonicalInput!);
    const plan = record(request['plan']!);
    expect(plan['subjects']).toStrictEqual([{ slot: 'subject', contentHash: hash }]);
  });

  it('reuses the engine-owned default budget once per engine across clients', async () => {
    const engine = new RecordingEngine(8_000_000);
    const first = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine });
    const second = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine });

    await first.expectGeo({ subjectHash: hash }).toBeWatertight();
    let request = record(engine.canonicalInput!);
    let plan = record(request['plan']!);
    let { claims } = plan;
    expect(record(Array.isArray(claims) ? claims[0]! : null)['workUnitBudget']).toBe(8_000_000);

    await second.expectGeo({ subjectHash: hash }).toHaveNoDiagnostics();
    request = record(engine.canonicalInput!);
    plan = record(request['plan']!);
    ({ claims } = plan);
    expect(record(Array.isArray(claims) ? claims[0]! : null)['workUnitBudget']).toBe(8_000_000);
    expect(engine.initializeCalls).toBe(1);
  });

  it('honors an explicit client budget without replacing it from initialize', async () => {
    const engine = new RecordingEngine(8_000_000);
    const client = createGeoSpecAssertionClient({ canonicalize: recordingCanonicalize, engine, workUnitLimit: 99 });

    await client.expectGeo({ subjectHash: hash }).toBeWatertight();
    const request = record(engine.canonicalInput!);
    const plan = record(request['plan']!);
    const { claims } = plan;
    expect(record(Array.isArray(claims) ? claims[0]! : null)['workUnitBudget']).toBe(99);
    expect(engine.initializeCalls).toBe(0);
  });

  it.each([null, 0, Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed engine-owned default work-unit budget %#',
    async (defaultWorkUnitBudget) => {
      const client = createGeoSpecAssertionClient({
        canonicalize: recordingCanonicalize,
        engine: new RecordingEngine(defaultWorkUnitBudget),
      });

      await expect(client.expectGeo({ subjectHash: hash }).toBeWatertight()).rejects.toThrow(
        defaultWorkUnitBudget === null ? 'omitted defaultWorkUnitBudget' : 'positive exact safe integer',
      );
    },
  );

  it.each([
    { subject: {}, limit: 1, message: 'exactly one' },
    { subject: { contentHash: hash, subjectHash: hash }, limit: 1, message: 'exactly one' },
    { subject: { subjectHash: 'sha256:bad' }, limit: 1, message: '64 lowercase' },
    { subject: { subjectHash: hash }, limit: 0, message: 'positive exact safe integer' },
    { subject: { subjectHash: hash }, limit: Number.MAX_SAFE_INTEGER + 1, message: 'positive exact safe integer' },
  ])('rejects malformed native transport options %#', async ({ subject, limit, message }) => {
    const client = createGeoSpecAssertionClient({
      canonicalize: recordingCanonicalize,
      engine: new RecordingEngine(),
      workUnitLimit: limit,
    });

    await expect(client.expectGeo(subject).toBeWatertight()).rejects.toThrow(message);
  });
});
