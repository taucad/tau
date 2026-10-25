import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPermissionModeControl } from '#components/chat/chat-permission-mode-control.js';
import { bypassConfirmation } from '#components/chat/permission-mode-copy.js';
import type { DesktopPermissions, PermissionMode } from '#filesystem/desktop-permissions.js';

/* The cmdk list scrolls the active option into view; jsdom has no layout. */
Element.prototype.scrollIntoView = vi.fn();

type State = {
  bridge: DesktopPermissions | undefined;
  execution: Record<string, unknown>;
  chatId: string | undefined;
};
const state = vi.hoisted(() => {
  const initial: State = {
    bridge: undefined,
    execution: { kind: 'tau', model: 'model-1', hostId: 'desktop' },
    chatId: 'chat-1',
  };
  return initial;
});

vi.mock('#filesystem/desktop-permissions.js', () => ({ desktopPermissions: () => state.bridge }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ isDesktopTarget: true }));
vi.mock('#lib/agent-host-placement.js', () => ({
  agentPlacementOf: (execution: { hostId?: string }) => (execution.hostId === 'desktop' ? 'desktop' : 'cloud'),
  desktopWorkspaceRoot: async (projectId: string) => `/home/me/Tau/${projectId}`,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    execution: { execution: state.execution },
    session: state.chatId === undefined ? undefined : { activeChatId: state.chatId },
  }),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn() } }));

let stored: PermissionMode = 'ask';
const setChatMode = vi.fn(async (_chat: unknown, mode: PermissionMode, _confirmed: boolean) => {
  stored = mode;
  return mode;
});

beforeEach(() => {
  stored = 'ask';
  setChatMode.mockClear();
  state.execution = { kind: 'tau', model: 'model-1', hostId: 'desktop' };
  state.chatId = 'chat-1';
  state.bridge = {
    chatMode: vi.fn(async () => stored),
    setChatMode,
    seedChat: vi.fn(),
    removeChat: vi.fn(),
    defaultMode: vi.fn(),
    setDefaultMode: vi.fn(),
  };
});

const focusEditor = vi.fn();
const renderControl = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ChatPermissionModeControl focusEditor={focusEditor} />
      </TooltipProvider>
    </QueryClientProvider>,
  );

describe('ChatPermissionModeControl (D19, RQ2, A19)', () => {
  it('names the chat’s mode in text, read from the host by project folder and chat', async () => {
    renderControl();
    const pill = await screen.findByRole('button', { name: 'Permissions: Ask' });
    expect(pill).toHaveTextContent('Ask');
    expect(state.bridge!.chatMode).toHaveBeenCalledWith({ projectRoot: '/home/me/Tau/project-1', chatId: 'chat-1' });
  });

  it('confirms every switch to Bypass in a focus-trapped dialog, Cancel focused, and Cancel keeps Ask', async () => {
    const user = userEvent.setup();
    renderControl();
    const pill = await screen.findByRole('button', { name: 'Permissions: Ask' });
    await user.click(pill);
    await user.click(await screen.findByRole('option', { name: /Bypass/u }));
    const dialog = await screen.findByRole('alertdialog', { name: bypassConfirmation.title });
    expect(dialog).toHaveAccessibleDescription(bypassConfirmation.body);
    expect(screen.getByRole('button', { name: bypassConfirmation.cancel })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: bypassConfirmation.cancel }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Permissions: Ask' })).toHaveFocus();
    });
    expect(setChatMode).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
  });

  it('applies a confirmed Bypass to this chat, announces it and returns focus to the pill', async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(await screen.findByRole('button', { name: 'Permissions: Ask' }));
    await user.click(await screen.findByRole('option', { name: /Bypass/u }));
    await user.click(await screen.findByRole('button', { name: bypassConfirmation.confirm }));
    expect(setChatMode).toHaveBeenCalledWith(
      { projectRoot: '/home/me/Tau/project-1', chatId: 'chat-1' },
      'bypass',
      true,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Permissions for this chat: Bypass');
    const pill = await screen.findByRole('button', { name: 'Permissions: Bypass' });
    await waitFor(() => {
      expect(pill).toHaveFocus();
    });
  });

  it('lowers to Ask without a confirmation', async () => {
    stored = 'bypass';
    const user = userEvent.setup();
    renderControl();
    await user.click(await screen.findByRole('button', { name: 'Permissions: Bypass' }));
    await user.click(await screen.findByRole('option', { name: /Ask/u }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(setChatMode).toHaveBeenCalledWith(expect.anything(), 'ask', false);
  });

  it('shows nothing for an external agent, a cloud run, before the chat exists, or off desktop', async () => {
    const cases: Array<() => void> = [
      () => {
        state.execution = { kind: 'acp', agentId: 'codex', hostId: 'desktop' };
      },
      () => {
        state.execution = { kind: 'tau', model: 'model-1', hostId: 'cloud-1' };
      },
      () => {
        state.chatId = undefined;
      },
      () => {
        state.bridge = undefined;
      },
    ];
    for (const arrange of cases) {
      state.execution = { kind: 'tau', model: 'model-1', hostId: 'desktop' };
      state.chatId = 'chat-1';
      arrange();
      const { container, unmount } = renderControl();
      // oxlint-disable-next-line no-await-in-loop -- one case at a time.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
