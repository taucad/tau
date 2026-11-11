import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import type { BillingTier, PlanCatalogEntry, WirePaymentAction } from '@taucad/billing';
import { tauPlanCatalog } from '@taucad/billing';
import { PlanCards as SharedPlanCards } from '@taucad/ui-kit/components/plan-cards';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import {
  BillingCollectionUnavailable,
  BillingPaymentConflict,
  purchasesUnavailableMessage,
  createPaymentRequestId,
  createSubscriptionAction,
  followPaymentRedirect,
} from '#lib/billing-payment-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { Button } from '@taucad/ui/components/button';
import { BillingInlineError } from '#components/billing/billing-primitives.js';

const enterpriseMailto = 'mailto:enterprise@tau.new';

const paymentPageNotOpenedMessage = 'Couldn’t open the payment page. Try again.';

/** Why a subscription answered without a payment page to open. */
const subscriptionNotOpenMessage = (action: WirePaymentAction): string => {
  switch (action.state) {
    case 'processing':
    case 'funds_received':
    case 'fulfilled': {
      return 'We’re confirming your payment. Your plan will update in a moment.';
    }
    case 'attention_required': {
      return 'We couldn’t start your subscription. Email help@tau.new and we’ll sort it out.';
    }
    default: {
      return 'Couldn’t open the payment page. Try again in a minute.';
    }
  }
};

function SubscribeButton({ label }: { readonly label: string }): React.JSX.Element {
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const binding = apiBaseUrl && environment && userId ? { apiBaseUrl, environment, ownerId: userId } : undefined;
  const { isResolved, paymentCollectionAvailable } = useEntitlements();
  const isUnavailable = binding !== undefined && (!isResolved || !paymentCollectionAvailable);
  const generation = `${apiBaseUrl ?? ''}|${environment ?? ''}|${userId ?? ''}`;
  /* oxlint-disable react/refs -- monotonic generation refs synchronously fence stale A→B→A render state */
  const scopeRef = useRef({ key: generation, value: 0 });
  if (scopeRef.current.key !== generation) {
    scopeRef.current = { key: generation, value: scopeRef.current.value + 1 };
  }
  const requestIdRef = useRef<string>(undefined);
  const [isStarting, setIsStarting] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const stateGenerationRef = useRef(scopeRef.current.value);
  const stateIsCurrent = stateGenerationRef.current === scopeRef.current.value;
  /* oxlint-enable react/refs */

  /** Follows an open payment page, or says why there is none to follow instead of leaving the button stuck. */
  const settle = (action: WirePaymentAction): void => {
    if (followPaymentRedirect(action)) {
      // In the desktop app the payment page opens in the browser, so the button stays usable to open it again.
      setIsPending(!isDesktopTarget());
      return;
    }
    // A retry asks again rather than replaying this answer.
    requestIdRef.current = undefined;
    setIsPending(false);
    setErrorMessage(subscriptionNotOpenMessage(action));
  };

  const start = async (): Promise<void> => {
    if (binding === undefined) {
      setErrorMessage(paymentPageNotOpenedMessage);
      return;
    }
    setIsStarting(true);
    stateGenerationRef.current = scopeRef.current.value;
    const startedGeneration = scopeRef.current.value;
    setErrorMessage(undefined);
    requestIdRef.current ??= createPaymentRequestId();
    try {
      const action = await createSubscriptionAction(binding, {
        requestId: requestIdRef.current,
        returnPath: `${globalThis.location.pathname}${globalThis.location.search}`,
      });
      if (scopeRef.current.value !== startedGeneration) {
        return;
      }
      settle(action);
    } catch (error) {
      if (scopeRef.current.value !== startedGeneration) {
        return;
      }
      if (error instanceof BillingPaymentConflict && error.action) {
        settle(error.action);
        return;
      }
      requestIdRef.current = undefined;
      setErrorMessage(
        error instanceof BillingCollectionUnavailable ? purchasesUnavailableMessage : paymentPageNotOpenedMessage,
      );
    } finally {
      if (scopeRef.current.value === startedGeneration) {
        setIsStarting(false);
      }
    }
  };

  return (
    <div className='flex flex-col gap-1'>
      <Button
        className='w-full'
        disabled={isUnavailable || (stateIsCurrent && (isStarting || isPending))}
        aria-busy={stateIsCurrent && isStarting}
        onClick={async () => {
          await start();
        }}
      >
        {stateIsCurrent && isStarting ? 'Opening payment page…' : isPending ? 'Finish on the payment page' : label}
      </Button>
      {isResolved && !paymentCollectionAvailable && binding !== undefined ? (
        <p className='text-xs text-muted-foreground' role='status'>
          {purchasesUnavailableMessage}
        </p>
      ) : stateIsCurrent && errorMessage ? (
        <BillingInlineError>{errorMessage}</BillingInlineError>
      ) : undefined}
    </div>
  );
}

function PlanCta({
  entry,
  isCurrent,
}: {
  readonly entry: PlanCatalogEntry;
  readonly isCurrent: boolean;
}): React.JSX.Element {
  if (isCurrent) {
    // A label, not a disabled button: a disabled button reads as broken.
    return (
      <p
        data-slot='current-plan'
        className='flex h-9 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground'
      >
        <Check aria-hidden='true' className='size-3.5' />
        Your current plan
      </p>
    );
  }
  switch (entry.cta.kind) {
    case 'signup': {
      return (
        <Button asChild variant='outline' className='w-full'>
          <Link to='/auth/sign-up'>{entry.cta.label}</Link>
        </Button>
      );
    }
    case 'subscribe': {
      return <SubscribeButton label={entry.cta.label} />;
    }
    case 'contact-sales': {
      return (
        <Button asChild variant='outline' className='w-full'>
          <a href={enterpriseMailto}>{entry.cta.label}</a>
        </Button>
      );
    }
  }
}

type PlanCardsProps = {
  /** Marks the viewer's tier as "Your current plan" instead of a CTA (settings grid). */
  readonly currentTier?: BillingTier;
  readonly className?: string;
  /** Keeps long feature lists bounded inside compact surfaces such as Settings. */
  readonly isFeatureListScrollable?: boolean;
};

/**
 * The app's plan grid: the shared `PlanCards` from `@taucad/ui-kit`, fed by
 * `tauPlanCatalog`, with the app's own actions under each card. The public
 * pricing page renders the same component and catalogue with its own links.
 */
export function PlanCards({
  currentTier,
  className,
  isFeatureListScrollable = false,
}: PlanCardsProps): React.JSX.Element {
  return (
    <SharedPlanCards
      entries={tauPlanCatalog}
      className={className}
      isFeatureListScrollable={isFeatureListScrollable}
      renderCta={(entry: PlanCatalogEntry) => <PlanCta entry={entry} isCurrent={currentTier === entry.id} />}
    />
  );
}
