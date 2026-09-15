import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';
import { isKernelAllowed } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { KernelTierBadge } from '#components/tier-badge.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';

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
  const { tier } = useEntitlements();
  return {
    isAllowed: useCallback((kernel: KernelProvider) => isKernelAllowed(kernel, tier), [tier]),
    requestUpgrade: useCallback(() => {
      openSettingsDialog('billing');
    }, []),
  };
};
