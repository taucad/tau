import { useQuery } from '@tanstack/react-query';
import { wireOpenHoldsSchema } from '@taucad/billing';
import type { WireOpenHolds } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- Adjacent TSX provider uses its declared .js import.
import { useBillingSession } from './billing-session.js';

/** Milliseconds between polls; a released hold disappears without a reload. */
const holdsRefetchInterval = 15_000;

/**
 * Reads the customer holds still open on the account.
 *
 * A hold lives only as long as its turn, so the read is never cached and is polled;
 * a failed read stays `undefined` rather than reporting an account with nothing
 * reserved.
 */
export const useOpenHolds = (): WireOpenHolds | undefined => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const { data, isError } = useQuery({
    queryKey: ['billing', 'holds', apiBaseUrl, userId, environment],
    enabled: userId !== undefined && apiBaseUrl !== undefined && environment !== undefined,
    staleTime: 0,
    refetchInterval: holdsRefetchInterval,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<WireOpenHolds> => {
      const response = await fetch(`${apiBaseUrl}/v1/billing/holds`, { credentials: 'include', signal });
      if (!response.ok) {
        throw new Error(`Open holds request failed with ${response.status}`);
      }
      const result = wireOpenHoldsSchema.parse(await response.json());
      if (result.ownerId !== userId || result.environment !== environment) {
        throw new Error('Open holds belong to a different billing session');
      }
      return result;
    },
  });
  return isError ? undefined : data;
};
