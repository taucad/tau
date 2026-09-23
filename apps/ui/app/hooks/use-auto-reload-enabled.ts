import { useQuery } from '@tanstack/react-query';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { getReloadConsent } from '#lib/billing-lifecycle-client.js';

/** Whether the account's automatic reload consent is enabled; false while unknown. */
export const useAutoReloadEnabled = (): boolean => {
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const subjectId = useCredits()?.subjectId;
  const { data } = useQuery({
    queryKey: ['billing', 'reload-consent', apiBaseUrl, environment, userId, subjectId],
    enabled: apiBaseUrl !== undefined && environment !== undefined && userId !== undefined && subjectId !== undefined,
    queryFn: async () =>
      (await getReloadConsent({ apiBaseUrl: apiBaseUrl!, environment: environment!, ownerId: userId!, subjectId })) ??
      null,
  });
  return data?.state === 'enabled';
};
