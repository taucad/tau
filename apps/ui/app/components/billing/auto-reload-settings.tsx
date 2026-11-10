import { useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCredits } from '@taucad/ui-core/utils/credits.utils';
import type { WireAutoReloadConsent, WirePaymentAction } from '@taucad/billing';
import { formatUsdMinor } from '@taucad/billing';
import { ExternalLink, LoaderCircle } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { CardContent } from '@taucad/ui/components/card';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { formatCardSummary } from '@taucad/ui-kit/components/payment-method';
import {
  BillingInlineError,
  BillingStatusBadge,
  SummaryList,
  SummaryRow,
} from '#components/billing/billing-primitives.js';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import {
  BillingCollectionUnavailable,
  confirmPaymentAction,
  createPaymentRequestId,
  followPaymentRedirect,
  purchasesUnavailableMessage,
  recoverPaymentAction,
} from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';
import {
  BillingAddressRequired,
  getReloadConsent,
  prepareReloadConsent,
  revokeReloadConsent,
} from '#lib/billing-lifecycle-client.js';
import { reloadConsentQueryKey } from '#hooks/use-auto-reload-enabled.js';
import { useFinancialSession } from '#providers/financial-session-provider.js';

/* oxlint-disable no-void, unicorn/no-negated-condition -- event handlers deliberately fire tracked UI operations */

const formatHours = (seconds: number): string => {
  const hours = Math.round(seconds / 3600);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

/** The cadence limit as the last clause of the limits line: `one reload per hour`. */
const formatCadenceLimit = (seconds: number): string => {
  const hours = Math.round(seconds / 3600);
  return hours === 1 ? 'one reload per hour' : `one reload every ${hours} hours`;
};

/** Consents new terms can replace: billing refuses new terms only while a consent waits for its card or is on. */
const reviewableStates: ReadonlySet<WireAutoReloadConsent['state']> = new Set([
  'paused_terms',
  'disabled_failures',
  'revoked',
]);

/** Milliseconds between reads while billing confirms a card setup the customer may already have finished. */
const setupConfirmationInterval = 2000;
/** Milliseconds a mounted card keeps reading; after that, focusing the page or reopening the card reads again. */
const setupConfirmationWindow = 60_000;

/** Whether the confirmation window is still open; react-query calls this between reads, never during render. */
const isBeforeDeadline = (deadline: number): boolean => Date.now() < deadline;

/** What the card shows for its read of the consent: the consent, a failure with Try again, or a skeleton. */
const loadState = (read: {
  readonly data: unknown;
  readonly isError: boolean;
  readonly isFetching: boolean;
}): 'loaded' | 'failed' | 'loading' =>
  read.data !== undefined ? 'loaded' : read.isError && !read.isFetching ? 'failed' : 'loading';

/** Whether the consent waits on a card setup on the payment page, which billing confirms some seconds after it is done. */
const isConfirmingSetup = (consent: WireAutoReloadConsent | undefined): boolean =>
  consent?.state === 'pending_setup' &&
  (consent.setupAction?.state === 'redirect_required' || consent.setupAction?.state === 'processing');

/** The heading row of the card: what state auto-reload is in, one sentence about it, and the control for it. */
function ReloadHeading({
  title,
  badge,
  description,
  control,
}: {
  readonly title: string;
  readonly badge?: React.ReactNode;
  readonly description: React.ReactNode;
  readonly control?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div className='flex min-w-0 flex-col gap-1'>
        <span className='flex flex-wrap items-center gap-2 font-medium'>
          {title}
          {badge}
        </span>
        <span className='text-muted-foreground'>{description}</span>
      </div>
      {control === undefined ? undefined : <div className='flex shrink-0 items-center gap-2'>{control}</div>}
    </div>
  );
}

const offDescription = 'Buy credits automatically when your balance runs low, so your work doesn’t stop.';

/** Auto-reload: what it does, the limits the customer agrees to, and the controls to turn it on and off. */
export function AutoReloadSettings({
  binding,
}: {
  /** Carries the account subject once known, so the consent read is the entry `useAutoReloadEnabled` shares. */
  readonly binding: PaymentActionBinding | undefined;
}): React.JSX.Element {
  const financial = useFinancialSession();
  const queryClient = useQueryClient();
  const { isResolved, paymentCollectionAvailable } = useEntitlements();
  const [confirmingUntil] = useState(() => Date.now() + setupConfirmationWindow);
  const queryKey = reloadConsentQueryKey(binding);
  /* The entry `useAutoReloadEnabled` reads, so a refresh here, or a billing invalidation after a payment
   * return, updates both. Each read captures the financial session, so a purge aborts and fences it. */
  const reload = useQuery({
    queryKey,
    queryFn:
      binding === undefined
        ? skipToken
        : async () => (await getReloadConsent({ ...binding, financialSession: financial.capture() })) ?? null,
    // The card shows a failed read with its own Retry at once.
    retry: false,
    meta: { handlesErrorLocally: true },
    refetchInterval: (query) =>
      isConfirmingSetup(query.state.data ?? undefined) && isBeforeDeadline(confirmingUntil)
        ? setupConfirmationInterval
        : false,
  });
  /** A control's answer for the setup, which stands until the next read of the consent replaces it. */
  const [answer, setAnswer] = useState<{ readonly readAt: number; readonly action: WirePaymentAction }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const consent = reload.data ?? undefined;
  const answered = answer?.readAt === reload.dataUpdatedAt ? answer.action : undefined;
  /* The setup the controls act on: a control's fresh answer, else the open setup of a consent still waiting
   * for its card. A paused or disabled consent still reports the setup that once enabled it, and offering to
   * continue that beside the review of new terms would send the customer back into a finished Checkout. */
  const action = answered ?? (consent?.state === 'pending_setup' ? (consent.setupAction ?? undefined) : undefined);
  const load = loadState(reload);
  const canReview = load === 'loaded' && (!consent || reviewableStates.has(consent.state));

  const answerSetup = (next: WirePaymentAction): void => {
    setAnswer({ readAt: reload.dataUpdatedAt, action: next });
  };
  /** Reads the consent again; a failed read rejects, so `run` reports it. */
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey }, { throwOnError: true });
  };
  const run = async (operation: () => Promise<void>): Promise<void> => {
    const guard = financial.capture();
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (error_) {
      if (guard.isCurrent()) {
        setError(
          error_ instanceof BillingCollectionUnavailable
            ? purchasesUnavailableMessage
            : error_ instanceof BillingAddressRequired
              ? 'Auto-reload needs a saved card. Add credits once to save your card, then come back here.'
              : 'Couldn’t update auto-reload. Try again.',
        );
      }
    } finally {
      if (guard.isCurrent()) {
        setBusy(false);
      }
    }
  };

  const terms = consent?.terms;
  const threshold = terms ? formatCredits(BigInt(terms.thresholdAtoms)) : '';
  const reloadAmount = terms ? formatUsdMinor(terms.principalMinor) : '';
  /* The credits one reload adds are known only from a setup frozen under the same offer as the terms. */
  const frozenSetup = consent?.setupAction?.frozen ?? action?.frozen;
  const reloadCredits =
    terms && frozenSetup && frozenSetup.offerId === terms.offerId
      ? formatCredits(BigInt(frozenSetup.creditAtoms))
      : undefined;
  const addsCredits = reloadCredits === undefined ? '' : ` and add ${reloadCredits}`;
  const cadence = terms ? formatHours(terms.minimumCadenceSeconds) : '';
  const isConfirming = action?.state === 'processing';
  const canContinueSetup =
    action?.state === 'redirect_required' ||
    (action?.state === 'attention_required' && action.attention?.action === 'continue_hosted');

  const review = (): void =>
    void run(async () => {
      const token = financial.capture();
      const next = await prepareReloadConsent(
        { ...binding!, financialSession: token },
        {
          requestId: createPaymentRequestId(),
          returnPath: `${location.pathname}${location.search}`,
        },
      );
      if (token.isCurrent()) {
        answerSetup(next);
        await refresh();
      }
    });
  const turnOff = (): void => {
    if (!consent) {
      return;
    }
    void run(async () => {
      const token = financial.capture();
      const next = await revokeReloadConsent(
        { ...binding!, subjectId: consent.subjectId, financialSession: token },
        consent.consentId,
      );
      if (token.isCurrent()) {
        setAnswer(undefined);
        queryClient.setQueryData<WireAutoReloadConsent>(queryKey, next);
      }
    });
  };
  const reviewDisabled = busy || !binding || !isResolved || !paymentCollectionAvailable;
  const reviewButton = (label: string, variant: 'default' | 'outline' = 'outline'): React.JSX.Element => (
    <Button variant={variant} size='sm' disabled={reviewDisabled} onClick={review}>
      {label}
    </Button>
  );
  const turnOffButton = (label: string): React.JSX.Element => (
    <Button variant='outline' size='sm' disabled={busy} onClick={turnOff}>
      {label}
    </Button>
  );

  const body = (): React.JSX.Element => {
    if (load === 'loading') {
      return (
        <div role='status' aria-busy='true' className='flex flex-col gap-2'>
          <span className='sr-only'>Loading auto-reload…</span>
          <Skeleton aria-hidden='true' className='h-3.5 w-28' />
          <Skeleton aria-hidden='true' className='h-3 w-4/5' />
        </div>
      );
    }
    if (load === 'failed') {
      return (
        <div role='alert'>
          <ReloadHeading
            title='Couldn’t load auto-reload'
            description='Your setting hasn’t changed.'
            control={
              <Button variant='outline' size='sm' onClick={() => void reload.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    /* Terms come from the consent this setup belongs to; after a failed re-read the cached consent may carry older terms. */
    if (action?.state === 'prepared' && terms && consent.setupAction?.actionId === action.actionId) {
      return (
        <>
          <div className='flex flex-col gap-1'>
            <span className='font-medium'>Turn on auto-reload?</span>
            <span className='text-muted-foreground'>
              When your balance drops below {threshold}, we’ll charge your saved card {reloadAmount} plus tax
              {addsCredits}.
            </span>
          </div>
          <SummaryList aria-label='Auto-reload limits'>
            <SummaryRow label='Each reload'>{reloadAmount} plus tax</SummaryRow>
            <SummaryRow label='Most we charge at once'>{formatUsdMinor(terms.grossCeilingMinor)}</SummaryRow>
            <SummaryRow label='Most we charge per month'>{formatUsdMinor(terms.monthlyGrossCapMinor)}</SummaryRow>
            <SummaryRow label='Time between reloads'>At least {cadence}</SummaryRow>
            <SummaryRow label='Turns off after'>
              {terms.terminalFailureLimit} failed {terms.terminalFailureLimit === 1 ? 'payment' : 'payments'}
            </SummaryRow>
          </SummaryList>
          {/* Consent wording: keeps every term of the authorization (amount plus tax, trigger, limits, until turned off). */}
          <p className='text-xs text-muted-foreground'>
            By turning this on, you authorize Tau to charge your saved card {reloadAmount} plus tax each time your
            balance drops below {threshold}, within these limits, until you turn auto-reload off.
          </p>
          <div className='flex flex-wrap justify-end gap-2'>
            {consent.state === 'revoked' ? undefined : turnOffButton('Cancel')}
            <Button
              size='sm'
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const token = financial.capture();
                  const next = await confirmPaymentAction(
                    { ...binding!, subjectId: action.subjectId, financialSession: token },
                    action.actionId,
                  );
                  if (token.isCurrent()) {
                    answerSetup(next);
                    followPaymentRedirect(next);
                    if (next.state !== 'redirect_required') {
                      await refresh();
                    }
                  }
                })
              }
            >
              Agree and turn on
            </Button>
          </div>
        </>
      );
    }
    if (isConfirming) {
      return (
        <p role='status' className='flex items-center gap-2 font-medium'>
          <LoaderCircle aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
          Confirming your card…
        </p>
      );
    }
    if (consent?.state === 'pending_setup') {
      return (
        <>
          <ReloadHeading
            title='Finish setting up auto-reload'
            badge={<BillingStatusBadge>Not finished</BillingStatusBadge>}
            description='Add a card on the payment page to turn auto-reload on.'
          />
          <div className='flex flex-wrap justify-end gap-2'>
            {turnOffButton('Cancel setup')}
            {canContinueSetup ? (
              <Button
                size='sm'
                disabled={busy}
                onClick={() => {
                  if (action.state === 'redirect_required') {
                    followPaymentRedirect(action);
                    return;
                  }
                  void run(async () => {
                    const token = financial.capture();
                    const next = await recoverPaymentAction(
                      { ...binding!, subjectId: action.subjectId, financialSession: token },
                      action.actionId,
                    );
                    if (token.isCurrent()) {
                      answerSetup(next);
                    }
                  });
                }}
              >
                Continue to payment
                <ExternalLink aria-hidden='true' className='size-3' />
              </Button>
            ) : undefined}
          </div>
        </>
      );
    }
    if (consent?.state === 'enabled') {
      return (
        <>
          <ReloadHeading
            title='Auto-reload'
            badge={<BillingStatusBadge tone='positive'>On</BillingStatusBadge>}
            description={`When your balance drops below ${threshold}, we charge ${
              consent.paymentMethod ? formatCardSummary(consent.paymentMethod) : 'your saved card'
            } ${reloadAmount} plus tax${addsCredits}.`}
            control={turnOffButton('Turn off')}
          />
          <p className='text-xs text-muted-foreground'>
            Limits: up to {formatUsdMinor(consent.terms.grossCeilingMinor)} per charge including tax,{' '}
            {formatUsdMinor(consent.terms.monthlyGrossCapMinor)} per month, and{' '}
            {formatCadenceLimit(consent.terms.minimumCadenceSeconds)}.
          </p>
        </>
      );
    }
    if (consent?.state === 'paused_terms') {
      return (
        <>
          <ReloadHeading
            title='Auto-reload'
            badge={<BillingStatusBadge tone='warning'>Paused</BillingStatusBadge>}
            description='We’ve updated the auto-reload terms. Review and accept them to turn auto-reload back on.'
          />
          <div className='flex flex-wrap justify-end gap-2'>
            {turnOffButton('Turn off')}
            {reviewButton('Review new terms', 'default')}
          </div>
        </>
      );
    }
    if (consent?.state === 'disabled_failures') {
      return (
        <ReloadHeading
          title='Auto-reload'
          badge={<BillingStatusBadge tone='warning'>Off</BillingStatusBadge>}
          description={`We turned auto-reload off after ${String(consent.terms.terminalFailureLimit)} failed ${
            consent.terms.terminalFailureLimit === 1 ? 'payment' : 'payments'
          }. Check your card, then turn it back on.`}
          control={reviewButton('Turn on')}
        />
      );
    }
    return (
      <ReloadHeading
        title='Auto-reload is off'
        description={offDescription}
        control={reviewButton(consent ? 'Turn on' : 'Set up')}
      />
    );
  };

  return (
    <div>
      <h2 className='mb-3 text-sm font-medium'>Auto-reload</h2>
      <SettingsSectionCard>
        <CardContent className='flex flex-col gap-3 text-sm'>
          {body()}
          {canReview && isResolved && !paymentCollectionAvailable ? (
            <p className='text-xs text-muted-foreground'>{purchasesUnavailableMessage}</p>
          ) : undefined}
          {error ? <BillingInlineError>{error}</BillingInlineError> : undefined}
        </CardContent>
      </SettingsSectionCard>
    </div>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
