import { useQuery } from '@tanstack/react-query';
import { parseCreditAccount } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- TSX cannot resolve through the canonical `#*.js` → `.ts` import map.
import { useBillingSession } from './billing-session.js';
import { billingQueryClient } from '#hooks/query-client.js';

type CreditAccount = ReturnType<typeof parseCreditAccount>;

export const useCredits = (): CreditAccount | undefined => {
  const { apiBaseUrl, userId } = useBillingSession();
  const { data } = useQuery(
    {
      queryKey: ['billing', 'credits', userId],
      enabled: userId !== undefined && apiBaseUrl !== undefined,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      queryFn: async (): Promise<CreditAccount> => {
        const response = await fetch(`${apiBaseUrl}/v1/billing/credits`, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Credits request failed with ${response.status}`);
        }
        return parseCreditAccount(await response.json());
      },
    },
    billingQueryClient,
  );
  return data;
};
