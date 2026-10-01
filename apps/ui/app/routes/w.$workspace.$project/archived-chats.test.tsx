// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import type { ChatRecord } from '@taucad/chat/schemas';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const fixture = vi.hoisted(() => ({
  chats: [] as ChatRecord[],
  loading: false,
  error: undefined as string | undefined,
  version: 0,
  listeners: new Set<() => void>(),
  retry: vi.fn(),
  restore: vi.fn<(id: string) => Promise<ChatRecord | undefined>>(),
  purge: vi.fn<(id: string) => Promise<void>>(),
  reads: vi.fn(),
}));
const notify = (): void => {
  fixture.version++;
  for (const listener of fixture.listeners) {
    listener();
  }
};
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_one' }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: (projectId: string, options: unknown) => {
    fixture.reads(projectId, options);
    useSyncExternalStore(
      (listener) => {
        fixture.listeners.add(listener);
        return () => {
          fixture.listeners.delete(listener);
        };
      },
      () => fixture.version,
    );
    return { chats: fixture.chats, isLoading: fixture.loading, error: fixture.error, retry: fixture.retry };
  },
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ restoreChat: fixture.restore, purgeChat: fixture.purge }),
}));
const { ArchivedChats } = await import('#routes/w.$workspace.$project/archived-chats.js');

const record = (id: number, extra: Partial<ChatRecord> = {}): ChatRecord => ({
  id: `chat_${id}`,
  resourceId: 'project_one',
  name: `Design ${id}`,
  createdAt: 1,
  updatedAt: 2,
  deletedAt: Date.UTC(2026, 8, 30, 9, id),
  ...extra,
});
function Route(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label='Current URL'>{location.search}</output>
      <button
        type='button'
        onClick={() => {
          const next = new URLSearchParams(location.search);
          next.set('workbench', 'parameters');
          void navigate({ search: next.toString() });
        }}
      >
        Change workbench
      </button>
      <button
        type='button'
        onClick={() => {
          void navigate(-1);
        }}
      >
        Browser back
      </button>
      <button
        type='button'
        onClick={() => {
          void navigate(1);
        }}
      >
        Browser forward
      </button>
      {new URLSearchParams(location.search).get('archivedChats') === '1' ? <ArchivedChats /> : <p>Original chat</p>}
    </>
  );
}
const open = (search = '?chat=original&archivedChats=1&workbench=share') =>
  render(
    <MemoryRouter initialEntries={['/?chat=original&workbench=share', `/${search}`]} initialIndex={1}>
      <TooltipProvider>
        <Route />
      </TooltipProvider>
    </MemoryRouter>,
  );
const currentURL = (): URLSearchParams =>
  new URLSearchParams(screen.getByRole('status', { name: 'Current URL' }).textContent);

describe('project archived chats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.chats = [
      record(1),
      record(2),
      record(3, { deletedAt: undefined }),
      record(4, { resourceId: 'other' }),
      record(5, { purgedAt: 6 }),
    ];
    fixture.loading = false;
    fixture.error = undefined;
    fixture.restore.mockImplementation(async (id: string) => {
      const chat = fixture.chats.find((chat) => chat.id === id);
      fixture.chats = fixture.chats.map((chat) => (chat.id === id ? { ...chat, deletedAt: undefined } : chat));
      notify();
      return chat ? { ...chat, deletedAt: undefined, messages: [] } : undefined;
    });
    fixture.purge.mockImplementation(async (id: string) => {
      fixture.chats = fixture.chats.filter((chat) => chat.id !== id);
      notify();
    });
  });

  it('loads the complete project archive, newest first, excluding active, foreign and purged records', () => {
    fixture.chats = [...Array.from({ length: 12 }, (_, index) => record(index + 10)), ...fixture.chats];
    open();
    expect(fixture.reads).toHaveBeenCalledWith('project_one', { includeDeleted: true });
    const rows = within(screen.getByRole('list', { name: 'Archived chat list' })).getAllByRole('listitem');
    expect(rows).toHaveLength(14);
    expect(within(rows[0]!).getByRole('heading', { name: 'Design 21' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Design 3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Design 4' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Design 5' })).not.toBeInTheDocument();
    expect(rows[0]?.querySelector('time')).toHaveAttribute('datetime', new Date(record(21).deletedAt!).toISOString());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('restores search from the URL, searches case-insensitively, clears it and preserves unrelated state', async () => {
    const user = userEvent.setup();
    open('?chat=original&archivedChats=1&workbench=share&q=DESIGN%202');
    const input = screen.getByRole('searchbox', { name: 'Search archived chats' });
    expect(input).toHaveValue('DESIGN 2');
    expect(screen.queryByRole('heading', { name: 'Design 1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveFocus();
    expect(currentURL().has('q')).toBe(false);
    expect(currentURL().get('workbench')).toBe('share');
    await user.type(input, 'absent');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('No archived chats match');
  });

  it('goes back to the original chat without dropping unrelated query state', async () => {
    const user = userEvent.setup();
    open('?chat=original&archivedChats=1&workbench=share&q=Design');
    await user.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(currentURL().get('chat')).toBe('original');
    expect(currentURL().get('workbench')).toBe('share');
    expect(currentURL().has('archivedChats')).toBe(false);
    expect(currentURL().has('q')).toBe(false);
    expect(screen.getByText('Original chat')).toBeInTheDocument();
  });

  it('handles browser Back/Forward and directly opens an archive query', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('heading', { name: 'Archived chats' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByText('Original chat')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browser forward' }));
    expect(screen.getByRole('heading', { name: 'Archived chats' })).toBeInTheDocument();
  });

  it('unarchives and immediately opens the restored chat with one merged URL update', async () => {
    const user = userEvent.setup();
    open('?chat=original&archivedChats=1&workbench=share&q=Design');
    await user.click(screen.getByRole('button', { name: 'Unarchive Design 2' }));
    await waitFor(() => {
      expect(currentURL().get('chat')).toBe('chat_2');
    });
    expect(fixture.restore).toHaveBeenCalledExactlyOnceWith('chat_2');
    expect(currentURL().has('archivedChats')).toBe(false);
    expect(currentURL().has('q')).toBe(false);
    expect(currentURL().get('workbench')).toBe('share');
  });

  it.each([undefined, new Error('Storage offline')])(
    'keeps the archive and original selection when restore fails: %s',
    async (failure) => {
      const user = userEvent.setup();
      fixture.restore.mockImplementation(async () => {
        if (failure instanceof Error) {
          throw failure;
        }
        return failure;
      });
      open();
      await user.click(screen.getByRole('button', { name: 'Unarchive Design 1' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(currentURL().get('chat')).toBe('original');
      expect(currentURL().get('archivedChats')).toBe('1');
    },
  );

  it('ignores repeated restore and does not navigate after leaving a pending operation', async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<ChatRecord>();
    fixture.restore.mockReturnValue(pending.promise);
    open();
    const action = screen.getByRole('button', { name: 'Unarchive Design 1' });
    await user.click(action);
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-busy', 'true');
    await user.click(action);
    expect(fixture.restore).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Back to chat' }));
    await act(async () => {
      pending.resolve(record(1, { deletedAt: undefined }));
    });
    expect(currentURL().get('chat')).toBe('original');
  });

  it('preserves query updates made while a restore is pending', async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<ChatRecord>();
    fixture.restore.mockReturnValue(pending.promise);
    open();
    await user.click(screen.getByRole('button', { name: 'Unarchive Design 1' }));
    await user.click(screen.getByRole('button', { name: 'Change workbench' }));
    await act(async () => {
      pending.resolve(record(1, { deletedAt: undefined }));
    });
    expect(currentURL().get('chat')).toBe('chat_1');
    expect(currentURL().get('workbench')).toBe('parameters');
    expect(currentURL().has('archivedChats')).toBe(false);
  });

  it('confirms single deletion, supports cancel/Escape, and removes only the selected record', async () => {
    const user = userEvent.setup();
    open();
    const deleteButton = screen.getByRole('button', { name: 'Delete Design 1' });
    await user.click(deleteButton);
    await user.keyboard('{Escape}');
    expect(fixture.purge).not.toHaveBeenCalled();
    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.purge).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(deleteButton).toHaveFocus();
    });
    await user.click(deleteButton);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Design 1' })).not.toBeInTheDocument();
    });
    expect(fixture.purge).toHaveBeenCalledExactlyOnceWith('chat_1');
    expect(screen.getByRole('heading', { name: 'Design 2', hidden: true })).toBeInTheDocument();
    expect(currentURL().get('archivedChats')).toBe('1');
  });

  it('deletes all archived chats in the project, including those outside search', async () => {
    const user = userEvent.setup();
    open('?chat=original&archivedChats=1&q=Design%201');
    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('all 2 archived chats in this project');
    await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));
    await waitFor(() => {
      expect(screen.getByText('No archived chats')).toBeInTheDocument();
    });
    expect(fixture.purge.mock.calls.map(([id]) => id).toSorted((left, right) => left.localeCompare(right))).toEqual([
      'chat_1',
      'chat_2',
    ]);
    expect(screen.getByRole('button', { name: 'Delete all' })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to chat' })).toHaveFocus();
    });
  });

  it('retains failures after partial bulk deletion and allows retry without claiming success', async () => {
    const user = userEvent.setup();
    fixture.purge.mockImplementation(async (id: string) => {
      if (id === 'chat_2') {
        throw new Error('Disk full');
      }
      fixture.chats = fixture.chats.filter((chat) => chat.id !== id);
      notify();
    });
    open();
    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete all' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete 1 archived chat');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Design 2', hidden: true })).toBeInTheDocument();
    fixture.purge.mockImplementation(async (id: string) => {
      fixture.chats = fixture.chats.filter((chat) => chat.id !== id);
      notify();
    });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete all' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('No archived chats')).toBeInTheDocument();
  });

  it('distinguishes loading, load failure with retry, and empty archive', async () => {
    const user = userEvent.setup();
    fixture.chats = [];
    fixture.loading = true;
    open();
    expect(screen.getByRole('status', { name: 'Loading archived chats' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No archived chats')).not.toBeInTheDocument();
    act(() => {
      fixture.loading = false;
      fixture.error = 'Offline';
      notify();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load archived chats');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fixture.retry).toHaveBeenCalledOnce();
    act(() => {
      fixture.error = undefined;
      notify();
    });
    expect(screen.getByText('No archived chats')).toBeInTheDocument();
  });
});
