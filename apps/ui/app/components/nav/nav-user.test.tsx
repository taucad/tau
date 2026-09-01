// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavUser } from '#components/nav/nav-user.js';
import { metaConfig } from '#constants/meta.constants.js';

const useNetworkConnectivityMock = vi.hoisted(() => vi.fn(() => true));
const useEntitlementsMock = vi.hoisted(() => vi.fn(() => ({ tier: 'free' })));

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

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

vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { readonly children?: React.ReactNode }) => <div role='menuitem'>{children}</div>,
  DropdownMenuLabel: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/utils/client-only.js', () => ({
  ClientOnly: ({ children }: { readonly children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
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
    useEntitlementsMock.mockReturnValue({ tier: 'free' });
  });

  it('shows upgrade and settings to free users', () => {
    render(<NavUser />);

    expect(screen.getByText('Upgrade to Pro')).toBeDefined();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toHaveAttribute('data-size', 'sm');
    expect(screen.getByTestId('user-button')).toHaveAttribute('data-side', 'top');
  });

  it('shows billing instead of upgrade to paid users', () => {
    useEntitlementsMock.mockReturnValue({ tier: 'pro' });

    render(<NavUser />);

    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('moves product help into its own menu with the current version', () => {
    render(<NavUser />);

    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Community Discord')).toBeInTheDocument();
    expect(screen.getByText(`Tau v${metaConfig.version}`)).toBeInTheDocument();
    expect(screen.queryByText('About Tau')).not.toBeInTheDocument();
  });

  it('shows connectivity in the footer row and user menu only while offline', () => {
    useNetworkConnectivityMock.mockReturnValue(false);

    render(<NavUser />);

    expect(screen.getByRole('status', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.getByText('Offline — online features unavailable')).toBeInTheDocument();
  });
});
