import { describe, expect, it } from 'vitest';
import { kernelConfigurations } from '@taucad/types/constants';
import { getKernelRequiredTier, isKernelAllowed, kernelTierRequirements } from '#kernel-tier-requirements.js';

describe('kernelTierRequirements', () => {
  it('covers every configured kernel', () => {
    for (const kernel of kernelConfigurations) {
      expect(kernelTierRequirements[kernel.id]).toBeDefined();
    }
  });

  it('requires pro for Zoo and free for all other kernels', () => {
    expect(getKernelRequiredTier('zoo')).toBe('pro');
    expect(getKernelRequiredTier('openscad')).toBe('free');
    expect(getKernelRequiredTier('replicad')).toBe('free');
    expect(getKernelRequiredTier('manifold')).toBe('free');
    expect(getKernelRequiredTier('jscad')).toBe('free');
    expect(getKernelRequiredTier('opencascadejs')).toBe('free');
  });
});

describe('isKernelAllowed', () => {
  it('allows Zoo only for pro and enterprise tiers', () => {
    expect(isKernelAllowed('zoo', 'free')).toBe(false);
    expect(isKernelAllowed('zoo', 'pro')).toBe(true);
    expect(isKernelAllowed('zoo', 'enterprise')).toBe(true);
  });

  it('allows free kernels for every tier', () => {
    expect(isKernelAllowed('replicad', 'free')).toBe(true);
    expect(isKernelAllowed('replicad', 'pro')).toBe(true);
  });
});
