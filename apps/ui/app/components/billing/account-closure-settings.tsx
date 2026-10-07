import { useEffect, useRef, useState } from 'react';
import type { WireAccountClosure } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { authClient } from '#lib/auth-client.js';
import { createPaymentRequestId } from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';
import {
  AccountClosurePaymentPending,
  getAccountClosure,
  getCurrentAccountClosure,
  prepareAccountClosure,
} from '#lib/billing-lifecycle-client.js';
import { useFinancialSession } from '#providers/financial-session-provider.js';

/* oxlint-disable no-void, unicorn/no-negated-condition -- event handlers deliberately fire tracked UI operations */

/** Purchase states the customer can end from Billing; anything else is processing or under review. */
const endablePurchaseStates = new Set(['prepared', 'creating', 'pending']);
const pendingPaymentCopy = (state: string | undefined): string =>
  state === 'prepared'
    ? 'Discard or finish your pending top-up first.'
    : endablePurchaseStates.has(state ?? '')
      ? 'Finish or cancel your pending payment first.'
      : 'A payment is still in progress or under review. Closing waits for it; contact support if it does not clear.';

/** Prepares the durable financial tombstone before invoking Better Auth deletion. */
export function AccountClosureSettings({
  binding,
}: {
  readonly binding: PaymentActionBinding | undefined;
}): React.JSX.Element {
  const financial = useFinancialSession();
  const requestId = useRef(createPaymentRequestId());
  const [closure, setClosure] = useState<WireAccountClosure>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [heldPayment, setHeldPayment] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!binding) {
      return;
    }
    const currentBinding = {
      apiBaseUrl: binding.apiBaseUrl,
      environment: binding.environment,
      ownerId: binding.ownerId,
      subjectId: binding.subjectId,
    };
    const token = financial.capture();
    // async-iife: bootstrap
    void (async () => {
      try {
        const value = await getCurrentAccountClosure({ ...currentBinding, financialSession: token });
        if (token.isCurrent()) {
          setClosure(value);
          if (value) {
            financial.purge('closure');
          }
        }
      } catch {
        if (token.isCurrent()) {
          setError('Could not check account closure status.');
        }
      }
    })();
  }, [binding?.apiBaseUrl, binding?.environment, binding?.ownerId, binding?.subjectId, financial]);

  const run = async (operation: () => Promise<void>): Promise<void> => {
    const guard = financial.capture();
    setBusy(true);
    setError(undefined);
    setHeldPayment(false);
    try {
      await operation();
    } catch (error_) {
      if (guard.isCurrent()) {
        const pending = error_ instanceof AccountClosurePaymentPending ? error_ : undefined;
        setError(pending ? pendingPaymentCopy(pending.state) : 'Could not continue account closure. Try again.');
        setHeldPayment(pending !== undefined && !endablePurchaseStates.has(pending.state ?? ''));
      }
    } finally {
      if (guard.isCurrent()) {
        setBusy(false);
      }
    }
  };
  const rememberRevoked = (next: WireAccountClosure): void => {
    setClosure(next);
    setBusy(false);
    financial.purge('closure');
  };

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle className='text-base'>Close Tau account</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 border-destructive/40 text-sm'>
        <p className='text-muted-foreground'>
          This immediately ends this billing session, turns off automatic reload, and starts subscription cancellation.
          Cancellation may finish after sign-out.
        </p>
        {closure ? (
          <p>Closure status: {closure.state.replaceAll('_', ' ')}</p>
        ) : (
          <label className='flex items-start gap-2'>
            <input
              type='checkbox'
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
              }}
            />
            I understand and want to close this account.
          </label>
        )}
        {!closure ? (
          <Button
            variant='destructive'
            disabled={!confirmed || busy || !binding}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await prepareAccountClosure({ ...binding!, financialSession: token }, requestId.current);
                if (token.isCurrent()) {
                  rememberRevoked(next);
                }
              })
            }
          >
            Prepare account closure
          </Button>
        ) : undefined}
        {closure && ['closing', 'cancellation_pending', 'attention'].includes(closure.state) ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await getAccountClosure(
                  { ...binding!, subjectId: closure.subjectId, financialSession: token },
                  closure.closureId,
                );
                if (token.isCurrent()) {
                  setClosure(next);
                }
              })
            }
          >
            Refresh closure status
          </Button>
        ) : undefined}
        {closure?.attention?.action === 'contact_support' ? (
          <a className='underline' href='mailto:support@tau.new'>
            Contact support
          </a>
        ) : undefined}
        {closure?.state === 'ready_for_auth_deletion' ? (
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                await authClient.deleteUser({ fetchOptions: { throw: true, signal: token.signal } });
                if (token.isCurrent()) {
                  setBusy(false);
                  financial.purge('closure');
                }
              })
            }
          >
            Delete my account
          </Button>
        ) : undefined}
        {error ? (
          <p className='text-warning' role='alert'>
            {error}
          </p>
        ) : undefined}
        {heldPayment ? (
          <a className='underline' href='mailto:support@tau.new'>
            Contact support
          </a>
        ) : undefined}
      </CardContent>
    </SettingsSectionCard>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
