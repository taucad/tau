import { describe, expect, it } from 'vitest';

import { canonicalizeCacheValue, encodeCacheValue } from '#cache-value.js';
import type { CacheValue } from '#types.js';

describe('CacheValue canonicalization', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const value = {
      z: 1,
      nested: { beta: true, alpha: ['second', 'first'] },
      a: null,
    } as const;

    expect(canonicalizeCacheValue({ value })).toBe(
      '{"a":null,"nested":{"alpha":["second","first"],"beta":true},"z":1}',
    );
  });

  it('encodes canonical JSON as deterministic UTF-8', () => {
    const bytes = encodeCacheValue({ value: { text: 'τ你🚀' } });

    expect([...bytes]).toEqual([
      123, 34, 116, 101, 120, 116, 34, 58, 34, 207, 132, 228, 189, 160, 240, 159, 154, 128, 34, 125,
    ]);
  });

  const sparseArray: unknown[] = [];
  sparseArray.length = 2;
  sparseArray[1] = 1;

  it.each([
    ['undefined', undefined],
    ['non-finite number', Number.POSITIVE_INFINITY],
    ['negative zero', -0],
    ['sparse array', sparseArray],
    ['date', new Date(0)],
    ['typed array', new Uint8Array([1])],
  ])('rejects %s rather than silently changing its meaning', (_name, value) => {
    expect(() => canonicalizeCacheValue({ value: value as unknown as CacheValue })).toThrow(TypeError);
  });

  it('rejects cycles with a path that identifies the invalid value', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(() => canonicalizeCacheValue({ value: cyclic as unknown as CacheValue })).toThrow('$.self');
  });

  it('rejects properties that canonical JSON would otherwise hide or execute', () => {
    const hidden = { visible: 1 };
    Object.defineProperty(hidden, 'hidden', { value: 2 });
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 });
    const extendedArray = [1] as unknown[] & { extra?: number };
    extendedArray.extra = 2;

    for (const value of [hidden, accessor, extendedArray]) {
      expect(() => canonicalizeCacheValue({ value: value as unknown as CacheValue })).toThrow(TypeError);
    }
  });
});
