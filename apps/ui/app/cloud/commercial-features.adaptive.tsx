import { useCallback } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useAdaptivePlan } from '#cloud/use-plan-wait.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { CommercialUpgradeLabel as SelfHostUpgradeLabel } from '#cloud/commercial-features.self-host.js';
import type { CommercialFeatures } from '#cloud/plan-facts.types.js';

/**
 * The adaptive facade of `commercial-features` (adaptive app deployment mode charter D6, consumer table): unfunded is
 * the self-host plan (resolved and open) with the mode's basis; funded is the plan the bridge published for the bound
 * identity; anything else is unresolved, with its wait kind and Retry (I3, I15). The hook never swaps implementation.
 */
export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return <FundedSurface fallback={<SelfHostUpgradeLabel />} render={(cloud) => <cloud.CommercialUpgradeLabel />} />;
}

export const useCommercialFeatures = (): CommercialFeatures => {
  const { mode, facts, unresolved } = useAdaptivePlan();
  const { open: openSettings } = useSettingsDialog();
  const requestUpgrade = useCallback(() => {
    openSettings('billing');
  }, [openSettings]);
  if (mode.state === 'unfunded') {
    return {
      isResolved: true,
      basis: mode.basis,
      canCreatePrivateShares: true,
      canSyncFiles: true,
      storageLimitBytes: undefined,
      canUpgradePlan: false,
      requestUpgrade,
    };
  }
  const commercial = mode.state === 'funded' ? facts?.commercial : undefined;
  if (mode.state !== 'funded' || commercial === undefined) {
    return unresolved;
  }
  return { isResolved: true, basis: mode.basis, ...commercial, requestUpgrade };
};
