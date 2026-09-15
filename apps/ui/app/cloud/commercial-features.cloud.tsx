import { useCallback } from 'react';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { ProBadge } from '#components/tier-badge.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';

export function CommercialUpgradeLabel(): React.JSX.Element {
  return (
    <>
      <ProBadge /> Upgrade
    </>
  );
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly requestUpgrade: () => void;
} => {
  const entitlements = useEntitlements();
  return {
    canCreatePrivateShares: entitlements.canCreatePrivateShares,
    hasNoTrainGuarantee: entitlements.tier !== 'free',
    requestUpgrade: useCallback(() => {
      openSettingsDialog('billing');
    }, []),
  };
};
