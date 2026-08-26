// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MarketingLanding } from '#routes/_index/marketing-landing.js';

// Mock the interactive / data-fetching leaves so the presentational marketing
// sections render in jsdom without query, chat, or runtime context.
vi.mock('#routes/_index/marketing-composer.js', () => ({
  MarketingComposer: () => <div data-testid='marketing-composer' />,
}));

vi.mock('#components/marketing/github-star-button.js', () => ({
  GithubStarButton: () => <div data-testid='github-star-button' />,
}));

vi.mock('#routes/_index/continue-ribbon.js', () => ({
  ContinueRibbon: () => null,
}));

// The full footer renders the cookie-consent dialog, which reads root loader
// data via a data router not present in this focused unit test.
vi.mock('#components/layout/page-footer.js', () => ({
  PageFooter: () => <footer data-testid='page-footer' />,
}));

// LazySection renders its fallback only, so the runtime viewer and community
// grid (both heavy) never mount during the test.
vi.mock('#components/ui/lazy-section.js', () => ({
  LazySection: ({ fallback }: { readonly fallback?: React.ReactNode }): React.ReactNode => fallback,
}));

function renderLanding(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <MarketingLanding />
    </MemoryRouter>,
  );
  return container;
}

describe('MarketingLanding', () => {
  it('should render the verification-led hero headline and primary composer CTA', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'AI CAD you can trust.', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('marketing-composer')).toBeInTheDocument();
  });

  it('should surface the agent loop with the verify step', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Generated, then verified' })).toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();
  });

  it('should never brand verification as "GeoSpec" on the marketing page (OQ1)', () => {
    const container = renderLanding();

    expect(container.textContent).not.toMatch(/geospec/i);
  });

  it('should render the pricing section with all three plan cards (T7/U6)', () => {
    const container = renderLanding();

    expect(container.textContent).toContain('Simple, usage-based pricing');
    expect(container.textContent).toContain('Free Forever');
    expect(container.textContent).toContain('Pro Plan');
    expect(container.textContent).toContain('Enterprise');
  });
});
