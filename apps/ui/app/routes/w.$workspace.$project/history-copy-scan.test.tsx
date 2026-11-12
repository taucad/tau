// @vitest-environment jsdom
/**
 * C8, M11: no save has a number and none is called a revision. "Revision" and
 * "Rev A, B, C" are reserved for a release workflow.
 *
 * This suite renders the History pane, the toolbar chip, the chat marker, the
 * toasts and the sidebar status in every state fixture and scans the text a
 * person reads or hears: the DOM text, every accessible name and description,
 * and every toast's title, description and action. The tool card's fixtures
 * scan themselves in `chat-message-tool-revisions.test.tsx`, and the palette's
 * in `project-command-items.test.tsx`, where their own mocks already live.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { RevisionRow, RevisionStatusProjection, SyncFacet } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { describeRevisionFailure, revisionFailureCopy } from '@taucad/ui-core/lib/revision-failure-copy';
import { RevisionsPanelBody } from '#routes/w.$workspace.$project/chat-revisions.js';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { RevisionRestore } from '#routes/w.$workspace.$project/revision-restore.js';
import { RevisionOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { turnRevisionDetail, turnRevisionLabel } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionState } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { projectSyncIndicator } from '#components/nav/project-sync-status.js';
import { selectProjectFacts } from '#hooks/use-sidebar-status.js';
import type { ProjectSidebarRow } from '#hooks/use-sidebar-status.js';
import type { RevisionToast, WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

/** The two things M11 forbids in copy. */
const forbidden = [/\bRev \d/u, /\brevisions?\b/iu] as const;

const expectHistoryCopy = (where: string, text: string): void => {
  for (const pattern of forbidden) {
    expect(text, `${where}: ${text}`).not.toMatch(pattern);
  }
};

/** Everything a person reads or hears on the page: text, accessible names and descriptions, titles. */
const pageCopy = (): string => {
  const attributes = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'aria-valuetext'];
  const named = [...document.body.querySelectorAll('*')].flatMap((element) =>
    attributes.map((name) => element.getAttribute(name) ?? '').filter((value) => value !== ''),
  );
  return [document.body.textContent, ...named].join('\n');
};

const projectSnapshot = { context: { project: { syncChats: true } } };
const projectRef = {
  getSnapshot: () => projectSnapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const editorRef = {
  getSnapshot: () => ({ context: { focusedChatId: undefined } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', projectRef, editorRef }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: vi.fn() }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ updateProject: vi.fn() }) }));
vi.mock('#components/code/code-editor.client.js', () => ({ CodeEditor: () => <pre /> }));
vi.mock('#components/code/diff-viewer.js', () => ({ DiffViewer: () => <pre /> }));

const events = vi.hoisted(() => new Set<(event: WorkerRevisionEvent) => void>());
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  const base = harness.revisionStatusMock();
  return {
    ...base,
    useRevisionClient: () => ({
      ...(base['useRevisionClient'] as () => Record<string, unknown>)(),
      subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => {
        events.add(listener);
        return () => events.delete(listener);
      },
    }),
  };
});
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ observedChatIdsOf: () => [], subscribeMembership: () => () => undefined }),
}));
const chats = [
  { id: 'chat-1', name: 'Optimize bracket', checkoutId: 'co-2' },
  { id: 'chat-2', name: 'Sketch lid', checkoutId: undefined },
];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTauCloudEligibility: () => ({ auth: 'authed', isResolved: true, canSyncFiles: true }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({ placeChat: vi.fn(async () => undefined) }),
}));
vi.mock('#routes/w.$workspace.$project/held-save-toast.js', () => ({ useHeldSaveToast: () => vi.fn() }));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));

/** Every toast the page raised, as the words a person reads. */
const { toasts, recordToast } = vi.hoisted(() => {
  const raised: string[] = [];
  return {
    toasts: raised,
    recordToast: (title: unknown, options?: unknown): void => {
      const { description, action } = (options ?? {}) as { description?: unknown; action?: { label?: unknown } };
      raised.push([title, description, action?.label].filter((part) => typeof part === 'string').join(' · '));
    },
  };
});
vi.mock('@taucad/ui/components/sonner', () => ({
  toast: Object.assign(recordToast, {
    success: recordToast,
    error: recordToast,
    info: recordToast,
    warning: recordToast,
    message: recordToast,
    loading: recordToast,
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'usr_test' } },
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Thicker base',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

/* A line with every kind of entry History draws: a version, a restore, autosaves, an agent change, Start. */
const line: readonly RevisionRow[] = [
  row({
    revisionId: 'rev-6',
    revisionNumber: 6,
    summary: 'Restore',
    source: 'restore',
    capture: 'restore',
    restoredFrom: 'rev-3',
  }),
  row({ revisionId: 'rev-5', revisionNumber: 5, summary: 'Saved changes (idle)', capture: 'idle' }),
  row({ revisionId: 'rev-4', revisionNumber: 4, summary: 'Saved changes (hidden)', capture: 'hidden' }),
  row({
    revisionId: 'rev-3',
    revisionNumber: 3,
    summary: 'Add vent slots',
    tags: ['Ready for print'],
    versions: [{ name: 'Ready for print', number: 2 }],
  }),
  row({
    revisionId: 'rev-2',
    revisionNumber: 2,
    summary: 'Agent turn t-1',
    source: 'agent',
    turnId: 't-1',
    capture: 'turn',
  }),
  row({ revisionId: 'rev-1', revisionNumber: 1, summary: 'Set up this project', start: 'created' }),
];

const base = (): RevisionStatusProjection => revisionStatusHarness.status;
const sync = (over: Partial<SyncFacet>): SyncFacet => ({ ...base().sync, ...over });
const tau = (): RevisionStatusProjection['remote'] => ({ ...base().remote, kind: 'tau', phase: 'connected' });
const github = (): RevisionStatusProjection['remote'] => ({
  ...base().remote,
  kind: 'git',
  phase: 'connected',
  url: 'https://github.com/o/r.git',
  provider: 'github',
});
const conflict = {
  revisionId: 'rev-c',
  branch: 'bracket-fillet',
  into: 'main',
  foreign: false,
  labels: { ours: 'main', theirs: 'bracket-fillet' },
  paths: ['lid.tsx'],
  busy: false,
  ready: false,
} as const;

/** The state fixtures: every sentence the status line can say. */
const states: ReadonlyArray<readonly [string, () => Partial<RevisionStatusProjection>]> = [
  ['at rest', () => ({})],
  ['modified', () => ({ dirty: true })],
  ['saving', () => ({ minting: true, dirty: true })],
  ['restoring', () => ({ restore: { ...base().restore, busy: true, revisionNumber: 3 } })],
  [
    'asked to restore',
    () => ({ restore: { ...base().restore, asking: true, revisionNumber: 3, removedPathCount: 1 } }),
  ],
  ['closing a branch', () => ({ branchVerb: { ...base().branchVerb, busy: true, operation: 'discard', branch: 'x' } })],
  ['a save not confirmed', () => ({ attention: 1, dirty: true })],
  ['deciding a merge', () => ({ attention: 1, conflicts: [conflict] })],
  ['backed up', () => ({ remote: tau(), sync: sync({ state: 'backedUp' }) })],
  ['backing up', () => ({ remote: tau(), sync: sync({ state: 'pending', pendingCount: 2 }) })],
  ['checking', () => ({ remote: tau(), sync: sync({ state: 'checking' }) })],
  ['not pushed', () => ({ remote: github(), sync: sync({ state: 'manual' }) })],
  ['queued offline', () => ({ remote: tau(), sync: sync({ state: 'queued', pendingCount: 2, online: false }) })],
  ['sync conflicted', () => ({ remote: tau(), sync: sync({ state: 'conflicted' }) })],
  ...(
    [
      'unauthorized',
      'notEntitled',
      'forbidden',
      'notFound',
      'quota',
      'largeFiles',
      'moved',
      'damaged',
      'rejected',
    ] as const
  ).flatMap((reason) =>
    [0, 2].map(
      (pendingCount) =>
        [
          `failed (${reason}, ${String(pendingCount)} waiting)`,
          () => ({ remote: github(), sync: sync({ state: 'failed', reason, pendingCount }) }),
        ] as const,
    ),
  ),
  ['an unknown line', () => ({ line: { kind: 'unknown' } as const, headRevisionId: undefined })],
];

beforeEach(() => {
  revisionStatusHarness.reset();
  toasts.length = 0;
});

afterEach(() => {
  cleanup();
  events.clear();
});

describe('History copy (C8, M11)', () => {
  it.each(states)(
    'the History pane and the toolbar chip say no save number and no “revision” when %s',
    async (_, over) => {
      revisionStatusHarness.rows = [...line];
      revisionStatusHarness.status = { ...base(), headRevisionId: 'rev-6', ...over() };

      render(
        <>
          <RevisionStatusAction />
          <RevisionsPanelBody />
          <RevisionRestore />
        </>,
        { wrapper },
      );
      /* The scan reads a drawn pane: its entries are there, named by version and title. */
      if (over().line === undefined) {
        await waitFor(() => {
          expect(document.body.textContent).toContain('Ready for print');
        });
        expect(document.body.textContent).toMatch(/Restored V2/u);
      } else {
        await act(async () => undefined);
      }
      expectHistoryCopy('page', pageCopy());
    },
  );

  it('the History pane says no save number and no “revision” before anything is saved', async () => {
    render(<RevisionsPanelBody />, { wrapper });
    await act(async () => undefined);

    expectHistoryCopy('empty pane', pageCopy());
  });

  it('the chat marker says no save number and no “revision” in any state', () => {
    const saved: RevisionCard = {
      revisionId: 'rev-5',
      n: 5,
      createdAt: 1,
      summary: 'Thicker base',
      actor: '',
      turnId: undefined,
      capture: 'save',
      conflicted: false,
    };
    const marker: readonly TurnRevisionState[] = [
      { kind: 'working', base: { kind: 'revision', n: 4 }, isWaiting: false },
      { kind: 'working', base: { kind: 'first' }, isWaiting: true },
      { kind: 'working', base: { kind: 'unknown' }, isWaiting: false },
      { kind: 'saving' },
      { kind: 'saved', revision: saved, isInterrupted: false },
      { kind: 'saved', revision: saved, isInterrupted: true },
      { kind: 'conflicted' },
      { kind: 'unconfirmed', base: { kind: 'revision', n: 3 } },
    ];
    for (const state of marker) {
      for (const files of [0, 1, 3]) {
        expectHistoryCopy(`marker ${state.kind}`, turnRevisionLabel(state, files));
      }
      expectHistoryCopy(`marker ${state.kind} detail`, turnRevisionDetail(state));
    }
  });

  it('the toasts say no save number and no “revision”, for every signal the tree sends', async () => {
    revisionStatusHarness.rows = [...line];
    render(
      <>
        <RevisionRestore />
        <RevisionOutcomes />
        <RevisionsPanelBody />
      </>,
      { wrapper },
    );
    /* A toast names an entry from the loaded page, so the page loads first. */
    await waitFor(() => {
      expect(document.body.textContent).toContain('Ready for print');
    });

    const signals: readonly RevisionToast[] = [
      { type: 'restored', mode: 'restore', revisionId: 'rev-3', revisionNumber: 3 },
      { type: 'restored', mode: 'restore', revisionId: 'rev-5', revisionNumber: 5 },
      { type: 'restored', mode: 'restore', revisionId: 'rev-gone', revisionNumber: undefined },
      { type: 'restored', mode: 'undoRestore', revisionId: 'rev-5', revisionNumber: 5 },
      { type: 'undone', revisionNumber: 2 },
      { type: 'undone', revisionNumber: 6 },
      { type: 'undone', revisionNumber: undefined },
      { type: 'nothingToSave' },
      ...(['switch', 'merge', 'discard', 'create', 'rename'] as const).map(
        (operation) => ({ type: 'branch', operation, branch: 'x' }) as const,
      ),
      { type: 'branch', operation: 'switch', branch: 'x', from: 'main', saved: true },
      { type: 'refused', branch: 'x', reason: 'Your files changed.' },
      { type: 'mergeConflicted', branch: 'x', into: 'main', paths: ['lid.tsx', 'base.tsx'] },
      ...(['restore', 'branch', 'save', 'connection'] as const).flatMap((subject) => [
        { type: 'error', subject, message: 'diagnostic' } as const,
        ...[...revisionFailureCopy[subject].codes.keys()].map(
          (code): RevisionToast => ({ type: 'error', subject, code, message: 'diagnostic' }),
        ),
      ]),
    ];
    act(() => {
      for (const listener of revisionStatusHarness.toasts) {
        for (const signal of signals) {
          listener(signal);
        }
      }
    });
    const outcomes: readonly WorkerRevisionEvent[] = [
      { type: 'turn.conflicted', turnId: 't-2', runId: 'r-2', chatId: 'chat-1', checkoutId: 'live' },
      { type: 'turn.failed', turnId: 't-3', runId: 'r-3', chatId: 'chat-1', checkoutId: 'live', reason: 'diagnostic' },
      ...[...revisionFailureCopy.turn.codes.keys()].map(
        (code, index): WorkerRevisionEvent => ({
          type: 'turn.failed',
          turnId: `t-${String(index + 4)}`,
          runId: `r-${String(index + 4)}`,
          chatId: 'chat-1',
          checkoutId: 'live',
          reason: 'diagnostic',
          code,
        }),
      ),
    ];
    act(() => {
      for (const listener of events) {
        for (const outcome of outcomes) {
          listener(outcome);
        }
      }
    });

    expect(toasts.length).toBeGreaterThan(signals.length);
    expect(toasts).toContain('Restored V2 · Undo');
    expect(toasts).toContain('Undid “Agent change”');
    expect(toasts).toContain('Undid the restore');
    for (const toast of toasts) {
      expectHistoryCopy('toast', toast);
    }
  });

  it('the failure copy says no save number and no “revision”, for every subject and code', () => {
    for (const [subject, copy] of Object.entries(revisionFailureCopy)) {
      for (const code of [undefined, ...copy.codes.keys()]) {
        const { title, description } = describeRevisionFailure(subject as keyof typeof revisionFailureCopy, code);
        expectHistoryCopy(`${subject} ${code ?? ''}`, `${title} ${description}`);
      }
    }
  });

  it('the sidebar status says no save number and no “revision”', () => {
    const facets: readonly SyncFacet[] = [
      sync({ state: 'conflicted' }),
      sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }),
      sync({ state: 'failed', reason: 'forbidden' }),
      sync({ state: 'queued', pendingCount: 2, online: false }),
      sync({ state: 'checking' }),
      sync({ state: 'backedUp', pullPhase: 'fetching' }),
      sync({ state: 'backedUp', chats: 'failed' }),
    ];
    for (const facet of facets) {
      for (const isCloudPending of [false, true]) {
        const indicator = projectSyncIndicator(facet, isCloudPending);
        expectHistoryCopy('sidebar sync', `${indicator?.label ?? ''} ${indicator?.detail ?? ''}`);
      }
    }
    const rest: ProjectSidebarRow = {
      projectId: 'p',
      glyph: 'idle',
      closing: false,
      attention: 1,
      conflicted: true,
      settings: 0,
      settingsLabel: undefined,
      failed: 0,
      running: 0,
      unread: 0,
      detail: undefined,
      runs: 0,
    };
    /* The closing sentence ("Backing up 2 changes, then closing…") is asserted where the session is read, in use-sidebar-status.test.tsx. */
    for (const expanded of [true, false]) {
      expectHistoryCopy('sidebar row', selectProjectFacts(rest, expanded).sentence ?? '');
    }
  });
});
