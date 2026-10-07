import { useEffect, useRef, useState } from 'react';
import type { WireAccountClosure, WirePaymentAction } from '@taucad/billing';
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

/** `held` adds the support link where only support can clear it; `review` offers the top-up dialog where the customer can. */
type PendingPaymentCopy = { readonly copy: string; readonly held: boolean; readonly review?: boolean };
const waitCopy: PendingPaymentCopy = {
  copy: 'A payment is still being processed. Closing waits for it; try again in a minute.',
  held: false,
};
const settledCopy: PendingPaymentCopy = { copy: 'That payment is no longer pending. Try again.', held: false };
/** Copy per wire state of the pending payment; not exhaustive, so a miss falls to `heldCopy`. */
const pendingPaymentCopy = new Map<WirePaymentAction['state'], PendingPaymentCopy>([
  ['prepared', { copy: 'Discard or finish your pending top-up quote first.', held: false, review: true }],
  ['redirect_required', { copy: 'Finish or cancel your pending payment first.', held: false, review: true }],
  ['creating', waitCopy],
  ['processing', waitCopy],
  // Captured cash awaiting its grant: the sweep normally lands it, and only support can when it does not.
  [
    'funds_received',
    {
      copy: 'Your payment was received and its credits are still being added. Closing waits for them; contact support if they do not arrive.',
      held: true,
    },
  ],
  // The refusal raced a payment that settled or was cancelled meanwhile; the next attempt goes through.
  ['fulfilled', settledCopy],
  ['canceled', settledCopy],
  ['failed', settledCopy],
]);
// Not only `attention_required`: also a refusal that carried no action (an adapter without `describeAction`, or a
// projection that failed), so the map is not exhaustive and this is the safe reading of anything else.
const heldCopy: PendingPaymentCopy = {
  copy: 'A payment needs attention before this account can close. Contact support if you cannot finish it.',
  held: true,
};

function SupportLink(): React.JSX.Element {
  return (
    <a className='underline' href='mailto:support@tau.new'>
      Contact support
    </a>
  );
}

/** Prepares the durable financial tombstone before invoking Better Auth deletion. */
export function AccountClosureSettings({
  binding,
  onReviewPayment,
}: {
  readonly binding: PaymentActionBinding | undefined;
  /** Opens the top-up dialog, where a pending quote or Checkout can be finished or ended. */
  readonly onReviewPayment?: () => void;
}): React.JSX.Element {
  const financial = useFinancialSession();
  const requestId = useRef(createPaymentRequestId());
  const [closure, setClosure] = useState<WireAccountClosure>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [heldPayment, setHeldPayment] = useState(false);
  const [reviewPayment, setReviewPayment] = useState(false);
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
          setHeldPayment(false);
          setReviewPayment(false);
        }
      }
    })();
  }, [binding?.apiBaseUrl, binding?.environment, binding?.ownerId, binding?.subjectId, financial]);

  const run = async (operation: () => Promise<void>): Promise<void> => {
    const guard = financial.capture();
    setBusy(true);
    setError(undefined);
    setHeldPayment(false);
    setReviewPayment(false);
    try {
      await operation();
    } catch (error_) {
      if (guard.isCurrent()) {
        const pending = error_ instanceof AccountClosurePaymentPending ? error_ : undefined;
        const mapped = pending?.action === undefined ? undefined : pendingPaymentCopy.get(pending.action.state);
        const refusal = pending ? (mapped ?? heldCopy) : undefined;
        setError(refusal ? refusal.copy : 'Could not continue account closure. Try again.');
        setHeldPayment(refusal?.held ?? false);
        setReviewPayment(refusal?.review === true && onReviewPayment !== undefined);
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
        {closure?.attention?.action === 'contact_support' ? <SupportLink /> : undefined}
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
          <div className='flex flex-col gap-1 text-warning' role='alert'>
            <p>{error}</p>
            {heldPayment ? <SupportLink /> : undefined}
            {reviewPayment ? (
              <Button className='self-start' variant='outline' onClick={onReviewPayment}>
                Review payment
              </Button>
            ) : undefined}
          </div>
        ) : undefined}
      </CardContent>
    </SettingsSectionCard>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
