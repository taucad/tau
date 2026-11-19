import type { KernelProvider } from '@taucad/runtime';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { useCloudFacts } from '#cloud/cloud-port.js';
import {
  KernelCommercialBadge as SelfHostKernelBadge,
  useKernelRoutingPlan as useSelfHostRoutingPlan,
} from '#cloud/kernel-commerce.self-host.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- no caller; W4 deletes it.
export { useKernelCommercialAccess } from '#cloud/kernel-commerce.self-host.js';

/** The adaptive facade of `kernel-commerce` (W2 skeleton): answers as the self-host build until W4 and W5. */
export function KernelCommercialBadge(props: { readonly kernelId: KernelProvider }): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostKernelBadge {...props} />} render={() => undefined} />;
}

export const useKernelRoutingPlan: typeof useSelfHostRoutingPlan = () => {
  useCloudFacts(undefined);
  return useSelfHostRoutingPlan();
};
