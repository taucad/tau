import { describe, it } from 'vitest';
import type { MiddlewareDependencyDeclaration } from '#types/runtime-middleware.types.js';

describe('MiddlewareDependencyDeclaration', () => {
  it('should require the affected operations', () => {
    // @ts-expect-error -- Every middleware dependency must declare the operations it invalidates.
    const dependency: MiddlewareDependencyDeclaration = { path: 'parameters.json' };
    void dependency;
  });
});
