import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Chat } from '@taucad/chat';
import { projectToManifest } from '@taucad/types';
import type { useChats } from '#hooks/use-chats.js';
import type { ProjectListItem } from '#types/project.types.js';

const mockUseChats = vi.fn();
const mockNavigate = vi.fn();
let search = '?chat=chat_12';
let pendingLocation: { readonly pathname: string; readonly search: string } | undefined;

vi.mock('#hooks/use-chats.js', () => ({ useChats: () => mockUseChats() as ReturnType<typeof useChats> }));
vi.mock('react-router', () => ({
  Link: ({ children, to, ...properties }: { readonly children: ReactNode; readonly to: string }) => (
    <a href={to} {...properties} rel='noreferrer'>
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
vi.mock('#components/ui/button.js', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { readonly children: ReactNode; readonly onSelect?: () => void }) => (
    <button type='button' onClick={onSelect}>
      {children}
    </button>
  ),
}));
vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => <input value={value} readOnly />,
}));
vi.mock('#components/ui/skeleton.js', () => ({ Skeleton: () => <span data-testid='skeleton' /> }));

const chat = (index: number, updatedAt = index): Chat => ({
  id: `chat_${index}`,
  resourceId: 'proj_one',
  name: `Chat ${index}`,
  messages: [],
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
  retry: vi.fn(),
  updateChatName: vi.fn(),
  deleteChat: vi.fn(),
};

const { ProjectChatList, sortProjectChats } = await import('#components/nav/project-chat-list.js');

describe('ProjectChatList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = '?chat=chat_12';
    pendingLocation = undefined;
    mockUseChats.mockReturnValue(defaultChatsResult);
    mockNavigate.mockResolvedValue(undefined);
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

  it('marks only the query-selected chat active', () => {
    render(<ProjectChatList project={project} isProjectActive />);

    expect(screen.getByRole('link', { name: 'Chat 12' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Chat 11' })).not.toHaveAttribute('aria-current');
  });

  it('shows route loading only on the destination chat', () => {
    pendingLocation = { pathname: '/w/home/project%20one', search: '?chat=chat_11' };
    render(<ProjectChatList project={project} isProjectActive />);

    const pendingLink = screen.getByRole('link', { name: 'Chat 11' });
    expect(pendingLink).toHaveAttribute('aria-busy', 'true');
    expect(pendingLink.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chat 12' }).querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('replaces a deleted focused-chat URL with the deterministic next chat', async () => {
    const deleteChat = vi.fn().mockResolvedValue(undefined);
    mockUseChats.mockReturnValue({
      ...defaultChatsResult,
      chats: [
        { ...chat(1, 20), recencyAt: 20 },
        { ...chat(2, 10), recencyAt: 10 },
      ],
      deleteChat,
    });
    search = '?chat=chat_1';
    render(<ProjectChatList project={project} isProjectActive />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    await vi.waitFor(() => {
      expect(deleteChat).toHaveBeenCalledWith('chat_1');
      expect(mockNavigate).toHaveBeenCalledWith('/w/home/project%20one?chat=chat_2', { replace: true });
    });
  });
});
