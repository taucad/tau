import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatRecord } from '@taucad/chat/schemas';
import { projectToManifest } from '@taucad/types';
import type { useChats } from '#hooks/use-chats.js';
import type { useChatRecords } from '#hooks/use-chat-records.js';
import type { ProjectListItem } from '#types/project-library.types.js';
import type * as SidebarStatusModule from '#hooks/use-sidebar-status.js';

const mockUseChats = vi.fn();
const mockUseChatRecords = vi.fn();
const mockWarmMonaco = vi.hoisted(() => vi.fn());
vi.mock('#lib/monaco-warmup.js', () => ({ warmMonaco: mockWarmMonaco }));
const { mockObserve, mockRelease, mockStore } = vi.hoisted(() => {
  const release = vi.fn<(chatId: string) => void>();
  const observe = vi.fn((chatId: string, _projectId: string) => () => {
    release(chatId);
  });
  return { mockObserve: observe, mockRelease: release, mockStore: { observe } };
});
const mockUseChatSessionStore = vi.fn(() => mockStore);
const mockNavigate = vi.fn();
const mockLinkState = vi.fn();
let search = '?chat=chat_12';
let pendingLocation: { readonly pathname: string; readonly search: string } | undefined;

vi.mock('#hooks/use-chats.js', () => ({
  useChats: (...args: Parameters<typeof useChats>) => mockUseChats(...args) as ReturnType<typeof useChats>,
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => mockUseChatSessionStore(),
}));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: (...args: Parameters<typeof useChatRecords>) =>
    mockUseChatRecords(...args) as ReturnType<typeof useChatRecords>,
}));
vi.mock('react-router', () => ({
  Link: ({
    children,
    to,
    state,
    ...properties
  }: {
    readonly children: ReactNode;
    readonly to: string;
    readonly state?: unknown;
  }) => (
    <a
      href={to}
      {...properties}
      rel='noreferrer'
      onClick={(event) => {
        event.preventDefault();
        mockLinkState(state);
      }}
    >
      {children}
    </a>
  ),
  useLocation: () => ({ search }),
  useNavigate: () => mockNavigate,
  useNavigation: () => ({ location: pendingLocation, state: pendingLocation ? 'loading' : 'idle' }),
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarMenuButton: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
  SidebarMenuSub: ({ children, ...properties }: { readonly children: ReactNode }) => (
    <ul {...properties}>{children}</ul>
  ),
  SidebarMenuSubItem: ({ children, ...properties }: { readonly children: ReactNode }) => (
    <li {...properties}>{children}</li>
  ),
  SidebarMenuSubButton: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <span data-testid='tooltip'>{children}</span>,
}));
vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    ...properties
  }: {
    readonly children: ReactNode;
    readonly onSelect?: () => void;
    readonly 'aria-label'?: string;
  }) => (
    <button type='button' onClick={onSelect} {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value, className }: { readonly value: string; readonly className?: string }) => (
    <div data-testid='inline-editor' className={className}>
      <input value={value} readOnly />
    </div>
  ),
}));
vi.mock('@taucad/ui/components/skeleton', () => ({ Skeleton: () => <span data-testid='skeleton' /> }));

/* The chat machines are pinned in `use-sidebar-status.test.tsx`; this suite is
 * about what the row does with what they say. */
const mockChatStatus = vi.fn();
const mockCloseChat = vi.fn();
vi.mock('#hooks/use-sidebar-status.js', async (importOriginal) => {
  const original = await importOriginal<typeof SidebarStatusModule>();
  return {
    ...original,
    useChatSidebarStatus: (projectId: string, chatId: string) => mockChatStatus(projectId, chatId) as unknown,
    useSidebarCommands: () => ({ closeChat: mockCloseChat, closeProject: vi.fn(), openProject: vi.fn() }),
  };
});

const status = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  state: 'idle',
  unread: false,
  toolName: undefined,
  pendingApprovalCount: 0,
  failureReason: undefined,
  branch: undefined,
  dirty: false,
  ...over,
});

const chat = (index: number, updatedAt = index): ChatRecord => ({
  id: `chat_${index}`,
  resourceId: 'proj_one',
  name: `Chat ${index}`,
  createdAt: index,
  updatedAt,
});

const project: ProjectListItem = {
  ...projectToManifest({
    id: 'proj_one',
    name: 'Project one',
    description: 'Project one',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/project-one' },
  slugs: { workspaceSlug: 'home', projectSlug: 'project one' },
};

const defaultChatsResult = {
  chats: Array.from({ length: 12 }, (_, index) => chat(index + 1)),
  isLoading: false,
  error: undefined,
  updateChatName: vi.fn(),
  deleteChat: vi.fn(),
  restoreChat: vi.fn(),
};

const { ProjectChatList, sortProjectChats } = await import('#components/nav/project-chat-list.js');

describe('ProjectChatList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatSessionStore.mockReturnValue(mockStore);
    search = '?chat=chat_12';
    pendingLocation = undefined;
    mockUseChats.mockReturnValue(defaultChatsResult);
    mockUseChatRecords.mockReturnValue(defaultChatsResult);
    mockNavigate.mockResolvedValue(undefined);
    mockChatStatus.mockReturnValue(undefined);
  });

  it('sorts by user activity, ignoring newer passive row updates, then breaks ties deterministically', () => {
    const chats = [
      { ...chat(3, 999), createdAt: 1, recencyAt: 10 },
      { ...chat(2, 10), createdAt: 1, recencyAt: 20 },
      { ...chat(1, 11), createdAt: 1, recencyAt: 20 },
    ];
    expect(sortProjectChats(chats).map((item) => item.id)).toEqual(['chat_1', 'chat_2', 'chat_3']);
  });

  it('reveals chats five at a time and removes the terminal Show more chats action', () => {
    render(<ProjectChatList project={project} isProjectActive />);

    expect(screen.getAllByRole('link')).toHaveLength(5);
    const showMore = screen.getByRole('button', { name: 'Show more chats' });
    expect(showMore).not.toHaveClass('font-medium');
    fireEvent.click(showMore);
    expect(screen.getAllByRole('link')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show more chats' }));
    expect(screen.getAllByRole('link')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Show more chats' })).not.toBeInTheDocument();
  });

  it('observes all listed chats while collapsed without rendering chat rows', () => {
    render(<ProjectChatList project={project} isProjectActive={false} isExpanded={false} />);
    expect(mockObserve).toHaveBeenCalledTimes(12);
    expect(mockUseChatRecords).toHaveBeenCalledWith('proj_one');
    expect(mockUseChats).toHaveBeenCalledWith('proj_one', { enabled: false });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'should retain all observation leases across metadata changes when expanded=%s',
    (isExpanded) => {
      const { rerender, unmount } = render(
        <ProjectChatList project={project} isProjectActive={false} isExpanded={isExpanded} />,
      );
      expect(mockObserve.mock.calls).toEqual(defaultChatsResult.chats.map((entry) => [entry.id, project.id]));
      expect(screen.queryAllByRole('link')).toHaveLength(isExpanded ? 5 : 0);

      mockUseChatRecords.mockReturnValue({
        ...defaultChatsResult,
        chats: defaultChatsResult.chats.map((entry) => ({
          ...entry,
          name: `Renamed ${entry.id}`,
          updatedAt: entry.updatedAt + 100,
          recencyAt: entry.id === 'chat_1' ? 1000 : entry.updatedAt,
        })),
      });
      rerender(<ProjectChatList project={project} isProjectActive={false} isExpanded={isExpanded} />);

      expect(mockRelease).not.toHaveBeenCalled();
      expect(mockObserve).toHaveBeenCalledTimes(12);
      if (isExpanded) {
        expect(screen.getAllByRole('link')[0]).toHaveAccessibleName('Renamed chat_1');
      } else {
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
      }
      unmount();
      expect(mockRelease.mock.calls.map(([chatId]) => chatId).sort()).toEqual(
        defaultChatsResult.chats.map((entry) => entry.id).sort(),
      );
    },
  );

  it('should retain observation leases when metadata rows are reordered', () => {
    const { rerender, unmount } = render(<ProjectChatList project={project} isProjectActive />);
    mockUseChatRecords.mockReturnValue({ ...defaultChatsResult, chats: [...defaultChatsResult.chats].reverse() });
    rerender(<ProjectChatList project={project} isProjectActive />);

    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockObserve).toHaveBeenCalledTimes(12);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    unmount();
    expect(mockRelease).toHaveBeenCalledTimes(12);
  });

  it('should change only observation leases whose chat membership changes', () => {
    const { rerender, unmount } = render(
      <ProjectChatList project={project} isProjectActive={false} isExpanded={false} />,
    );
    mockUseChatRecords.mockReturnValue({
      ...defaultChatsResult,
      chats: [...defaultChatsResult.chats.filter((entry) => entry.id !== 'chat_1'), chat(13)],
    });
    rerender(<ProjectChatList project={project} isProjectActive={false} isExpanded={false} />);

    expect(mockRelease.mock.calls).toEqual([['chat_1']]);
    expect(mockObserve).toHaveBeenCalledTimes(13);
    expect(mockObserve).toHaveBeenLastCalledWith('chat_13', project.id);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();
    expect(mockRelease.mock.calls.map(([chatId]) => chatId).sort()).toEqual(
      Array.from({ length: 13 }, (_, index) => `chat_${index + 1}`).sort(),
    );
  });

  it('should release the old project leases before observing the replacement project', () => {
    const { rerender, unmount } = render(
      <ProjectChatList project={project} isProjectActive={false} isExpanded={false} />,
    );
    const replacement = { ...project, id: 'proj_replacement' };
    rerender(<ProjectChatList project={replacement} isProjectActive={false} isExpanded={false} />);
    expect(mockRelease).toHaveBeenCalledTimes(12);
    expect(Math.max(...mockRelease.mock.invocationCallOrder)).toBeLessThan(mockObserve.mock.invocationCallOrder[12]!);
    expect(mockObserve.mock.calls.slice(12)).toEqual(
      defaultChatsResult.chats.map((entry) => [entry.id, replacement.id]),
    );
    unmount();
    expect(mockRelease).toHaveBeenCalledTimes(24);
  });

  it('should transfer every observation when the store owner changes', () => {
    const replacementRelease = vi.fn<(chatId: string) => void>();
    const replacementObserve = vi.fn((chatId: string, _projectId: string) => () => {
      replacementRelease(chatId);
    });
    const { rerender, unmount } = render(
      <ProjectChatList project={project} isProjectActive={false} isExpanded={false} />,
    );
    mockUseChatSessionStore.mockReturnValue({ observe: replacementObserve });
    rerender(<ProjectChatList project={project} isProjectActive={false} isExpanded={false} />);
    expect(mockRelease).toHaveBeenCalledTimes(12);
    expect(replacementObserve.mock.calls).toEqual(defaultChatsResult.chats.map((entry) => [entry.id, project.id]));
    expect(replacementRelease).not.toHaveBeenCalled();
    unmount();
    expect(mockRelease).toHaveBeenCalledTimes(12);
    expect(replacementRelease).toHaveBeenCalledTimes(12);
  });

  it('reads navigation rows from metadata even when the mutation hook has no chats', () => {
    mockUseChats.mockReturnValue({ ...defaultChatsResult, chats: [] });
    render(<ProjectChatList project={project} isProjectActive />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(mockObserve).toHaveBeenCalledTimes(12);
  });

  it('marks only the query-selected chat active', () => {
    render(<ProjectChatList project={project} isProjectActive />);

    expect(screen.getByRole('link', { name: 'Chat 12' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Chat 11' })).not.toHaveAttribute('aria-current');
  });

  it('should request the chat pane when clicking the selected chat again', () => {
    render(<ProjectChatList project={project} isProjectActive />);

    fireEvent.click(screen.getByRole('link', { name: 'Chat 12' }));

    expect(mockLinkState).toHaveBeenCalledExactlyOnceWith({ openChat: true });
  });

  /* The loader spins in the status column, over the row's own mark, so a
   * loading route never moves the name. */
  it('spins in the status slot of the destination chat only, over its mark', () => {
    pendingLocation = { pathname: '/w/home/project%20one', search: '?chat=chat_11' };
    mockChatStatus.mockImplementation((_projectId: string, chatId: string) =>
      chatId === 'chat_11' ? status({ state: 'failed', failureReason: 'the model refused' }) : status(),
    );
    render(<ProjectChatList project={project} isProjectActive />);

    const pendingLink = screen.getByRole('link', { name: 'Chat 11' });
    expect(pendingLink).toHaveAttribute('aria-busy', 'true');
    expect(pendingLink.querySelector('.animate-spin')).not.toBeInTheDocument();
    const pendingRow = pendingLink.closest('[data-slot=chat-trigger]');
    expect(pendingRow?.querySelector('[data-slot=chat-status][data-glyph=pending] .animate-spin')).toBeInTheDocument();
    expect(pendingRow?.querySelector('[data-glyph=failed]')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Chat 12' }).closest('[data-slot=chat-trigger]')?.querySelector('.animate-spin'),
    ).toBeNull();
  });

  it('replaces a deleted focused-chat URL with the deterministic next chat', async () => {
    const deleteChat = vi.fn().mockResolvedValue(undefined);
    mockUseChatRecords.mockReturnValue({
      ...defaultChatsResult,
      chats: [
        { ...chat(1, 20), recencyAt: 20 },
        { ...chat(2, 10), recencyAt: 10 },
      ],
    });
    mockUseChats.mockReturnValue({ ...defaultChatsResult, deleteChat });
    search = '?chat=chat_1';
    render(<ProjectChatList project={project} isProjectActive />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Move to Trash' })[0]!);
    await vi.waitFor(() => {
      expect(deleteChat).toHaveBeenCalledWith('chat_1');
      expect(mockNavigate).toHaveBeenCalledWith('/w/home/project%20one?chat=chat_2', { replace: true });
    });
  });

  it('keeps archived chats and restore controls out of the sidebar', () => {
    mockUseChatRecords.mockReturnValue({
      ...defaultChatsResult,
      chats: [chat(1), { ...chat(2), deletedAt: Date.now() }],
    });
    render(<ProjectChatList project={project} isProjectActive />);

    expect(screen.queryByRole('link', { name: 'Chat 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chat Trash/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
    expect(mockUseChatRecords).toHaveBeenCalledWith('proj_one');
  });

  /* D1, D8, D16: one leading mark inside the rail; the sentence is the
   * link's tooltip and description; branch facts are not the sidebar's (D4). */
  it('leads the row with its mark and says its sentence on the link', () => {
    mockChatStatus.mockImplementation((_projectId: string, chatId: string) =>
      chatId === 'chat_12'
        ? status({ state: 'approval', pendingApprovalCount: 1, branch: 'sweep', unread: true })
        : undefined,
    );
    render(<ProjectChatList project={project} isProjectActive />);

    const link = screen.getByRole('link', { name: 'Chat 12' });
    expect(link).toHaveAttribute('aria-describedby', 'chat-status-chat_12');
    expect(document.querySelector('#chat-status-chat_12')?.textContent).toBe('Needs your approval · 1');
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Needs your approval · 1');
    expect(screen.queryByText('sweep')).not.toBeInTheDocument();
    const row = link.closest<HTMLElement>('[data-slot=chat-trigger]');
    const slot = row?.querySelector<HTMLElement>('[data-slot=chat-status]');
    expect(row?.firstElementChild).toBe(slot);
    expect(slot?.dataset['glyph']).toBe('attention');
    expect(slot?.querySelector('.absolute')).toHaveTextContent('1');
    /* No bold for unread: the mark says it (D2). */
    expect(link.querySelector('.font-medium')).toBeNull();
  });

  it('starts Monaco when a chat row is pointed at or focused', () => {
    render(<ProjectChatList project={project} isProjectActive />);
    const link = screen.getByRole('link', { name: 'Chat 12' });

    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    expect(mockWarmMonaco).toHaveBeenCalledTimes(2);
  });

  it('hangs the chats off a rail one slot in', () => {
    render(<ProjectChatList project={project} isProjectActive />);
    expect(document.querySelector('#project-chats-proj_one')).toHaveClass('ml-3.5', 'border-l', 'pl-1.5', 'gap-0.5');
  });

  it('keeps an empty status column and no sentence for a chat with no state at all', () => {
    render(<ProjectChatList project={project} isProjectActive />);
    expect(mockObserve).toHaveBeenCalledWith('chat_12', 'proj_one');
    expect(screen.getByRole('link', { name: 'Chat 12' })).not.toHaveAttribute('aria-describedby');
    const slots = document.querySelectorAll<HTMLElement>('[data-slot=chat-status]');
    expect(slots).toHaveLength(5);
    expect([...slots].every((slot) => slot.dataset['glyph'] === 'none' && slot.childElementCount === 0)).toBe(true);
  });

  /* D20: in flight is a pulsing muted disc that stops under reduced motion. */
  it('draws work in flight as a filled pulsing disc, not a spinner', () => {
    mockChatStatus.mockReturnValue(status({ state: 'tool', toolName: 'bash' }));
    render(<ProjectChatList project={project} isProjectActive />);
    const slot = document.querySelector<HTMLElement>('[data-slot=chat-status]');
    expect(slot?.dataset['glyph']).toBe('running');
    expect(slot?.querySelector('svg')).toBeNull();
    const disc = slot?.firstElementChild;
    expect(disc).toHaveClass('bg-muted-foreground/80', 'animate-breathe', 'motion-reduce:animate-none', 'rounded-full');
    expect(disc?.className).not.toMatch(/\bring-/u);
  });

  it('stops a running chat without touching the record', () => {
    mockChatStatus.mockReturnValue(status({ state: 'working' }));
    render(<ProjectChatList project={project} isProjectActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Chat 12' }));
    expect(mockCloseChat).toHaveBeenCalledExactlyOnceWith('proj_one', 'chat_12');
  });

  it('opens the same actions on right-click anywhere on the row', async () => {
    mockChatStatus.mockReturnValue(status({ state: 'working' }));
    render(<ProjectChatList project={project} isProjectActive />);
    const row = screen.getByRole('link', { name: 'Chat 12' }).closest<HTMLElement>('[data-slot=chat-trigger]')!;
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole('menu');
    expect(row).toHaveAttribute('data-state', 'open');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Rename', 'Stop', 'Move to Trash']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Stop Chat 12' }));
    expect(mockCloseChat).toHaveBeenCalledExactlyOnceWith('proj_one', 'chat_12');
  });

  /* D7, D18: the chat's banner owns Try again; the name already opens it. */
  it('offers neither Retry nor Open log on a failed chat, and no Stop on a finished one', () => {
    mockChatStatus.mockImplementation((_projectId: string, chatId: string) =>
      chatId === 'chat_12' ? status({ state: 'failed', failureReason: 'the model refused' }) : status(),
    );
    render(<ProjectChatList project={project} isProjectActive />);

    expect(screen.queryByRole('button', { name: /retry/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open log/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Stop / })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot=chat-status][data-glyph=failed]')).toBeInTheDocument();
  });

  it.each([false, true])(
    'should retry metadata with retained chats=%s without replacing observation leases',
    async (retained) => {
      const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const chats = retained ? defaultChatsResult.chats : [];
      mockUseChatRecords.mockReturnValue({ ...defaultChatsResult, chats, retry });
      mockChatStatus.mockReturnValue(status({ state: 'working' }));
      const { rerender, unmount } = render(<ProjectChatList project={project} isProjectActive />);
      const registrations = mockObserve.mock.calls.length;
      const links = screen.queryAllByRole('link');
      mockUseChatRecords.mockReturnValue({
        ...defaultChatsResult,
        chats,
        retry,
        error: 'Provider offline\nprivate diagnostic',
      });
      rerender(<ProjectChatList project={project} isProjectActive />);
      expect(document.querySelector('[data-slot=failure-row]')).toHaveTextContent("Couldn't load chats");
      expect(screen.queryByText(/private diagnostic/u)).not.toBeInTheDocument();
      expect(screen.queryAllByRole('link')).toEqual(links);
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading chats' }));
      await waitFor(() => {
        expect(retry).toHaveBeenCalledOnce();
      });
      expect(mockCloseChat).not.toHaveBeenCalled();
      expect(mockObserve).toHaveBeenCalledTimes(registrations);
      expect(mockRelease).not.toHaveBeenCalled();
      if (retained) {
        fireEvent.click(screen.getByRole('button', { name: 'Stop Chat 12' }));
        expect(mockCloseChat).toHaveBeenCalledWith(project.id, 'chat_12');
      }
      mockUseChatRecords.mockReturnValue({ ...defaultChatsResult, chats, retry });
      rerender(<ProjectChatList project={project} isProjectActive />);
      expect(screen.queryByRole('button', { name: 'Retry loading chats' })).not.toBeInTheDocument();
      expect(screen.queryAllByRole('link')).toEqual(links);
      expect(mockRelease).not.toHaveBeenCalled();
      unmount();
      expect(mockRelease).toHaveBeenCalledTimes(chats.length);
    },
  );

  /* D17: renaming keeps the status column and outlines the whole row. */
  it('outlines the whole row while it is renamed and keeps its status column', () => {
    mockChatStatus.mockReturnValue(status({ state: 'working' }));
    render(<ProjectChatList project={project} isProjectActive />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]!);
    const row = screen.getByTestId('inline-editor').closest('[data-slot=chat-trigger]');
    expect(row).toHaveClass('focus-outline');
    expect(row?.querySelector('[data-slot=chat-status]')).toBeInTheDocument();
  });

  it('opens the rename field when the row is double-clicked', () => {
    render(<ProjectChatList project={project} isProjectActive />);
    expect(screen.queryByTestId('inline-editor')).not.toBeInTheDocument();
    fireEvent.doubleClick(document.querySelectorAll('[data-slot=chat-trigger]')[0]!);
    expect(screen.getByTestId('inline-editor')).toBeInTheDocument();
  });

  it('groups chats by day only when both days are on screen', () => {
    const now = Date.now();
    mockUseChatRecords.mockReturnValue({
      ...defaultChatsResult,
      chats: [
        { ...chat(1), recencyAt: now },
        { ...chat(2), recencyAt: 1 },
      ],
    });
    render(<ProjectChatList project={project} isProjectActive />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();

    mockUseChatRecords.mockReturnValue({ ...defaultChatsResult, chats: [{ ...chat(1), recencyAt: now }] });
    render(<ProjectChatList project={project} isProjectActive />);
    expect(screen.queryAllByText('Earlier')).toHaveLength(1);
  });
});
