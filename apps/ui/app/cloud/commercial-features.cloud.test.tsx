import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import type { BillingTier, Entitlements } from '@taucad/billing';
import { useCommercialFeatures } from '#cloud/commercial-features.cloud.js';

const plan = vi.hoisted(() => ({ current: undefined as (Entitlements & { isResolved: boolean }) | undefined }));

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => plan.current }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));

const withPlan = (tier: BillingTier, isResolved = true, freeTierSync = true) => {
  plan.current = { ...entitlementsFromTier(tier, { freeTierSync }), isResolved };
  return renderHook(() => useCommercialFeatures()).result.current;
};

/* D16/D17: the Sync region's allowance and its one plan action come from the plan. */
describe('useCommercialFeatures storage allowance', () => {
  it('should include 1 GB on Free and offer the upgrade', () => {
    expect(withPlan('free')).toMatchObject({ storageLimitBytes: 1024 ** 3, canUpgradePlan: true });
  });

  it('should offer no larger plan on Enterprise', () => {
    expect(withPlan('enterprise')).toMatchObject({ storageLimitBytes: 100 * 1024 ** 3, canUpgradePlan: false });
  });

  it('should say nothing about storage or upgrades before the plan is known', () => {
    expect(withPlan('free', false)).toMatchObject({ storageLimitBytes: undefined, canUpgradePlan: false });
  });

  it('should include no allowance while D23 keeps free sync closed', () => {
    expect(withPlan('free', true, false).storageLimitBytes).toBeUndefined();
  });
});
