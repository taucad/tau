import { describe, expectTypeOf, it } from 'vitest';
import type { KernelId } from '@taucad/types/constants';
import { kernelTierRequirements } from '#kernel-tier-requirements.js';

describe('kernelTierRequirements exhaustiveness', () => {
  it('declares a billing tier for every kernel id', () => {
    expectTypeOf<KernelId>().toEqualTypeOf<keyof typeof kernelTierRequirements>();
    expectTypeOf(kernelTierRequirements.zoo).toEqualTypeOf<'pro'>();
  });
});
