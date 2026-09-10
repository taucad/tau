import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Link } from 'react-router';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party billing surface owns the direct billing client contract
import { formatCreditAtoms } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import {
  BillingPaymentConflict,
  cancelPaymentAction,
  confirmPaymentAction,
  createPaymentRequestId,
  followPaymentRedirect,
  getUnresolvedPaymentActions,
  prepareTopup,
  recoverPaymentAction,
} from '#lib/billing-payment-client.js';
import { toast } from '#components/ui/sonner.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { IconId } from '#components/icons/svg-icon.js';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@taucad/ui/components/dialog';

const presetsCents = [1000, 2500, 5000, 10_000] as const;
const minCents = 500;
const maxCents = 50_000;
const brandIconId: Record<string, IconId> = {
  visa: 'visa',
  mastercard: 'mastercard',
  amex: 'amex',
  discover: 'discover',
  diners: 'diners-club',
  jcb: 'jcb',
  unionpay: 'unionpay',
};
const brandLabel: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};
const returnPath = (): string => `${globalThis.location.pathname}${globalThis.location.search}`;
const formatUsdMinor = (minor: string | number): string => `US$${(Number(minor) / 100).toFixed(2)}`;

function CardBrandIcon({
  brand,
  className,
}: {
  readonly brand: string;
  readonly className?: string;
}): React.JSX.Element {
  const iconId = brandIconId[brand];
  return iconId === undefined ? (
    <CreditCard className={className} aria-label='Card' />
  ) : (
    <SvgIcon id={iconId} className={className} role='img' aria-label={brandLabel[brand] ?? brand} />
  );
}

function PaymentMethod({ method }: { readonly method: { brand: string; last4: string } }): React.JSX.Element {
  return (
    <span className='flex items-center gap-2'>
      <CardBrandIcon brand={method.brand} className='size-8' />
      {brandLabel[method.brand] ?? 'Card'} •••• {method.last4}
    </span>
  );
}

type TopupModalProps = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly defaultAmountCents?: number;
};

/** First-party quote, confirmation, recovery, and receipt flow for credit purchases. */
export function TopupModal({ isOpen, onOpenChange, defaultAmountCents = 2500 }: TopupModalProps): React.JSX.Element {
  const entitlements = useEntitlements();
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
              ? 'This purchase changed. Start a new purchase to continue.'
              : 'A payment is already in progress.',
          );
        } else {
          toast.warning('Could not update the payment. Try again.');
        }
      } finally {
        if (scopeRef.current.value === startedGeneration) {
          setIsBusy(false);
        }
      }
    },
    [generationValue, userId],
  );

  useEffect(() => {
    if (!isOpen || binding === undefined) {
      return;
    }
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- hide the prior identity's financial state before the owned GET
    setAction(undefined);
    // oxlint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- visible recovery loading state
    setIsBusy(true);
    busyGenerationRef.current = generationValue;
    // async-iife: bootstrap
    void (async () => {
      try {
        const items = await getUnresolvedPaymentActions(binding, 'manual_topup');
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          const owned = items[0];
          actionGenerationRef.current = generationValue;
          setAction(owned);
        }
      } catch {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          toast.warning('Could not check for an existing payment.');
        }
      } finally {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip active while the GET is pending
        if (active) {
          setIsBusy(false);
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
  /* oxlint-enable react/refs */
  const visibleBinding = binding && visibleAction ? { ...binding, subjectId: visibleAction.subjectId } : binding;
  const frozen = visibleAction?.frozen;
  const terminal =
    visibleAction?.state === 'fulfilled' || visibleAction?.state === 'failed' || visibleAction?.state === 'canceled';
  const amountIsValid = amountCents >= minCents && amountCents <= maxCents;

  const discardQuote = async (): Promise<void> => {
    if (visibleAction?.state !== 'prepared') {
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
    } catch {
      if (scopeRef.current.value === startedGeneration) {
        toast.warning('Could not discard the quote. Try again.');
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
        if (!visibleBusy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{visibleAction?.state === 'fulfilled' ? 'Credits added' : 'Add credits'}</DialogTitle>
          <DialogDescription>
            {visibleAction
              ? `Payment status: ${visibleAction.state.replaceAll('_', ' ')}`
              : 'Top up your credit balance.'}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          {/* oxlint-disable-next-line unicorn/no-negated-condition -- the empty action branch is the primary purchase form */}
          {!visibleAction ? (
            <>
              <div className='grid grid-cols-5 gap-2' role='group' aria-label='Credit pack amount'>
                {presetsCents.map((preset) => (
                  <Button
                    key={preset}
                    size='sm'
                    variant={!isOther && amountCents === preset ? 'default' : 'outline'}
                    onClick={() => {
                      setIsOther(false);
                      setAmountCents(preset);
                    }}
                  >
                    ${preset / 100}
                  </Button>
                ))}
                <Button
                  size='sm'
                  variant={isOther ? 'default' : 'outline'}
                  onClick={() => {
                    setIsOther(true);
                    setAmountCents(0);
                  }}
                >
                  Other
                </Button>
              </div>
              {isOther ? (
                <Input
                  autoFocus
                  type='number'
                  min={5}
                  max={500}
                  aria-label='Custom amount'
                  value={customDollars}
                  onChange={(event) => {
                    setCustomDollars(event.target.value);
                    setAmountCents(Math.round(Number(event.target.value) * 100));
                  }}
                />
              ) : undefined}
              <Button
                disabled={visibleBusy || !amountIsValid || binding === undefined}
                onClick={async () => {
                  await run(async () =>
                    prepareTopup(binding!, {
                      requestId: requestIdRef.current,
                      amountMinor: String(amountCents),
                      method: entitlements.paymentMethod ? 'saved_card' : 'checkout',
                      returnPath: returnPath(),
                    }),
                  );
                }}
              >
                Review {formatUsdMinor(amountCents)} purchase
              </Button>
            </>
          ) : undefined}

          {frozen ? (
            <>
              <dl className='flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-sm'>
                <div className='flex justify-between'>
                  <dt>Credits</dt>
                  <dd>{formatCreditAtoms(BigInt(frozen.creditAtoms))}</dd>
                </div>
                <div className='flex justify-between'>
                  <dt>Amount</dt>
                  <dd>{formatUsdMinor(frozen.principalMinor)}</dd>
                </div>
                {frozen.taxMinor === '0' ? undefined : (
                  <div className='flex justify-between'>
                    <dt>Tax</dt>
                    <dd>{formatUsdMinor(frozen.taxMinor)}</dd>
                  </div>
                )}
                <div className='flex justify-between border-t pt-1.5 font-medium'>
                  <dt>Total due</dt>
                  <dd>{formatUsdMinor(frozen.grossMinor)}</dd>
                </div>
              </dl>
              {frozen.paymentMethod ? (
                <div className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                  <PaymentMethod method={frozen.paymentMethod} />
                  {visibleAction.state === 'prepared' ? (
                    <span className='text-xs text-muted-foreground'>Discard this quote to change the card.</span>
                  ) : undefined}
                </div>
              ) : undefined}
            </>
          ) : undefined}

          {visibleAction?.state === 'prepared' ? (
            <div className='flex gap-2'>
              <Button
                className='flex-1'
                disabled={visibleBusy}
                onClick={async () => {
                  await run(async () => confirmPaymentAction(visibleBinding!, visibleAction.actionId));
                }}
              >
                Confirm quote
              </Button>
              <Button variant='outline' disabled={visibleBusy} onClick={discardQuote}>
                Discard quote
              </Button>
            </div>
          ) : undefined}
          {visibleAction?.state === 'redirect_required' ? (
            <div className='flex flex-col gap-2 text-sm'>
              <p>Checkout is ready. Continue when you are ready.</p>
              <Button onClick={() => followPaymentRedirect(visibleAction)}>Resume Checkout</Button>
            </div>
          ) : undefined}
          {visibleAction && ['creating', 'processing', 'funds_received'].includes(visibleAction.state) ? (
            <p className='text-sm'>
              {visibleAction.state === 'funds_received'
                ? 'Payment received. Credits are still being added.'
                : 'Payment is still processing. You can close this window and return later.'}
            </p>
          ) : undefined}
          {visibleAction?.state === 'attention_required' ? (
            <div className='flex flex-col gap-2 text-sm'>
              <p>
                {visibleAction.attention?.reason === 'authentication_required'
                  ? 'Your saved-card attempt is paused. Continue in Checkout to authenticate or choose another card; the old attempt will not be charged separately.'
                  : visibleAction.attention?.reason === 'operator_review'
                    ? 'Support needs to review this payment.'
                    : 'The payment outcome is not yet known. Do not start another purchase.'}
              </p>
              {visibleAction.attention?.action === 'continue_hosted' ? (
                <Button
                  disabled={visibleBusy}
                  onClick={async () => {
                    await run(async () => recoverPaymentAction(visibleBinding!, visibleAction.actionId));
                  }}
                >
                  Continue in Checkout
                </Button>
              ) : undefined}
            </div>
          ) : undefined}
          {visibleAction?.state === 'fulfilled' && visibleAction.receipt ? (
            <div className='rounded-md border px-3 py-2.5 text-sm'>
              <p className='font-medium'>
                {formatCreditAtoms(BigInt(visibleAction.receipt.grantedCreditAtoms))} credits added.
              </p>
              <p>
                {formatUsdMinor(visibleAction.frozen?.grossMinor ?? '0')} charged
                {visibleAction.receipt.chargedPaymentMethod ? (
                  <>
                    {' '}
                    to <PaymentMethod method={visibleAction.receipt.chargedPaymentMethod} />
                  </>
                ) : undefined}
                .
              </p>
            </div>
          ) : undefined}
          {terminal ? (
            <Button
              onClick={() => {
                if (visibleAction.state === 'fulfilled') {
                  startNew();
                  onOpenChange(false);
                } else {
                  startNew();
                }
              }}
            >
              {visibleAction.state === 'fulfilled' ? 'Done' : 'Start a new purchase'}
            </Button>
          ) : undefined}
          <p className='text-xs text-muted-foreground'>
            Credits are spent on AI and kernel usage and never expire. By continuing you agree to Tau’s{' '}
            <Link to='/legal/terms' className='underline'>
              Terms
            </Link>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
