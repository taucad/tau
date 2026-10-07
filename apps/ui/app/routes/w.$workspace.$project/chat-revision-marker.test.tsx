import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceFileService, ProviderRegistry, MountTable, ResourceQueue, ChangeEventBus } from '@taucad/filesystem';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { createProjectRevisionsActor } from '@taucad/revisions/revision-effects';
import type { RevisionFileSystem } from '@taucad/revisions/revision-effects';
import { createTurnPlacementPort } from '@taucad/revisions/turn-placement';
import { createTauAgentHost } from '@taucad/agent-host';
import { createProviderEventLog } from '@taucad/agent-host/browser';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import { useRevisionCards, useRevisionChanges, useRevisions, useTurnRevision } from '#hooks/use-revisions.js';
import type { RevisionCard, RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { requestRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

const chatState = vi.hoisted(() => ({
  messagesById: new Map<string, { role: string }>([
    ['u1', { role: 'user' }],
    ['a1', { role: 'assistant' }],
  ]),
  status: 'ready' as string,
  error: undefined as Error | undefined,
  persistedError: undefined as unknown,
  attachmentStatus: 'unknown' as 'unknown' | 'attached',
}));
const continueChat = vi.hoisted(() => vi.fn());
const openPanel = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
/* The chat's projection of its log, as the store serves it (PV-S9). */
const chatLog = vi.hoisted(() => ({ projection: undefined as unknown, listeners: new Set<() => void>() }));
const revisionListeners = vi.hoisted(() => new Set<() => void>());

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat-1' }),
  useChatSelector: (selector: (state: typeof chatState & { projection: unknown }) => unknown) =>
    selector({ ...chatState, projection: chatLog.projection }),
  useChatActions: () => ({ continueChat }),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revisions.js', () => ({
  useRevisionChangesSince: vi.fn(),
  useRevisionsOnLine: vi.fn(),
  useWithRestoreTargets: vi.fn(),
  revisionPageSize: 50,
  actorOf: vi.fn(),
  useRevisions: vi.fn(),
  useRevisionCards: vi.fn(),
  useTurnRevision: vi.fn(),
  useRevisionChanges: vi.fn(),
  useRevisionFileComparison: vi.fn(),
}));
vi.mock('#hooks/use-restore-to-point.js', () => ({ useRestoreToPoint: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void): (() => void) => {
    revisionListeners.add(listener);
    return () => revisionListeners.delete(listener);
  };
  const read = (): typeof harness.revisionStatusHarness.status | undefined =>
    harness.revisionStatusHarness.connected ? harness.revisionStatusHarness.status : undefined;
  return { ...harness.revisionStatusMock(), useRevisionStatus: () => useSyncExternalStore(subscribe, read, read) };
});
vi.mock('#hooks/use-sidebar-status.js', () => ({
  useChatSidebarStatus: vi.fn(),
  useProjectSidebarRow: vi.fn(),
  useLiveNow: vi.fn(),
  useSidebarCommands: vi.fn(),
  selectChatStatus: vi.fn(),
  selectProjectedChatStatus: vi.fn(),
  chatStatusLabel: vi.fn(),
  selectChatFacts: vi.fn(),
  chatFailedUnread: vi.fn(),
  selectProjectRow: vi.fn(),
  selectProjectFacts: vi.fn(),
  readProjectStatus: vi.fn(),
  pluralize: (count: number, noun: string) => `${String(count)} ${noun}${count === 1 ? '' : 's'}`,
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    getProjection: () => chatLog.projection,
    subscribeProjection: (_chatId: string, listener: () => void) => {
      chatLog.listeners.add(listener);
      return () => chatLog.listeners.delete(listener);
    },
  }),
}));
vi.mock('#routes/w.$workspace.$project/revision-reveal.js', () => ({
  requestRevisionReveal: vi.fn(),
  consumeRevisionReveal: vi.fn(),
  useRevisionReveal: vi.fn(),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));
vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

const revision = (over: Partial<RevisionCard> = {}): RevisionCard => ({
  revisionId: 'rev-5',
  n: 5,
  createdAt: 200,
  summary: 'Wider mounting holes',
  actor: 'tau-browser-agent-host',
  turnId: 'u1',
  conflicted: false,
  trigger: 'turn',
  ...over,
});

/** The chat's log, read to its end, as the store's projection holds it. */
const setLog = (rows: readonly unknown[]): void => {
  chatLog.projection = reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: { status: 'batch', cursor: 0, nextCursor: rows.length, endCursor: rows.length, events: rows },
  }).state;
  act(() => {
    for (const listener of chatLog.listeners) {
      listener();
    }
  });
};

/** Turn `u1`'s run, admitted and running on the base its placement names. */
const placed = (baseRevisionId = 'rev-4'): unknown[] => [
  lifecycleRow(0, 'admitted'),
  logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Wider holes' } }),
  logRow(2, {
    type: 'run.lifecycle',
    state: 'running',
    attempt: 1,
    placement: { checkoutId: 'live', mode: 'direct', baseRevisionId },
  }),
];

const changed = (): unknown[] => [
  ...placed(),
  logRow(3, {
    type: 'turn.changed',
    turnId: 'u1',
    chatId: 'chat-1',
    attempt: 1,
    checkoutId: 'live',
  }),
];
const saved = (): unknown[] => [...changed(), lifecycleRow(4, 'completed'), settlementRow(5, { revisionId: 'rev-5' })];

const settlementRow = (sequence: number, fields: Readonly<Record<string, unknown>>): unknown =>
  logRow(sequence, {
    type: 'turn.finalized',
    turnId: 'u1',
    chatId: 'chat-1',
    projectId: 'p',
    changedPaths: [],
    trigger: 'turn',
    runIds: ['run_1'],
    attempt: 1,
    ...fields,
  });

const setRevisions = (view: Partial<RevisionsView>): void => {
  const byTurnId = view.byTurnId ?? new Map<string, RevisionCard>();
  vi.mocked(useRevisions).mockReturnValue({
    revisions: view.revisions ?? [],
    hasOlder: false,
    loadOlder: async () => undefined,
    byTurnId,
    headRevisionId: view.headRevisionId,
    line: view.line ?? { kind: 'branch', name: 'main' },
    isDirty: false,
    isLoading: false,
  });
  /* The turn's own lookup, which the real hook answers from the page or by the settled id (B2). */
  vi.mocked(useTurnRevision).mockImplementation((turnId) => byTurnId.get(turnId));
};

const setRun = (state: ChatSidebarStatus['state'] | undefined): void => {
  vi.mocked(useChatSidebarStatus).mockReturnValue(
    state === undefined ? undefined : ({ state } as unknown as ChatSidebarStatus),
  );
};

/** Publish the scripted revision projection through the same subscription the marker reads. */
const refreshRevisionStatus = (): void => {
  act(() => {
    for (const listener of revisionListeners) {
      listener();
    }
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  revisionStatusHarness.reset();
  revisionListeners.clear();
  revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4', dirty: true };
  chatState.status = 'ready';
  chatState.error = undefined;
  chatState.persistedError = undefined;
  chatState.attachmentStatus = 'unknown';
  chatLog.projection = undefined;
  chatLog.listeners.clear();
  setRun(undefined);
  setRevisions({});
  vi.mocked(useRevisionCards).mockReturnValue(new Map());
  vi.mocked(useRevisionChanges).mockReturnValue([
    { path: 'bracket.scad', kind: 'modified' },
    { path: '.tau/parameters/bracket.scad.json', kind: 'modified' },
  ]);
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore,
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
});

describe('ChatRevisionMarker', () => {
  it.skipIf(!navigator.locks)(
    'should render from real filesystem authority through the placement stream and durable host log',
    async () => {
      const registry = new ProviderRegistry();
      const scope = { backend: 'memory', storageRootKey: 'memory:marker-integration' } as const;
      const mounts = new MountTable();
      mounts.mount('/', await registry.getProvider(scope), { class: 'authored', ...scope });
      const service = new WorkspaceFileService({
        providerRegistry: registry,
        mountTable: mounts,
        resourceQueue: new ResourceQueue(),
        eventBus: new ChangeEventBus(),
      });
      const filesystem = service.createRootedFileSystem('/');
      await filesystem.writeFile('main.ts', 'before');
      const port = createIsomorphicGitRevisionPort({
        filesystem,
        checkouts: { projectId: 'project-1', root: () => filesystem },
      });
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const revisions = createProjectRevisionsActor({ port, projectId: 'project-1', filesystem: () => filesystem });
      revisions.actor.start();
      const toolsReady = Promise.withResolvers<RevisionFileSystem>();
      const running = Promise.withResolvers<void>();
      const finish = Promise.withResolvers<void>();
      const placement = createTurnPlacementPort({
        revisions,
        openTools: ({ filesystem: view }) => {
          toolsReady.resolve(view);
          return { list: () => [], invoke: async () => ({ content: null, isError: false }) };
        },
      });
      const host = createTauAgentHost({
        systemPrompt: '',
        toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
        placement,
        modelTransport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('No model call expected');
          },
        },
        openEventLog: async () =>
          createProviderEventLog({
            fileSystem: filesystem,
            filePath: '.tau/chats/chat-1/events.jsonl',
            access: 'write',
          }),
        externalRunners: {
          acp: {
            list: () => ['stub'],
            run: async () => {
              running.resolve();
              await finish.promise;
              return undefined;
            },
          },
        },
      });
      const refresh = async (): Promise<void> => {
        const answer = await host.read({ chatId: 'chat-1', cursor: 0, limit: 1000, maxBytes: 1_048_576 });
        if (answer.status !== 'batch') {
          throw new Error('Expected durable log batch');
        }
        setLog(answer.events);
      };
      vi.mocked(useRevisionCards).mockImplementation(
        (ids) => new Map(ids.map((id) => [id, revision({ revisionId: id, n: 2, turnId: undefined })])),
      );
      const mounted = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
      try {
        await host.admit({
          chatId: 'chat-1',
          runId: 'run_1',
          trigger: 'submit',
          message: { id: 'u1', role: 'user', content: 'Change the file' },
          config: { systemPrompt: '', toolChoice: 'none', agent: { kind: 'acp', id: 'stub' } },
        });
        await running.promise;
        const view = await toolsReady.promise;
        await refresh();
        expect(mounted.container.firstChild).toBeNull();
        await view.writeFile('main.ts', 'before');
        await view.writeFile('.tau/cache/report.json', '{}');
        await filesystem.writeFile('foreign.ts', 'manual');
        await refresh();
        expect(mounted.container.firstChild).toBeNull();
        await view.writeFile('main.ts', 'after');
        await vi.waitFor(async () => {
          await refresh();
          expect(screen.getByRole('status').textContent).toBe('Starting from Rev 2');
        });
        mounted.unmount();
        const restored = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
        expect(screen.getByRole('status').textContent).toBe('Starting from Rev 2');
        restored.unmount();
        finish.resolve();
      } finally {
        finish.resolve();
        mounted.unmount();
        await host.close();
        await placement.fence();
        revisions.actor.stop();
        await revisions.settled();
        service.dispose();
      }
    },
  );

  it('should appear only after the placed checkout changes files', () => {
    setLog(placed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: false };
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true };
    refreshRevisionStatus();
    expect(container.firstChild).toBeNull();
    setLog(changed());
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 4');

    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: false, headRevisionId: 'rev-5' };
    setLog([...changed(), lifecycleRow(4, 'completed')]);
    expect(screen.getByRole('status').textContent).toBe('Saving revision');
    setRevisions({ revisions: [revision()] });
    setLog([...changed(), lifecycleRow(4, 'completed'), settlementRow(5, { revisionId: 'rev-5' })]);
    expect(screen.getByRole('status').textContent).toBe('Rev 5 saved');
  });

  it('should keep a no-change request hidden through completion and settlement', () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: false };
    setLog(placed());
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
    setLog([...placed(), lifecycleRow(3, 'completed')]);
    expect(container.firstChild).toBeNull();
    setLog([...placed(), lifecycleRow(3, 'completed'), settlementRow(5, {})]);
    expect(container.firstChild).toBeNull();
  });

  it('should not attribute another checkout or pre-turn edits to the request', () => {
    setLog(placed());
    revisionStatusHarness.status = { ...revisionStatusHarness.status, checkoutId: 'other', dirty: true };
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, checkoutId: 'live', headRevisionId: 'rev-3' };
    refreshRevisionStatus();
    expect(container.firstChild).toBeNull();
    revisionStatusHarness.connected = false;
    refreshRevisionStatus();
    expect(container.firstChild).toBeNull();
  });

  it('should not attach the latest checkout changes to an earlier request', () => {
    setLog(placed());
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing for a turn not anchored by a user message', () => {
    setRevisions({ byTurnId: new Map([['a1', revision({ turnId: 'a1' })]]) });
    const { container } = render(<ChatRevisionMarker userMessageId='a1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when the host confirms the request changed no files', () => {
    setLog([...placed(), lifecycleRow(3, 'completed'), settlementRow(5, {})]);
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should keep a saved revision compact until its changes are requested', () => {
    setLog(saved());
    setRevisions({ revisions: [revision()], byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-9' });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);

    /* The live region holds the lifecycle only; the file count arrives after
       the diff and must not be a second announcement (C46). */
    expect(screen.getByRole('status').textContent).toBe('Rev 5 saved');
    expect(screen.getByLabelText('Turn revision').textContent).toContain('Rev 5 saved · 2 files');
    /* The whole header is the disclosure; no separate Details button (R11). */
    const toggle = screen.getByRole('button', { name: 'Rev 5 saved · 2 files · revision details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Files · 2')).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Details|View changes)$/ })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    /* Rounds 14 and 18: History's actions row — View revision, then More and Details. */
    const actions = document.querySelector<HTMLElement>('[data-slot="marker-actions"]')!;
    fireEvent.click(within(actions).getByRole('button', { name: 'View revision' }));
    expect(requestRevisionReveal).toHaveBeenCalledWith('p', 'rev-5');
    expect(openPanel).toHaveBeenCalledWith('revisions');
    expect(within(actions).getByRole('button', { name: 'More actions for Rev 5' })).not.toBeNull();
    fireEvent.click(within(actions).getByRole('button', { name: 'Details' }));
    const details = document.querySelector('dl[aria-label="Details for Rev 5"]');
    expect(details?.textContent).toContain('rev-5');
    expect(details?.textContent).toContain('main');
    /* Restore is History's; the chat reaches it by View revision. */
    expect(screen.queryByRole('button', { name: /Restore/u })).toBeNull();
  });

  it('should reach History’s More from the chat: naming and a new branch (round 14)', async () => {
    const user = userEvent.setup();
    setLog(saved());
    setRevisions({ revisions: [revision()], byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-9' });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    await user.click(screen.getByRole('button', { name: /revision details$/u }));
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 5' }));

    expect(screen.getByRole('menuitem', { name: 'Name version…' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'New branch from Rev 5…' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Copy revision id' })).not.toBeNull();
  });

  it('should draw the trigger’s glyph family, a failed turn in the alert purple (HQ5)', () => {
    setLog(saved());
    setRevisions({ revisions: [revision()], byTurnId: new Map([['u1', revision()]]) });
    const { unmount } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(document.querySelector('[data-slot="marker-glyph"]')?.getAttribute('class')).toContain('lucide-history');
    unmount();

    setLog(changed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    chatState.persistedError = { category: 'generic', title: 'Error', message: 'Network error', code: 'ERR' };
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    const glyph = document.querySelector('[data-slot="marker-glyph"]')?.getAttribute('class') ?? '';
    expect(glyph).toContain('lucide-circle-alert');
    expect(glyph).toContain('text-feature');
    expect(glyph).not.toContain('text-destructive');
  });

  it('should say the saved revision is still on its way to Tau Cloud (round 21)', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
      sync: { ...revisionStatusHarness.status.sync, state: 'pending', pendingCount: 1 },
    };
    setLog(saved());
    setRevisions({ revisions: [revision()], byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-5' });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    fireEvent.click(screen.getByRole('button', { name: /revision details$/u }));
    expect(screen.getByText('Backing up to Tau Cloud…')).not.toBeNull();
  });

  it('should link an earlier saved request to its revision in Revisions', () => {
    setLog(saved());
    setRevisions({ revisions: [revision()], byTurnId: new Map([['u1', revision()]]) });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'View revision' }));
    /* Keyed by project: one document can hold two panes (C47). */
    expect(requestRevisionReveal).toHaveBeenCalledWith('p', 'rev-5');
    expect(openPanel).toHaveBeenCalledWith('revisions');
  });

  it('should show the confirmed starting revision while work runs', () => {
    setLog(changed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Starting from Rev 4');
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  /* B2: the base a turn started from can sit below History's loaded page; it is read on its own. */
  it('should name a starting revision older than the loaded page, read by its id', () => {
    setLog(changed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-60', n: 60, turnId: undefined })] });
    vi.mocked(useRevisionCards).mockImplementation((ids) =>
      ids.includes('rev-4')
        ? new Map([['rev-4', revision({ revisionId: 'rev-4', n: 4, turnId: undefined })]])
        : new Map(),
    );
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 4');
    expect(vi.mocked(useRevisionCards)).toHaveBeenCalledWith(['rev-4']);
  });

  it('should not read the turn base as a save while work runs', () => {
    /* A turn that starts dirty mints its base under its own turn id (D17), so
       the graph attaches a card to a turn that has saved nothing yet — on a new
       project that card is the scaffold, minted as Rev 1. */
    setLog(placed('rev-1'));
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-1', dirty: false };
    setRevisions({
      revisions: [revision({ revisionId: 'rev-1', n: 1, turnId: 'u1' })],
      byTurnId: new Map([['u1', revision({ revisionId: 'rev-1', n: 1 })]]),
    });
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should hold the last known label while the stream reconnects', () => {
    setLog([
      ...changed(),
      logRow(4, { type: 'interrupt.recorded', interruptId: 'i1', phase: 'requested', reason: 'approval' }),
    ]);
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    const { rerender } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 4 · Waiting for you');

    setRun('reconnecting');
    /* A replay after the reconnect has not reached the interrupt yet. */
    setLog([
      ...changed(),
      logRow(4, { type: 'interrupt.recorded', interruptId: 'i1', phase: 'requested', reason: 'approval' }),
    ]);
    rerender(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 4 · Waiting for you');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  /* PV-A7, V5 B1: a finished run whose settlement row is late. */
  it('should show saving until the settlement row, then the saved revision', () => {
    setRevisions({ revisions: [revision()] });
    setLog([...changed(), lifecycleRow(4, 'completed')]);
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Saving revision');
    expect(screen.queryByText(/Finishing/u)).toBeNull();

    setLog([...changed(), lifecycleRow(4, 'completed'), settlementRow(5, { revisionId: 'rev-5' })]);
    expect(screen.getByRole('status').textContent).toBe('Rev 5 saved');
  });

  /* PV-A20, V5 B2: a Stop after the agent changed files settles with its revision. */
  it('shows an interrupted save for a stopped attempt', () => {
    setRevisions({ revisions: [revision()] });
    setLog([...changed(), lifecycleRow(4, 'cancelled'), settlementRow(5, { revisionId: 'rev-5' })]);
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Rev 5 saved · Work interrupted');
  });

  it('should hide a never-run attempt’s base before and after the card arrives', () => {
    setLog([
      ...placed(),
      lifecycleRow(3, 'cancelled'),
      logRow(4, {
        type: 'turn.failed',
        turnId: 'u1',
        chatId: 'chat-1',
        attempt: 1,
        reason: 'Stopped before it started',
        revisionId: 'rev-5',
      }),
    ]);
    const { container, rerender } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
    setRevisions({ revisions: [revision()] });
    rerender(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should reset pending visibility on retry and restore change proof after remount', () => {
    setLog(changed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    const mounted = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 4');
    mounted.unmount();
    const retry = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status')).not.toBeNull();
    setLog([
      ...changed(),
      logRow(4, {
        type: 'run.lifecycle',
        state: 'failed',
        attempt: 1,
        detail: { code: 'RUN_ABANDONED', message: 'Host stopped' },
      }),
      logRow(5, { type: 'run.lifecycle', state: 'running', attempt: 2 }),
    ]);
    expect(retry.container.firstChild).toBeNull();
  });

  it('should offer Retry when a placed request errors without a settlement', () => {
    setLog(changed());
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    chatState.persistedError = { category: 'generic', title: 'Error', message: 'Network error', code: 'ERR' };
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);

    expect(screen.getByRole('status').textContent).toBe('Save not confirmed');
    fireEvent.click(screen.getByRole('button', { name: /revision details$/ }));
    expect(screen.getByText(/Rev 4 is the last confirmed revision/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(continueChat).toHaveBeenCalledOnce();
  });

  it('does not turn a caught-up healthy run into an unconfirmed save because of a legacy error', () => {
    setLog([...changed(), lifecycleRow(4, 'completed')]);
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    chatState.persistedError = { category: 'generic', title: 'Error', message: 'Old channel closed', code: 'ERR' };
    chatState.attachmentStatus = 'attached';
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);

    expect(screen.queryByText('Save not confirmed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
