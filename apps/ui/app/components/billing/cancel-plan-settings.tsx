import { useEffect, useRef, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { createPaymentRequestId, createPortalAction, followPaymentRedirect } from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

/**
 * Cancels the plan through the billing portal's cancellation flow, which ends it at the close of the paid period.
 *
 * @param props - The owner's payment-action binding.
 * @returns The Cancel plan row.
 */
export function CancelPlanSettings({
  binding,
}: {
  readonly binding: PaymentActionBinding | undefined;
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
        setError('Cancellation is still being prepared. Try again.');
      }
    } catch {
      if (currentOwnerRef.current === startedOwner) {
        setError('Could not open cancellation. Try again.');
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
        description="If you cancel, you'll keep full access to your plan features until the end of your billing period"
        control={
          <Button
            variant='destructive'
            size='sm'
            disabled={binding === undefined || isRedirecting}
            onClick={async () => {
              await cancelPlan();
            }}
          >
            Cancel plan
          </Button>
        }
      >
        {error ? (
          <span role='alert' className='text-xs text-warning'>
            {error}
          </span>
        ) : undefined}
      </SettingsRow>
    </SettingsGroup>
  );
}
