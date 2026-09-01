import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const editorRef = { kind: 'editor' };
const projectRef = { kind: 'project' };
const createChat = vi.fn();
const navigate = vi.fn();
let keybindingHandler: (() => Promise<void>) | undefined;
let connectionStatus = 'connected';

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, projectRef, projectId: 'proj_one' }),
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: [
      {
        id: 'chat_active',
        resourceId: 'proj_one',
        name: 'Bracket design',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    createChat,
    applyGeneratedChatName: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { readonly kind: string }, selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: actor.kind === 'editor' ? { focusedChatId: 'chat_active' } : { isLoading: false } }),
}));
vi.mock('#routes/w.$workspace.$project/use-active-chat-naming.js', () => ({
  useActiveChatNaming: () => false,
}));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'home', projectSlug: 'bracket' } }),
}));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: (_keys: unknown, handler: () => Promise<void>) => {
    keybindingHandler = handler;
    return { formattedKeyCombination: 'Ctrl+Shift+C' };
  },
}));
vi.mock('#hooks/use-chat-rpc-socket.js', () => ({
  useChatRpcStatus: () => ({ status: connectionStatus, error: connectionStatus === 'error' ? 'Offline' : undefined }),
}));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('#routes/w.$workspace.$project/chat-history-settings.js', () => ({
  ChatHistorySettings: () => <button type='button'>Chat settings</button>,
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanelContentHeaderActions: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  FloatingPanelButtonGroup: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));

const { ChatTitleBar } = await import('#routes/w.$workspace.$project/chat-title-bar.js');

describe('ChatTitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionStatus = 'connected';
    createChat.mockResolvedValue({ id: 'chat_new' });
    navigate.mockResolvedValue(undefined);
  });

  it('shows current-session controls without recreating chat navigation', () => {
    render(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />);

    expect(screen.getByText('Bracket design')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument();
    expect(screen.queryByText(/search chats/i)).not.toBeInTheDocument();
  });

  it('keeps Ctrl-Shift-C as a direct create-then-navigate action', async () => {
    const onNewChat = vi.fn();
    render(<ChatTitleBar onNewChat={onNewChat} />);

    await keybindingHandler?.();
    expect(createChat).toHaveBeenCalledWith({ name: 'New chat', messages: [] });
    expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_new');
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('exposes connection errors to keyboard and assistive technology', () => {
    connectionStatus = 'error';
    render(<ChatTitleBar />);

    expect(screen.getByRole('button', { name: 'Chat connection error' })).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
