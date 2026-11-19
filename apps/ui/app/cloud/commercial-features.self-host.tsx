import { useCallback } from 'react';
import type { CommercialFeatures } from '#cloud/plan-facts.types.js';

export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return undefined;
}

/** A self-host build sells nothing, so it gates nothing (N4): resolved and open, pinned. */
export const useCommercialFeatures = (): CommercialFeatures => ({
  isResolved: true,
  basis: 'pinned',
  canCreatePrivateShares: true,
  canSyncFiles: true,
  /* The server's own allowance, which this build has no plan table for. */
  storageLimitBytes: undefined,
  canUpgradePlan: false,
  requestUpgrade: useCallback(() => undefined, []),
});
