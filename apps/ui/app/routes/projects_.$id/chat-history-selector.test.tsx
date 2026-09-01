// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { Chat } from '@taucad/chat';

// ChatHistorySelector kicks off the name-generation flow whenever the active
// chat is still labelled "New chat" and already carries its first user
// message. The flow must route through `useProjectNameClient().generate(...)`
// — no `metadata.model = 'name-generator'` legacy stamping survives.

const { mockGenerate, mockUpdateChatName, mockCreateChat, mockDeleteChat, mockSetFocusedChatId } = vi.hoisted(() => ({
  mockGenerate: vi.fn<(prompt: string) => Promise<string>>(),
  mockUpdateChatName: vi.fn<(chatId: string, name: string) => Promise<void>>(),
  mockCreateChat: vi.fn(),
  mockDeleteChat: vi.fn(),
  mockSetFocusedChatId: vi.fn(),
}));

let mockChats: Chat[] = [];
let mockActiveChatId: string | undefined = 'chat_new';

vi.mock('#chat-clients/use-project-name-client.js', () => ({
  useProjectNameClient: () => ({ generate: mockGenerate }),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    throw new Error('chat-history-selector should no longer call useChat directly — switch to useProjectNameClient');
  },
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { send: vi.fn() },
    editorRef: { send: vi.fn() },
    projectId: 'project_test',
    setFocusedChatId: mockSetFocusedChatId,
  }),
}));

vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: mockChats,
    createChat: mockCreateChat,
    updateChatName: mockUpdateChatName,
    deleteChat: mockDeleteChat,
    isLoading: false,
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    selector: (state: { context: { focusedChatId?: string; isLoading: boolean } }) => unknown,
  ) => selector({ context: { focusedChatId: mockActiveChatId, isLoading: false } }),
}));

vi.mock('#hooks/use-chat-rpc-socket.js', () => ({
  useChatRpcStatus: () => ({ status: 'connected', error: undefined }),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+Shift+C' }),
}));

vi.mock('#components/ui/button.js', () => ({
  Button: ({ children }: { readonly children: React.ReactNode }) => <button type='button'>{children}</button>,
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/dialog.js', () => ({
  Dialog: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/input.js', () => ({
  Input: () => null,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanelContentHeaderActions: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelMenuButton: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelButtonGroup: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#routes/projects_.$id/chat-history-settings.js', () => ({
  ChatHistorySettings: () => null,
}));

const { ChatHistorySelector } = await import('#routes/projects_.$id/chat-history-selector.js');

const makeChat = (overrides: Partial<Chat>): Chat => ({
  id: 'chat_new',
  resourceId: 'project_test',
  name: 'New chat',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('ChatHistorySelector — name generation routes through useProjectNameClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveChatId = 'chat_new';
  });

  it('calls projectNameClient.generate with the first user-message text and updates the chat name with the result', async () => {
    mockGenerate.mockResolvedValueOnce('A Generated Name');
    mockUpdateChatName.mockResolvedValue(undefined);
    mockChats = [
      makeChat({
        messages: [
          {
            id: 'msg_user_1',
            role: 'user',
            parts: [{ type: 'text', text: 'design a bracket' }],
          },
        ],
      }),
    ];

    render(<ChatHistorySelector />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith('design a bracket');
    });
    await waitFor(() => {
      expect(mockUpdateChatName).toHaveBeenCalledWith('chat_new', 'A Generated Name');
    });
  });

  it('does not update the chat name when the generator returns an empty string', async () => {
    mockGenerate.mockResolvedValueOnce('   ');
    mockChats = [
      makeChat({
        messages: [
          {
            id: 'msg_user_1',
            role: 'user',
            parts: [{ type: 'text', text: 'design a bracket' }],
          },
        ],
      }),
    ];

    render(<ChatHistorySelector />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
    expect(mockUpdateChatName).not.toHaveBeenCalled();
  });

  it('swallows generator errors so a failed name generation does not crash the chat shell', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerate.mockRejectedValueOnce(new Error('upstream timeout'));
    mockChats = [
      makeChat({
        messages: [
          {
            id: 'msg_user_1',
            role: 'user',
            parts: [{ type: 'text', text: 'design a vase' }],
          },
        ],
      }),
    ];

    render(<ChatHistorySelector />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
    expect(consoleError).toHaveBeenCalled();
    expect(mockUpdateChatName).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not trigger name generation when the chat already has a custom name', async () => {
    mockChats = [
      makeChat({
        name: 'Customized Name',
        messages: [
          {
            id: 'msg_user_1',
            role: 'user',
            parts: [{ type: 'text', text: 'unused' }],
          },
        ],
      }),
    ];

    render(<ChatHistorySelector />);

    await Promise.resolve();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
