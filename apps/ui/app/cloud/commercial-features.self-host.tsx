import { useCallback } from 'react';

export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return undefined;
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  readonly canSyncFiles: boolean;
  readonly canConnectGitHub: boolean;
  readonly storageLimitBytes: number | undefined;
  readonly canUpgradePlan: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly isResolved: boolean;
  readonly requestUpgrade: () => void;
} => ({
  canCreatePrivateShares: true,
  /* A self-host build sells nothing, so it gates nothing (N4). */
  canSyncFiles: true,
  canConnectGitHub: true,
  /* The server's own allowance, which this build has no plan table for. */
  storageLimitBytes: undefined,
  canUpgradePlan: false,
  hasNoTrainGuarantee: false,
  isResolved: true,
  requestUpgrade: useCallback(() => undefined, []),
});
