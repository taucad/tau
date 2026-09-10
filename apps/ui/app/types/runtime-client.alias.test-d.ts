import type { RuntimeClient, RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import { describe, expectTypeOf, it } from 'vitest';

import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { AppRuntimeClient, KernelOptionsFactory, PageKernelOptionsFactory } from '#types/runtime-client.alias.js';

describe('runtime client aliases', () => {
  it('should keep selected-host clients wider than the browser runtime', () => {
    expectTypeOf<AppRuntimeClient>().toEqualTypeOf<RuntimeClient>();
    expectTypeOf<AppRuntimeClient>().not.toEqualTypeOf<RuntimeClient<typeof runtime>>();
  });

  it('should keep unknown-host options separate from exact browser authoring', () => {
    expectTypeOf<ReturnType<PageKernelOptionsFactory>>().toEqualTypeOf<RuntimeClientOptionsWithTransport>();
    expectTypeOf<ReturnType<PageKernelOptionsFactory>>().not.toExtend<ReturnType<KernelOptionsFactory>>();
  });
});
