import { useCallback } from 'react';

export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return undefined;
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  readonly canSyncFiles: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly isResolved: boolean;
  readonly requestUpgrade: () => void;
} => ({
  canCreatePrivateShares: true,
  /* A self-host build sells nothing, so it gates nothing (N4). */
  canSyncFiles: true,
  hasNoTrainGuarantee: false,
  isResolved: true,
  requestUpgrade: useCallback(() => undefined, []),
});
