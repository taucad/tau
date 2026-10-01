import { describe, it } from 'vitest';
import type { MiddlewareDependency } from '#types/runtime-middleware-v2.types.js';

describe('MiddlewareDependency', () => {
  it('should require the affected operations', () => {
    // @ts-expect-error -- Every middleware dependency must declare the operations it invalidates.
    const dependency: MiddlewareDependency = { path: 'parameters.json' };
    void dependency;
  });
});
