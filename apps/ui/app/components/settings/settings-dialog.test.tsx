// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@taucad/ui/components/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { SettingsDialog, SettingsSurface } from '#components/settings/settings-dialog.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

const loadGeneralSettings = vi.hoisted(() => vi.fn());
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
        <section id='settings-credit-balance' aria-label='Purchased credits' tabIndex={-1} />
      ) : null}
    </div>
  ),
}));
vi.mock('#components/settings/filesystem-settings.js', () => ({
  FileSystemSettings: () => <div>Mounted filesystem</div>,
}));
vi.mock('#components/settings/github-repository-settings.js', () => ({
  GithubRepositorySettings: () => <div>Mounted repositories</div>,
}));
vi.mock('#components/browser/browser-settings.js', () => ({
  BrowserSettingsPanel: () => <div>Mounted browser settings</div>,
}));
vi.mock('#components/settings/machines-settings.js', () => ({
  MachinesSettings: () => <div>Mounted machines</div>,
}));
vi.mock('#components/settings/general-settings.js', () => {
  loadGeneralSettings();
  return {
    GeneralSettings: () => (
      <div>
        Mounted general settings
        <section id='settings-theme' aria-label='Theme' tabIndex={-1}>
          Theme setting
        </section>
      </div>
    ),
  };
});
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
vi.mock('@taucad/ui/components/keyboard', () => ({ useKeybinding: vi.fn() }));

function SettingsOpener(): React.JSX.Element {
  const { open } = useSettingsDialog();
  return (
    <button
      type='button'
      onClick={() => {
        open();
      }}
    >
      Open settings
    </button>
  );
}

/** Opens settings the way the user menu does: from an item that unmounts with its menu. */
function SettingsMenu(): React.JSX.Element {
  const { open } = useSettingsDialog();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            open('general');
          }}
        >
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsTestSurface({ url = '/home/project?settings=general' }: { readonly url?: string }): React.JSX.Element {
  return (
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <SettingsOpener />
        <SettingsMenu />
        <SettingsDialog />
      </SidebarProvider>
    </MemoryRouter>
  );
}

/** Report a viewport below the 768px breakpoint, as a phone does. */
function emulatePhone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
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

  it('should not load settings panels while the dialog is closed', () => {
    render(<SettingsTestSurface url='/home/project' />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(loadGeneralSettings).not.toHaveBeenCalled();
  });

  it('should mount Security only after its tab is selected', async () => {
    render(<SettingsTestSurface />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(await screen.findByText('Mounted general settings')).toBeInTheDocument();
    expect(screen.queryByText('Mounted security settings')).not.toBeInTheDocument();
    expect(renderSecuritySettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Security' }));

    expect(await screen.findByText('Mounted security settings')).toBeInTheDocument();
    expect(renderSecuritySettings).toHaveBeenCalledOnce();
  });

  it('should close settings when Close settings is selected', async () => {
    render(<SettingsTestSurface />);

    await userEvent.click(screen.getByRole('button', { name: 'Close settings' }));

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
    await user.click(screen.getByRole('button', { name: 'Purchased credits' }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Billing settings' })).toHaveFocus();
    });

    deferredBillingState.showTarget = true;
    view.rerender(<SettingsTestSurface />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Purchased credits' })).toHaveFocus();
    });
  });

  it('should reveal the setting a deep link names once its section has loaded', async () => {
    const url = '/home/project?settings=billing&setting=credit-balance';
    const view = render(<SettingsTestSurface url={url} />);

    expect(await screen.findByText('Mounted billing')).toBeInTheDocument();
    deferredBillingState.showTarget = true;
    view.rerender(<SettingsTestSurface url={url} />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Purchased credits' })).toHaveFocus();
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

  it('should return focus to the opener when settings close', async () => {
    const user = userEvent.setup();
    render(<SettingsTestSurface url='/home/project' />);
    const opener = screen.getByRole('button', { name: 'Open settings' });

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('should return focus to the menu trigger when settings opened from a menu item close', async () => {
    const user = userEvent.setup();
    render(<SettingsTestSurface url='/home/project' />);
    const trigger = screen.getByRole('button', { name: 'Account' });

    trigger.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Settings' }));

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('should show the desktop navigation and section together without a back control', () => {
    render(<SettingsTestSurface />);

    expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'General settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Settings' })).not.toBeInTheDocument();
  });

  describe('on a phone', () => {
    beforeEach(() => {
      emulatePhone();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should render the embedded section list outside a dialog', () => {
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <SidebarProvider>
            <SettingsSurface isEmbedded activeSection='general' openSection={vi.fn()} close={vi.fn()} />
          </SidebarProvider>
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close settings' })).toBeInTheDocument();
    });

    it('should open on the section list and step into a section and back to its row', async () => {
      const user = userEvent.setup();
      render(<SettingsTestSurface url='/home/project' />);
      const opener = screen.getByRole('button', { name: 'Open settings' });

      await user.click(opener);

      const navigation = screen.getByRole('navigation', { name: 'Settings navigation' });
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveFocus();
      });
      expect(screen.queryByRole('region', { name: 'General settings' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back to Settings' })).not.toBeInTheDocument();
      for (const group of ['Personal', 'Workspace', 'Advanced']) {
        expect(screen.getByText(group)).toBeInTheDocument();
      }

      await user.click(screen.getByRole('button', { name: 'Security' }));

      expect(await screen.findByText('Mounted security settings')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Security' })).toBeInTheDocument();
      expect(navigation).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back to Settings' }));

      expect(screen.queryByText('Mounted security settings')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Security' })).toHaveFocus();
      });

      await user.click(screen.getByRole('button', { name: 'Close settings' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(opener).toHaveFocus();
      });
    });

    it('should return from a section to the list with Escape and close from the list', async () => {
      const user = userEvent.setup();
      render(<SettingsTestSurface url='/home/project' />);
      const opener = screen.getByRole('button', { name: 'Open settings' });
      await user.click(opener);

      await user.click(screen.getByRole('button', { name: 'Agents' }));
      expect(await screen.findByText('Mounted agents')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
      expect(screen.queryByText('Mounted agents')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Agents' })).toHaveFocus();
      });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(opener).toHaveFocus();
      });
    });

    it('should find a setting from the list search, open it, and return to the result', async () => {
      const user = userEvent.setup();
      render(<SettingsTestSurface />);
      const searchbox = screen.getByRole('searchbox', { name: 'Search settings' });

      await user.type(searchbox, 'theme');
      await user.click(screen.getByRole('button', { name: 'Theme' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: 'Theme' })).toHaveFocus();
      });
      expect(screen.getByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
      expect(screen.queryByRole('searchbox', { name: 'Search settings' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back to Settings' }));

      expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveValue('theme');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Theme' })).toHaveFocus();
      });
    });

    it('should land a link to a section on its detail with a way back to the list', async () => {
      const user = userEvent.setup();
      render(<SettingsTestSurface url='/home/project?settings=agents&setting=filesystem-context' />);

      expect(screen.getByRole('heading', { level: 2, name: 'Agents' })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('region', { name: 'Filesystem' })).toHaveFocus();
      });

      await user.click(screen.getByRole('button', { name: 'Back to Settings' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Agents' })).toHaveFocus();
      });
    });

    it('should show the detail when the dialog is opened to a section', async () => {
      render(<SettingsTestSurface url='/home/project?settings=models' />);

      expect(await screen.findByText('Mounted models')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Models' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back to Settings' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Settings navigation' })).not.toBeInTheDocument();
    });
  });

  it('should render embedded outside a dialog and keep search-clearing Escape from the host', async () => {
    const user = userEvent.setup();
    const onHostKeyDown = vi.fn();
    render(
      <MemoryRouter initialEntries={['/home/project']}>
        <SidebarProvider>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the embedding host's key handling. */}
          <div
            onKeyDown={(event) => {
              onHostKeyDown(event.key);
            }}
          >
            <SettingsSurface isEmbedded activeSection='general' openSection={vi.fn()} close={vi.fn()} />
          </div>
        </SidebarProvider>
      </MemoryRouter>,
    );
    const searchbox = screen.getByRole('searchbox', { name: 'Search settings' });

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    await user.type(searchbox, 'theme');
    onHostKeyDown.mockClear();
    await user.keyboard('{Escape}');

    expect(searchbox).toHaveValue('');
    expect(onHostKeyDown).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(onHostKeyDown).toHaveBeenCalledWith('Escape');
  });
});
