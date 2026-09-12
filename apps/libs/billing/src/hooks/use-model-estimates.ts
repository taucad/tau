import { useQuery } from '@tanstack/react-query';
import { wireModelEstimatesSchema } from '@taucad/billing';
import type { WireModelEstimates } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- Adjacent TSX provider uses its declared .js import.
import { useBillingSession } from './billing-session.js';

/**
 * Reads the hold admission would authorize for one representative turn per route.
 *
 * The estimate is advisory: an unavailable read stays `undefined` so callers fall
 * open to the server's own admission rather than blocking a turn on a missing number.
 */
export const useModelEstimates = (): WireModelEstimates | undefined => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const { data, isError } = useQuery({
    queryKey: ['billing', 'model-estimates', apiBaseUrl, userId, environment],
    enabled: userId !== undefined && apiBaseUrl !== undefined && environment !== undefined,
    // The estimate only moves when the published tariff does, unlike a balance.
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<WireModelEstimates> => {
      const response = await fetch(`${apiBaseUrl}/v1/billing/model-estimates`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) {
        throw new Error(`Model estimates request failed with ${response.status}`);
      }
      const result = wireModelEstimatesSchema.parse(await response.json());
      if (result.ownerId !== userId || result.environment !== environment) {
        throw new Error('Model estimates belong to a different billing session');
      }
      return result;
    },
  });
  return isError ? undefined : data;
};
