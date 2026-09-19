import { useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { BillingTier, PlanCatalogEntry } from '@taucad/billing';
import { tauPlanCatalog } from '@taucad/billing';
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
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { cn } from '@taucad/ui/utils/cn';

const enterpriseMailto = 'mailto:enterprise@tau.new';

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

  const start = async (): Promise<void> => {
    if (binding === undefined) {
      setErrorMessage('Billing checkout is unavailable.');
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
      setIsPending(!followPaymentRedirect(action));
    } catch (error) {
      if (scopeRef.current.value !== startedGeneration) {
        return;
      }
      if (error instanceof BillingPaymentConflict && error.action) {
        setIsPending(!followPaymentRedirect(error.action));
        return;
      }
      requestIdRef.current = undefined;
      setErrorMessage(
        error instanceof BillingCollectionUnavailable
          ? purchasesUnavailableMessage
          : 'Could not start checkout. Try again.',
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
        <Sparkles className='size-4' />
        {stateIsCurrent && isStarting ? 'Starting checkout…' : isPending ? 'Checkout pending' : label}
      </Button>
      {isResolved && !paymentCollectionAvailable && binding !== undefined ? (
        <p className='text-xs text-muted-foreground' role='status'>
          {purchasesUnavailableMessage}
        </p>
      ) : stateIsCurrent && errorMessage ? (
        <p className='text-xs text-warning' role='alert'>
          {errorMessage}
        </p>
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
    return (
      <Button variant='outline' disabled className='w-full'>
        Current plan
      </Button>
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
  /** Marks the viewer's tier as "Current plan" instead of a CTA (settings grid). */
  readonly currentTier?: BillingTier;
  readonly className?: string;
  /** Keeps long feature lists bounded inside compact surfaces such as Settings. */
  readonly isFeatureListScrollable?: boolean;
};

/**
 * The three-tier plan grid (T6/T7/U1/U6): one `tauPlanCatalog` source feeds
 * both the index pricing section and the BillingSettings free-state grid.
 * Cards stack on mobile (U14).
 */
export function PlanCards({
  currentTier,
  className,
  isFeatureListScrollable = false,
}: PlanCardsProps): React.JSX.Element {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
      {tauPlanCatalog.map((entry) => (
        <Card key={entry.id} className={cn('relative flex flex-col', entry.popular && 'border-primary shadow-md')}>
          {entry.popular ? (
            <Badge className='absolute -top-2.5 left-1/2 -translate-x-1/2 uppercase'>Popular</Badge>
          ) : undefined}
          <CardHeader>
            <CardTitle className='text-lg'>{entry.name}</CardTitle>
            <p className='text-sm text-muted-foreground'>{entry.tagline}</p>
            <p className='pt-2'>
              <span className='text-3xl font-semibold'>{entry.priceLabel}</span>
              {entry.priceSubLabel ? (
                <span className='text-sm text-muted-foreground'>{entry.priceSubLabel}</span>
              ) : undefined}
            </p>
          </CardHeader>
          <CardContent className='flex flex-1 flex-col gap-4'>
            <ul
              aria-label={isFeatureListScrollable ? `${entry.name} features` : undefined}
              className={cn(
                'flex flex-1 flex-col gap-1.5 text-sm',
                isFeatureListScrollable &&
                  'max-h-80 scroll-shadows-y overscroll-contain pr-2 focus-visible:focus-outline',
              )}
              tabIndex={isFeatureListScrollable ? 0 : undefined}
            >
              {entry.features.map((feature) => (
                <li key={feature} className='flex items-start gap-2'>
                  <Check className='mt-0.5 size-3.5 shrink-0 text-primary' />
                  <span className='text-muted-foreground'>{feature}</span>
                </li>
              ))}
            </ul>
            <PlanCta entry={entry} isCurrent={currentTier === entry.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
