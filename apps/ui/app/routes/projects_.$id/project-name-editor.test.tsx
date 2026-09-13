// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { MyUIMessage, Chat } from '@taucad/chat';
import { defaultProjectName } from '#constants/project-names.js';

const { mockGenerate, mockUpdateName, mockGetChat } = vi.hoisted(() => ({
  mockGenerate: vi.fn<(prompt: string) => Promise<string>>(),
  mockUpdateName: vi.fn(),
  mockGetChat: vi.fn<(chatId: string) => Promise<Chat | undefined>>(),
}));

let mockProjectName = defaultProjectName;
let mockIsLoading = false;
let mockActiveChatId: string | undefined = 'chat_first';

vi.mock('#chat-clients/use-project-name-client.js', () => ({
  useProjectNameClient: () => ({ generate: mockGenerate }),
}));

// Production code must no longer touch the AI SDK directly or the legacy
// `useChatConstants` symbol — guard with throwing mocks so any regression
// surfaces immediately.
vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    throw new Error('project-name-editor should no longer call useChat directly — switch to useProjectNameClient');
  },
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { send: vi.fn() },
    editorRef: { send: vi.fn() },
    updateName: mockUpdateName,
  }),
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ getChat: mockGetChat }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    selector: (state: {
      context: { project?: { name: string }; isLoading: boolean; focusedChatId?: string };
      matches: (s: string) => boolean;
    }) => unknown,
  ) =>
    selector({
      context: {
        project: { name: mockProjectName },
        isLoading: mockIsLoading,
        focusedChatId: mockActiveChatId,
      },
      matches: () => false,
    }),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: () => <div data-testid='loader'>loader</div>,
}));

vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => <div data-testid='name'>{value}</div>,
}));

const { ProjectNameEditor } = await import('#routes/projects_.$id/project-name-editor.js');

const makeFirstMessage = (text: string): MyUIMessage => ({
  id: 'msg_first',
  role: 'user',
  parts: [{ type: 'text', text }],
});

const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat_first',
  resourceId: 'project_test',
  name: 'New chat',
  messages: [makeFirstMessage('design a bracket')],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('ProjectNameEditor — name generation routes through useProjectNameClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectName = defaultProjectName;
    mockIsLoading = false;
    mockActiveChatId = 'chat_first';
  });

  it('calls projectNameClient.generate with the first user-message text and updates the project name with the result', async () => {
    mockGenerate.mockResolvedValueOnce('Bracket Design');
    mockGetChat.mockResolvedValueOnce(makeChat());

    render(<ProjectNameEditor />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith('design a bracket');
    });
    await waitFor(() => {
      expect(mockUpdateName).toHaveBeenCalledWith('Bracket Design');
    });
  });

  it('keeps the default project name and does not call updateName when the generator returns an empty string', async () => {
    mockGenerate.mockResolvedValueOnce('   ');
    mockGetChat.mockResolvedValueOnce(makeChat());

    render(<ProjectNameEditor />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
    expect(mockUpdateName).not.toHaveBeenCalled();
  });

  it('logs and recovers when the generator rejects so the editor stays renderable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerate.mockRejectedValueOnce(new Error('upstream timeout'));
    mockGetChat.mockResolvedValueOnce(makeChat());

    render(<ProjectNameEditor />);

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
    expect(consoleError).toHaveBeenCalled();
    expect(mockUpdateName).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not trigger generation when the project already has a custom name', async () => {
    mockProjectName = 'My Custom Name';
    mockGetChat.mockResolvedValueOnce(makeChat());

    render(<ProjectNameEditor />);

    await Promise.resolve();
    await Promise.resolve();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
