// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Chat } from '@taucad/chat';
import type { RevisionStatusProjection } from '@taucad/revisions';
import type { ProjectListItem } from '#types/project.types.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ChatSessionActorRef, ChatSessionMachineEvent } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef, ProjectSessionCloseReason } from '#machines/project-session.machine.js';
import type { SessionsActorRef, SessionsProjectStatus } from '#machines/sessions.machine.js';

import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { peekRevisionClient } from '#hooks/use-revision-status.js';
import { useSessions } from '#hooks/use-sessions.js';
import {
  chatStatusLabel,
  readProjectStatus,
  selectChatFacts,
  selectChatStatus,
  selectProjectFacts,
  selectProjectRow,
  useChatSidebarStatus,
  useProjectSidebarRow,
  useSidebarCommands,
} from '#hooks/use-sidebar-status.js';
import type { ProjectSidebarRow, useLiveNow } from '#hooks/use-sidebar-status.js';
import { toSnapshotCallback } from '#lib/xstate-test.utils.js';
import type { SnapshotListener } from '#lib/xstate-test.utils.js';

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
    updateChatName: vi.fn(),
    deleteChat: vi.fn(),
  }),
}));
vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [sidebarProject],
    isLoading: false,
    error: undefined,
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
  TooltipProvider: ({ children }: { readonly children: ReactNode }): ReactNode => children,
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
  /** What the session recorded about a region that did not come up (R4). */
  failures: Record<string, Record<string, string>>;
  registryListeners: Set<(snapshot?: unknown) => void>;
  sessionListeners: Set<(snapshot?: unknown) => void>;
};

/** The registry, the session and the revision clients, as thin as the hooks read them. */
const fakeRegistry: FakeRegistry = {
  actor: undefined as unknown as SessionsActorRef,
  revisionClients: new Map(),
  refs: {},
  status: {},
  closed: {},
  chatReferences: {},
  failures: {},
  registryListeners: new Set(),
  sessionListeners: new Set(),
};

const sessionRefFor = (projectId: string): ProjectSessionActorRef =>
  ({
    getSnapshot: () => ({
      context: {
        chatRefs: fakeRegistry.chatReferences[projectId] ?? {},
        failures: fakeRegistry.failures[projectId] ?? {},
      },
    }),
    send: sessionSend,
    subscribe: (listener: SnapshotListener<unknown>) => {
      const callback = toSnapshotCallback(listener);
      fakeRegistry.sessionListeners.add(callback);
      return {
        unsubscribe: () => {
          fakeRegistry.sessionListeners.delete(callback);
        },
      };
    },
  }) as unknown as ProjectSessionActorRef;

const resetRegistry = (): void => {
  fakeRegistry.refs = {};
  fakeRegistry.status = {};
  fakeRegistry.closed = {};
  fakeRegistry.chatReferences = {};
  fakeRegistry.failures = {};
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
    subscribe: (listener: SnapshotListener<unknown>) => {
      const callback = toSnapshotCallback(listener);
      fakeRegistry.registryListeners.add(callback);
      return {
        unsubscribe: () => {
          fakeRegistry.registryListeners.delete(callback);
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
const acquireSession = vi.fn(() => ({}));
const releaseSession = vi.fn();

beforeEach(() => {
  resetRegistry();
  stopRun.mockReset();
  acquireSession.mockClear();
  releaseSession.mockClear();
  registrySend.mockReset();
  sessionSend.mockReset();
  /* `ProjectChatItem` acquires a chat session on mount (`useChatSession`), so
   * the store mock owes the two verbs that acquisition uses. */
  vi.mocked(useChatSessionStore).mockReturnValue({
    stopRun,
    acquire: acquireSession,
    release: releaseSession,
  } as unknown as ReturnType<typeof useChatSessionStore>);
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
  readonly mark: string;
  readonly sentence: string | undefined;
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
    mark: 'none',
    sentence: undefined,
  },
  {
    signal: 'run.lifecycle: admitted',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'admitted' }],
    state: 'queued',
    label: 'Queued',
    mark: 'running',
    sentence: 'Queued',
  },
  {
    signal: 'run.lifecycle: running, no tool in flight',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'running' }],
    state: 'working',
    label: 'Working…',
    mark: 'running',
    sentence: 'Working…',
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
    mark: 'running',
    sentence: 'Running geospec_check',
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
    mark: 'attention',
    sentence: 'Needs your approval · 1',
  },
  {
    signal: 'model asked a question and stopped',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'paused' }],
    state: 'question',
    label: 'Waiting for you',
    mark: 'attention',
    sentence: 'Waiting for you',
  },
  {
    signal: 'durableRunState reattaching',
    target: 'chat',
    events: [{ type: 'durableRunState', state: 'reattaching' }],
    state: 'reconnecting',
    label: 'Reconnecting…',
    mark: 'running',
    sentence: 'Reconnecting…',
  },
  {
    signal: 'run.lifecycle: completed, chat not focused',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'completed' }],
    state: 'finishing',
    label: 'Finishing…',
    mark: 'running',
    sentence: 'Finishing…',
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
    mark: 'unread',
    sentence: 'Finished while you were away',
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
    mark: 'none',
    sentence: undefined,
  },
  {
    /* W8 (D9): after a reload the run is idle, and the unread record is what
     * says a turn finished unseen; the store restores it into the machine. */
    signal: 'unreadRestored after a reload, chat not focused',
    target: 'chat',
    events: [{ type: 'unreadRestored' }],
    state: 'idle',
    label: undefined,
    mark: 'unread',
    sentence: 'Finished while you were away',
  },
  {
    signal: 'run.lifecycle: failed',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed while meshing' }],
    state: 'failed',
    label: 'Failed · kernel crashed while meshing',
    mark: 'failed',
    sentence: 'Failed · kernel crashed while meshing',
  },
  {
    signal: 'run.lifecycle: cancelled',
    target: 'chat',
    events: [{ type: 'runLifecycle', phase: 'cancelled' }],
    state: 'stopped',
    label: 'Stopped',
    mark: 'none',
    sentence: 'Stopped',
  },
  {
    signal: 'turn.finalized on a branch',
    target: 'chat',
    events: [{ type: 'turnFinalized', branch: 'arm-fillet' }],
    state: 'idle',
    label: undefined,
    mark: 'none',
    sentence: undefined,
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
    mark: 'none',
    sentence: undefined,
  },
  {
    signal: 'sync.machine queued',
    target: 'project',
    events: [],
    label: undefined,
    mark: 'none',
    sentence: 'Live',
    revision: { sync: { state: 'queued', pendingCount: 1 } },
  },
  {
    signal: 'sync.machine conflicted',
    target: 'project',
    events: [],
    label: undefined,
    mark: 'attention',
    sentence: 'Live · 1 needs you · needs resolution',
    revision: { sync: { state: 'conflicted', pendingCount: 0 } },
    conflictedChats: 3,
    attention: 1,
  },
  {
    signal: 'sync.machine pending (ordinary project row)',
    target: 'project',
    events: [],
    label: undefined,
    mark: 'none',
    sentence: 'Live',
    revision: { sync: { state: 'pending', pendingCount: 2 } },
  },
];

describe('use-sidebar-status — pin (a): every agent-state row renders from a driven machine (V22)', () => {
  it.each(agentStateRows)(
    '$signal',
    ({ target, events, state, label, mark, sentence, revision, conflictedChats, attention }) => {
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
      /* D1: the sentence is the link's description, or there is none. */
      expect(descriptionId === null ? undefined : document.querySelector(`#${descriptionId}`)?.textContent).toBe(
        sentence,
      );

      const renderedRow = link.closest<HTMLElement>(`[data-slot=${target}-trigger]`);
      /* D2: one mark per row; the chat's leading column renders even when plain. */
      const marks = Array.from(
        renderedRow?.querySelectorAll<HTMLElement>('[data-glyph]') ?? [],
        (glyph) => glyph.dataset['glyph'],
      );
      expect(marks).toEqual(target === 'chat' || mark !== 'none' ? [mark] : []);
      /* D4: branch, dirty and backup left the sidebar. */
      expect(renderedRow?.querySelector('[data-slot=branch-chip], [data-slot=dirty-pip]')).toBeNull();
      /* D15: the name dissolves; it never clips at an ellipsis. */
      expect(link.querySelector('.fade-label')?.textContent).toBe(accessibleName);
      expect(link.querySelector('.truncate')).toBeNull();
    },
  );

  it('carries a failed run its reason', () => {
    const actor = driveChat('bracket', 'arm', [
      { type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed while meshing' },
    ]);
    expect(chatStatusLabel(selectChatStatus(actor.getSnapshot()))).toBe('Failed · kernel crashed while meshing');
  });

  /* D16: the count hangs off the disc; the disc keeps the slot's centre. */
  it('hangs the needs-you count off a centred disc', () => {
    liveProject(sidebarProject.id);
    driveChat(sidebarProject.id, sidebarChat.id, [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested', count: 12 },
    ]);
    render(<ProjectChatList project={sidebarProject} isProjectActive={false} />);
    const slot = document.querySelector<HTMLElement>('[data-slot=chat-status]');
    expect(slot?.className).toContain('justify-center');
    expect(slot?.querySelector('.absolute')?.textContent).toBe('9+');
  });
});

describe('use-sidebar-status — pin (d): the project row rolls up its chats (A36, v2 D3, D11)', () => {
  const rowOf = (projectId: string): ProjectSidebarRow =>
    selectProjectRow(readProjectStatus(fakeRegistry.actor, projectId), idleWindowMilliseconds);
  const collapsed = (projectId: string) => selectProjectFacts(rowOf(projectId), false);
  const expanded = (projectId: string) => selectProjectFacts(rowOf(projectId), true);

  it('rolls up a running chat while collapsed, and hands it to the chat once expanded', () => {
    liveProject('bracket');
    driveChat('bracket', 'idle-chat', []);
    driveChat('bracket', 'busy-chat', [{ type: 'runLifecycle', phase: 'running' }]);
    expect(rowOf('bracket').glyph).toBe('busy');
    expect(collapsed('bracket')).toEqual({ mark: 'running', sentence: 'Live, busy · 1 agent working' });
    expect(expanded('bracket')).toEqual({ mark: 'none', sentence: 'Live, busy' });
  });

  /* R4: a live project whose kernel was refused says so on the row, with the
   * reason the refusal carried — the sentence is the only channel a screen
   * reader has, because every mark glyph is `aria-hidden`. */
  it('marks a live project failed when its runtime was refused, naming the reason', () => {
    liveProject('bracket');
    fakeRegistry.failures['bracket'] = {
      runtime:
        'Electron main refused the tau:runtime:port request: registerElectronRuntimeMain: refusing to exceed 64 utility processes',
    };

    expect(rowOf('bracket').runtimeFailure).toContain('refusing to exceed 64 utility processes');
    expect(collapsed('bracket')).toEqual({
      mark: 'failed',
      sentence: 'Live · Kernel refused · refusing to exceed 64 utility processes',
    });
    expect(expanded('bracket').mark).toBe('failed');
  });

  /* V2-4: a turn in flight keeps its spinner — it is still doing something,
   * kernel or no kernel — and the row says both things. */
  it('leaves a running chat its mark and still names the refusal', () => {
    liveProject('bracket');
    driveChat('bracket', 'busy-chat', [{ type: 'runLifecycle', phase: 'running' }]);
    fakeRegistry.failures['bracket'] = {
      runtime: 'Electron main refused the tau:runtime:port request: refusing to exceed 64 utility processes',
    };

    expect(collapsed('bracket')).toEqual({
      mark: 'running',
      sentence: 'Live, busy · 1 agent working · Kernel refused · refusing to exceed 64 utility processes',
    });
  });

  /* V2-2: only the broker's refusal is called a refusal. Anything else that
   * stops a kernel is unavailable, and its message is said whole, because
   * nothing here knows which of its clauses is the subject. */
  it('calls a kernel that failed for any other reason unavailable, message intact', () => {
    liveProject('bracket');
    fakeRegistry.failures['bracket'] = { runtime: 'Kernel boot failed: ENOENT: no such file or directory, open /x' };

    expect(collapsed('bracket')).toEqual({
      mark: 'failed',
      sentence: 'Live · Kernel unavailable · Kernel boot failed: ENOENT: no such file or directory, open /x',
    });
  });

  it('names the same reason when the refusal beat the session to `live`', () => {
    liveProject('bracket', { state: 'failed' });
    fakeRegistry.failures['bracket'] = {
      runtime: 'Electron main refused the tau:runtime:port request: refusing to exceed 64 utility processes',
    };

    expect(collapsed('bracket')).toEqual({
      mark: 'failed',
      sentence: 'Kernel refused · refusing to exceed 64 utility processes',
    });
  });

  it('lifts the amber count from the chats that need a person', () => {
    liveProject('bracket');
    driveChat('bracket', 'one', [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested', count: 1 },
    ]);
    driveChat('bracket', 'two', [{ type: 'runLifecycle', phase: 'paused' }]);
    expect(rowOf('bracket').attention).toBe(2);
    expect(collapsed('bracket')).toEqual({ mark: 'attention', count: 2, sentence: 'Live · 2 need you' });
  });

  it('ranks needs-you over failed over running over finished', () => {
    liveProject('bracket');
    driveChat('bracket', 'done', [
      { type: 'runLifecycle', phase: 'completed' },
      { type: 'turnFinalizedObserved', branch: 'main' },
    ]);
    expect(collapsed('bracket').mark).toBe('unread');
    driveChat('bracket', 'running', [{ type: 'runLifecycle', phase: 'running' }]);
    expect(collapsed('bracket').mark).toBe('running');
    driveChat('bracket', 'failed', [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed' }]);
    expect(collapsed('bracket').mark).toBe('failed');
    driveChat('bracket', 'asking', [{ type: 'runLifecycle', phase: 'paused' }]);
    expect(collapsed('bracket').mark).toBe('attention');
  });

  /* D11: a failed chat is the chat's mark; the project fails only when its
   * session does, and that shows whether or not it is expanded. */
  it('never turns a failed chat into a failed session', () => {
    liveProject('bracket');
    const actor = driveChat('bracket', 'arm', [{ type: 'runLifecycle', phase: 'failed', reason: 'kernel crashed' }]);
    expect(rowOf('bracket').glyph).toBe('idle');
    expect(collapsed('bracket')).toEqual({ mark: 'failed', sentence: 'Live · 1 chat failed' });
    expect(expanded('bracket')).toEqual({ mark: 'none', sentence: 'Live' });
    /* P57: looking at the chat quiets the rollup. */
    actor.send({ type: 'viewed' });
    expect(collapsed('bracket')).toEqual({ mark: 'none', sentence: 'Live' });

    liveProject('gearbox', { state: 'failed' });
    expect(rowOf('gearbox').glyph).toBe('failed');
    expect(expanded('gearbox')).toEqual({ mark: 'failed', sentence: 'Failed to open' });
  });

  it('says whether every project is live (D12)', () => {
    liveProject('bracket', { state: 'opening' });
    expect(collapsed('bracket')).toEqual({ mark: 'running', sentence: 'Opening…' });
    liveProject('bracket');
    expect(collapsed('bracket')).toEqual({ mark: 'none', sentence: 'Live' });
    closeProject('bracket', 'user');
    expect(collapsed('bracket')).toEqual({ mark: 'none', sentence: 'Closed' });
  });

  it('names a policy close on the row and says nothing more about a user close', () => {
    closeProject('enclosure', 'idle');
    expect(rowOf('enclosure').detail).toBe('Closed to save memory · 30 min idle');
    expect(collapsed('enclosure').sentence).toBe('Closed to save memory · 30 min idle');
    closeProject('gearbox', 'budget');
    expect(rowOf('gearbox').detail).toBe('Closed · memory budget · reopen any time');
    closeProject('quadcopter', 'user');
    expect(rowOf('quadcopter').detail).toBeUndefined();
  });

  it('keeps backup state out of the sidebar (D4)', () => {
    liveProject('enclosure');
    revisions('enclosure', { branch: 'lid', dirty: true, sync: { state: 'failed', pendingCount: 2, error: 'quota' } });
    expect(rowOf('enclosure').detail).toBeUndefined();
    expect(collapsed('enclosure')).toEqual({ mark: 'none', sentence: 'Live' });
  });

  it('names the chat facts the row draws', () => {
    const facts = (events: readonly ChatSessionMachineEvent[]) =>
      selectChatFacts(selectChatStatus(driveChat('bracket', 'probe', events).getSnapshot()));
    expect(facts([{ type: 'runLifecycle', phase: 'paused' }])).toEqual({
      mark: 'attention',
      sentence: 'Waiting for you',
    });
    expect(facts([])).toEqual({ mark: 'none', sentence: undefined });
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
      return <span>{selectProjectFacts(row, false).sentence}</span>;
    }
    render(<Row />);
    expect(screen.getByText('Live')).toBeTruthy();

    act(() => {
      /* The client is created by the project's route subtree, after the
       * sidebar bound this row. A conflict is the one sync fact it keeps. */
      revisions('enclosure', { sync: { state: 'conflicted', pendingCount: 0 } });
      notifyRegistry();
    });
    expect(screen.getByText('Live · 1 needs you · needs resolution')).toBeTruthy();
  });

  it('leaves `opening` when the registry says the project is live, with no chat spawned (W19-b)', () => {
    liveProject('enclosure', { state: 'opening' });
    function Row(): React.JSX.Element {
      const row = useProjectSidebarRow('enclosure');
      return <span>{selectProjectFacts(row, false).sentence}</span>;
    }
    render(<Row />);
    expect(screen.getByText('Opening…')).toBeTruthy();

    act(() => {
      /* `project-session` reached `live`; the registry's own record is the only
       * thing that moved — no chat was spawned and no revision client appeared,
       * which is exactly the fresh project the principal watched sit at
       * `opening` for 25 minutes. */
      liveProject('enclosure');
      notifyRegistry();
    });
    expect(screen.getByText('Live')).toBeTruthy();
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
  const compiled = transformSync('use-sidebar-status.ts', source, { lang: 'ts', reactCompiler: { target: '19' } });
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
    '#lib/xstate.lib.js': await import('#lib/xstate.lib.js'),
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
      const summary = compiledHooks.useLiveNow();
      return (
        <span data-testid='header'>{`${String(summary.projects)} live · ${summary.idleProjectIds.join(',')}`}</span>
      );
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
    expect(screen.getByTestId('header').textContent).toBe('1 live · bracket');

    act(() => {
      liveProject('bracket', { runs: 1 });
      liveProject('gearbox');
      notifyRegistry();
      chat.send({ type: 'runLifecycle', phase: 'admitted' });
    });

    expect(screen.getByTestId('project').textContent).toBe('busy');
    expect(screen.getByTestId('chat').textContent).toBe('queued');
    expect(screen.getByTestId('header').textContent).toBe('2 live · gearbox');
  });
});
