// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '#components/settings/settings-dialog.js';

const renderSecuritySettings = vi.hoisted(() => vi.fn(() => <div>Mounted security settings</div>));
const scrollTo = HTMLElement.prototype.scrollTo;

vi.mock('#components/auth/settings/account/account-settings.js', () => ({
  AccountSettings: () => <div>Mounted account settings</div>,
}));
vi.mock('#components/auth/settings/security/security-settings.js', () => ({
  SecuritySettings: renderSecuritySettings,
}));
vi.mock('#components/auth/api-key/api-keys.js', () => ({ ApiKeys: () => <div>Mounted API keys</div> }));
vi.mock('#components/settings/billing-settings.js', () => ({ BillingSettings: () => <div>Mounted billing</div> }));
vi.mock('#components/settings/filesystem-settings.js', () => ({
  FileSystemSettings: () => <div>Mounted filesystem</div>,
}));
vi.mock('#components/settings/general-settings.js', () => ({
  GeneralSettings: () => <div>Mounted general settings</div>,
}));
vi.mock('#components/settings/experimental-settings.js', () => ({
  ExperimentalSettings: () => <div>Mounted experimental</div>,
}));
vi.mock('#components/settings/model-settings.js', () => ({ ModelSettings: () => <div>Mounted models</div> }));
vi.mock('#components/settings/agent-settings.js', () => ({ AgentSettings: () => <div>Mounted agents</div> }));
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

describe('SettingsDialog', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterAll(() => {
    HTMLElement.prototype.scrollTo = scrollTo;
  });

  it('should mount Security only after its tab is selected', async () => {
    render(
      <MemoryRouter initialEntries={['/home/project?settings=general']}>
        <SettingsDialog />
      </MemoryRouter>,
    );

    expect(screen.getByText('Mounted general settings')).toBeInTheDocument();
    expect(screen.queryByText('Mounted security settings')).not.toBeInTheDocument();
    expect(renderSecuritySettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: 'Security' }));

    expect(await screen.findByText('Mounted security settings')).toBeInTheDocument();
    expect(renderSecuritySettings).toHaveBeenCalledOnce();
  });
});
