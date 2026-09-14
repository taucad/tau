import { describe, expectTypeOf, it } from 'vitest';
import { createParameterClient } from '#parameter-client.js';
import type { ParameterClient, ParameterCloseOutcome, ParameterResolveOutcome } from '#parameter-client.js';
import type { ParameterSetOutcome } from '#parameter-set.machine.js';
import type { RuntimeClient } from '#client/runtime-client-core.js';

describe('parameter client public types', () => {
  it('keeps resolve, operation, and close outcomes explicit', () => {
    expectTypeOf(createParameterClient).toBeFunction();
    expectTypeOf<ReturnType<ParameterClient['resolve']>>().toEqualTypeOf<Promise<ParameterResolveOutcome>>();
    expectTypeOf<ReturnType<ParameterClient['submit']>>().toEqualTypeOf<Promise<ParameterSetOutcome>>();
    expectTypeOf<ReturnType<ParameterClient['close']>>().toEqualTypeOf<Promise<ParameterCloseOutcome>>();
  });

  it('keeps runtime resolution mode explicit', () => {
    expectTypeOf<NonNullable<Parameters<RuntimeClient['resolveParameters']>[0]['resolution']>['mode']>().toEqualTypeOf<
      'default' | 'declared-only' | undefined
    >();
  });
});
