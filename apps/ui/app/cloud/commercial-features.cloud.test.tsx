import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import type { BillingTier, Entitlements } from '@taucad/billing';
import { useCommercialFeatures } from '#cloud/commercial-features.cloud.js';

const plan = vi.hoisted(() => ({
  current: undefined as (Entitlements & { isResolved: boolean; isError: boolean }) | undefined,
}));

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => plan.current }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ refetchQueries: vi.fn() }) }));

const withPlan = (tier: BillingTier, isResolved = true, isError = false) => {
  plan.current = { ...entitlementsFromTier(tier), isResolved, isError };
  return renderHook(() => useCommercialFeatures()).result.current;
};

/* D16/D17: the Sync region's allowance and its one plan action come from the plan. */
describe('useCommercialFeatures storage allowance', () => {
  it('should include 1 GB on Free and offer the upgrade', () => {
    expect(withPlan('free')).toMatchObject({ storageLimitBytes: 1024 ** 3, canUpgradePlan: true });
  });

  it('should offer no larger plan on Enterprise', () => {
    expect(withPlan('enterprise')).toMatchObject({ storageLimitBytes: 1024 ** 4, canUpgradePlan: false });
  });

  it('should be unresolved, with no capability to read, before the plan is known (adaptive app deployment mode I3)', () => {
    const unresolved = withPlan('free', false);
    expect(unresolved).toMatchObject({ isResolved: false, wait: 'checking' });
    expect(unresolved).not.toHaveProperty('canCreatePrivateShares');
    expect(unresolved).not.toHaveProperty('canUpgradePlan');
  });

  it("should read a failed entitlements request as a stated can't-check (I15)", () => {
    expect(withPlan('free', false, true)).toMatchObject({ isResolved: false, wait: 'unavailable' });
  });

  it('should resolve with a pinned basis', () => {
    expect(withPlan('pro')).toMatchObject({ isResolved: true, basis: 'pinned', canCreatePrivateShares: true });
  });
});
