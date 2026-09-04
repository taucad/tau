// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tauPlanCatalog } from '@taucad/billing';
import { PlanCards } from '#components/billing/plan-cards.js';

const upgradeMock = vi.hoisted(() => vi.fn());
vi.mock('#lib/auth-client.js', () => ({
  authClient: { subscription: { upgrade: upgradeMock } },
}));

const renderCards = (currentTier?: 'free' | 'pro' | 'enterprise'): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <PlanCards currentTier={currentTier} />
    </MemoryRouter>,
  );

describe('PlanCards', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should render every catalogue card with the POPULAR pill on Pro (S57)', () => {
    renderCards();

    for (const entry of tauPlanCatalog) {
      expect(screen.getByText(entry.name)).toBeInTheDocument();
    }
    expect(screen.getByText(/popular/i)).toBeInTheDocument();
    expect(screen.getByText('$20')).toBeInTheDocument();
  });

  it('should start the Pro checkout from the subscribe CTA', async () => {
    upgradeMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCards();

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    expect(upgradeMock).toHaveBeenCalledWith(expect.objectContaining({ plan: 'pro' }));
  });

  it('should route signup to /auth/sign-up and enterprise to the sales mailbox', () => {
    renderCards();

    expect(screen.getByRole('link', { name: /start creating free/i })).toHaveAttribute('href', '/auth/sign-up');
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', 'mailto:enterprise@tau.new');
  });

  it("pins the viewer's tier as a disabled Current-plan card (settings grid)", () => {
    renderCards('free');

    expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /start creating free/i })).not.toBeInTheDocument();
  });
});
