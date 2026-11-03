import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

/**
 * The signed-in owner's payment-action binding, or `undefined` until the billing session is known.
 *
 * @returns The binding payment actions are sent with.
 */
export function useBillingBinding(): PaymentActionBinding | undefined {
  const credits = useCredits();
  const { apiBaseUrl, environment, userId } = useBillingSession();
  return apiBaseUrl && environment && userId
    ? {
        apiBaseUrl,
        environment,
        ownerId: userId,
        ...(credits?.subjectId ? { subjectId: credits.subjectId } : {}),
      }
    : undefined;
}
