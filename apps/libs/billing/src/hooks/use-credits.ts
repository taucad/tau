import { useQuery } from '@tanstack/react-query';
import { wireBalanceExplanationSchema } from '@taucad/billing';
import type { WireBalanceExplanation } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- Adjacent TSX provider uses its declared .js import.
import { useBillingSession } from './billing-session.js';

/** Reads the authoritative balance; failed reads never masquerade as zero. */
export const useCredits = (minimum?: {
  environment: string;
  subjectId: string;
  revision: string;
}): WireBalanceExplanation | undefined => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const { data, isError } = useQuery({
    queryKey: ['billing', 'credits', apiBaseUrl, userId, environment, minimum],
    enabled: userId !== undefined && apiBaseUrl !== undefined && environment !== undefined,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<WireBalanceExplanation> => {
      const query = minimum === undefined ? '' : `?minRevision=${encodeURIComponent(minimum.revision)}`;
      const response = await fetch(`${apiBaseUrl}/v1/billing/credits${query}`, { credentials: 'include', signal });
      if (!response.ok) {
        throw new Error(`Credits request failed with ${response.status}`);
      }
      const result = wireBalanceExplanationSchema.parse(await response.json());
      if (result.ownerId !== userId || result.environment !== environment) {
        throw new Error('Balance belongs to a different billing session');
      }
      if (
        minimum !== undefined &&
        (result.environment !== minimum.environment ||
          result.subjectId !== minimum.subjectId ||
          BigInt(result.snapshotRevision) < BigInt(minimum.revision))
      ) {
        throw new Error('Balance does not cover the owned receipt');
      }
      return result;
    },
  });
  return isError ? undefined : data;
};
