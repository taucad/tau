import { useEffect, useId, useRef, useState } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
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
import { IconLine, supportEmail } from '#components/billing/billing-primitives.js';

/* oxlint-disable no-void, unicorn/no-negated-condition -- event handlers deliberately fire tracked UI operations */

/**
 * What the card says after a failure and the one step it offers: `support` where only support can clear it, `review`
 * where the owner can finish or cancel the purchase in the Add credits dialog.
 */
type Notice = { readonly copy: string; readonly next?: 'support' | 'review' };
const statusFailed: Notice = { copy: 'Couldn’t check whether your account is closing. Reload the page to try again.' };
const closureFailed: Notice = { copy: 'Couldn’t close your account. Try again.' };
const waitNotice: Notice = { copy: 'A payment is still processing. Wait a minute, then try again.' };
const reloadNotice: Notice = {
  copy: 'Auto-reload is buying credits right now. Try again in a few minutes.',
};
const checkoutNotice: Notice = {
  copy: 'You have a payment to finish first. Finish it, then close your account.',
  next: 'review',
};
// The refusal raced a payment that settled or was canceled meanwhile; the next attempt goes through.
const settledNotice: Notice = { copy: 'That payment is done. Try again.' };
// Also a refusal that carried no action (an adapter without `describeAction`, or a projection that failed): the safe
// reading of anything the owner cannot finish from here.
const heldNotice: Notice = {
  copy: `A payment needs to be sorted out before you can close your account. Email ${supportEmail} for help.`,
  next: 'support',
};
const unfinishedPurchaseNotice: Notice = {
  copy: 'You have a credit purchase you haven’t finished. Finish or cancel it, then close your account.',
  next: 'review',
};
/** Copy per wire state of a pending manual payment; not exhaustive, so a miss falls to `heldNotice`. */
const manualNotice = new Map<WirePaymentAction['state'], Notice>([
  ['prepared', unfinishedPurchaseNotice],
  ['redirect_required', unfinishedPurchaseNotice],
  ['creating', waitNotice],
  ['processing', waitNotice],
  // Captured cash awaiting its grant: the sweep normally lands it, and only support can when it does not.
  [
    'funds_received',
    {
      copy: `We’re still adding credits from your last payment. Try again in a few minutes, or email ${supportEmail} if this doesn’t clear.`,
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
    <a className='underline' href={`mailto:${supportEmail}`}>
      Email {supportEmail}
    </a>
  );
}

/** The row's title and description for each closure state, in the customer's words and never the wire state. */
const closureRowCopy = (
  closure: WireAccountClosure | undefined,
): { readonly title: string; readonly description: string | undefined } => {
  switch (closure?.state) {
    case undefined: {
      return { title: 'Close account', description: 'Cancel your plan now and permanently delete your account.' };
    }
    case 'ready_for_auth_deletion': {
      return { title: 'Your plan is canceled', description: 'One step left. Deleting your account is permanent.' };
    }
    case 'attention': {
      return {
        title: 'We couldn’t close your account',
        description: `Something needs fixing on our side. Email ${supportEmail} and we’ll finish it for you.`,
      };
    }
    case 'closed': {
      return { title: 'Your account is closed', description: undefined };
    }
    default: {
      return { title: 'Closing your account', description: 'We’re canceling your plan. This can take a minute.' };
    }
  }
};

/** What to do instead of closing, shown as separate lines so each is read on its own. */
const closureAlternatives = [
  'To keep your plan until the end of the billing period, cancel the plan in Billing instead.',
  `If you bought credits in the last 14 days and want a refund, email ${supportEmail} before you close.`,
] as const;

/** Prepares the durable financial tombstone before invoking Better Auth deletion. */
export function AccountClosureSettings({
  binding,
  onReviewPayment,
}: {
  readonly binding: PaymentActionBinding | undefined;
  /** Opens the Add credits dialog, where an unfinished purchase can be finished or canceled. */
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

  const rowCopy = closureRowCopy(closure);
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
        Delete account
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
        Check again
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
      <SettingsRow settingId='close-account' title={rowCopy.title} description={rowCopy.description} control={control}>
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
              Your plan ends now and you lose any credits you have left. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className='flex flex-col gap-2 text-sm text-muted-foreground'>
            {closureAlternatives.map((alternative) => (
              <li key={alternative}>
                <IconLine icon={<Info aria-hidden='true' className='size-4' />}>{alternative}</IconLine>
              </li>
            ))}
          </ul>
          <div className='flex items-start gap-2 text-sm'>
            <Checkbox
              id={confirmationId}
              className='mt-[calc((1lh-1rem)/2)]'
              checked={confirmed}
              onCheckedChange={(checked) => {
                setConfirmed(checked === true);
              }}
            />
            <Label htmlFor={confirmationId} className='leading-snug font-normal'>
              I understand I’ll lose my remaining credits.
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
      <p role='alert' aria-label='Account closure notice'>
        <IconLine icon={<TriangleAlert aria-hidden='true' className='size-4 text-warning' strokeWidth={1.5} />}>
          {notice.copy}
        </IconLine>
      </p>
      {notice.next === 'support' ? <SupportLink /> : undefined}
      {notice.next === 'review' ? (
        <Button variant='outline' size='sm' onClick={onReview}>
          Go to purchase
        </Button>
      ) : undefined}
    </div>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
