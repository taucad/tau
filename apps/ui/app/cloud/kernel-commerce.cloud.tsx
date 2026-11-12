import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';
import type { KernelId } from '@taucad/types/constants';
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

/**
 * The plan fact for routing (automatic kernel selection blueprint D4): fail closed. A kernel a plan gates is
 * entitled only once the plan has resolved to a tier that allows it, unlike {@link useKernelCommercialAccess}, which
 * fails open so a Pro customer is never asked to upgrade while the plan loads.
 *
 * @returns Whether the resolved plan allows a kernel.
 */
export const useKernelRoutingPlan = (): ((kernel: KernelId) => boolean) => {
  const { tier, isResolved } = useEntitlements();
  return useCallback((kernel: KernelId) => isResolved && isKernelAllowed(kernel, tier), [isResolved, tier]);
};
