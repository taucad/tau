import type { KernelId } from '@taucad/types/constants';
import type { BillingTier } from '#billing-tier.js';
import { tierMeets } from '#billing-tier.js';

/**
 * Minimum billing tier required per CAD kernel.
 * Zoo requires Pro because it depends on cloud WebSocket access.
 * @public
 */
export const kernelTierRequirements = {
  openscad: 'free',
  replicad: 'free',
  manifold: 'free',
  jscad: 'free',
  opencascadejs: 'free',
  zoo: 'pro',
} as const satisfies Record<KernelId, BillingTier>;

/**
 * Returns the minimum billing tier required to use a kernel.
 *
 * @param kernelId - Canonical kernel identifier
 * @returns The required billing tier
 * @public
 * @example <caption>Look up the tier required for Zoo</caption>
 * ```typescript
 * import { getKernelRequiredTier } from '@taucad/billing';
 *
 * getKernelRequiredTier('zoo'); // 'pro'
 * getKernelRequiredTier('replicad'); // 'free'
 * ```
 */
export const getKernelRequiredTier = (kernelId: KernelId): BillingTier => kernelTierRequirements[kernelId];

/**
 * Returns whether a subscriber tier may use the given kernel.
 *
 * @param kernelId - Canonical kernel identifier
 * @param tier - The subscriber's billing tier
 * @returns `true` when the tier meets the kernel requirement
 * @public
 */
export const isKernelAllowed = (kernelId: KernelId, tier: BillingTier): boolean =>
  tierMeets(tier, getKernelRequiredTier(kernelId));
