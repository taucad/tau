import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';
import type { KernelId } from '@taucad/types/constants';
import { isKernelAllowed } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { KernelTierBadge } from '@taucad/billing-ui/components/tier-badge';

export function KernelCommercialBadge({
  kernelId,
}: {
  readonly kernelId: KernelProvider;
}): React.JSX.Element | undefined {
  return <KernelTierBadge kernelId={kernelId} />;
}

/**
 * The plan fact for routing (automatic kernel selection blueprint D4): fail closed. A kernel a plan gates is
 * entitled only once the plan has resolved to a tier that allows it.
 *
 * @returns Whether the resolved plan allows a kernel.
 */
export const useKernelRoutingPlan = (): ((kernel: KernelId) => boolean) => {
  const { tier, isResolved } = useEntitlements();
  return useCallback((kernel: KernelId) => isResolved && isKernelAllowed(kernel, tier), [isResolved, tier]);
};
