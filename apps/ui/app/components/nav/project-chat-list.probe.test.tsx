// @vitest-environment jsdom
import { createProjectFixture } from '#lib/project.fixture.js';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { useChats } from '#hooks/use-chats.js';
import type { useChatRecords } from '#hooks/use-chat-records.js';
import type { ProjectListItem } from '#types/project-library.types.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';

const probeChatId = '00000000-0000-4000-8000-000000000000';

const holder = vi.hoisted(() => ({
  store: undefined as ChatSessionStore | undefined,
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ search: '' }),
  useNavigate: () => vi.fn(),
  useNavigation: () => ({ location: undefined, state: 'idle' }),
}));
vi.mock('#hooks/use-cloud-projects.js', () => ({
  useTauCloudIntent: () => undefined,
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: (): ChatSessionStore => {
    if (holder.store === undefined) {
      throw new Error('Chat session store was not installed.');
    }
    return holder.store;
  },
}));

const mockUseChats = vi.fn();
const mockUseChatRecords = vi.fn();
vi.mock('#hooks/use-chats.js', () => ({
  useChats: (...args: Parameters<typeof useChats>) => mockUseChats(...args) as ReturnType<typeof useChats>,
}));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: (...args: Parameters<typeof useChatRecords>) =>
    mockUseChatRecords(...args) as ReturnType<typeof useChatRecords>,
}));
vi.mock('#hooks/use-sidebar-status.js', () => ({
  useProjectSidebarRow: () => ({ sync: { chats: 'ready' } }),
  useChatSidebarStatus: () => undefined,
  useSidebarCommands: () => ({ closeChat: vi.fn(), closeProject: vi.fn(), openProject: vi.fn() }),
  selectChatFacts: () => ({ mark: 'none', sentence: undefined }),
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarMenuButton: ({ children }: { readonly children: ReactNode }) => <button type='button'>{children}</button>,
  SidebarMenuSub: ({ children }: { readonly children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: { readonly children: ReactNode }) => <li>{children}</li>,
}));

const { ProjectChatList } = await import('#components/nav/project-chat-list.js');
const { ChatSessionStore: Store } = await import('#services/chat-session-store.js');

const project = (id: string): ProjectListItem => ({
  ...createProjectFixture({
    id,
    name: id,
    description: id,
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: `/${id}` },
  slugs: { workspaceSlug: 'home', projectSlug: id },
});

const record = (projectId: string, id: string, updatedAt: number): ChatRecord => ({
  id,
  resourceId: projectId,
  name: id,
  createdAt: updatedAt,
  updatedAt,
});

describe('ProjectChatList registration probe', () => {
  afterEach(() => {
    cleanup();
    holder.store = undefined;
  });

  it('should keep both project sidebars mounted when each lists the registration probe', () => {
    const store = new Store();
    holder.store = store;
    mockUseChatRecords.mockImplementation((projectId: string) => ({
      chats: [record(projectId, probeChatId, 0), record(projectId, `chat_${projectId}`, 2)],
      isLoading: false,
      error: undefined,
      retry: vi.fn(),
    }));
    mockUseChats.mockReturnValue({ updateChatName: vi.fn(), deleteChat: vi.fn() });

    render(
      <>
        <ProjectChatList project={project('proj_home')} isProjectActive={false} isExpanded={false} />
        <ProjectChatList project={project('proj_workspace')} isProjectActive isExpanded={false} />
      </>,
    );

    expect(store.observedChatIdsOf('proj_home')).toEqual(['chat_proj_home']);
    expect(store.observedChatIdsOf('proj_workspace')).toEqual(['chat_proj_workspace']);
  });
});
