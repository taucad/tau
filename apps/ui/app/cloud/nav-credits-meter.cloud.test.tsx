import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@taucad/ui/components/dropdown-menu';
import { NavCreditsMeter } from '#cloud/nav-billing.cloud.js';
import { NavCreditsMeter as SelfHostNavCreditsMeter } from '#cloud/nav-billing.self-host.js';

const useCredits = vi.hoisted(() => vi.fn());
const useEntitlements = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({ fetching: 0 }));
const openSettings = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useIsFetching: () => query.fetching,
}));
vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ open: openSettings }),
}));

const credits = (value: number): string => (BigInt(value) * 10_000n).toString();
const balanceOf = (overrides: Record<string, string>) => ({
  availability: { state: 'available', reason: null },
  balance: {
    promoGrantCreditAtoms: '0',
    planGrantCreditAtoms: '0',
    purchasedCreditAtoms: '0',
    debtCreditAtoms: '0',
    promoHeldCreditAtoms: '0',
    planHeldCreditAtoms: '0',
    purchasedHeldCreditAtoms: '0',
    ...overrides,
  },
});

/** The meter's Add credits action is a menu item, so it needs an open menu around it. */
const renderInMenu = (node: ReactNode): void => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>{node}</DropdownMenuContent>
    </DropdownMenu>,
  );
};

describe('NavCreditsMeter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.fetching = 0;
    useEntitlements.mockReturnValue({ tier: 'pro', isResolved: true });
  });

  it('should show monthly credits left without counting purchased credits', () => {
    useCredits.mockReturnValue(
      balanceOf({
        planGrantCreditAtoms: credits(1240),
        purchasedCreditAtoms: credits(5000),
      }),
    );
    render(<NavCreditsMeter />);
    expect(screen.getByText('1,240 left')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Monthly credits' });
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuetext', '1,240 of 2,000 monthly credits left');
  });

  it('should not offer Add credits while monthly credits are healthy', () => {
    useCredits.mockReturnValue(balanceOf({ planGrantCreditAtoms: credits(1240) }));
    renderInMenu(<NavCreditsMeter />);
    expect(screen.queryByRole('menuitem', { name: 'Add credits' })).not.toBeInTheDocument();
  });

  it('should open Billing on the credit balance from Add credits when monthly credits are low', async () => {
    useCredits.mockReturnValue(balanceOf({ planGrantCreditAtoms: credits(120) }));
    renderInMenu(<NavCreditsMeter />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add credits' }));
    expect(openSettings).toHaveBeenCalledWith('billing', 'credit-balance');
  });

  it('should offer Add credits when monthly credits are gone', () => {
    useCredits.mockReturnValue(balanceOf({ planGrantCreditAtoms: credits(40), debtCreditAtoms: credits(3) }));
    renderInMenu(<NavCreditsMeter />);
    expect(screen.getByText('0 left')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add credits' })).toBeInTheDocument();
  });

  it('should render nothing for a free account with only purchased credits', () => {
    useEntitlements.mockReturnValue({ tier: 'free', isResolved: true });
    useCredits.mockReturnValue(balanceOf({ purchasedCreditAtoms: credits(500) }));
    const { container } = render(<NavCreditsMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should say the balance is unavailable for a paid account when the read failed', () => {
    useCredits.mockReturnValue(undefined);
    render(<NavCreditsMeter />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should hold a busy bar while the first balance read is in flight', () => {
    useCredits.mockReturnValue(undefined);
    query.fetching = 1;
    render(<NavCreditsMeter />);
    expect(screen.getByRole('progressbar', { name: 'Monthly credits' })).toHaveAttribute('aria-busy', 'true');
  });

  it('should render nothing until the plan is known', () => {
    useEntitlements.mockReturnValue({ tier: 'free', isResolved: false });
    useCredits.mockReturnValue(balanceOf({ planGrantCreditAtoms: credits(10) }));
    const { container } = render(<NavCreditsMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should emit nothing in the self-hosted build', () => {
    const { container } = render(<SelfHostNavCreditsMeter />);
    expect(container).toBeEmptyDOMElement();
  });
});
