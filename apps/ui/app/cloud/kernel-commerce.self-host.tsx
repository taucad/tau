import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';
import type { KernelId } from '@taucad/types/constants';

export function KernelCommercialBadge(_props: { readonly kernelId: KernelProvider }): React.JSX.Element | undefined {
  return undefined;
}

export const useKernelCommercialAccess = (): {
  readonly isAllowed: (kernel: KernelProvider) => boolean;
  readonly requestUpgrade: () => void;
} => ({
  isAllowed: useCallback(() => true, []),
  requestUpgrade: useCallback(() => undefined, []),
});

/**
 * The plan fact for routing: a self-hosted Tau has no plan gate (blueprint Appendix C).
 *
 * @returns Whether the plan allows a kernel: always.
 */
export const useKernelRoutingPlan = (): ((kernel: KernelId) => boolean) => useCallback((_kernel: KernelId) => true, []);
