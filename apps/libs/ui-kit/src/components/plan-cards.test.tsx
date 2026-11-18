// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanCards } from '#components/plan-cards.js';
import type { PlanCardEntry } from '#components/plan-cards.js';

const entries: PlanCardEntry[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For trying out Tau',
    priceLabel: '$0',
    priceSubLabel: '/month',
    features: [{ label: '1 GB cloud backup and sync', isComingSoon: false }],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'More credits for regular CAD work',
    priceLabel: '$20',
    priceSubLabel: '/month plus tax',
    features: [
      { label: '2,000 credits every month', isComingSoon: false },
      { label: 'Hosted design verification', isComingSoon: true },
    ],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Verification you can sign off on',
    priceLabel: 'Custom',
    priceSubLabel: undefined,
    features: [{ label: 'Team billing', isComingSoon: false }],
    popular: false,
  },
];

const renderCta = (entry: PlanCardEntry): React.JSX.Element => <a href={`/choose/${entry.id}`}>Choose {entry.name}</a>;

describe('PlanCards', () => {
  it('should render one card per entry with its name, price and host-supplied action', () => {
    render(<PlanCards entries={entries} renderCta={renderCta} />);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toStrictEqual([
      'Free',
      'Pro',
      'Enterprise',
    ]);
    expect(screen.getByText('/month plus tax')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose Pro' })).toHaveAttribute('href', '/choose/pro');
    expect(screen.getAllByText('Most popular')).toHaveLength(1);
  });

  it('should mark a coming-soon feature with the coming-soon icon, never a tick, and say so to screen readers', () => {
    render(<PlanCards entries={entries} renderCta={renderCta} />);

    const proFeatures = screen.getByRole('list', { name: 'Pro features' });
    const [includedItem, comingSoonItem] = within(proFeatures).getAllByRole('listitem');

    expect(includedItem).not.toHaveAttribute('data-coming-soon');
    expect(includedItem?.querySelector('[data-slot=coming-soon-icon]')).toBeNull();
    expect(comingSoonItem).toHaveAttribute('data-coming-soon');
    expect(comingSoonItem?.querySelector('[data-slot=coming-soon-icon]')).not.toBeNull();
    expect(comingSoonItem).toHaveTextContent('Coming soon: Hosted design verification');
  });

  it('should explain the icon once, in a legend under the cards that shows the same icon', () => {
    render(<PlanCards entries={entries} renderCta={renderCta} />);

    const legend = document.querySelector('[data-slot=coming-soon-legend]');

    expect(legend).toHaveTextContent('Coming soon');
    expect(legend?.querySelector('[data-slot=coming-soon-icon]')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot=coming-soon-legend]')).toHaveLength(1);
  });

  it('should leave the legend out when nothing shown is coming soon', () => {
    render(<PlanCards entries={entries.filter((entry) => entry.id !== 'pro')} renderCta={renderCta} />);

    expect(document.querySelector('[data-slot=coming-soon-legend]')).toBeNull();
  });

  it('should show name, price and action only when compact', () => {
    render(<PlanCards isCompact entries={entries} renderCta={renderCta} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot=coming-soon-legend]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Choose Free' })).toBeInTheDocument();
  });

  it('should make a bounded feature list keyboard reachable', () => {
    render(<PlanCards isFeatureListScrollable entries={entries} renderCta={renderCta} />);

    expect(screen.getByRole('list', { name: 'Free features' })).toHaveAttribute('tabindex', '0');
  });
});
