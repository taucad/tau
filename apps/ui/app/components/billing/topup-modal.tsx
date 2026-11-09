import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { legalUrl } from '#lib/legal-url.js';
import { CircleCheck, ExternalLink, Info, LoaderCircle } from 'lucide-react';
import { formatCredits } from '#utils/credits.utils.js';
import {
  formatUsdMinor,
  formatUsdTotalMinor,
  formatUsdWholeMinor,
  purchasedCreditsPerUsd,
  topupPrincipalBoundsMinor,
} from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import {
  BillingCollectionUnavailable,
  BillingPaymentConflict,
  cancelPaymentAction,
  confirmPaymentAction,
  createPaymentRequestId,
  followPaymentRedirect,
  getPaymentAction,
  getUnresolvedPaymentActions,
  prepareTopup,
  purchasesUnavailableMessage,
  recoverPaymentAction,
} from '#lib/billing-payment-client.js';
import { toast } from '@taucad/ui/components/sonner';
import { PaymentMethod } from '@taucad/ui-kit/components/payment-method';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@taucad/ui/components/dialog';
import { IconLine, SummaryList, SummaryRow, supportEmail } from '#components/billing/billing-primitives.js';

const presetsCents = [1000, 2500, 5000, 10_000] as const;
const minCents = topupPrincipalBoundsMinor.minimum;
const maxCents = topupPrincipalBoundsMinor.maximum;
const amountRange = `${formatUsdWholeMinor(minCents)} to ${formatUsdWholeMinor(maxCents)}`;
const settlingStates: ReadonlySet<WirePaymentAction['state']> = new Set(['creating', 'processing', 'funds_received']);
/** States the dialog only reports: nothing is left to do here but close or start again. */
const terminalStates: ReadonlySet<WirePaymentAction['state']> = new Set([
  'fulfilled',
  'completed',
  'failed',
  'canceled',
]);
/** The refund clause of the Terms; `apps/www/app/legal.server.ts` pins the `refunds` anchor. */
const refundPolicyPage = 'terms#refunds';
const settleIntervalMilliseconds = 2000;
const returnPath = (): string => `${globalThis.location.pathname}${globalThis.location.search}`;
/** Credits a purchase of this many cents adds, at the advertised rate; the review step shows the exact figure. */
const creditsForCents = (cents: number): string =>
  Math.floor((cents * purchasedCreditsPerUsd) / 100).toLocaleString('en-US');

type DialogCopy = {
  readonly title: string;
  readonly description: string;
  /** A live state shows a spinner beside its title. */
  readonly isLive?: boolean;
  /** Steps that lead to a payment keep the Terms and Refund policy line. */
  readonly hasLegalLine: boolean;
};

const formCopy: DialogCopy = {
  title: 'Add credits',
  description: 'Credits pay for AI and cloud kernel usage. They’re added right away and never expire.',
  hasLegalLine: true,
};

/** The title and description for a purchase in each state: what is happening, then what happens next. */
const actionCopy = (action: WirePaymentAction): DialogCopy => {
  const credits = formatCredits(BigInt(action.receipt?.grantedCreditAtoms ?? action.frozen?.creditAtoms ?? '0'));
  switch (action.state) {
    case 'prepared': {
      return action.purpose === 'automatic_topup'
        ? {
            title: 'Auto-reload in progress',
            description: 'Auto-reload is buying these credits now. You don’t need to do anything.',
            hasLegalLine: false,
          }
        : {
            title: 'Review your purchase',
            description: `You’re adding ${credits} to your balance.`,
            hasLegalLine: true,
          };
    }
    case 'redirect_required': {
      return {
        title: 'Finish your payment',
        description: 'You started this purchase but haven’t paid yet. You haven’t been charged.',
        hasLegalLine: true,
      };
    }
    case 'creating':
    case 'processing': {
      return {
        title: 'Processing payment',
        description:
          'This usually takes a few seconds. You can close this window and your credits will still be added.',
        isLive: true,
        hasLegalLine: false,
      };
    }
    case 'funds_received': {
      return {
        title: 'Payment received',
        description: `We’re adding ${credits} to your balance. This can take a moment.`,
        isLive: true,
        hasLegalLine: false,
      };
    }
    case 'attention_required': {
      if (action.attention?.reason === 'authentication_required') {
        return {
          title: 'Confirm with your bank',
          description:
            'Your bank wants you to confirm this payment. You can also pay with a different card. You’ll only be charged once.',
          hasLegalLine: true,
        };
      }
      return action.attention?.reason === 'operator_review'
        ? {
            title: 'We’re reviewing this payment',
            description: `You don’t need to do anything. If you have questions, email ${supportEmail}.`,
            hasLegalLine: false,
          }
        : {
            title: 'Waiting to hear from your bank',
            description:
              'We don’t know yet whether this payment went through. Please don’t pay again. Check back in a few minutes.',
            hasLegalLine: false,
          };
    }
    case 'fulfilled': {
      return {
        title: 'Credits added',
        description: `${credits} are in your balance and ready to use.`,
        hasLegalLine: false,
      };
    }
    case 'completed': {
      // Credit purchases end at `fulfilled`; this keeps a completed action from rendering as a dead end.
      return { title: 'Payment complete', description: 'This payment is finished.', hasLegalLine: false };
    }
    case 'failed': {
      return {
        title: 'Payment failed',
        description: 'Your card wasn’t charged. Try again, or use a different card.',
        hasLegalLine: true,
      };
    }
    case 'canceled': {
      return { title: 'Purchase canceled', description: 'You weren’t charged.', hasLegalLine: true };
    }
  }
};

/**
 * The line under every step that leads to a payment. The refund right is one
 * named link away at the point of purchase, without a refund sentence in the pitch.
 */
function LegalLine(): React.JSX.Element {
  return (
    <p data-slot='legal-line' className='text-xs text-muted-foreground'>
      By continuing, you agree to Tau’s{' '}
      <a href={legalUrl('terms')} target='_blank' rel='noopener noreferrer' className='underline'>
        Terms
      </a>{' '}
      and{' '}
      <a href={legalUrl(refundPolicyPage)} target='_blank' rel='noopener noreferrer' className='underline'>
        Refund policy
      </a>
      .
    </p>
  );
}

type TopupModalProps = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly defaultAmountCents?: number;
};

/** The Add credits dialog: choose an amount, review, pay, and see the result, with recovery for a purchase left open. */
export function TopupModal({ isOpen, onOpenChange, defaultAmountCents = 2500 }: TopupModalProps): React.JSX.Element {
  const entitlements = useEntitlements();
  const canPurchase = entitlements.isResolved && entitlements.paymentCollectionAvailable;
  const queryClient = useQueryClient();
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const binding = apiBaseUrl && environment && userId ? { apiBaseUrl, environment, ownerId: userId } : undefined;
  const generation = `${apiBaseUrl ?? ''}|${environment ?? ''}|${userId ?? ''}`;
  /* oxlint-disable react/refs -- monotonic generation refs synchronously fence stale A→B→A render state */
  const scopeRef = useRef({ key: generation, value: 0 });
  if (scopeRef.current.key !== generation) {
    scopeRef.current = { key: generation, value: scopeRef.current.value + 1 };
  }
  const generationValue = scopeRef.current.value;
  const [amountCents, setAmountCents] = useState(defaultAmountCents);
  const [customDollars, setCustomDollars] = useState('');
  const [isOther, setIsOther] = useState(false);
  const [action, setAction] = useState<WirePaymentAction>();
  const actionGenerationRef = useRef(generationValue);
  const [isBusy, setIsBusy] = useState(false);
  /* The read on open only looks for an unfinished purchase, so the dialog may close while it runs. */
  const [isChecking, setIsChecking] = useState(false);
  const amountFieldId = useId();
  const amountHintId = useId();
  const busyGenerationRef = useRef(generationValue);
  const requestIdRef = useRef(createPaymentRequestId());

  const run = useCallback(
    async (operation: () => Promise<WirePaymentAction>): Promise<void> => {
      const startedGeneration = generationValue;
      busyGenerationRef.current = startedGeneration;
      setIsBusy(true);
      try {
        const next = await operation();
        if (scopeRef.current.value !== startedGeneration) {
          return;
        }
        actionGenerationRef.current = startedGeneration;
        setAction(next);
        if (next.state === 'fulfilled') {
          void queryClient.invalidateQueries({ queryKey: ['billing'] });
        }
        followPaymentRedirect(next);
      } catch (error) {
        if (scopeRef.current.value !== startedGeneration) {
          return;
        }
        if (error instanceof BillingPaymentConflict) {
          if (error.action) {
            actionGenerationRef.current = startedGeneration;
            setAction(error.action);
            followPaymentRedirect(error.action);
          }
          toast.warning(
            error.code === 'request_payload_conflict'
              ? 'This purchase is out of date. Start again to continue.'
              : error.code === 'saved_card_not_found' || error.code === 'customer_tax_location_invalid'
                ? 'Your saved card needs a billing address. Choose "Use a different card" to add one.'
                : 'You already have a payment in progress.',
          );
        } else {
          toast.warning(
            error instanceof BillingCollectionUnavailable
              ? purchasesUnavailableMessage
              : 'Something went wrong. Try again.',
          );
        }
      } finally {
        if (scopeRef.current.value === startedGeneration) {
          setIsBusy(false);
        }
      }
    },
    [generationValue, queryClient],
  );

  useEffect(() => {
    if (!isOpen || !apiBaseUrl || !environment || !userId) {
      return;
    }
    const currentBinding = { apiBaseUrl, environment, ownerId: userId };
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- hide the prior identity's financial state before the owned GET
    setAction(undefined);
    // oxlint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- visible recovery loading state
    setIsBusy(true);
    // oxlint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- marks the busy period as the closable read
    setIsChecking(true);
    busyGenerationRef.current = generationValue;
    // async-iife: bootstrap
    void (async () => {
      try {
        const items = await getUnresolvedPaymentActions(currentBinding, 'manual_topup');
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          const owned = items.find((item) => item.purpose === 'manual_topup');
          actionGenerationRef.current = generationValue;
          setAction(owned);
        }
      } catch {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          toast.warning('Couldn’t check for an unfinished payment. Close this window and try again.');
        }
      } finally {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          setIsBusy(false);
          setIsChecking(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, environment, isOpen, userId]);

  const startNew = (): void => {
    requestIdRef.current = createPaymentRequestId();
    setAction(undefined);
    setAmountCents(defaultAmountCents);
    setCustomDollars('');
    setIsOther(false);
  };
  const visibleAction = binding && actionGenerationRef.current === generationValue ? action : undefined;
  const visibleBusy = busyGenerationRef.current === generationValue && isBusy;
  const visibleBinding = binding && visibleAction ? { ...binding, subjectId: visibleAction.subjectId } : binding;
  const settling = isOpen && visibleAction !== undefined && settlingStates.has(visibleAction.state);
  const settlingActionId = settling ? visibleAction.actionId : undefined;
  const settlingSubjectId = settling ? visibleAction.subjectId : undefined;

  // A confirmed saved-card charge settles in the billing worker, so the dialog polls until it reaches a receipt.
  useEffect(() => {
    if (settlingActionId === undefined || !apiBaseUrl || !environment || !userId) {
      return;
    }
    const pollBinding = { apiBaseUrl, environment, ownerId: userId, subjectId: settlingSubjectId };
    const startedGeneration = generationValue;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const next = await getPaymentAction(pollBinding, settlingActionId);
        if (!active || scopeRef.current.value !== startedGeneration) {
          return;
        }
        actionGenerationRef.current = startedGeneration;
        setAction(next);
        if (next.state === 'fulfilled') {
          void queryClient.invalidateQueries({ queryKey: ['billing'] });
        }
        if (settlingStates.has(next.state)) {
          timer = setTimeout(poll, settleIntervalMilliseconds);
        }
      } catch {
        // ponytail: retries at the same interval while the dialog is open; the worker, not this poll, owns settlement.
        if (active) {
          timer = setTimeout(poll, settleIntervalMilliseconds);
        }
      }
    };
    timer = setTimeout(poll, settleIntervalMilliseconds);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [apiBaseUrl, environment, generationValue, queryClient, settlingActionId, settlingSubjectId, userId]);
  /* oxlint-enable react/refs */
  const frozen = visibleAction?.frozen;
  const terminal = visibleAction !== undefined && terminalStates.has(visibleAction.state);
  const succeeded = visibleAction?.state === 'fulfilled' || visibleAction?.state === 'completed';
  const copy = visibleAction ? actionCopy(visibleAction) : formCopy;
  // Reached only through a refused top-up that carried it: its worker confirms or closes it, never this dialog.
  const automatic = visibleAction?.purpose === 'automatic_topup';
  const amountIsValid = amountCents >= minCents && amountCents <= maxCents;
  const amountIsOutOfRange = isOther && customDollars.trim() !== '' && !amountIsValid;
  const savedCard = entitlements.paymentMethod;
  const purchasesUnavailable = entitlements.isResolved && !entitlements.paymentCollectionAvailable;
  const cannotStart = visibleBusy || !amountIsValid || binding === undefined || !canPurchase;
  const prepare = async (method: 'saved_card' | 'checkout'): Promise<void> => {
    await run(async () =>
      prepareTopup(binding!, {
        requestId: requestIdRef.current,
        amountMinor: String(amountCents),
        method,
        returnPath: returnPath(),
      }),
    );
  };
  const close = (): void => {
    onOpenChange(false);
  };
  // After payment the summary reads as a receipt; before it, as what will be charged.
  const isPaid = visibleAction?.state === 'funds_received' || succeeded;
  const paidWith = visibleAction?.receipt?.chargedPaymentMethod ?? (succeeded ? frozen?.paymentMethod : undefined);
  const canContinueHosted =
    visibleAction?.state === 'attention_required' && visibleAction.attention?.action === 'continue_hosted';

  // Ends a prepared purchase or an open payment page; the server expires the session so nothing can be paid later.
  const discardQuote = async (): Promise<void> => {
    if (visibleAction?.state !== 'prepared' && visibleAction?.state !== 'redirect_required') {
      return;
    }
    const startedGeneration = generationValue;
    busyGenerationRef.current = startedGeneration;
    setIsBusy(true);
    try {
      await cancelPaymentAction(visibleBinding!, visibleAction.actionId);
      if (scopeRef.current.value !== startedGeneration) {
        return;
      }
      startNew();
    } catch (error) {
      if (scopeRef.current.value === startedGeneration) {
        if (error instanceof BillingPaymentConflict && error.code === 'action_not_cancelable') {
          // The Checkout already closed on Stripe's side, so retrying cannot help; show where the payment stands.
          toast.warning('This payment can’t be canceled anymore.');
          const current = await getPaymentAction(visibleBinding!, visibleAction.actionId).catch(() => undefined);
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the modal may have moved on during the GET
          if (current !== undefined && scopeRef.current.value === startedGeneration) {
            actionGenerationRef.current = startedGeneration;
            setAction(current);
            if (current.state === 'fulfilled') {
              void queryClient.invalidateQueries({ queryKey: ['billing'] });
            }
          }
        } else {
          toast.warning(
            visibleAction.state === 'prepared'
              ? 'Couldn’t go back. Try again.'
              : 'Couldn’t cancel the purchase. Try again.',
          );
        }
      }
    } finally {
      if (scopeRef.current.value === startedGeneration) {
        setIsBusy(false);
      }
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!visibleBusy || isChecking) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {copy.isLive ? (
              <LoaderCircle aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
            ) : undefined}
            {visibleAction?.state === 'fulfilled' ? (
              <CircleCheck aria-hidden='true' className='size-4 text-success' />
            ) : undefined}
            {copy.title}
          </DialogTitle>
          <DialogDescription role={visibleAction ? 'status' : undefined}>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          {/* oxlint-disable-next-line unicorn/no-negated-condition -- the empty action branch is the primary purchase form */}
          {!visibleAction ? (
            <>
              <div className='flex flex-col gap-2'>
                <div className='grid grid-cols-3 gap-2 sm:grid-cols-5' role='group' aria-label='Amount'>
                  {presetsCents.map((preset) => (
                    <Button
                      key={preset}
                      size='sm'
                      variant={!isOther && amountCents === preset ? 'default' : 'outline'}
                      aria-pressed={!isOther && amountCents === preset}
                      onClick={() => {
                        setIsOther(false);
                        setAmountCents(preset);
                      }}
                    >
                      {formatUsdWholeMinor(preset)}
                    </Button>
                  ))}
                  <Button
                    size='sm'
                    variant={isOther ? 'default' : 'outline'}
                    aria-pressed={isOther}
                    onClick={() => {
                      setIsOther(true);
                      setAmountCents(Math.round(Number(customDollars) * 100));
                    }}
                  >
                    Other
                  </Button>
                </div>
                {isOther ? (
                  <div className='flex flex-col gap-1'>
                    <label htmlFor={amountFieldId} className='text-xs font-medium'>
                      Amount (USD)
                    </label>
                    <div className='relative'>
                      <span
                        aria-hidden='true'
                        className='pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground'
                      >
                        $
                      </span>
                      <Input
                        autoFocus
                        id={amountFieldId}
                        type='number'
                        inputMode='decimal'
                        min={minCents / 100}
                        max={maxCents / 100}
                        className='pl-6'
                        aria-describedby={amountHintId}
                        aria-invalid={amountIsOutOfRange ? true : undefined}
                        value={customDollars}
                        onChange={(event) => {
                          setCustomDollars(event.target.value);
                          setAmountCents(Math.round(Number(event.target.value) * 100));
                        }}
                      />
                    </div>
                  </div>
                ) : undefined}
                <p
                  id={amountHintId}
                  role={amountIsOutOfRange ? 'alert' : undefined}
                  className={amountIsOutOfRange ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}
                >
                  {amountIsOutOfRange
                    ? `Enter an amount from ${amountRange}.`
                    : amountIsValid
                      ? `${formatUsdWholeMinor(amountCents)} adds ${creditsForCents(amountCents)} credits. ${
                          isOther
                            ? `Enter ${amountRange}.`
                            : savedCard
                              ? 'Tax is added on the next step.'
                              : 'You’ll enter your card on Stripe’s payment page, where tax is added.'
                        }`
                      : `Enter ${amountRange}.`}
                </p>
              </div>
              {purchasesUnavailable ? (
                <div role='status' className='rounded-md border px-3 py-2.5 text-sm'>
                  <IconLine icon={<Info aria-hidden='true' className='size-4 text-muted-foreground' />}>
                    {purchasesUnavailableMessage}
                  </IconLine>
                </div>
              ) : undefined}
              {savedCard ? (
                <>
                  <div className='flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'>
                    <PaymentMethod method={savedCard} />
                    <Button
                      variant='ghost'
                      size='xs'
                      disabled={cannotStart}
                      onClick={async () => {
                        await prepare('checkout');
                      }}
                    >
                      Use a different card
                    </Button>
                  </div>
                  <Button
                    disabled={cannotStart}
                    aria-busy={visibleBusy}
                    onClick={async () => {
                      await prepare('saved_card');
                    }}
                  >
                    {visibleBusy ? (
                      <LoaderCircle aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
                    ) : undefined}
                    Continue
                  </Button>
                </>
              ) : (
                <Button
                  disabled={cannotStart}
                  aria-busy={visibleBusy}
                  onClick={async () => {
                    await prepare('checkout');
                  }}
                >
                  {visibleBusy ? (
                    <LoaderCircle aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
                  ) : undefined}
                  Continue to payment
                  <ExternalLink aria-hidden='true' className='size-3' />
                </Button>
              )}
            </>
          ) : undefined}

          {frozen ? (
            <>
              <SummaryList>
                <SummaryRow label={formatCredits(BigInt(frozen.creditAtoms))}>
                  {formatUsdMinor(frozen.principalMinor)}
                </SummaryRow>
                {frozen.taxMinor === null ? (
                  isPaid ? undefined : (
                    <SummaryRow label='Tax' emphasis='muted'>
                      Calculated on the payment page
                    </SummaryRow>
                  )
                ) : (
                  <SummaryRow label='Tax'>{formatUsdMinor(frozen.taxMinor)}</SummaryRow>
                )}
                {frozen.grossMinor === null ? undefined : (
                  <SummaryRow label={isPaid ? 'Total paid' : 'Total'} emphasis='total'>
                    {formatUsdTotalMinor(frozen.grossMinor)}
                  </SummaryRow>
                )}
                {succeeded && paidWith ? (
                  <SummaryRow label='Paid with'>
                    <PaymentMethod method={paidWith} />
                  </SummaryRow>
                ) : undefined}
              </SummaryList>
              {frozen.paymentMethod && !succeeded ? (
                <div className='flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'>
                  <PaymentMethod method={frozen.paymentMethod} />
                  {visibleAction.state === 'prepared' && !automatic ? (
                    <Button variant='ghost' size='xs' disabled={visibleBusy} onClick={discardQuote}>
                      Change
                    </Button>
                  ) : undefined}
                </div>
              ) : undefined}
            </>
          ) : undefined}

          {visibleAction?.state === 'prepared' && !automatic ? (
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' disabled={visibleBusy} onClick={discardQuote}>
                Back
              </Button>
              <Button
                className='flex-1'
                disabled={visibleBusy}
                onClick={async () => {
                  await run(async () => confirmPaymentAction(visibleBinding!, visibleAction.actionId));
                }}
              >
                {typeof frozen?.grossMinor === 'string' ? (
                  `Pay ${formatUsdMinor(frozen.grossMinor)}`
                ) : (
                  <>
                    Continue to payment
                    <ExternalLink aria-hidden='true' className='size-3' />
                  </>
                )}
              </Button>
            </div>
          ) : undefined}
          {visibleAction?.state === 'redirect_required' ? (
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' disabled={visibleBusy} onClick={discardQuote}>
                Cancel purchase
              </Button>
              <Button className='flex-1' disabled={visibleBusy} onClick={() => followPaymentRedirect(visibleAction)}>
                Continue to payment
                <ExternalLink aria-hidden='true' className='size-3' />
              </Button>
            </div>
          ) : undefined}
          {canContinueHosted ? (
            <Button
              disabled={visibleBusy}
              onClick={async () => {
                await run(async () => recoverPaymentAction(visibleBinding!, visibleAction.actionId));
              }}
            >
              Continue to payment
              <ExternalLink aria-hidden='true' className='size-3' />
            </Button>
          ) : undefined}
          {/* Waiting states have nothing to press, so they get an explicit way out instead of only the corner X. */}
          {visibleAction !== undefined &&
          !terminal &&
          !canContinueHosted &&
          visibleAction.state !== 'redirect_required' &&
          !(visibleAction.state === 'prepared' && !automatic) ? (
            <Button variant='outline' onClick={close}>
              Close
            </Button>
          ) : undefined}
          {terminal ? (
            <Button
              onClick={() => {
                startNew();
                if (succeeded) {
                  close();
                }
              }}
            >
              {succeeded ? 'Done' : visibleAction.state === 'failed' ? 'Try again' : 'Add credits'}
            </Button>
          ) : undefined}
          {copy.hasLegalLine && !purchasesUnavailable ? <LegalLine /> : undefined}
        </div>
      </DialogContent>
    </Dialog>
  );
}
