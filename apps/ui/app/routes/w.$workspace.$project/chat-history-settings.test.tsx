// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { mock } from 'vitest-mock-extended';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MemoryRouter, useLocation } from 'react-router';

type ChatState = {
  chat: { messages: unknown[] } | undefined;
  activeChatId: string;
  messages: CombinedChatState['messages'];
};
const chatState = vi.hoisted((): ChatState => ({ chat: { messages: [] }, activeChatId: 'chat_active', messages: [] }));
const downloadBlob = vi.fn();
const serializeTranscript = vi.fn(() => '# transcript');
const chats = [{ id: 'chat_active', name: 'Bracket design' }];

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ chat: chatState.chat, activeChatId: chatState.activeChatId }),
  useChatSelector: <Selection,>(selector: (state: CombinedChatState) => Selection): Selection =>
    selector(mock<CombinedChatState>({ messages: chatState.messages })),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'proj_one' }),
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ chats }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));
vi.mock('@taucad/utils/file', () => ({ downloadBlob }));
vi.mock('#utils/chat.utils.js', () => ({ serializeTranscript }));
vi.mock('#routes/w.$workspace.$project/chat-options-meta.js', () => ({
  ChatOptionsMeta: () => <div data-testid='chat-options-meta'>Activity · Runs on · Credits</div>,
}));

const { ChatHistorySettings } = await import('#routes/w.$workspace.$project/chat-history-settings.js');

function renderMenu(onRename = vi.fn()): { readonly onRename: ReturnType<typeof vi.fn> } {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <MemoryRouter initialEntries={['/?chat=chat_active&workbench=share']}>
      <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
  );
  render(
    <>
      <ChatHistorySettings onRename={onRename} />
      <Location />
    </>,
    { wrapper },
  );
  return { onRename };
}

function Location(): React.JSX.Element {
  return <output aria-label='Current URL'>{useLocation().search}</output>;
}

describe('ChatHistorySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatState.chat = { messages: [] };
    chatState.messages = [];
    chatState.activeChatId = 'chat_active';
  });

  it('should open a menu of Rename, Export transcript and the read-only meta block, in that order', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Rename', 'Export transcript', 'Archived chats']);
    const meta = screen.getByTestId('chat-options-meta');
    expect(screen.getByRole('menu')).toContainElement(meta);
    expect(screen.getByRole('menuitem', { name: 'Export transcript' }).compareDocumentPosition(meta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('opens the project archive while preserving the current chat and other query state', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Chat options' }));
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('[role=separator]')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Archived chats' }));
    expect(screen.getByRole('status', { name: 'Current URL' })).toHaveTextContent(
      'chat=chat_active&workbench=share&archivedChats=1',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should hand Rename to the header and keep Export disabled with no messages', async () => {
    const user = userEvent.setup();
    chatState.chat = { messages: [{ id: 'stale-sdk-message' }] };
    const { onRename } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));
    expect(screen.getByRole('menuitem', { name: 'Export transcript' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledOnce();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('should export a transcript named after the chat once it has messages', async () => {
    const user = userEvent.setup();
    chatState.messages = [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Authoritative history' }] }];
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export transcript' }));

    expect(serializeTranscript).toHaveBeenCalledExactlyOnceWith(chatState.messages, 'Bracket design');
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^bracket_design_.*\.md$/));
  });
});
