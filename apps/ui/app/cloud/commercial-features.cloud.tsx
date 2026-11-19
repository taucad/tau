import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommercialFeatures } from '#cloud/plan-facts.types.js';
import { storageLimitBytesByTier } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { ProBadge } from '@taucad/billing-ui/components/tier-badge';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

export function CommercialUpgradeLabel(): React.JSX.Element {
  return (
    <>
      <ProBadge /> Upgrade
    </>
  );
}

/**
 * The plan from the account's entitlements (a pinned `cloud` build). Unresolved while they load (`checking`) or after
 * their request failed (`unavailable`); a Pro customer is never asked to buy Pro while the plan is unknown.
 */
export const useCommercialFeatures = (): CommercialFeatures => {
  const entitlements = useEntitlements();
  const { open: openSettings } = useSettingsDialog();
  const queryClient = useQueryClient();
  const requestUpgrade = useCallback(() => {
    openSettings('billing');
  }, [openSettings]);
  const retry = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: ['billing', 'entitlements'] });
  }, [queryClient]);
  if (!entitlements.isResolved) {
    return { isResolved: false, wait: entitlements.isError ? 'unavailable' : 'checking', retry };
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
