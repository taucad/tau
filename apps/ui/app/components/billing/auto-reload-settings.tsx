import { useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCreditAtoms } from '@taucad/billing';
import type { WireAutoReloadConsent, WirePaymentAction } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
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

/* eslint-disable @typescript-eslint/naming-convention -- keys are the wire's snake_case consent states. */
const consentStateLabel: Record<WireAutoReloadConsent['state'], string> = {
  pending_setup: 'Waiting for card setup',
  enabled: 'On',
  paused_terms: 'Paused because the terms changed. Review the new terms to continue.',
  disabled_failures: 'Off after failed payments',
  revoked: 'Off',
};
/* eslint-enable @typescript-eslint/naming-convention -- end wire state keys. */

/** Consents new terms can replace: billing refuses new terms only while a consent waits for its card or is on. */
const reviewableStates: ReadonlySet<WireAutoReloadConsent['state']> = new Set([
  'paused_terms',
  'disabled_failures',
  'revoked',
]);

const money = (minor: string): string => `US$${(Number(minor) / 100).toFixed(2)}`;

/** Milliseconds between reads while billing confirms a card setup the customer may already have finished. */
const setupConfirmationInterval = 2000;
/** Milliseconds a mounted card keeps reading; after that, focusing the page or reopening the card reads again. */
const setupConfirmationWindow = 60_000;

/** What the card shows for its read of the consent: the consent, a failure with Retry, or a loading line. */
const loadState = (read: {
  readonly data: unknown;
  readonly isError: boolean;
  readonly isFetching: boolean;
}): 'loaded' | 'failed' | 'loading' =>
  read.data !== undefined ? 'loaded' : read.isError && !read.isFetching ? 'failed' : 'loading';

/** Whether the consent waits on a card setup in Checkout, which billing confirms some seconds after it is done. */
const isConfirmingSetup = (consent: WireAutoReloadConsent | undefined): boolean =>
  consent?.state === 'pending_setup' &&
  (consent.setupAction?.state === 'redirect_required' || consent.setupAction?.state === 'processing');

/** Explicit quote, acceptance, setup, and revocation controls for automatic credit reload. */
export function AutoReloadSettings({
  binding,
}: {
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
      isConfirmingSetup(query.state.data ?? undefined) && Date.now() < confirmingUntil
        ? setupConfirmationInterval
        : false,
  });
  /** A control's answer for the setup, which stands until the next read of the consent replaces it. */
  const [answer, setAnswer] = useState<{ readonly readAt: number; readonly action: WirePaymentAction }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const consent = reload.data ?? undefined;
  const action = answer?.readAt === reload.dataUpdatedAt ? answer.action : (consent?.setupAction ?? undefined);
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
              ? 'Add credits once through Checkout to save a card and billing address, then set up automatic reload.'
              : 'Could not update automatic reload. Try again.',
        );
      }
    } finally {
      if (guard.isCurrent()) {
        setBusy(false);
      }
    }
  };

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle className='text-base'>Automatic reload</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 text-sm'>
        {load === 'loading' ? (
          <p className='text-muted-foreground' role='status' aria-busy='true'>
            Loading automatic reload…
          </p>
        ) : undefined}
        {load === 'failed' ? (
          <div className='flex items-center justify-between gap-2'>
            <p className='text-muted-foreground' role='alert'>
              Automatic reload settings could not be loaded.
            </p>
            <Button variant='ghost' size='sm' onClick={() => void reload.refetch()}>
              Retry
            </Button>
          </div>
        ) : undefined}
        {load !== 'loaded' ? undefined : consent ? (
          <dl className='grid grid-cols-2 gap-1 text-muted-foreground'>
            <dt>Reload amount</dt>
            <dd>{money(consent.terms.principalMinor)}</dd>
            <dt>Quoted tax</dt>
            <dd>{money(consent.terms.quotedTaxMinor)}</dd>
            <dt>Maximum charge</dt>
            <dd>{money(consent.terms.grossCeilingMinor)}</dd>
            <dt>Monthly maximum</dt>
            <dd>{money(consent.terms.monthlyGrossCapMinor)}</dd>
            <dt>Reload threshold</dt>
            <dd>{formatCreditAtoms(BigInt(consent.terms.thresholdAtoms))} credits</dd>
            <dt>Minimum time between reloads</dt>
            <dd>{formatHours(consent.terms.minimumCadenceSeconds)}</dd>
            <dt>Failure limit</dt>
            <dd>{consent.terms.terminalFailureLimit}</dd>
            <dt>Status</dt>
            <dd>{consentStateLabel[consent.state]}</dd>
            {consent.paymentMethod ? (
              <>
                <dt>Card</dt>
                <dd>
                  {consent.paymentMethod.brand} •••• {consent.paymentMethod.last4}
                </dd>
              </>
            ) : undefined}
          </dl>
        ) : (
          <p className='text-muted-foreground'>Automatic reload is off.</p>
        )}
        {action?.state === 'prepared' ? (
          <Button
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
            Accept these limits
          </Button>
        ) : undefined}
        {action?.state === 'redirect_required' ? (
          <Button onClick={() => followPaymentRedirect(action)}>Continue setup</Button>
        ) : undefined}
        {action?.state === 'attention_required' && action.attention?.action === 'continue_hosted' ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await recoverPaymentAction(
                  { ...binding!, subjectId: action.subjectId, financialSession: token },
                  action.actionId,
                );
                if (token.isCurrent()) {
                  answerSetup(next);
                }
              })
            }
          >
            Continue setup
          </Button>
        ) : undefined}
        {canReview ? (
          <Button
            disabled={busy || !binding || !isResolved || !paymentCollectionAvailable}
            onClick={() =>
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
              })
            }
          >
            Review automatic reload
          </Button>
        ) : undefined}
        {canReview && isResolved && !paymentCollectionAvailable ? (
          <p className='text-muted-foreground'>{purchasesUnavailableMessage}</p>
        ) : undefined}
        {consent && consent.state !== 'revoked' ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await revokeReloadConsent(
                  { ...binding!, subjectId: consent.subjectId, financialSession: token },
                  consent.consentId,
                );
                if (token.isCurrent()) {
                  queryClient.setQueryData<WireAutoReloadConsent>(queryKey, next);
                }
              })
            }
          >
            Turn off automatic reload
          </Button>
        ) : undefined}
        {error ? (
          <p className='text-warning' role='alert'>
            {error}
          </p>
        ) : undefined}
      </CardContent>
    </SettingsSectionCard>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
