import { useQuery } from '@tanstack/react-query';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { getReloadConsent } from '#lib/billing-lifecycle-client.js';

/** The API, billing environment, owner and billing account a reload consent is read for. */
type ReloadConsentScope = {
  readonly apiBaseUrl?: string | undefined;
  readonly environment?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly subjectId?: string | undefined;
};

/**
 * The one cache entry for an owner's reload consent. The billing settings card reads and writes the
 * same entry, so its refreshes, and invalidating `['billing']`, also refresh this hook.
 */
export const reloadConsentQueryKey = (scope: ReloadConsentScope | undefined) =>
  ['billing', 'reload-consent', scope?.apiBaseUrl, scope?.environment, scope?.ownerId, scope?.subjectId] as const;

/** Whether the account's automatic reload consent is enabled; false while unknown. */
export const useAutoReloadEnabled = (): boolean => {
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const subjectId = useCredits()?.subjectId;
  const { data } = useQuery({
    queryKey: reloadConsentQueryKey({ apiBaseUrl, environment, ownerId: userId, subjectId }),
    enabled: apiBaseUrl !== undefined && environment !== undefined && userId !== undefined && subjectId !== undefined,
    queryFn: async () =>
      (await getReloadConsent({ apiBaseUrl: apiBaseUrl!, environment: environment!, ownerId: userId!, subjectId })) ??
      null,
  });
  return data?.state === 'enabled';
};
