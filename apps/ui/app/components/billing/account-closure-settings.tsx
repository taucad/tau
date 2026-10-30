import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WireAccountClosure, WirePaymentAction } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { SettingsRow } from '#components/settings/settings-item.js';
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

/**
 * What the card says after a failure and the one step it offers: `support` where only support can clear it, `review`
 * where the owner can finish or end the payment in the Add credits dialog.
 */
type Notice = { readonly copy: string; readonly next?: 'support' | 'review' };
const statusFailed: Notice = { copy: 'Could not check account closure status.' };
const closureFailed: Notice = { copy: 'Could not continue account closure. Try again.' };
const waitNotice: Notice = { copy: 'A payment is still being processed. Closing waits for it; try again in a minute.' };
const reloadNotice: Notice = {
  copy: 'An automatic reload is in progress. It finishes or clears on its own in a few minutes; try again then.',
};
const checkoutNotice: Notice = { copy: 'Finish your pending payment in Checkout first.', next: 'review' };
// The refusal raced a payment that settled or was cancelled meanwhile; the next attempt goes through.
const settledNotice: Notice = { copy: 'That payment is no longer pending. Try again.' };
// Also a refusal that carried no action (an adapter without `describeAction`, or a projection that failed): the safe
// reading of anything the owner cannot finish from here.
const heldNotice: Notice = {
  copy: 'A payment needs attention before this account can close. Contact support if you cannot finish it.',
  next: 'support',
};
/** Copy per wire state of a pending manual payment; not exhaustive, so a miss falls to `heldNotice`. */
const manualNotice = new Map<WirePaymentAction['state'], Notice>([
  ['prepared', { copy: 'Discard or finish your pending top-up quote first.', next: 'review' }],
  ['redirect_required', { copy: 'Finish or cancel your pending payment first.', next: 'review' }],
  ['creating', waitNotice],
  ['processing', waitNotice],
  // Captured cash awaiting its grant: the sweep normally lands it, and only support can when it does not.
  [
    'funds_received',
    {
      copy: 'Your payment was received and its credits are still being added. Closing waits for them; contact support if they do not arrive.',
      next: 'support',
    },
  ],
  ['fulfilled', settledNotice],
  ['completed', settledNotice],
  ['canceled', settledNotice],
  ['failed', settledNotice],
]);
/** An automatic reload's own states: nothing for the owner to do but wait for its worker. */
const reloadStates: ReadonlySet<WirePaymentAction['state']> = new Set(['prepared', 'creating', 'processing']);

/** The notice for the payment a closure was refused for. */
const refusalNotice = (action: WirePaymentAction | undefined): Notice => {
  if (action === undefined) {
    return heldNotice;
  }
  if (action.purpose === 'automatic_topup' && reloadStates.has(action.state)) {
    return reloadNotice;
  }
  if (action.state === 'attention_required') {
    // The dialog can finish a hosted continuation; a wait is a wait; anything else is support's.
    if (action.attention?.action === 'continue_hosted') {
      return checkoutNotice;
    }
    return action.attention?.action === 'wait' ? waitNotice : heldNotice;
  }
  return manualNotice.get(action.state) ?? heldNotice;
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
  /** Opens the Add credits dialog, where a pending quote or Checkout can be finished or ended. */
  readonly onReviewPayment: () => void;
}): React.JSX.Element {
  const financial = useFinancialSession();
  const confirmationId = useId();
  const requestId = useRef(createPaymentRequestId());
  const [closure, setClosure] = useState<WireAccountClosure>();
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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
          setNotice(statusFailed);
        }
      }
    })();
  }, [binding?.apiBaseUrl, binding?.environment, binding?.ownerId, binding?.subjectId, financial]);

  const run = async (operation: () => Promise<void>): Promise<void> => {
    const guard = financial.capture();
    setBusy(true);
    setNotice(undefined);
    try {
      await operation();
    } catch (error_) {
      if (guard.isCurrent()) {
        setNotice(error_ instanceof AccountClosurePaymentPending ? refusalNotice(error_.action) : closureFailed);
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

  const prepare = (): void =>
    void run(async () => {
      const token = financial.capture();
      const next = await prepareAccountClosure({ ...binding!, financialSession: token }, requestId.current);
      if (token.isCurrent()) {
        setIsConfirming(false);
        rememberRevoked(next);
      }
    });

  const control = closure ? (
    closure.state === 'ready_for_auth_deletion' ? (
      <Button
        variant='destructive'
        size='sm'
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const token = financial.capture();
            await authClient.deleteUser({
              fetchOptions: { throw: true, signal: token.signal },
            });
            if (token.isCurrent()) {
              setBusy(false);
              financial.purge('closure');
            }
          })
        }
      >
        Delete my account
      </Button>
    ) : ['closing', 'cancellation_pending', 'attention'].includes(closure.state) ? (
      <Button
        variant='outline'
        size='sm'
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const token = financial.capture();
            const next = await getAccountClosure(
              {
                ...binding!,
                subjectId: closure.subjectId,
                financialSession: token,
              },
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
    ) : undefined
  ) : (
    <Button
      variant='destructive'
      size='sm'
      disabled={!binding}
      onClick={() => {
        setConfirmed(false);
        setIsConfirming(true);
      }}
    >
      Close account
    </Button>
  );

  return (
    <>
      <SettingsRow
        settingId='close-account'
        title='Close account'
        description={
          closure
            ? `Closure status: ${closure.state.replaceAll('_', ' ')}`
            : 'Cancels your plan right away and lets you delete your account'
        }
        control={control}
      >
        {closure?.attention?.action === 'contact_support' ? <SupportLink /> : undefined}
        {notice && !isConfirming ? (
          <ClosureNotice
            notice={notice}
            onReview={() => {
              setNotice(undefined);
              onReviewPayment();
            }}
          />
        ) : undefined}
      </SettingsRow>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Paid usage stops and your plan is cancelled right away. To keep your plan until the end of your billing
              period, cancel it in Billing instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-start gap-2 text-sm'>
            <Checkbox
              id={confirmationId}
              className='mt-0.5'
              checked={confirmed}
              onCheckedChange={(checked) => {
                setConfirmed(checked === true);
              }}
            />
            <Label htmlFor={confirmationId} className='leading-snug font-normal'>
              I want to close my account.
            </Label>
          </div>
          {notice ? (
            <ClosureNotice
              notice={notice}
              onReview={() => {
                setNotice(undefined);
                setIsConfirming(false);
                onReviewPayment();
              }}
            />
          ) : undefined}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep account</AlertDialogCancel>
            <Button variant='destructive' disabled={!confirmed || busy || !binding} onClick={prepare}>
              Close account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A refusal or failure, with the one step it offers. */
function ClosureNotice({
  notice,
  onReview,
}: {
  readonly notice: Notice;
  readonly onReview: () => void;
}): React.JSX.Element {
  return (
    <div className='flex flex-col items-start gap-1 text-sm'>
      {/* The live region holds the sentence alone; colour marks only the glyph, and the step sits outside it. */}
      <p role='alert' aria-label='Account closure notice' className='flex items-start gap-1.5'>
        <AlertTriangle aria-hidden className='mt-0.5 size-4 shrink-0 text-warning' strokeWidth={1.5} />
        <span>{notice.copy}</span>
      </p>
      {notice.next === 'support' ? <SupportLink /> : undefined}
      {notice.next === 'review' ? (
        <Button variant='outline' size='sm' onClick={onReview}>
          Open Add credits
        </Button>
      ) : undefined}
    </div>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
