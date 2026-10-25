import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bypassConfirmation, promptInjectionDisclosure } from '#components/chat/permission-mode-copy.js';
import { DefaultPermissionsSetting } from '#components/settings/default-permissions-setting.js';
import type { DesktopPermissions, PermissionMode } from '#filesystem/desktop-permissions.js';

const bridge = vi.hoisted(() => ({ current: undefined as DesktopPermissions | undefined }));
vi.mock('#filesystem/desktop-permissions.js', () => ({ desktopPermissions: () => bridge.current }));

let stored: PermissionMode = 'ask';
const setDefaultMode = vi.fn(async (mode: PermissionMode, _confirmed: boolean) => {
  stored = mode;
  return mode;
});

beforeEach(() => {
  stored = 'ask';
  setDefaultMode.mockClear();
  bridge.current = {
    chatMode: vi.fn(),
    setChatMode: vi.fn(),
    seedChat: vi.fn(),
    removeChat: vi.fn(),
    defaultMode: vi.fn(async () => stored),
    setDefaultMode,
  };
});

const renderSetting = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DefaultPermissionsSetting />
    </QueryClientProvider>,
  );

describe('DefaultPermissionsSetting (D19, RQ2a, RQ4)', () => {
  it('reads Ask out of the box and shows the prompt-injection disclosure', async () => {
    renderSetting();
    expect(await screen.findByRole('radio', { name: /^Ask/u })).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Default permissions' })).toHaveAccessibleDescription(
      promptInjectionDisclosure,
    );
  });

  it('draws the confirmation in place with Cancel focused, and Escape keeps Ask with focus on its radio', async () => {
    const user = userEvent.setup();
    renderSetting();
    await user.click(await screen.findByRole('radio', { name: /^Bypass/u }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const confirmation = screen.getByRole('group', { name: bypassConfirmation.title });
    expect(confirmation).toHaveAccessibleDescription(bypassConfirmation.body);
    expect(screen.getByRole('button', { name: bypassConfirmation.cancel })).toHaveFocus();
    expect(setDefaultMode).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: bypassConfirmation.title })).not.toBeInTheDocument();
    const ask = screen.getByRole('radio', { name: /^Ask/u });
    expect(ask).toBeChecked();
    await waitFor(() => {
      expect(ask).toHaveFocus();
    });
    expect(setDefaultMode).not.toHaveBeenCalled();
  });

  it('applies Bypass to new chats only through the confirmation, and announces it', async () => {
    const user = userEvent.setup();
    renderSetting();
    await user.click(await screen.findByRole('radio', { name: /^Bypass/u }));
    await user.click(screen.getByRole('button', { name: bypassConfirmation.confirm }));
    expect(setDefaultMode).toHaveBeenCalledWith('bypass', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Default permissions for new chats: Bypass');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^Bypass/u })).toBeChecked();
    });
  });

  it('lowers back to Ask without a confirmation', async () => {
    stored = 'bypass';
    const user = userEvent.setup();
    renderSetting();
    await user.click(await screen.findByRole('radio', { name: /^Ask/u }));
    expect(setDefaultMode).toHaveBeenCalledWith('ask', false);
    expect(screen.queryByRole('group', { name: bypassConfirmation.title })).not.toBeInTheDocument();
  });

  it('renders nothing without the desktop bridge', () => {
    bridge.current = undefined;
    const { container } = renderSetting();
    expect(container).toBeEmptyDOMElement();
  });
});
