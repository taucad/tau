import { useCallback } from 'react';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { ProBadge } from '#components/tier-badge.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

export function CommercialUpgradeLabel(): React.JSX.Element {
  return (
    <>
      <ProBadge /> Upgrade
    </>
  );
}

export const useCommercialFeatures = (): {
  readonly canCreatePrivateShares: boolean;
  /** Whether this plan may back a project's files up to Tau Cloud (N4). */
  readonly canSyncFiles: boolean;
  /** Whether this plan may connect a Git remote (N4). */
  readonly canConnectGitHub: boolean;
  readonly hasNoTrainGuarantee: boolean;
  readonly requestUpgrade: () => void;
} => {
  const entitlements = useEntitlements();
  const { open: openSettings } = useSettingsDialog();
  return {
    canCreatePrivateShares: entitlements.canCreatePrivateShares,
    canSyncFiles: entitlements.canSyncFiles,
    canConnectGitHub: entitlements.canConnectGitHub,
    hasNoTrainGuarantee: entitlements.tier !== 'free',
    requestUpgrade: useCallback(() => {
      openSettings('billing');
    }, [openSettings]),
  };
};
