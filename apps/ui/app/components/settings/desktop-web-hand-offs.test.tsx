// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsSectionsProvider } from '@taucad/settings-ui/components/settings/settings-item';
import { createSettingsCatalogue } from '@taucad/settings-ui/components/settings/settings-catalogue';

/*
 * Desktop sign-in DSI-5 (ruling D1=A): in Tau Desktop, Security, Account and account closure show rows that open the
 * website, and fetch nothing the desktop's sign-in would be refused.
 */
const fixture = vi.hoisted(() => ({
  listAccounts: vi.fn(() => ({ data: [], isPending: false })),
  listSessions: vi.fn(() => ({ data: [], isPending: false })),
  binding: vi.fn(() => ({ apiBaseUrl: 'https://api.tau.test' })),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({ authClient: {}, emailAndPassword: { enabled: true }, plugins: [], socialProviders: ['github'] }),
  useListAccounts: fixture.listAccounts,
  useListSessions: fixture.listSessions,
}));
vi.mock('#components/auth/settings/security/active-sessions.js', () => ({
  ActiveSessions: () => {
    fixture.listSessions();
    return <div>Session list</div>;
  },
}));
vi.mock('#components/auth/settings/security/github-permissions.js', () => ({
  GithubPermissions: () => {
    fixture.listAccounts();
    return <div>Gist permissions</div>;
  },
}));
vi.mock('#components/auth/settings/security/desktop-sign-ins.js', () => ({
  DesktopSignIns: () => <div>Desktops</div>,
}));
vi.mock('#components/auth/settings/account/user-profile.js', () => ({ UserProfile: () => <div>Profile form</div> }));
vi.mock('#components/auth/settings/account/email-deliverability-banner.js', () => ({
  EmailDeliverabilityBanner: () => undefined,
}));
vi.mock('@taucad/settings-ui/components/auth/settings/security/change-password', () => ({
  ChangePassword: () => <div>Password form</div>,
}));
vi.mock('@taucad/settings-ui/components/auth/settings/security/linked-accounts', () => ({
  LinkedAccounts: () => <div>Linked accounts</div>,
}));
vi.mock('@taucad/billing-ui/components/billing/use-billing-binding', () => ({ useBillingBinding: fixture.binding }));
vi.mock('@taucad/billing-ui/components/billing/account-closure-settings', () => ({
  AccountClosureSettings: () => <div>Closure flow</div>,
}));
vi.mock('@taucad/billing-ui/components/billing/topup-modal', () => ({ TopupModal: () => undefined }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

const { SecuritySettings } = await import('#components/auth/settings/security/security-settings.js');
const { AccountSettings } = await import('#components/auth/settings/account/account-settings.js');
const { CloudAccountClosure } = await import('#cloud/settings-billing.funded.js');

const renderIn = (node: React.ReactNode) =>
  render(<SettingsSectionsProvider sections={createSettingsCatalogue([])}>{node}</SettingsSectionsProvider>);

const linkOf = (title: string): HTMLAnchorElement => {
  const row = screen.getByRole('group', { name: title });
  return within(row).getByRole('link', { name: /open on the web/i });
};

describe('Tau Desktop settings hand-offs', () => {
  beforeEach(() => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should open password, sign-in methods, sessions, desktops and Gist access on the website, fetching none', () => {
    renderIn(<SecuritySettings />);

    for (const [title, setting] of [
      ['Password', 'password'],
      ['Sign-in methods', 'linked-accounts'],
      ['Active sessions', 'active-sessions'],
      ['Tau Desktop', 'desktop-sign-ins'],
      ['GitHub Gist access', 'github-permissions'],
    ] as const) {
      const link = linkOf(title);
      expect(link).toHaveAttribute('href', `http://localhost:3000/?settings=security&setting=${setting}`);
      expect(link).toHaveAttribute('target', '_blank');
    }
    expect(screen.queryByText('Password form')).not.toBeInTheDocument();
    expect(screen.queryByText('Session list')).not.toBeInTheDocument();
    expect(fixture.listAccounts).not.toHaveBeenCalled();
    expect(fixture.listSessions).not.toHaveBeenCalled();
  });

  it('should open the profile on the website', () => {
    renderIn(<AccountSettings />);

    expect(linkOf('Profile')).toHaveAttribute('href', 'http://localhost:3000/?settings=account&setting=profile');
    expect(screen.queryByText('Profile form')).not.toBeInTheDocument();
  });

  it('should open account closure on the website without reading the billing binding', () => {
    renderIn(<CloudAccountClosure />);

    expect(linkOf('Close account')).toHaveAttribute(
      'href',
      'http://localhost:3000/?settings=data-controls&setting=close-account',
    );
    expect(screen.queryByText('Closure flow')).not.toBeInTheDocument();
  });

  it('should keep the web build unchanged', () => {
    vi.unstubAllEnvs();
    renderIn(<SecuritySettings />);

    expect(screen.getByText('Password form')).toBeInTheDocument();
    expect(screen.getByText('Session list')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open on the web/i })).not.toBeInTheDocument();
  });
});
