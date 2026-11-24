import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommercialFeatures } from '#cloud/plan-facts.types.js';
import { storageLimitBytesByTier } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { createAskDeadlines } from '#lib/ask-deadline.js';
import { ProBadge } from '@taucad/billing-ui/components/tier-badge';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

export function CommercialUpgradeLabel(): React.JSX.Element {
  return (
    <>
      <ProBadge /> Upgrade
    </>
  );
}

/** The entitlements' person-visible waits, one deadline per account and API (I15). @public */
export const entitlementDeadlines = createAskDeadlines();

/**
 * The plan from the account's entitlements (a pinned `cloud` build, adaptive app deployment mode I3, I15). Unresolved
 * while they load, as `checking` for one ask deadline and then `unavailable` with Retry; a failed request is
 * `unavailable` at once; background retries continue and a late answer resolves it. With no account or API to ask
 * (signed out), there is no answer coming, so it is `unavailable`, never an open-ended wait. A Pro customer is never
 * asked to buy Pro while the plan is unknown.
 */
export const useCommercialFeatures = (): CommercialFeatures => {
  const entitlements = useEntitlements();
  const { apiBaseUrl, userId } = useBillingSession();
  const { open: openSettings } = useSettingsDialog();
  const queryClient = useQueryClient();
  const asks = apiBaseUrl !== undefined && userId !== undefined;
  const key = asks ? JSON.stringify([apiBaseUrl, userId]) : undefined;
  const pending = asks && !entitlements.isResolved && !entitlements.isError;
  /* The deadline is a module store's timer; the layout effect only says which wait is on screen. */
  useLayoutEffect(() => {
    if (pending && key !== undefined) {
      entitlementDeadlines.start(key);
    }
  }, [key, pending]);
  const readExpired = useCallback(() => entitlementDeadlines.expired(key), [key]);
  const expired = useSyncExternalStore(entitlementDeadlines.subscribe, readExpired, () => false);
  const requestUpgrade = useCallback(() => {
    openSettings('billing');
  }, [openSettings]);
  const retry = useCallback(() => {
    if (key !== undefined) {
      entitlementDeadlines.restart(key);
    }
    void queryClient.refetchQueries({ queryKey: ['billing', 'entitlements'] });
  }, [key, queryClient]);
  if (!entitlements.isResolved) {
    return { isResolved: false, wait: pending && !expired ? 'checking' : 'unavailable', retry };
  }
  return {
    isResolved: true,
    basis: 'pinned',
    canCreatePrivateShares: entitlements.canCreatePrivateShares,
    canSyncFiles: entitlements.canSyncFiles,
    storageLimitBytes: entitlements.canSyncFiles ? storageLimitBytesByTier[entitlements.tier] : undefined,
    canUpgradePlan: entitlements.tier !== 'enterprise',
    requestUpgrade,
  };
};
