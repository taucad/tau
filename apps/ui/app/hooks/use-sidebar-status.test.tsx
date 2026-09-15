// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Chat } from '@taucad/chat';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type { ProjectListItem } from '#types/project.types.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ChatSessionActorRef, ChatSessionMachineEvent } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef, ProjectSessionCloseReason } from '#machines/project-session.machine.js';
import type { SessionsActorRef, SessionsProjectStatus } from '#machines/sessions.machine.js';

import { LivenessGlyph, projectRowDescription } from '#components/nav/liveness-glyph.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { peekRevisionClient } from '#hooks/use-revision-status.js';
import { useSessions } from '#hooks/use-sessions.js';
import {
  chatStatusLabel,
  liveNowText,
  readProjectStatus,
  selectChatStatus,
  selectLiveNow,
  selectProjectRow,
  useChatSidebarStatus,
  useProjectSidebarRow,
  useSidebarCommands,
} from '#hooks/use-sidebar-status.js';
import type { useLiveNow } from '#hooks/use-sidebar-status.js';

/* The registry and the revision clients are the hooks' two inputs; the chat
 * machines below are real, because the pins are about what they say. */
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: vi.fn(),
  useLiveProjectIds: () => Object.keys(fakeRegistry.refs),
}));
vi.mock('#hooks/use-revision-status.js', () => ({ peekRevisionClient: vi.fn() }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: sidebarChats,
    isLoading: false,
    error: undefined,
    retry: vi.fn(),
    updateChatName: vi.fn(),
    deleteChat: vi.fn(),
  }),
}));
vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [sidebarProject],
    isLoading: false,
    error: undefined,
    retry: vi.fn(),
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    updateName: vi.fn(),
  }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createChat: vi.fn() }) }));
vi.mock('#hooks/use-app-ui-preferences.js', () => ({
  useAppUiPreferences: () => ({ isProjectExpanded: () => false, setProjectDisclosure: vi.fn() }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('react-router', () => ({
  Link: ({ children, to, ...properties }: { readonly children: ReactNode; readonly to: string }) => (
    <a href={to} {...properties} rel='noreferrer'>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: '/', search: '' }),
  useNavigate: () => vi.fn(),
  useNavigation: () => ({ location: undefined, state: 'idle' }),
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarGroup: ({ children }: { readonly children: ReactNode }) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: { readonly children: ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { readonly children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children, ...properties }: { readonly children: ReactNode }) => (
    <li {...properties}>{children}</li>
  ),
  SidebarMenuButton: ({ children, ...properties }: { readonly children: ReactNode }) => (
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
  useSidebar: () => ({ isMobile: false }),
}));
vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children }: { readonly children: ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock('#components/nav/project-close-dialogs.js', () => ({ CloseProjectDialog: () => null }));

const idleWindowMilliseconds = 30 * 60 * 1000;
const registrySend = vi.fn();
const sessionSend = vi.fn();

const sidebarProject: ProjectListItem = {
  $schema: 'https://tau.new/schemas/tau-schema-v1.json',
  id: 'enclosure',
  name: 'Enclosure',
  description: 'Enclosure',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/enclosure' },
  slugs: { workspaceSlug: 'home', projectSlug: 'enclosure' },
};
const sidebarChat: Chat = {
  id: 'sweep',
  resourceId: sidebarProject.id,
  name: 'Wall thickness sweep',
  messages: [],
  createdAt: 0,
  updatedAt: 0,
};
const sidebarChats: readonly Chat[] = [sidebarChat];

const { ProjectChatList } = await import('#components/nav/project-chat-list.js');
const { ProjectNavigation } = await import('#components/nav/project-navigation.js');

type RevisionOverrides = Partial<Pick<RevisionStatusProjection, 'branch' | 'dirty'>> & {
  readonly sync?: Partial<RevisionStatusProjection['sync']>;
};

type RevisionClientStub = {
  status: () => RevisionStatusProjection | undefined;
  subscribe: (l: () => void) => () => void;
};

type FakeRegistry = {
  actor: SessionsActorRef;
  revisionClients: Map<string, RevisionClientStub>;
  refs: Record<string, ProjectSessionActorRef>;
  status: Record<string, SessionsProjectStatus>;
  closed: Record<string, { reason: ProjectSessionCloseReason; at: number }>;
  chatReferences: Record<string, Record<string, ChatSessionActorRef>>;
  registryListeners: Set<() => void>;
  sessionListeners: Set<() => void>;
};

/** The registry, the session and the revision clients, as thin as the hooks read them. */
const fakeRegistry: FakeRegistry = {
  actor: undefined as unknown as SessionsActorRef,
  revisionClients: new Map(),
  refs: {},
  status: {},
  closed: {},
  chatReferences: {},
  registryListeners: new Set(),
  sessionListeners: new Set(),
};

const sessionRefFor = (projectId: string): ProjectSessionActorRef =>
  ({
    getSnapshot: () => ({ context: { chatRefs: fakeRegistry.chatReferences[projectId] ?? {} } }),
    send: sessionSend,
    subscribe: (listener: () => void) => {
      fakeRegistry.sessionListeners.add(listener);
      return {
        unsubscribe: () => {
          fakeRegistry.sessionListeners.delete(listener);
        },
      };
    },
  }) as unknown as ProjectSessionActorRef;

const resetRegistry = (): void => {
  fakeRegistry.refs = {};
  fakeRegistry.status = {};
  fakeRegistry.closed = {};
  fakeRegistry.chatReferences = {};
  fakeRegistry.registryListeners.clear();
  fakeRegistry.sessionListeners.clear();
  fakeRegistry.revisionClients.clear();
  fakeRegistry.actor = {
    getSnapshot: () => ({
      context: {
        refs: fakeRegistry.refs,
        status: fakeRegistry.status,
        closed: fakeRegistry.closed,
        refusals: {},
        idleWindowMilliseconds,
      },
    }),
    subscribe: (listener: () => void) => {
      fakeRegistry.registryListeners.add(listener);
      return {
        unsubscribe: () => {
          fakeRegistry.registryListeners.delete(listener);
        },
      };
    },
    send: registrySend,
  } as unknown as SessionsActorRef;
};

const liveProject = (projectId: string, status: Partial<SessionsProjectStatus> = {}): void => {
  fakeRegistry.refs[projectId] = sessionRefFor(projectId);
  fakeRegistry.chatReferences[projectId] ??= {};
  fakeRegistry.status[projectId] = { state: 'live', runs: 0, dirty: false, pushed: true, pending: 0, ...status };
};

const closeProject = (projectId: string, reason: ProjectSessionCloseReason): void => {
  fakeRegistry.refs = Object.fromEntries(Object.entries(fakeRegistry.refs).filter(([id]) => id !== projectId));
  fakeRegistry.status = Object.fromEntries(Object.entries(fakeRegistry.status).filter(([id]) => id !== projectId));
  fakeRegistry.closed[projectId] = { reason, at: 1 };
};

const revisions = (projectId: string, overrides: RevisionOverrides = {}): void => {
  const projection = {
    projectId,
    branch: overrides.branch ?? 'main',
    dirty: overrides.dirty ?? false,
    sync: {
      state: 'noRemote',
      pendingCount: 0,
      online: true,
      conflictRef: undefined,
      error: undefined,
      ...overrides.sync,
    },
  } as unknown as RevisionStatusProjection;
  fakeRegistry.revisionClients.set(projectId, { status: () => projection, subscribe: () => () => undefined });
};

/** One live chat machine, driven by the events the architecture's table names. */
const driveChat = (
  projectId: string,
  chatId: string,
  events: readonly ChatSessionMachineEvent[],
): ChatSessionActorRef => {
  const actor = createActor(chatSessionMachine, { input: { chatId, projectId } });
  actor.start();
  for (const event of events) {
    actor.send(event);
  }
  fakeRegistry.chatReferences[projectId] ??= {};
  fakeRegistry.chatReferences[projectId][chatId] = actor;
  return actor;
};

const notifyRegistry = (): void => {
  for (const listener of new Set(fakeRegistry.registryListeners)) {
    listener();
  }
};

const stopRun = vi.fn();
const retryRun = vi.fn();

beforeEach(() => {
  resetRegistry();
  stopRun.mockReset();
  retryRun.mockReset();
  registrySend.mockReset();
  sessionSend.mockReset();
  vi.mocked(useChatSessionStore).mockReturnValue({ stopRun, retryRun } as unknown as ReturnType<
    typeof useChatSessionStore
  >);
  vi.mocked(useSessions).mockImplementation(() => fakeRegistry.actor);
  vi.mocked(peekRevisionClient).mockImplementation(
    (projectId: string) => fakeRegistry.revisionClients.get(projectId) as ReturnType<typeof peekRevisionClient>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const agentStateRows: ReadonlyArray<{
  readonly signal: string;
  readonly target: 'chat' | 'project';
  readonly events: readonly ChatSessionMachineEvent[];
  readonly state?: string;
  readonly label: string | undefined;
  readonly glyphs: readonly string[];
  readonly description: string;
  readonly branch?: string;
  readonly dirty?: boolean;
  readonly revision?: RevisionOverrides;
  readonly conflictedChats?: number;
  readonly attention?: number;
}> = [
  {
    signal: 'no session, no run',
    target: 'chat',
    events: [],
    state: 'idle',
    label: undefined,
    glyphs: [],
    description: 'Wall thickness sweep.',
  },
  {
    signal: 'run.lifecycle: admitted',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'admitted' }],
    state: 'queued',
    label: 'Queued',
    glyphs: ['queued'],
    description: 'Wall thickness sweep, queued.',
  },
  {
    signal: 'run.lifecycle: running, no tool in flight',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'running' }],
    state: 'working',
    label: 'Working…',
    glyphs: ['working'],
    description: 'Wall thickness sweep, working.',
  },
  {
    signal: 'tool part in flight',
    target: 'chat',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'toolParts', inFlight: 1, approvals: 0, toolName: 'geospec_check' },
    ],
    state: 'tool',
    label: 'Running geospec_check',
    glyphs: ['tool'],
    description: 'Wall thickness sweep, running geospec_check.',
  },
  {
    signal: 'interrupt.recorded requested',
    target: 'chat',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested', count: 1 },
    ],
    state: 'approval',
    label: 'Needs your approval · 1',
    glyphs: ['approval'],
    description: 'Wall thickness sweep, needs your approval, 1 pending.',
  },
  {
    signal: 'model asked a question and stopped',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'paused' }],
    state: 'question',
    label: 'Waiting for you',
    glyphs: ['question'],
    description: 'Wall thickness sweep, waiting for you.',
  },
  {
    signal: 'durableRunState reattaching',
    target: 'chat',
    events: [{ type: 'durableRunState', state: 'reattaching' }],
    state: 'reconnecting',
    label: 'Reconnecting…',
    glyphs: ['reconnecting'],
    description: 'Wall thickness sweep, reconnecting.',
  },
  {
    signal: 'run.lifecycle: completed, chat not focused',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'completed' }],
    state: 'finishing',
    label: 'Finishing…',
    glyphs: ['finishing'],
    description: 'Wall thickness sweep, finishing, unread.',
  },
  {
    signal: 'turn.finalized, chat not focused',
    target: 'chat',
    events: [
      { type: 'runLifecycle', phase: 'completed' },
      { type: 'turnFinalizedObserved', branch: 'main' },
    ],
    state: 'done',
    label: 'Done',
    glyphs: ['unread'],
    description: 'Wall thickness sweep, done, unread.',
  },
  {
    signal: 'turn.finalized, focused',
    target: 'chat',
    events: [
      { type: 'runLifecycle', phase: 'completed' },
      { type: 'viewed' },
      { type: 'turnFinalizedObserved', branch: 'main' },
    ],
    state: 'done',
    label: 'Done',
    glyphs: [],
    description: 'Wall thickness sweep, done.',
  },
  {
    signal: 'run.lifecycle: failed',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed while meshing' }],
    state: 'failed',
    label: 'Failed · kernel crashed while meshing',
    glyphs: ['failed'],
    description: 'Wall thickness sweep, failed: kernel crashed while meshing, unread.',
  },
  {
    signal: 'run.lifecycle: cancelled',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'cancelled' }],
    state: 'stopped',
    label: 'Stopped',
    glyphs: [],
    description: 'Wall thickness sweep, stopped.',
  },
  {
    signal: 'turn.finalized on a branch',
    target: 'chat',
    events: [{ type: 'turnFinalized', branch: 'arm-fillet' }],
    state: 'idle',
    label: undefined,
    glyphs: ['branch'],
    description: 'Wall thickness sweep, on branch arm-fillet.',
    branch: 'arm-fillet',
  },
  {
    signal: 'checkout.machine dirty',
    target: 'chat',
    events: [
      { type: 'turnFinalized', branch: 'arm-fillet' },
      { type: 'dirtyChanged', dirty: true },
    ],
    state: 'idle',
    label: undefined,
    glyphs: ['branch', 'dirty'],
    description: 'Wall thickness sweep, on branch arm-fillet, unsaved edits.',
    branch: 'arm-fillet',
    dirty: true,
  },
  {
    signal: 'sync.machine queued',
    target: 'project',
    events: [],
    label: 'Not backed up · 1 revision · retrying',
    glyphs: ['idle', 'sync-queued'],
    description: 'Enclosure, live, not backed up, 1 revision pending.',
    revision: { sync: { state: 'queued', pendingCount: 1 } },
  },
  {
    signal: 'sync.machine conflicted',
    target: 'project',
    events: [],
    label: 'Needs resolution',
    glyphs: ['attention', 'sync-conflicted'],
    description: 'Enclosure, live, 1 needs you, needs resolution.',
    revision: { sync: { state: 'conflicted', pendingCount: 0 } },
    conflictedChats: 3,
    attention: 1,
  },
  {
    signal: 'sync.machine pending (ordinary project row)',
    target: 'project',
    events: [],
    label: 'Backing up 2 revisions',
    glyphs: ['idle', 'sync-pending'],
    description: 'Enclosure, live, backing up, 2 revisions pending.',
    revision: { sync: { state: 'pending', pendingCount: 2 } },
  },
];

describe('use-sidebar-status — pin (a): every agent-state row renders from a driven machine (V22)', () => {
  it.each(agentStateRows)(
    '$signal',
    ({
      target,
      events,
      state,
      label,
      glyphs,
      description,
      branch,
      dirty = false,
      revision,
      conflictedChats,
      attention,
    }) => {
      liveProject(sidebarProject.id);
      if (target === 'chat') {
        const actor = driveChat(sidebarProject.id, sidebarChat.id, events);
        const status = selectChatStatus(actor.getSnapshot());
        expect(status.state).toBe(state);
        expect(chatStatusLabel(status)).toBe(label);
        render(<ProjectChatList project={sidebarProject} isProjectActive={false} />);
      } else {
        for (let index = 0; index < (conflictedChats ?? 0); index += 1) {
          driveChat(sidebarProject.id, `conflicted-${String(index)}`, [{ type: 'syncState', state: 'conflicted' }]);
        }
        revisions(sidebarProject.id, revision);
        const row = selectProjectRow(readProjectStatus(fakeRegistry.actor, sidebarProject.id), idleWindowMilliseconds);
        expect(row.detail).toBe(label);
        if (attention !== undefined) {
          expect(row.attention).toBe(attention);
        }
        render(<ProjectNavigation />);
      }

      const accessibleName = target === 'chat' ? sidebarChat.name : sidebarProject.name;
      const link = screen.getByRole('link', { name: accessibleName });
      const descriptionId = link.getAttribute('aria-describedby');
      expect(descriptionId).not.toBeNull();
      expect(descriptionId === null ? undefined : document.querySelector(`#${descriptionId}`)?.textContent).toBe(
        description,
      );

      const renderedRow = link.closest<HTMLElement>(`[data-slot=${target}-trigger]`);
      expect(
        Array.from(renderedRow?.querySelectorAll<HTMLElement>('[data-glyph]') ?? [], (glyph) => glyph.dataset['glyph']),
      ).toEqual(glyphs);
      expect(renderedRow?.querySelector('[data-slot=branch-chip]')?.textContent).toBe(branch);
      expect(renderedRow?.querySelector('[data-slot=dirty-pip]') !== null).toBe(dirty);
    },
  );

  it('carries a failed run its reason and its Retry affordance vocabulary', () => {
    const actor = driveChat('bracket', 'arm', [
      { type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed while meshing' },
    ]);
    expect(chatStatusLabel(selectChatStatus(actor.getSnapshot()))).toBe('Failed · kernel crashed while meshing');
  });
});

describe('use-sidebar-status — pin (d): the project row aggregates its chats (A36)', () => {
  const glyphOf = (projectId: string): string | undefined => {
    const row = selectProjectRow(readProjectStatus(fakeRegistry.actor, projectId), idleWindowMilliseconds);
    const { container } = render(<LivenessGlyph row={row} />);
    return container.querySelector<HTMLElement>('[data-glyph]')?.dataset['glyph'];
  };

  it('spins while any chat runs', () => {
    liveProject('bracket');
    driveChat('bracket', 'idle-chat', []);
    driveChat('bracket', 'busy-chat', [{ type: 'runLifecycle', phase: 'running' }]);
    expect(glyphOf('bracket')).toBe('busy');
  });

  it('lifts the amber count from the chats that need a person', () => {
    liveProject('bracket');
    driveChat('bracket', 'one', [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested', count: 1 },
    ]);
    driveChat('bracket', 'two', [{ type: 'runLifecycle', phase: 'paused' }]);
    const row = selectProjectRow(readProjectStatus(fakeRegistry.actor, 'bracket'), idleWindowMilliseconds);
    expect(row.attention).toBe(2);
    expect(glyphOf('bracket')).toBe('attention');
    expect(projectRowDescription('Bracket v2', row)).toBe('Bracket v2, live, 2 need you.');
  });

  /* P57: red is "a run failed **and is unread**", so looking at the chat is
   * what quiets the project row. */
  it('turns red on a failed run nobody has seen, and not once it is seen', () => {
    liveProject('bracket');
    const actor = driveChat('bracket', 'arm', [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed' }]);
    expect(selectChatStatus(actor.getSnapshot()).unread).toBe(true);
    expect(glyphOf('bracket')).toBe('failed');
    actor.send({ type: 'viewed' });
    expect(glyphOf('bracket')).toBe('idle');
  });

  it('is a solid dot when live and idle, and nothing at all when closed', () => {
    liveProject('bracket');
    expect(glyphOf('bracket')).toBe('idle');
    closeProject('bracket', 'user');
    expect(glyphOf('bracket')).toBeUndefined();
  });

  it('names a policy close on the row and says nothing about a user close', () => {
    closeProject('enclosure', 'idle');
    expect(selectProjectRow(readProjectStatus(fakeRegistry.actor, 'enclosure'), idleWindowMilliseconds).detail).toBe(
      'Closed to save memory · 30 min idle',
    );
    closeProject('gearbox', 'budget');
    expect(selectProjectRow(readProjectStatus(fakeRegistry.actor, 'gearbox'), idleWindowMilliseconds).detail).toBe(
      'Closed · memory budget · reopen any time',
    );
    closeProject('quadcopter', 'user');
    expect(
      selectProjectRow(readProjectStatus(fakeRegistry.actor, 'quadcopter'), idleWindowMilliseconds).detail,
    ).toBeUndefined();
  });

  it('writes the Live now header the canvas writes', () => {
    liveProject('bracket', { runs: 3 });
    liveProject('quadcopter');
    driveChat('bracket', 'one', [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested', count: 1 },
    ]);
    const rows = ['bracket', 'quadcopter'].map((projectId) =>
      selectProjectRow(readProjectStatus(fakeRegistry.actor, projectId), idleWindowMilliseconds),
    );
    expect(liveNowText(selectLiveNow(rows, ['quadcopter']))).toBe('2 projects · 3 agents · 1 needs you');
    expect(selectLiveNow(rows, ['quadcopter']).idleProjectIds).toEqual(['quadcopter']);
  });
});

describe('use-sidebar-status — pin (e): the render-count bound (V24 seam)', () => {
  it('repaints one row per changed chat, not the whole sidebar', () => {
    liveProject('bracket');
    const chatIds = ['one', 'two', 'three', 'four'];
    const actors = chatIds.map((chatId) => driveChat('bracket', chatId, [{ type: 'runLifecycle', phase: 'running' }]));
    const renders: string[] = [];

    function ChatRow({ chatId }: { readonly chatId: string }): React.JSX.Element {
      renders.push(`chat:${chatId}`);
      const status = useChatSidebarStatus('bracket', chatId);
      return <li>{status === undefined ? '' : (chatStatusLabel(status) ?? '')}</li>;
    }

    function ProjectRow(): React.JSX.Element {
      renders.push('project');
      const row = useProjectSidebarRow('bracket');
      return <span>{row.glyph}</span>;
    }

    render(
      <ul>
        <ProjectRow />
        {chatIds.map((chatId) => (
          <ChatRow key={chatId} chatId={chatId} />
        ))}
      </ul>,
    );
    renders.length = 0;

    act(() => {
      for (const [index, actor] of actors.entries()) {
        actor.send({ type: 'toolParts', inFlight: 1, approvals: 0, toolName: `tool_${String(index)}` });
      }
    });

    expect(renders.filter((entry) => entry.startsWith('chat:'))).toHaveLength(chatIds.length);
    expect(renders.length).toBeLessThanOrEqual(chatIds.length + 1);
  });

  it('wakes a chat row when its own machine moves and leaves its siblings alone', () => {
    liveProject('bracket');
    const moved = driveChat('bracket', 'one', []);
    driveChat('bracket', 'two', []);
    const renders: string[] = [];

    function ChatRow({ chatId }: { readonly chatId: string }): React.JSX.Element {
      renders.push(chatId);
      const status = useChatSidebarStatus('bracket', chatId);
      return <li>{status === undefined ? 'none' : status.state}</li>;
    }

    render(
      <ul>
        <ChatRow chatId='one' />
        <ChatRow chatId='two' />
      </ul>,
    );
    renders.length = 0;

    act(() => {
      moved.send({ type: 'runLifecycle', phase: 'admitted' });
    });

    expect(renders).toEqual(['one']);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['queued', 'idle']);
  });

  it('wakes every row when the registry opens or closes a project', () => {
    closeProject('bracket', 'budget');
    function ProjectRow(): React.JSX.Element {
      const row = useProjectSidebarRow('bracket');
      return <span>{row.detail ?? 'none'}</span>;
    }
    render(<ProjectRow />);
    expect(screen.getByText('Closed · memory budget · reopen any time')).toBeTruthy();

    act(() => {
      liveProject('bracket');
      notifyRegistry();
    });
    expect(screen.getByText('none')).toBeTruthy();
  });
});

describe('use-sidebar-status — pin (R1/P63): *Close* on a chat stops the run and keeps the row', () => {
  it('stops the run exactly once, leaves the chat machine alive, and the row reads Stopped', () => {
    liveProject('bracket');
    const actor = driveChat('bracket', 'sweep', [{ type: 'runLifecycle', phase: 'running' }]);

    function Row(): React.JSX.Element {
      const status = useChatSidebarStatus('bracket', 'sweep');
      const { closeChat } = useSidebarCommands();
      return (
        <button
          type='button'
          onClick={() => {
            closeChat('bracket', 'sweep');
          }}
        >
          {status === undefined ? 'gone' : (chatStatusLabel(status) ?? 'plain')}
        </button>
      );
    }
    render(<Row />);
    expect(screen.getByRole('button').textContent).toBe('Working…');

    act(() => {
      screen.getByRole('button').click();
    });

    /* The run's owner is asked once — the store's `stopRequest`, the same verb
     * the composer's *Stop* sends — and nothing stopped the chat's machine. */
    expect(stopRun).toHaveBeenCalledExactlyOnceWith('sweep');
    expect(fakeRegistry.chatReferences['bracket']?.['sweep']).toBe(actor);
    expect(actor.getSnapshot().status).toBe('active');
    expect(screen.getByRole('button').textContent).toBe('Stopped');
  });

  it('retries a failed chat through the same store', () => {
    liveProject('bracket');
    driveChat('bracket', 'arm', [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed' }]);

    function Retry(): React.JSX.Element {
      const { retryChat } = useSidebarCommands();
      return (
        <button
          type='button'
          onClick={() => {
            retryChat('arm');
          }}
        >
          Retry
        </button>
      );
    }
    render(<Retry />);
    act(() => {
      screen.getByRole('button').click();
    });
    expect(retryRun).toHaveBeenCalledExactlyOnceWith('arm');
  });
});

describe('use-sidebar-status — pin (P68): confirmed project closes finish through the registry', () => {
  it('sends the user close to the registry and confirms the captured live session', () => {
    liveProject('bracket', { runs: 2 });

    function Close(): React.JSX.Element {
      const { closeProject } = useSidebarCommands();
      return (
        <button
          type='button'
          onClick={() => {
            closeProject('bracket');
          }}
        >
          Stop and close
        </button>
      );
    }
    render(<Close />);
    act(() => {
      screen.getByRole('button').click();
    });

    expect(registrySend).toHaveBeenCalledExactlyOnceWith({ type: 'close', projectId: 'bracket', reason: 'user' });
    expect(sessionSend).toHaveBeenCalledExactlyOnceWith({ type: 'confirmClose' });
  });
});

describe('use-sidebar-status — pin (P64): sync remains a project fact', () => {
  it('leaves the chat rows of a conflicted project saying what they are doing', () => {
    liveProject('enclosure');
    const actor = driveChat('enclosure', 'one', [
      { type: 'syncState', state: 'conflicted' },
      { type: 'runLifecycle', phase: 'running' },
    ]);
    expect(chatStatusLabel(selectChatStatus(actor.getSnapshot()))).toBe('Working…');
  });
});

describe('use-sidebar-status — pin (R3/R4): the bind key carries what the row is bound to', () => {
  it('subscribes to a revision client that appears after the first bind', () => {
    liveProject('enclosure');
    function Row(): React.JSX.Element {
      const row = useProjectSidebarRow('enclosure');
      return <span>{row.detail ?? 'nothing'}</span>;
    }
    render(<Row />);
    expect(screen.getByText('nothing')).toBeTruthy();

    act(() => {
      /* The client is created by the project's route subtree, after the
       * sidebar bound this row. */
      revisions('enclosure', { sync: { state: 'queued', pendingCount: 1 } });
      notifyRegistry();
    });
    expect(screen.getByText('Not backed up · 1 revision · retrying')).toBeTruthy();
  });

  it('leaves `opening` when the registry says the project is live, with no chat spawned (W19-b)', () => {
    liveProject('enclosure', { state: 'opening' });
    function Row(): React.JSX.Element {
      const row = useProjectSidebarRow('enclosure');
      return <span>{projectRowDescription('Enclosure', row)}</span>;
    }
    render(<Row />);
    expect(screen.getByText('Enclosure, opening.')).toBeTruthy();

    act(() => {
      /* `project-session` reached `live`; the registry's own record is the only
       * thing that moved — no chat was spawned and no revision client appeared,
       * which is exactly the fresh project the principal watched sit at
       * `opening` for 25 minutes. */
      liveProject('enclosure');
      notifyRegistry();
    });
    expect(screen.getByText('Enclosure, live.')).toBeTruthy();
  });

  it('re-subscribes when a chat id is bound to a freshly spawned machine', () => {
    liveProject('bracket');
    driveChat('bracket', 'sweep', []);
    function Row(): React.JSX.Element {
      const status = useChatSidebarStatus('bracket', 'sweep');
      return <span>{status === undefined ? 'gone' : status.state}</span>;
    }
    render(<Row />);
    expect(screen.getByText('idle')).toBeTruthy();

    /* `openChat` spawns a new actor for an id it no longer holds; the ids are
     * identical across the swap, so only actor identity can catch it. */
    const replacement = driveChat('bracket', 'sweep', []);
    act(() => {
      notifyRegistry();
    });
    act(() => {
      replacement.send({ type: 'runLifecycle', phase: 'admitted' });
    });
    expect(screen.getByText('queued')).toBeTruthy();
  });
});

describe('use-sidebar-status — pin (R13): closing is visible, never silent', () => {
  it('says what it is waiting for while a project closes', () => {
    liveProject('bracket', { state: 'closing', pending: 1 });
    revisions('bracket', { sync: { state: 'pending', pendingCount: 1 } });
    expect(selectProjectRow(readProjectStatus(fakeRegistry.actor, 'bracket'), idleWindowMilliseconds).detail).toBe(
      'Backing up 1 revision, then closing…',
    );

    revisions('bracket');
    expect(selectProjectRow(readProjectStatus(fakeRegistry.actor, 'bracket'), idleWindowMilliseconds).detail).toBe(
      'Closing…',
    );
  });
});

/*
 * Pin (P66 / DEF-9) — the hooks the app ships, not the hooks jsdom renders.
 *
 * `nx test ui` runs vite in `mode === 'test'`, and `apps/ui/vite.config.ts`
 * leaves `createUiReactCompilerPlugin()` out of the plugin list in that mode, so
 * every other pin in this file renders uncompiled source. DEF-9 lives on the
 * other side of the compiler: it infers a memo's dependencies from what the
 * callback *reads*, so `useMemo(() => read(), [key, read])` loses `key` and the
 * row is computed once and frozen — live on the preview, green in jsdom.
 *
 * So this pin compiles the real module with the app's own transform
 * (`oxc-transform-react`, the one `vite:react-compiler` wraps) and renders that.
 */
const compiledHooks = await (async () => {
  const { transformSync } = await import('oxc-transform-react');
  const source = await readFile(new URL('use-sidebar-status.ts', pathToFileURL(import.meta.filename)), 'utf8');
  const compiled = transformSync('use-sidebar-status.ts', source, {
    lang: 'ts',
    reactCompiler: { target: '19' },
  });
  if (compiled.fatal || compiled.errors.length > 0) {
    throw new Error(`React Compiler refused the hook module: ${JSON.stringify(compiled.errors)}`);
  }
  if (!compiled.code.includes('react/compiler-runtime')) {
    throw new Error('The React Compiler did not compile the hook module.');
  }
  /* The mocks above are what these specifiers resolve to, so the compiled
   * module reads the same fake registry every other pin drives. */
  const modules: Record<string, unknown> = {
    react: await import('react'),
    'react/compiler-runtime': await import('react/compiler-runtime'),
    '#machines/sessions.machine.js': await import('#machines/sessions.machine.js'),
    '#services/sessions-store.js': await import('#services/sessions-store.js'),
    '#hooks/use-revision-status.js': await import('#hooks/use-revision-status.js'),
    '#hooks/use-sessions.js': await import('#hooks/use-sessions.js'),
    '#hooks/chat-session-store-provider.js': await import('#hooks/chat-session-store-provider.js'),
  };
  const linked = compiled.code
    .replaceAll(
      /^import {([^}]*)} from "([^"]+)";$/gm,
      (_match, names: string, specifier: string) =>
        `const { ${names.replaceAll(' as ', ': ')} } = __modules[${JSON.stringify(specifier)}];`,
    )
    .replaceAll(/^export /gm, '');
  // oxlint-disable-next-line no-new-func -- running the app's own compiler output is the point of this pin.
  const factory = new Function(
    '__modules',
    `${linked}\nreturn { useProjectSidebarRow, useChatSidebarStatus, useLiveNow };`,
  ) as (dependencies: Record<string, unknown>) => {
    useProjectSidebarRow: typeof useProjectSidebarRow;
    useChatSidebarStatus: typeof useChatSidebarStatus;
    useLiveNow: typeof useLiveNow;
  };
  return factory(modules);
})();

describe('use-sidebar-status — pin (P66): every row reads its value from the store, compiled (DEF-9)', () => {
  it('repaints the compiled project row, chat row and header when their own actors move', () => {
    liveProject('bracket', { state: 'opening' });
    const chat = driveChat('bracket', 'sweep', []);

    function ProjectRow(): React.JSX.Element {
      const row = compiledHooks.useProjectSidebarRow('bracket');
      return <span data-testid='project'>{row.glyph}</span>;
    }
    function ChatRow(): React.JSX.Element {
      const status = compiledHooks.useChatSidebarStatus('bracket', 'sweep');
      return <span data-testid='chat'>{status?.state ?? 'none'}</span>;
    }
    function Header(): React.JSX.Element {
      const summary = compiledHooks.useLiveNow(['bracket']);
      return <span data-testid='header'>{liveNowText(summary)}</span>;
    }

    render(
      <>
        <ProjectRow />
        <ChatRow />
        <Header />
      </>,
    );
    expect(screen.getByTestId('project').textContent).toBe('opening');
    expect(screen.getByTestId('chat').textContent).toBe('idle');
    expect(screen.getByTestId('header').textContent).toBe('1 project');

    act(() => {
      liveProject('bracket', { runs: 1 });
      notifyRegistry();
      chat.send({ type: 'runLifecycle', phase: 'admitted' });
    });

    expect(screen.getByTestId('project').textContent).toBe('busy');
    expect(screen.getByTestId('chat').textContent).toBe('queued');
    expect(screen.getByTestId('header').textContent).toBe('1 project · 1 agent');
  });
});
