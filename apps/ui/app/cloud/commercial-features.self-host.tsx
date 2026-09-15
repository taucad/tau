import { useCallback } from 'react';

export function CommercialUpgradeLabel(): React.JSX.Element | undefined {
  return undefined;
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly requestUpgrade: () => void;
} => ({
  canCreatePrivateShares: true,
  hasNoTrainGuarantee: false,
  requestUpgrade: useCallback(() => undefined, []),
});
