// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

type ChatState = { chat: { messages: unknown[] } | undefined; activeChatId: string };
const chatState = vi.hoisted((): ChatState => ({ chat: { messages: [] }, activeChatId: 'chat_active' }));
const downloadBlob = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ chat: chatState.chat, activeChatId: chatState.activeChatId }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'proj_one' }),
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ chats: [{ id: 'chat_active', name: 'Bracket design' }] }),
}));
vi.mock('@taucad/utils/file', () => ({ downloadBlob }));
vi.mock('#utils/chat.utils.js', () => ({ serializeTranscript: () => '# transcript' }));
vi.mock('#routes/w.$workspace.$project/chat-options-meta.js', () => ({
  ChatOptionsMeta: () => <div data-testid='chat-options-meta'>Activity · Runs on · Credits</div>,
}));

const { ChatHistorySettings } = await import('#routes/w.$workspace.$project/chat-history-settings.js');

function renderMenu(onRename = vi.fn()): { readonly onRename: ReturnType<typeof vi.fn> } {
  const wrapper = ({ children }: { readonly children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
  render(<ChatHistorySettings onRename={onRename} />, { wrapper });
  return { onRename };
}

describe('ChatHistorySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatState.chat = { messages: [] };
    chatState.activeChatId = 'chat_active';
  });

  it('should open a menu of Rename, Export transcript and the read-only meta block, in that order', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Rename', 'Export transcript']);
    const meta = screen.getByTestId('chat-options-meta');
    expect(screen.getByRole('menu')).toContainElement(meta);
    expect(screen.getByRole('menuitem', { name: 'Export transcript' }).compareDocumentPosition(meta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('should hand Rename to the header and keep Export disabled with no messages', async () => {
    const user = userEvent.setup();
    const { onRename } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));
    expect(screen.getByRole('menuitem', { name: 'Export transcript' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledOnce();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('should export a transcript named after the chat once it has messages', async () => {
    const user = userEvent.setup();
    chatState.chat = { messages: [{ id: 'm1' }] };
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Chat options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export transcript' }));

    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^bracket_design_.*\.md$/));
  });
});
