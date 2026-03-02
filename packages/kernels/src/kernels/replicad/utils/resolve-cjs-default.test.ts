import { describe, it, expect } from 'vitest';
import { resolveCjsDefault } from '#kernels/replicad/utils/resolve-cjs-default.js';

describe('resolveCjsDefault', () => {
  it('returns a function as-is (static import path)', () => {
    const fn = (): string => 'hello';
    expect(resolveCjsDefault(fn)).toBe(fn);
  });

  it('unwraps a double-wrapped CJS default (dynamic import path)', () => {
    const fn = (): string => 'hello';

    const wrapped = { __esModule: true, default: fn };
    expect(resolveCjsDefault(wrapped)).toBe(fn);
  });

  it('unwraps when only default is present (no __esModule)', () => {
    const fn = (): string => 'hello';
    const wrapped = { default: fn };
    expect(resolveCjsDefault(wrapped)).toBe(fn);
  });

  it('returns non-function values without a default property as-is', () => {
    const object = { foo: 'bar' };
    expect(resolveCjsDefault(object)).toBe(object);
  });

  it('returns primitives as-is', () => {
    expect(resolveCjsDefault(42)).toBe(42);
    expect(resolveCjsDefault('str')).toBe('str');
  });
});
