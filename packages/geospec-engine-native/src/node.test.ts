import { availableParallelism } from 'node:os';
import { beforeEach, expect, it, vi } from 'vitest';
import { Engine, ProtocolError } from '@taucad/geospec-engine-native/node';

const nativeConstruct = vi.hoisted(() => vi.fn());
const nativeClose = vi.hoisted(() => vi.fn());
vi.mock('#native-binding', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the generated binding export.
  Engine: class {
    public constructor(cacheOptions?: unknown, executionPermits?: number) {
      nativeConstruct(cacheOptions, executionPermits);
    }

    public close(): void {
      nativeClose();
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
