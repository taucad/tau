import { describe, expectTypeOf, it } from 'vitest';
import type { CliRuntimeOptions, createCliRuntime } from '#cli-runtime.js';

describe('createCliRuntime types', () => {
  it('takes only loaded plugin factories and configured instances', () => {
    expectTypeOf<Parameters<typeof createCliRuntime>>().toEqualTypeOf<[options?: CliRuntimeOptions]>();
  });
});
