import { useQuery } from '@tanstack/react-query';
import type { KernelId } from '@taucad/types/constants';
import { entitlementsFromTier, getKernelRequiredTier, parseEntitlements, tierMeets } from '@taucad/billing';
import type { BillingTier, Entitlements } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- TSX cannot resolve through the canonical `#*.js` → `.ts` import map.
import { useBillingSession } from './billing-session.js';

const freeFallback = entitlementsFromTier('free');

/**
 * The viewer's entitlements. Until the server answers, `isResolved` is false and the value is the Free
 * fallback, so callers that name a plan or offer a purchase render a neutral state instead.
 */
export const useEntitlements = (): Entitlements & { readonly isResolved: boolean } => {
  const { apiBaseUrl, userId } = useBillingSession();
  const { data } = useQuery({
    queryKey: ['billing', 'entitlements', apiBaseUrl, userId],
    enabled: userId !== undefined && apiBaseUrl !== undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<Entitlements> => {
      const response = await fetch(`${apiBaseUrl}/v1/billing/entitlements`, { credentials: 'include', signal });
      if (!response.ok) {
        throw new Error(`Entitlements request failed with ${response.status}`);
      }
      return parseEntitlements(await response.json());
    },
  });
  return data === undefined ? { ...freeFallback, isResolved: false } : { ...data, isResolved: true };
};

export const useKernelTierRequirement = (
  kernelId: KernelId,
): { readonly requiredTier: BillingTier; readonly isUnlocked: boolean; readonly isPro: boolean } => {
  const entitlements = useEntitlements();
  const requiredTier = getKernelRequiredTier(kernelId);
  return { requiredTier, isUnlocked: tierMeets(entitlements.tier, requiredTier), isPro: requiredTier === 'pro' };
};
