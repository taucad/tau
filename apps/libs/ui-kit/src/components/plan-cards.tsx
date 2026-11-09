import type { ReactNode } from 'react';
import { Check, Circle } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Card, CardContent, CardHeader } from '@taucad/ui/components/card';
import { cn } from '@taucad/ui/utils/cn';

/** One line of a plan card; `isComingSoon` swaps the tick for the coming-soon icon. */
export type PlanCardFeature = { readonly label: string; readonly isComingSoon: boolean };

/** What a plan card needs to draw itself. The billing plan catalogue satisfies it. */
export type PlanCardEntry = {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly priceLabel: string;
  readonly priceSubLabel: string | undefined;
  readonly features: readonly PlanCardFeature[];
  readonly popular: boolean;
};

/** What the coming-soon icon means, in the words the legend and assistive technology share. */
export const comingSoonMeaning = 'Coming soon';

/**
 * The mark for a feature that is still in development. It is deliberately not
 * a tick: a tick says "you get this", and this says "not yet". Decorative by
 * default; the text beside it carries the meaning.
 */
export function ComingSoonIcon({ className }: { readonly className?: string }): React.JSX.Element {
  return <Circle data-slot='coming-soon-icon' aria-hidden='true' className={cn('text-muted-foreground', className)} />;
}

/** The key for the coming-soon icon, shown once under any list that uses it. */
export function ComingSoonLegend({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <p data-slot='coming-soon-legend' className={cn('flex items-start gap-2 text-xs text-muted-foreground', className)}>
      <span className='flex h-lh shrink-0 items-center'>
        <ComingSoonIcon className='size-3.5' />
      </span>
      <span>{comingSoonMeaning}</span>
    </p>
  );
}

type PlanCardsProps<Entry extends PlanCardEntry> = {
  readonly entries: readonly Entry[];
  /** The action under each card: a link, a button or a "current plan" label. The host owns what it does. */
  readonly renderCta: (entry: Entry) => ReactNode;
  readonly className?: string;
  /** Keeps long feature lists bounded inside compact surfaces such as Settings. */
  readonly isFeatureListScrollable?: boolean;
  /** Name, price and action only, for a teaser that links to the full cards. */
  readonly isCompact?: boolean;
};

/**
 * The plan grid, the one component behind the public pricing page and the
 * Billing settings plan grid. Each card lists what the plan includes with a
 * tick and what is still in development with the coming-soon icon; a legend
 * under the cards explains the icon. Cards stack on narrow screens.
 */
export function PlanCards<Entry extends PlanCardEntry>({
  entries,
  renderCta,
  className,
  isFeatureListScrollable = false,
  isCompact = false,
}: PlanCardsProps<Entry>): React.JSX.Element {
  const hasComingSoon = !isCompact && entries.some((entry) => entry.features.some((feature) => feature.isComingSoon));
  return (
    <div data-slot='plan-cards' className={cn('flex flex-col gap-4', className)}>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {entries.map((entry) => (
          <Card
            key={entry.id}
            data-slot='plan-card'
            data-plan={entry.id}
            className={cn('relative flex flex-col', entry.popular && 'border-primary shadow-md')}
          >
            {entry.popular ? (
              <Badge className='absolute -top-2.5 left-1/2 -translate-x-1/2'>Most popular</Badge>
            ) : undefined}
            <CardHeader>
              <h3 className='text-lg leading-none font-semibold'>{entry.name}</h3>
              <p className='text-sm text-muted-foreground'>{entry.tagline}</p>
              <p className='pt-2'>
                <span className='text-3xl font-semibold'>{entry.priceLabel}</span>
                {entry.priceSubLabel ? (
                  <span className='text-sm text-muted-foreground'>{entry.priceSubLabel}</span>
                ) : undefined}
              </p>
            </CardHeader>
            <CardContent className='flex flex-1 flex-col gap-4'>
              {isCompact ? undefined : (
                <ul
                  aria-label={`${entry.name} features`}
                  className={cn(
                    'flex flex-1 flex-col gap-1.5 text-sm',
                    isFeatureListScrollable &&
                      'max-h-80 scroll-shadows-y overscroll-contain pr-2 focus-visible:focus-outline',
                  )}
                  // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable list must be keyboard reachable (WCAG 2.1.1)
                  tabIndex={isFeatureListScrollable ? 0 : undefined}
                >
                  {entry.features.map((feature) => (
                    <li
                      key={feature.label}
                      data-coming-soon={feature.isComingSoon ? '' : undefined}
                      className='flex items-start gap-2'
                    >
                      {/* The icon box is one line tall, so the icon sits on the centre line of the first line of text. */}
                      <span className='flex h-lh shrink-0 items-center'>
                        {feature.isComingSoon ? (
                          <ComingSoonIcon className='size-3.5' />
                        ) : (
                          <Check aria-hidden='true' className='size-3.5 text-primary' />
                        )}
                      </span>
                      <span className='text-muted-foreground'>
                        {feature.isComingSoon ? <span className='sr-only'>{comingSoonMeaning}: </span> : undefined}
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {renderCta(entry)}
            </CardContent>
          </Card>
        ))}
      </div>
      {hasComingSoon ? <ComingSoonLegend /> : undefined}
    </div>
  );
}
