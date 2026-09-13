import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient } from '#assertion-client/index.js';
import type { GeoSpecAssertionClient, GeoSpecNativeEngine } from '#assertion-client/index.js';

export const subject = { subjectHash: 'b'.repeat(64) };

const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): Record<string, JSONValue> =>
  JSON.parse(new TextDecoder().decode(value)) as Record<string, JSONValue>;
let completed = 0;
let retryAttempts = 0;

class SettlementEngine implements GeoSpecNativeEngine {
  #request?: Record<string, JSONValue>;

  readonly #engineId: string;

  public constructor(engineId: string) {
    this.#engineId = engineId;
  }

  public canonicalPlan(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    this.#request = decode(request);
    return Uint8Array.from(request);
  }

  public evaluatePlan(_plan: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    completed += 1;
    const plan = this.#request?.['plan'] as {
      claims: [
        {
          claimId: string;
          polarity: string;
          payload: { arguments: [{ disposition?: string; retry?: boolean; value?: number }] };
        },
      ];
    };
    const [claim] = plan.claims;
    const [expected] = claim.payload.arguments;
    const { disposition } = expected;
    const positiveSatisfied = expected.retry === true ? ++retryAttempts > 1 : expected.value === 1;
    const passed = positiveSatisfied === (claim.polarity === 'positive');
    return encode({
      results: [
        disposition === 'refused'
          ? {
              claimId: claim.claimId,
              diagnostics: [
                { code: 'GEOSPEC_CAPABILITY_UNAVAILABLE', message: 'volume capability unavailable', severity: 'error' },
              ],
              status: 'refused',
            }
          : {
              claimId: claim.claimId,
              diagnostics: passed ? [] : [{ code: 'MISMATCH', message: 'volume mismatch', severity: 'error' }],
              evidence: { engineId: this.#engineId, positiveSatisfied },
              status: passed ? 'passed' : 'failed',
            },
      ],
    });
  }

  public processRequest(_request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    throw new Error('Unexpected direct request.');
  }
}

export const createSettlementClient = (engineId = 'settlement'): GeoSpecAssertionClient =>
  createGeoSpecAssertionClient({
    canonicalize: (input) => Uint8Array.from(input),
    engine: new SettlementEngine(engineId),
    workUnitLimit: 10_000,
  });

export const delayedSubject = async (): Promise<typeof subject> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  return subject;
};

export const completedCount = (): number => completed;
export const resetCompletedCount = (): void => {
  completed = 0;
};
