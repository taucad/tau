import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';
import { isKernelAllowed } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { KernelTierBadge } from '#components/tier-badge.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

export function KernelCommercialBadge({
  kernelId,
}: {
  readonly kernelId: KernelProvider;
}): React.JSX.Element | undefined {
  return <KernelTierBadge kernelId={kernelId} />;
}

export const useKernelCommercialAccess = (): {
  readonly isAllowed: (kernel: KernelProvider) => boolean;
  readonly requestUpgrade: () => void;
} => {
  const { tier, isResolved } = useEntitlements();
  const { open: openSettings } = useSettingsDialog();
  return {
    // The kernel gateway enforces the tier; an unresolved plan must not prompt a Pro customer to upgrade.
    isAllowed: useCallback(
      (kernel: KernelProvider) => !isResolved || isKernelAllowed(kernel, tier),
      [isResolved, tier],
    ),
    requestUpgrade: useCallback(() => {
      openSettings('billing');
    }, [openSettings]),
  };
};
