import { useCallback } from 'react';
import type { KernelProvider } from '@taucad/runtime';

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
