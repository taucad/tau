import type { KernelProvider } from '@taucad/runtime';
import { KernelTierBadge } from '@taucad/billing-ui/components/tier-badge';

export function KernelCommercialBadge({
  kernelId,
}: {
  readonly kernelId: KernelProvider;
}): React.JSX.Element | undefined {
  return <KernelTierBadge kernelId={kernelId} />;
}
