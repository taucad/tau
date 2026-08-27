// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavUser } from '#components/nav/nav-user.js';

const useNetworkConnectivityMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('#components/auth/user/user-button.js', () => ({
  UserButton: ({
    links,
    size,
    side,
  }: {
    readonly links?: React.ReactNode[];
    readonly size?: string;
    readonly side?: string;
  }) => (
    <div data-testid='user-button' data-size={size} data-side={side}>
      {links}
    </div>
  ),
}));

vi.mock('#hooks/use-network-connectivity.js', () => ({
  useNetworkConnectivity: useNetworkConnectivityMock,
}));

vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenuItem: ({ children }: { readonly children?: React.ReactNode }) => <div role='menuitem'>{children}</div>,
}));

vi.mock('#components/ui/utils/client-only.js', () => ({
  ClientOnly: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children?: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/icons/svg-icon.js', () => ({ SvgIcon: () => <span aria-hidden /> }));

vi.mock('#components/tier-badge.js', () => ({
  ProBadge: () => <span>Pro</span>,
}));

describe('NavUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNetworkConnectivityMock.mockReturnValue(true);
  });

  it('shows the complete footer menu above its full-width trigger', () => {
    render(<NavUser />);

    expect(screen.getByText('Upgrade to Pro')).toBeDefined();
    expect(screen.getByText('Billing')).toBeDefined();
    expect(screen.getByTestId('user-button')).not.toHaveAttribute('data-size', 'icon');
    expect(screen.getByTestId('user-button')).toHaveAttribute('data-side', 'top');
  });

  it('shows connectivity in the footer row and user menu only while offline', () => {
    useNetworkConnectivityMock.mockReturnValue(false);

    render(<NavUser />);

    expect(screen.getByRole('status', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.getByText('Offline — online features unavailable')).toBeInTheDocument();
  });
});
