import { describe, it, expect } from 'vitest';
import { resolveCjsDefault } from '#utils/resolve-cjs-default.js';

describe('resolveCjsDefault', () => {
  it('returns a function as-is (static import path)', () => {
    const function_ = (): string => 'hello';
    expect(resolveCjsDefault(function_)).toBe(function_);
  });

  it('unwraps a double-wrapped CJS default (dynamic import path)', () => {
    const function_ = (): string => 'hello';

    const wrapped = { __esModule: true, default: function_ };
    expect(resolveCjsDefault(wrapped)).toBe(function_);
  });

  it('unwraps when only default is present (no __esModule)', () => {
    const function_ = (): string => 'hello';
    const wrapped = { default: function_ };
    expect(resolveCjsDefault(wrapped)).toBe(function_);
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
