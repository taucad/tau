import { availableParallelism } from 'node:os';
import { beforeEach, expect, it, vi } from 'vitest';
import { Engine, ProtocolError } from '@taucad/geospec-engine-native/node';

const nativeConstruct = vi.hoisted(() => vi.fn());
const nativeClose = vi.hoisted(() => vi.fn());
const nativeEvaluateClaim = vi.hoisted(() => vi.fn<(request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>>());
vi.mock('#native-binding', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the generated binding export.
  Engine: class {
    public constructor(cacheOptions?: unknown, executionPermits?: number) {
      nativeConstruct(cacheOptions, executionPermits);
    }

    public close(): void {
      nativeClose();
    }

    public evaluateClaim(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
      return nativeEvaluateClaim(request);
    }
  },
}));

beforeEach(() => {
  nativeConstruct.mockClear();
  nativeClose.mockClear();
});

it('should preserve cache construction and forward an explicit caller-inclusive permit', () => {
  const cache = { root: '/cache', projectRoot: '/project' };
  new Engine().close();
  new Engine(cache).close();
  new Engine(undefined, 1).close();
  new Engine(cache, 1).close();
  expect(nativeConstruct.mock.calls).toEqual([
    [undefined, undefined],
    [cache, undefined],
    [undefined, 1],
    [cache, 1],
  ]);
  expect(nativeClose).toHaveBeenCalledTimes(4);
});

it('should refuse invalid or over-cap permits before constructing the binding', () => {
  for (const value of [0, 1.5, Number.NaN, availableParallelism() + 1]) {
    try {
      const engine = new Engine(undefined, value);
      engine.close();
      expect.fail('invalid grant should be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      expect(error).toMatchObject({ code: 'invalid-request' });
      expect((error as Error).message).toContain('Execution permits must be a positive integer');
    }
  }
  expect(nativeConstruct).not.toHaveBeenCalled();
});

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const claimFrame = (plan: string, claim: string, result: string): Uint8Array<ArrayBuffer> => {
  const lengths = new DataView(new ArrayBuffer(8));
  lengths.setUint32(0, encode(plan).byteLength, true);
  lengths.setUint32(4, encode(claim).byteLength, true);
  return Uint8Array.from([...new Uint8Array(lengths.buffer), ...encode(plan), ...encode(claim), ...encode(result)]);
};

it('should split one evaluateClaim frame into plan, claim and result views over one copy', () => {
  nativeEvaluateClaim.mockReturnValueOnce(claimFrame('{"plan":1}', '{"claim":2}', '{"results":[]}'));
  const engine = new Engine();
  const evaluation = engine.evaluateClaim(encode('{}'));
  engine.close();
  const sections = [evaluation.canonicalPlan, evaluation.canonicalClaim, evaluation.canonicalResult];
  expect(sections.map((bytes) => new TextDecoder().decode(bytes))).toEqual([
    '{"plan":1}',
    '{"claim":2}',
    '{"results":[]}',
  ]);
  expect(evaluation.canonicalClaim.buffer).toBe(evaluation.canonicalPlan.buffer);
  expect(evaluation.canonicalResult.buffer).toBe(evaluation.canonicalPlan.buffer);
});

it('should refuse an evaluateClaim frame shorter than its declared sections', () => {
  const engine = new Engine();
  for (const frame of [new Uint8Array(7), claimFrame('{"plan":1}', '{"claim":2}', '').subarray(0, 12)]) {
    nativeEvaluateClaim.mockReturnValueOnce(Uint8Array.from(frame));
    expect(() => engine.evaluateClaim(encode('{}'))).toThrow(ProtocolError);
  }
  engine.close();
});
