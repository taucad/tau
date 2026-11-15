import { useEffect, useRef, useState } from 'react';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { createPaymentRequestId, createPortalAction, followPaymentRedirect } from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';
import { BillingInlineError, formatBillingDate } from '#components/billing/billing-primitives.js';
import { Button } from '@taucad/ui/components/button';

/** One message for every way the cancellation page can fail to open: the customer's next step is the same. */
const cancellationNotOpenedMessage = 'Couldn’t open the cancellation page. Try again.';

/**
 * Cancels the plan through the billing portal's cancellation flow, which ends it at the close of the paid period.
 *
 * @param props - The owner's payment-action binding and the date the paid period ends.
 * @returns The Cancel plan row.
 */
export function CancelPlanSettings({
  binding,
  paidThrough,
}: {
  readonly binding: PaymentActionBinding | undefined;
  /** The end of the paid period, so the row names the real date the plan runs to. */
  readonly paidThrough?: Date;
}): React.JSX.Element {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string>();
  /* The owner the latest render belongs to; cleared on unmount so a stale portal session is never followed. */
  const ownerKey =
    binding === undefined ? undefined : `${binding.apiBaseUrl}|${binding.environment}|${binding.ownerId}`;
  const currentOwnerRef = useRef(ownerKey);
  useEffect(() => {
    currentOwnerRef.current = ownerKey;
    return () => {
      currentOwnerRef.current = undefined;
    };
  }, [ownerKey]);

  const cancelPlan = async (): Promise<void> => {
    if (binding === undefined) {
      return;
    }
    const startedOwner = ownerKey;
    setIsRedirecting(true);
    setError(undefined);
    try {
      const action = await createPortalAction(binding, {
        requestId: createPaymentRequestId(),
        returnPath: `${globalThis.location.pathname}${globalThis.location.search}`,
        flow: 'subscription_cancel',
      });
      if (currentOwnerRef.current !== startedOwner) {
        return;
      }
      followPaymentRedirect(action);
      if (action.state !== 'redirect_required') {
        setError(cancellationNotOpenedMessage);
      }
    } catch {
      if (currentOwnerRef.current === startedOwner) {
        setError(cancellationNotOpenedMessage);
      }
    } finally {
      if (currentOwnerRef.current === startedOwner) {
        setIsRedirecting(false);
      }
    }
  };

  return (
    <SettingsGroup>
      <SettingsRow
        settingId='cancel-plan'
        title='Cancel plan'
        description={
          paidThrough
            ? `You keep Pro until ${formatBillingDate(paidThrough)}.`
            : 'You keep Pro until the end of your billing period.'
        }
        control={
          <Button
            variant='destructive'
            disabled={binding === undefined || isRedirecting}
            onClick={async () => {
              await cancelPlan();
            }}
          >
            Cancel plan
          </Button>
        }
      >
        {error ? <BillingInlineError>{error}</BillingInlineError> : undefined}
      </SettingsRow>
    </SettingsGroup>
  );
}
