// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { NavUser } from '#components/nav/nav-user.js';
import * as Cookies from 'es-cookie';
import { metaConfig } from '#constants/meta.constants.js';

const clientEnvironment = globalThis.window.ENV;
const useNetworkConnectivityMock = vi.hoisted(() => vi.fn(() => true));
const useEntitlementsMock = vi.hoisted(() => vi.fn(() => ({ tier: 'free', isResolved: true })));

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

vi.mock('#components/auth/user/user-button.js', () => ({
  UserButton: ({
    links,
    size,
    side,
  }: {
    readonly links?: Array<{ readonly href: string; readonly label: ReactNode } | ReactElement>;
    readonly size?: string;
    readonly side?: string;
  }) => (
    <div data-testid='user-button' data-size={size} data-side={side}>
      {links?.map((link) =>
        isValidElement(link) ? (
          link
        ) : (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ),
      )}
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

vi.mock('@taucad/ui/components/client-only', () => ({
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
    useEntitlementsMock.mockReturnValue({ tier: 'free', isResolved: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.window.ENV = clientEnvironment;
  });

  it('shows product navigation, upgrade, and settings to free users', () => {
    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByText('Upgrade to Pro')).toBeDefined();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/files');
    expect(within(screen.getByTestId('user-button')).queryByRole('link', { name: 'Documentation' })).toBeNull();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toHaveAttribute('data-size', 'sm');
    expect(screen.getByTestId('user-button')).toHaveAttribute('data-side', 'top');
  });

  it('shows billing instead of upgrade to paid users', () => {
    useEntitlementsMock.mockReturnValue({ tier: 'pro', isResolved: true });

    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('never offers an upgrade before the plan is known', () => {
    useEntitlementsMock.mockReturnValue({ tier: 'free', isResolved: false });

    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
  });

  it('moves product help into its own menu with the current version', () => {
    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', 'https://docs.tau.new');
    // A local build runs no website, so the legal pages open on the public site rather than 404.
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://tau.new/legal/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', 'https://tau.new/legal/terms');
    expect(screen.getByRole('link', { name: 'Open-source notices' })).toHaveAttribute(
      'href',
      'https://tau.new/legal/open-source',
    );
    expect(screen.getByRole('menuitem', { name: 'Cookie preferences' })).toBeInTheDocument();
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Community Discord')).toBeInTheDocument();
    expect(screen.getByText(`Tau v${metaConfig.version}`)).toBeInTheDocument();
    expect(screen.queryByText('About Tau')).not.toBeInTheDocument();
  });

  it('should link the legal pages to the web deployment the desktop shell is bound to', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://taucad.dev',
    };

    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://taucad.dev/legal/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', 'https://taucad.dev/legal/terms');
    expect(screen.getByRole('link', { name: 'Open-source notices' })).toHaveAttribute(
      'href',
      'https://taucad.dev/legal/open-source',
    );
  });

  it('shows connectivity in the footer row and user menu only while offline', () => {
    useNetworkConnectivityMock.mockReturnValue(false);

    render(<NavUser />, { wrapper: MemoryRouter });

    expect(screen.getByRole('status', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.getByText('Offline — online features unavailable')).toBeInTheDocument();
  });
});

describe('Website preference navigation', () => {
  beforeEach(() => {
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new',
    };
  });
  afterEach(() => {
    globalThis.window.ENV = clientEnvironment;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Cookies.remove('tau-entry', { path: '/' });
  });
  it('should select the website and navigate to the bare URL', () => {
    const assign = vi.fn();
    // The test document is plain http, where a Secure cookie would not stick; only the origin matters here.
    vi.stubGlobal('location', { protocol: 'http:', origin: 'https://tau.new', assign });
    render(<NavUser />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('link', { name: 'Visit website' }));
    expect(Cookies.get('tau-entry')).toBe('website');
    expect(assign).toHaveBeenCalledWith('/');
  });
  it('should keep the explicit website link usable when cookies are blocked', () => {
    const assign = vi.fn();
    // The test document is plain http, where a Secure cookie would not stick; only the origin matters here.
    vi.stubGlobal('location', { protocol: 'http:', origin: 'https://tau.new', assign });
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => undefined);
    render(<NavUser />, { wrapper: MemoryRouter });
    const link = screen.getByRole('link', { name: 'Visit website' });
    expect(link).toHaveAttribute('href', '/?website=1');
    fireEvent.click(link);
    expect(assign).not.toHaveBeenCalled();
  });
  it('should open the public website from a build that runs none', () => {
    globalThis.window.ENV = clientEnvironment;
    render(<NavUser />, { wrapper: MemoryRouter });
    const link = screen.getByRole('link', { name: 'Visit website' });
    expect(link).toHaveAttribute('href', 'https://tau.new/');
    expect(link).toHaveAttribute('target', '_blank');
  });
  it('should omit the web-only switch in desktop', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    render(<NavUser />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('link', { name: 'Visit website' })).not.toBeInTheDocument();
  });
});
