// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import { SettingsDialog } from '#components/settings/settings-dialog.js';

const renderSecuritySettings = vi.hoisted(() => vi.fn(() => <div>Mounted security settings</div>));
const deferredBillingState = vi.hoisted(() => ({ showTarget: false }));
const { scrollTo } = HTMLElement.prototype;
const { scrollIntoView } = HTMLElement.prototype;

vi.mock('#components/auth/settings/account/account-settings.js', () => ({
  AccountSettings: () => <div>Mounted account settings</div>,
}));
vi.mock('#components/auth/settings/security/security-settings.js', () => ({
  SecuritySettings: renderSecuritySettings,
}));
vi.mock('#components/auth/api-key/api-keys.js', () => ({ ApiKeys: () => <div>Mounted API keys</div> }));
vi.mock('#components/settings/billing-settings.js', () => ({
  BillingSettings: () => (
    <div>
      Mounted billing
      {deferredBillingState.showTarget ? (
        <section id='settings-credit-balance' aria-label='Credit balance' tabIndex={-1} />
      ) : null}
    </div>
  ),
}));
vi.mock('#components/settings/filesystem-settings.js', () => ({
  FileSystemSettings: () => <div>Mounted filesystem</div>,
}));
vi.mock('#components/settings/general-settings.js', () => ({
  GeneralSettings: () => (
    <div>
      Mounted general settings
      <section id='settings-theme' aria-label='Theme' tabIndex={-1}>
        Theme setting
      </section>
    </div>
  ),
}));
vi.mock('#components/settings/experimental-settings.js', () => ({
  ExperimentalSettings: () => <div>Mounted experimental</div>,
}));
vi.mock('#components/settings/model-settings.js', () => ({ ModelSettings: () => <div>Mounted models</div> }));
vi.mock('#components/settings/agent-settings.js', () => ({
  AgentSettings: () => (
    <div>
      Mounted agents
      <section id='settings-filesystem-context' aria-label='Filesystem' tabIndex={-1} />
    </div>
  ),
}));
vi.mock('#components/settings/remote-compute-settings.js', () => ({
  RemoteComputeSettings: () => <div>Mounted remote compute</div>,
}));
vi.mock('#components/settings/compute-reuse-settings.js', () => ({
  ComputeReuseSettings: () => <div>Mounted compute reuse</div>,
}));
vi.mock('#components/settings/settings-auth-gate.js', () => ({
  SettingsAuthGate: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));
vi.mock('#hooks/use-keyboard.js', () => ({ useKeybinding: vi.fn() }));

function SettingsTestSurface(): React.JSX.Element {
  return (
    <MemoryRouter initialEntries={['/home/project?settings=general']}>
      <SidebarProvider>
        <SettingsDialog />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe('SettingsDialog', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    renderSecuritySettings.mockClear();
    deferredBillingState.showTarget = false;
  });

  afterAll(() => {
    HTMLElement.prototype.scrollTo = scrollTo;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it('should mount Security only after its tab is selected', async () => {
    render(<SettingsTestSurface />);

    expect(screen.getByText('Mounted general settings')).toBeInTheDocument();
    expect(screen.queryByText('Mounted security settings')).not.toBeInTheDocument();
    expect(renderSecuritySettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Security' }));

    expect(await screen.findByText('Mounted security settings')).toBeInTheDocument();
    expect(renderSecuritySettings).toHaveBeenCalledOnce();
  });

  it('should close settings when Back to app is selected', async () => {
    render(<SettingsTestSurface />);

    await userEvent.click(screen.getByRole('button', { name: 'Back to app' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should find and focus a setting selected from search results', async () => {
    const user = userEvent.setup();
    render(<SettingsTestSurface />);

    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'theme');
    await user.click(screen.getByRole('button', { name: 'Theme' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Theme' })).toHaveFocus();
    });
    expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveValue('theme');
  });

  it('should open the first ranked setting when search is submitted', async () => {
    const user = userEvent.setup();
    render(<SettingsTestSurface />);

    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'filesystem{Enter}');

    expect(await screen.findByText('Mounted agents')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Filesystem' })).toHaveFocus();
    });
  });

  it('should focus a setting that mounts after its section opens', async () => {
    const user = userEvent.setup();
    const view = render(<SettingsTestSurface />);

    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'credit balance');
    await user.click(screen.getByRole('button', { name: 'Credit balance' }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Billing settings' })).toHaveFocus();
    });

    deferredBillingState.showTarget = true;
    view.rerender(<SettingsTestSurface />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Credit balance' })).toHaveFocus();
    });
  });

  it('should show an empty state and restore navigation when search is cleared', async () => {
    const user = userEvent.setup();
    render(<SettingsTestSurface />);
    const searchbox = screen.getByRole('searchbox', { name: 'Search settings' });

    await user.type(searchbox, 'no such setting');

    expect(screen.getByText('No settings found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(searchbox).toHaveValue('');
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByText('No settings found')).not.toBeInTheDocument();
  });
});
