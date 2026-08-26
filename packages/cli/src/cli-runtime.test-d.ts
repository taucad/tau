import { describe, expectTypeOf, it } from 'vitest';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import type { CliRuntimeOptions, createCliRuntime } from '#cli-runtime.js';

describe('createCliRuntime types', () => {
  it('takes only loaded plugin factories and configured instances', () => {
    expectTypeOf<Parameters<typeof createCliRuntime>>().toEqualTypeOf<[options?: CliRuntimeOptions]>();
  });
});
