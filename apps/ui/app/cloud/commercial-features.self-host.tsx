import { useCallback } from 'react';

export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return undefined;
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  readonly canSyncFiles: boolean;
  readonly canConnectGitHub: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly requestUpgrade: () => void;
} => ({
  canCreatePrivateShares: true,
  /* A self-host build sells nothing, so it gates nothing (N4). */
  canSyncFiles: true,
  canConnectGitHub: true,
  hasNoTrainGuarantee: false,
  requestUpgrade: useCallback(() => undefined, []),
});
