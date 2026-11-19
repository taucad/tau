import type { KernelProvider } from '@taucad/runtime';
import type { KernelId } from '@taucad/types/constants';
import { getKernelRequiredTier } from '@taucad/billing/kernel-tier-requirements';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { cloudPort } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';
import { KernelCommercialBadge as SelfHostKernelBadge } from '#cloud/kernel-commerce.self-host.js';

/** The adaptive facade of `kernel-commerce` (adaptive app deployment mode charter D6, C6, C8). */
export function KernelCommercialBadge(props: { readonly kernelId: KernelProvider }): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostKernelBadge {...props} />} render={() => undefined} />;
}

/**
 * Whether the plan allows a kernel for routing, checked when called (I4): the facts the bridge published for the
 * identity bound now. With none (unfunded, unknown, signed out, or the plan not yet read), a kernel no plan gates is
 * allowed and a gated one (Zoo) is left out of automatic routing (C6); the selector still lists it.
 *
 * @param kernel - The kernel.
 * @returns Whether routing may offer it.
 * @public
 */
export const isKernelRoutable = (kernel: KernelId): boolean => {
  const facts = cloudPort.read(cloudPort.current()) as CloudPlanFacts | undefined;
  return facts?.kernels === undefined
    ? getKernelRequiredTier(kernel) === 'free'
    : facts.kernels.allowed.includes(kernel);
};

/** One function for the page's life: it reads the bound identity when called. */
export const useKernelRoutingPlan = (): ((kernel: KernelId) => boolean) => isKernelRoutable;
