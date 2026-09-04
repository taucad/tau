import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { formatMicroUsd } from '@taucad/billing';
import { randomUuid } from '@taucad/utils/id';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { authClient } from '#lib/auth-client.js';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { toast } from '#components/ui/sonner.js';
import { confirmTopupSettlement } from '@taucad/billing/hooks/use-topup-return';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { IconId } from '#components/icons/svg-icon.js';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@taucad/ui/components/dialog';

/** Preset credit-pack denominations in cents (Q6): $10/$25/$50/$100 + "Other". */
const presetsCents = [1000, 2500, 5000, 10_000] as const;
/** A µ$ balance on the wire — the same shape `use-credits.ts` parses with zod. */
const microString = /^-?\d+$/u;
const minCents = 500;
const maxCents = 50_000;

const apiBaseUrl = (): string => requireClientEnvironmentUrl('TAU_API_URL');

/** "US$25" for whole dollars, "US$5.50" otherwise — for the buy-button copy. */
const formatUsd = (cents: number): string => {
  const dollars = cents / 100;
  return `US$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
};

/**
 * Stripe `card.brand` → bundled sprite icon (R8). Brands with no bundled mark
 * (`unknown`, `eftpos_au`, …) fall through to the lucide `CreditCard` glyph.
 */
const brandIconId: Record<string, IconId> = {
  visa: 'visa',
  mastercard: 'mastercard',
  amex: 'amex',
  discover: 'discover',
  diners: 'diners-club',
  jcb: 'jcb',
  unionpay: 'unionpay',
};

/** Human label for a `card.brand`; unmapped brands read as a generic "Card". */
const brandLabel: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

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

type TopupModalProps = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Pre-selected denomination for contextual flows (chat-error default $25). */
  readonly defaultAmountCents?: number;
};

/**
 * Credit-pack mini-checkout (redesign R2–R5/R8): a line-item summary (Usage
 * credits / Total due — no tax line, Tau runs no tax integration), the saved
 * card that will be charged with an edit affordance, and a Tau-accurate footnote.
 *
 * With a card on file the "Buy" button charges it in-app and the server credits
 * the ledger in the same request, so the modal confirms the new balance in place
 * rather than closing on a promise (docs/research/credit-topup-inline-settlement-blueprint.md).
 * With no card it says "Continue" and redirects to Stripe hosted Checkout —
 * embedded Checkout cannot load under Tau's cross-origin isolation (Stripe.js is
 * COEP-blocked — docs/research/credit-topup-hosted-checkout-migration.md), so
 * completion returns via `?topup=success`, where `useTopupReturn` refreshes the
 * balance.
 */
export function TopupModal({ isOpen, onOpenChange, defaultAmountCents = 2500 }: TopupModalProps): React.JSX.Element {
  const entitlements = useEntitlements();
  const savedCard = entitlements.paymentMethod;

  const [amountCents, setAmountCents] = useState(defaultAmountCents);
  const [customDollars, setCustomDollars] = useState('');
  const [isOther, setIsOther] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'loading'>('pick');
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Set only once the inline credit is confirmed — its presence *is* the success
  // state, so the balance can never render without a number behind it. It also
  // carries the charged amount, captured when the request resolved, so the
  // receipt can never quote a figure the buyer picked after the charge.
  const [settled, setSettled] = useState<{ balanceMicro: string; chargedCents: number }>();
  const [resetState, setResetState] = useState({ isOpen, defaultAmountCents });

  // Retry key for the saved-card charge: reused across retries of the same
  // attempt so Stripe dedupes the charge, discarded on any definitive outcome.
  const idempotencyKeyRef = useRef<string>(undefined);

  // Stripe rejects a reused key whose params changed, so an amount change
  // starts a fresh attempt.
  useEffect(() => {
    idempotencyKeyRef.current = undefined;
  }, [amountCents]);

  if (isOpen !== resetState.isOpen || defaultAmountCents !== resetState.defaultAmountCents) {
    setResetState({ isOpen, defaultAmountCents });
    if (isOpen) {
      setPhase('pick');
      setCustomDollars('');
      setIsOther(false);
      setAmountCents(defaultAmountCents);
      setSettled(undefined);
    }
  }

  const startCheckout = useCallback(async (): Promise<void> => {
    const apiBase = apiBaseUrl();
    setPhase('loading');
    idempotencyKeyRef.current ??= randomUuid();
    try {
      const response = await fetch(`${apiBase}/v1/billing/topup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        // The server sanitises `returnUrl` to a same-origin path and appends
        // `?topup=success`, so the buyer returns exactly where they started.
        body: JSON.stringify({
          amountCents,
          returnUrl: globalThis.location.href,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (!response.ok) {
        // The body carries the server's error code (e.g. TOPUP_CHARGE_UNCONFIRMED)
        // so the catch can tell an ambiguous charge from a plain failure.
        const body = await response.text().catch(() => '');
        throw new Error(`Top-up request failed with ${response.status}: ${body}`);
      }
      const result = (await response.json()) as { url?: string; status?: 'succeeded'; balanceMicro?: unknown };
      if (result.status === 'succeeded') {
        // Definitive outcome — the next Buy is a new payment, not a retry.
        idempotencyKeyRef.current = undefined;
        // Fast path: the saved card was charged AND credited in the same request.
        confirmTopupSettlement();
        // `BigInt()` throws on anything but an integer string, and this renders,
        // so anything else must degrade rather than reach the error boundary.
        const balanceMicro =
          typeof result.balanceMicro === 'string' && microString.test(result.balanceMicro)
            ? result.balanceMicro
            : undefined;
        if (balanceMicro === undefined) {
          // Charged, but the inline credit did not confirm. The money left the
          // buyer's account, so this is never an error and never offers a retry
          // — fall back to the old promise and let the webhook settle it.
          onOpenChange(false);
          toast('Payment received — your balance will update shortly.');
          return;
        }
        setSettled({ balanceMicro, chargedCents: amountCents });
        return;
      }
      if (result.url !== undefined) {
        // The charge was declined for sure (the server only falls back to
        // Checkout on definite rejections), so the retry key is spent.
        idempotencyKeyRef.current = undefined;
        globalThis.location.assign(result.url);
        return;
      }
      throw new Error('Top-up response had neither a checkout URL nor a success status');
    } catch (error) {
      setPhase('pick');
      // The key survives this path on purpose: an ambiguous failure (503
      // TOPUP_CHARGE_UNCONFIRMED, network drop) may have charged the card, and
      // retrying with the same key recovers that charge instead of repeating it.
      toast.warning(
        error instanceof Error && error.message.includes('TOPUP_CHARGE_UNCONFIRMED')
          ? 'We could not confirm the charge — check your balance in a moment before retrying.'
          : error instanceof Error && error.message.includes('429')
            ? 'Too many top-up attempts — try again in a bit.'
            : 'Could not start the top-up checkout. Try again.',
      );
    }
  }, [amountCents, onOpenChange]);

  // Edit the saved card in Stripe's hosted billing portal (R3) — a redirect out
  // and back. On return the fresh page load refetches entitlements, so the
  // updated card renders (the webhook fan-out also invalidates the projection).
  const editCard = useCallback(async (): Promise<void> => {
    setIsRedirecting(true);
    try {
      await authClient.subscription.billingPortal({ returnUrl: globalThis.location.href });
    } finally {
      setIsRedirecting(false);
    }
  }, []);

  const applyCustomDollars = (raw: string): void => {
    setCustomDollars(raw);
    const dollars = Number(raw);
    // Keep `amountCents` in lock-step with the field so the button reflects it as
    // the user types; 0 when empty/non-numeric (button reads "US$0…", disabled).
    setAmountCents(raw !== '' && Number.isFinite(dollars) ? Math.round(dollars * 100) : 0);
  };

  const amountIsValid = amountCents >= minCents && amountCents <= maxCents;
  // A charge is in flight against `amountCents`, so every control that could
  // change it — or navigate away from the outcome — is frozen with it.
  const isCharging = phase === 'loading';
  const customIsInvalid = isOther && customDollars !== '' && !amountIsValid;
  const hasCard = savedCard !== undefined;

  if (settled !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Credits added</DialogTitle>
            <DialogDescription>{formatUsd(settled.chargedCents)} was charged to your card.</DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-4'>
            <dl className='flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm'>
              <dt className='text-muted-foreground'>New balance</dt>
              <dd className='font-medium'>{`US$${formatMicroUsd(BigInt(settled.balanceMicro))}`}</dd>
            </dl>
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        // Radix routes escape, outside-click AND the built-in close button
        // through this one handler, so a single guard stops the buyer losing
        // the outcome of a charge that is already in flight.
        if (!isCharging) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Add credits</DialogTitle>
          <DialogDescription>Top up your credit balance.</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          <div className='grid grid-cols-5 gap-2' role='group' aria-label='Credit pack amount'>
            {presetsCents.map((preset) => (
              <Button
                key={preset}
                variant={!isOther && amountCents === preset ? 'default' : 'outline'}
                size='sm'
                disabled={isCharging}
                onClick={() => {
                  setIsOther(false);
                  setCustomDollars('');
                  setAmountCents(preset);
                }}
              >
                ${preset / 100}
              </Button>
            ))}
            <Button
              variant={isOther ? 'default' : 'outline'}
              size='sm'
              disabled={isCharging}
              onClick={() => {
                // Reset to $0 so a previously-picked preset doesn't linger in the
                // button — the buyer enters the amount below.
                setIsOther(true);
                setCustomDollars('');
                setAmountCents(0);
              }}
            >
              Other
            </Button>
          </div>
          {isOther ? (
            <div className='flex flex-col gap-2'>
              <div className='flex items-baseline gap-2'>
                <span className='text-sm font-medium'>Enter amount</span>
                <span className='text-xs text-muted-foreground'>${minCents / 100}.00 minimum</span>
              </div>
              <div className='relative'>
                <span className='pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground'>
                  $
                </span>
                <Input
                  autoFocus
                  type='number'
                  inputMode='decimal'
                  min={minCents / 100}
                  max={maxCents / 100}
                  step='1'
                  aria-label='Custom amount'
                  className='pl-7'
                  disabled={isCharging}
                  value={customDollars}
                  aria-invalid={customIsInvalid}
                  onChange={(event) => {
                    applyCustomDollars(event.target.value);
                  }}
                />
              </div>
              {customIsInvalid ? (
                <p className='text-xs text-warning'>Custom amounts must be between $5 and $500.</p>
              ) : undefined}
            </div>
          ) : undefined}

          {/* Line-item summary (R2/R5): Usage credits + Total due, no tax line. */}
          <dl className='flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm'>
            <div className='flex items-center justify-between text-muted-foreground'>
              <dt>Usage credits</dt>
              <dd>{formatUsd(amountCents)}</dd>
            </div>
            <div className='flex items-center justify-between border-t border-border pt-1.5 font-medium'>
              <dt>Total due</dt>
              <dd>{formatUsd(amountCents)}</dd>
            </div>
          </dl>

          {/* Payment-method row (R2/R3/R8): the card that will be charged + edit. */}
          {savedCard ? (
            <div className='flex items-center justify-between rounded-md border border-border px-3 py-2'>
              <div className='flex items-center gap-2'>
                <CardBrandIcon brand={savedCard.brand} className='size-8 shrink-0' />
                <span className='text-sm'>
                  {brandLabel[savedCard.brand] ?? 'Card'} •••• {savedCard.last4}
                </span>
              </div>
              <Button
                variant='ghost'
                size='sm'
                disabled={isRedirecting || isCharging}
                onClick={() => void editCard()}
                aria-label='Edit payment method'
              >
                <Pencil className='size-3.5' />
              </Button>
            </div>
          ) : undefined}

          <Button disabled={isCharging || !amountIsValid} onClick={() => void startCheckout()}>
            {isCharging
              ? 'Processing…'
              : hasCard
                ? `Buy ${formatUsd(amountCents)} of credits`
                : `Continue — ${formatUsd(amountCents)}`}
          </Button>

          {/* Footnote (R4): scoped to what is actually live and metered. */}
          <p className='text-xs text-muted-foreground'>
            Credits are spent on AI and kernel usage after your monthly grant runs out, and never expire. By clicking
            “Buy credits” you agree to Tau’s{' '}
            <Link to='/legal/terms' className='underline underline-offset-2 hover:text-foreground'>
              Terms
            </Link>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
