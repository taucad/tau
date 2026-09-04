import { Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { BillingTier, PlanCatalogEntry } from '@taucad/billing';
import { tauPlanCatalog } from '@taucad/billing';
import { authClient } from '#lib/auth-client.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { cn } from '@taucad/ui/utils/cn';

const enterpriseMailto = 'mailto:enterprise@tau.new';

const startProCheckout = async (): Promise<void> => {
  await authClient.subscription.upgrade({
    plan: 'pro',
    successUrl: globalThis.location.href,
    cancelUrl: globalThis.location.href,
  });
};

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
      return (
        <Button className='w-full' onClick={() => void startProCheckout()}>
          <Sparkles className='size-4' />
          {entry.cta.label}
        </Button>
      );
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
};

/**
 * The three-tier plan grid (T6/T7/U1/U6): one `tauPlanCatalog` source feeds
 * both the index pricing section and the BillingSettings free-state grid.
 * Cards stack on mobile (U14).
 */
export function PlanCards({ currentTier, className }: PlanCardsProps): React.JSX.Element {
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
            <ul className='flex flex-1 flex-col gap-1.5 text-sm'>
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
