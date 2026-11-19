import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import type { BillingTier, Entitlements } from '@taucad/billing';
import { entitlementDeadlines, useCommercialFeatures } from '#cloud/commercial-features.cloud.js';
import { askDeadlineMilliseconds } from '#lib/ask-deadline.js';

const plan = vi.hoisted(() => ({
  current: undefined as (Entitlements & { isResolved: boolean; isError: boolean }) | undefined,
}));

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => plan.current }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ refetchQueries: vi.fn() }) }));
const session = vi.hoisted(() => ({ userId: 'u1' as string | undefined }));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({ apiBaseUrl: 'https://api.test', environment: 'staging', userId: session.userId }),
}));

beforeEach(() => {
  session.userId = 'u1';
  entitlementDeadlines.cancel();
});

afterEach(() => {
  vi.useRealTimers();
});

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

/* Adaptive app deployment mode I15 on a pinned cloud build: no person-visible wait is open-ended. */
describe('useCommercialFeatures deadline', () => {
  it('should check for one ask deadline, then say it cannot check, then resolve when the answer arrives', () => {
    vi.useFakeTimers();
    plan.current = { ...entitlementsFromTier('pro'), isResolved: false, isError: false };
    const view = renderHook(() => useCommercialFeatures());
    expect(view.result.current).toMatchObject({ isResolved: false, wait: 'checking' });
    act(() => {
      vi.advanceTimersByTime(askDeadlineMilliseconds - 1);
    });
    expect(view.result.current).toMatchObject({ isResolved: false, wait: 'checking' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.result.current).toMatchObject({ isResolved: false, wait: 'unavailable' });
    plan.current = { ...entitlementsFromTier('pro'), isResolved: true, isError: false };
    view.rerender();
    expect(view.result.current).toMatchObject({ isResolved: true, canCreatePrivateShares: true });
  });

  it('should check again for one deadline on Retry', () => {
    vi.useFakeTimers();
    plan.current = { ...entitlementsFromTier('free'), isResolved: false, isError: false };
    const view = renderHook(() => useCommercialFeatures());
    act(() => {
      vi.advanceTimersByTime(askDeadlineMilliseconds);
    });
    const { current } = view.result;
    expect(current).toMatchObject({ wait: 'unavailable' });
    act(() => {
      if (!current.isResolved) {
        current.retry();
      }
    });
    expect(view.result.current).toMatchObject({ wait: 'checking' });
  });

  it('should read a signed-out session, whose query is disabled, as unavailable at once, never checking', () => {
    session.userId = undefined;
    expect(withPlan('free', false)).toMatchObject({ isResolved: false, wait: 'unavailable' });
  });
});
