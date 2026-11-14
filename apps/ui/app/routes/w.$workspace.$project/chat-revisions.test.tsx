// @vitest-environment jsdom
/**
 * The Revisions pane's four regions, driven by a scripted projection (S26, A29).
 *
 * Every region reads the same two hooks the product does, mocked through the
 * one revision harness, so "what a person sees for this projection" is what is
 * asserted — no worker, no actor, no network.
 */

import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { RevisionRow } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  ChatRevisions,
  RevisionsPanelBody,
  currentRevisionOf,
  groupRevisionHistory,
} from '#routes/w.$workspace.$project/chat-revisions.js';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { requestBranchControl } from '#routes/w.$workspace.$project/revision-pane-requests.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { refuseCreateBranch, revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type { TurnOutcomeNotice } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { consumeRevisionReveal, requestRevisionReveal } from '@taucad/project-workspace/utils/revision-reveal';
import { tauCloudIntent } from '#hooks/use-cloud-projects.js';
import type { EditorDocument } from '#lib/editor-document.js';
import type * as UseFeatureModule from '#flags/use-feature.js';

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
/* Tau's debug setting, off unless a row turns it on (B5). */
const flags = vi.hoisted(() => ({ tauDebug: false }));
vi.mock('#flags/use-feature.js', async (importOriginal) => {
  const original = await importOriginal<typeof UseFeatureModule>();
  return {
    ...original,
    useFeature: (flag: Parameters<typeof original.useFeature>[0]) =>
      flag === 'tauDebug' ? flags.tauDebug : original.useFeature(flag),
  };
});
const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ updateProject: vi.fn() }),
}));
/* CodeMirror and syntax highlighting are the editor's, not this pane's: the conflict rows are
 * asserted by their verbs and the bytes they hand back (P43). */
vi.mock('#components/code/code-editor.client.js', () => ({
  CodeEditor: ({ document }: { readonly document: EditorDocument }) => (
    <pre data-testid='conflict-buffer'>{document.text}</pre>
  ),
}));
vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer: ({
    originalContent,
    modifiedContent,
    language,
  }: {
    originalContent: string;
    modifiedContent: string;
    language?: string;
  }) => <pre data-testid='conflict-diff' data-language={language}>{`${originalContent}|${modifiedContent}`}</pre>,
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
/* One stable array: `useSyncExternalStore` re-renders forever when its snapshot
 * is a new reference on every read. */
/* C2: the chats whose current run has not settled, which the header reads as the agent working. */
const sessions = vi.hoisted(() => ({ observed: [] as string[], running: new Set<string>() }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    observedChatIdsOf: () => sessions.observed,
    subscribeMembership: () => () => undefined,
    subscribeProjection: () => () => undefined,
    getProjection: (chatId: string) => ({ chatId, ledger: { position: { cursor: 0 }, runs: {} } }),
  }),
}));
vi.mock('#machines/chat-projection.logic.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  selectRunPhase: ({ chatId }: { readonly chatId: string }) => (sessions.running.has(chatId) ? 'running' : 'completed'),
}));
const chats = [
  { id: 'chat-1', name: 'Optimize bracket', checkoutId: 'co-2' },
  /* Unplaced: it works in the live checkout. */
  { id: 'chat-2', name: 'Sketch lid', checkoutId: undefined },
];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));
/* Whether the creation toast is still carrying the backup offer. */
/* D19: the backup-by-default line asks about the account; these rows are signed in and entitled. */
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTauCloudEligibility: () => ({ auth: 'authed', isResolved: true, canSyncFiles: true }),
}));
const placeChat = vi.fn(async () => undefined);
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({ placeChat }),
}));
/* The pane is the second surface on the same notice as the toast; the store
   behind it is written by `RevisionOutcomes`, which this pane does not mount. */
let turnOutcomes: readonly TurnOutcomeNotice[] = [];
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({
  useTurnOutcomes: () => turnOutcomes,
  clearTurnOutcome: vi.fn(),
}));

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'usr_test' } },
  source: 'user',
  createdAt: 1_788_220_800_000,
  /* M11: an entry has no number, so each one is told apart by its title. */
  summary: over.revisionNumber === undefined ? 'Thicker base' : `Thicker base ${String(over.revisionNumber)}`,
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

/* A router, because the pane resolves the *Sign in* destination the rest of the
   app resolves (`useAuthLinks`) rather than inventing a second one (N3). */
const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {/* The app's root TooltipProvider, which an open row's ID copy glyph needs. */}
    <TooltipProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const renderPane = (): void => {
  render(<RevisionsPanelBody />, { wrapper });
};

/** The branch chip is the branch menu; New branch… opens its form under the chip (C2). */
const openNewBranch = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(await screen.findByRole('button', { name: 'Branch: main. Switch branch' }));
  await user.click(await screen.findByRole('menuitem', { name: 'New branch…' }));
};

beforeEach(() => {
  revisionStatusHarness.reset();
  turnOutcomes = [];
  sessions.observed = [];
  sessions.running.clear();
});

describe('Revisions pane', () => {
  it('folds only consecutive unnamed autosaves', () => {
    const card = (
      revisionId: string,
      capture: RevisionCard['capture'],
      tags: readonly string[] = [],
    ): RevisionCard => ({
      revisionId,
      n: 1,
      createdAt: 1,
      summary: '',
      actor: 'You',
      turnId: undefined,
      conflicted: false,
      tags,
      capture,
    });
    const groups = groupRevisionHistory(
      [card('head', 'idle'), card('a', 'hidden'), card('b', 'close'), card('named', 'idle', ['v1'])],
      'head',
    );

    expect(groups.map((group) => group.kind)).toStrictEqual(['revision', 'autosaves', 'revision']);
    expect(groups[1]).toMatchObject({ kind: 'autosaves', revisions: [{ revisionId: 'a' }, { revisionId: 'b' }] });
  });

  it('should never fold autosaves of two lines together, nor across the backup boundary (D2, D4)', () => {
    const card = (revisionId: string): RevisionCard => ({
      revisionId,
      n: undefined,
      createdAt: 1,
      summary: '',
      actor: '',
      turnId: undefined,
      conflicted: false,
      tags: [],
      capture: 'hidden',
    });
    const autosaves = [card('a'), card('b'), card('c'), card('d')];
    const lineOf = new Map([
      ['a', 'main'],
      ['b', 'side'],
      ['c', 'side'],
      ['d', 'side'],
    ]);

    const groups = groupRevisionHistory(autosaves, undefined, { backedUpTo: 'd', lineOf });

    /* `a` stands alone on main, `b` and `c` fold on side, and `d`, the backed-up entry, starts its own group. */
    expect(
      groups.map((group) =>
        group.kind === 'revision' ? [group.revision.revisionId] : group.revisions.map((entry) => entry.revisionId),
      ),
    ).toStrictEqual([['a'], ['b', 'c'], ['d']]);
    expect(groups.map((group) => group.kind)).toStrictEqual(['revision', 'autosaves', 'revision']);
  });

  it('merges consecutive setup entries into one line, the head among them, and never marks one Current (A4)', () => {
    const card = (revisionId: string, parent: string | undefined, isSetup: boolean): RevisionCard => ({
      revisionId,
      n: 1,
      createdAt: 1,
      summary: '',
      actor: 'You',
      turnId: undefined,
      conflicted: false,
      tags: [],
      capture: isSetup ? 'idle' : 'save',
      ...(parent === undefined ? {} : { parent }),
      ...(isSetup ? { isSetup: true } : {}),
    });
    const revisions = [
      card('setup-2', 'setup-1', true),
      card('setup-1', 'agent', true),
      card('agent', 'start', false),
      card('start', undefined, false),
    ];

    expect(groupRevisionHistory(revisions, 'setup-2').map((group) => group.kind)).toStrictEqual([
      'setup',
      'revision',
      'revision',
    ]);
    expect(currentRevisionOf(revisions, 'setup-2')).toBe('agent');
    expect(currentRevisionOf(revisions, 'agent')).toBe('agent');
  });

  it('names its Close after the panel, as its tooltip does (I6)', () => {
    render(
      <TooltipProvider>
        <ChatRevisions />
      </TooltipProvider>,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: 'Close History' })).toBeInTheDocument();
  });

  it('lets the keyboard reach and scroll its column even when it holds no control', () => {
    render(
      <TooltipProvider>
        <ChatRevisions />
      </TooltipProvider>,
      { wrapper },
    );

    // A half-height phone sheet can overflow History while it loads, with nothing to Tab to (WCAG 2.1.1).
    expect(screen.getByRole('group', { name: 'History and branches' })).toHaveAttribute('tabindex', '0');
  });

  it('renders exactly one "Current" for a projection with two branches', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-4', revisionNumber: 4 }),
      row({ revisionId: 'rev-3', revisionNumber: 3 }),
    ];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-4',
      branches: [
        { name: 'main', head: 'rev-4', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-3',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: ['chat-1'],
        },
      ],
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    });
    /* *Where you are* names the branch and the revision, the branch row is
     * marked, and the History row of that revision is the one place the word
     * itself appears. */
    await waitFor(() => {
      expect(screen.getAllByText('Current')).toHaveLength(1);
    });
    /* D3: the header's chip names the branch; no list of branches marks one. */
    expect(screen.getByRole('button', { name: 'Branch: main. Switch branch' })).toBeInTheDocument();
  });

  /* W10 red pin (d), HQ1–HQ2: a conflicted head is a decision in *Choose a
   * version*, and every per-file choice is one machine verb. Nothing here
   * touches main — the card says so, because that is AC14's promise to a
   * person — and the strip names the line being decided on. */
  it('asks for a decision on a conflicted branch head, naming the line (HQ1, HQ2)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-c',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [
            { path: 'src/bracket.ts', openable: true, side: undefined },
            { path: 'params/wall.json', openable: false, side: undefined },
          ],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();

    expect(await screen.findByRole('heading', { name: 'Choose a version' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'History status' })).toHaveTextContent('Needs your decision on main');
    expect(screen.queryByText(/Needs resolution/u)).toBeNull();
    expect(screen.getByText('src/bracket.ts')).toBeInTheDocument();
    /* AC14's promise, in the one sentence a person reads first. */
    expect(screen.getByText(/main is untouched until you choose/u)).toBeInTheDocument();
    /* A22: a parametric file has no markers to read, so it is choose-one only. */
    expect(screen.getByRole('button', { name: 'Edit src/bracket.ts manually' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit params/wall.json manually' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare params/wall.json' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeDisabled();
  });

  it('finishes the merge only once every file has a side', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-c',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: 'theirs' }],
          busy: false,
          ready: true,
        },
      ],
    };

    renderPane();
    expect(await screen.findByRole('button', { name: 'Keep theirs in src/bracket.ts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Ask chat to resolve' }));
    await user.click(screen.getByRole('button', { name: 'Merge into main' }));

    expect(revisionStatusHarness.commands.askChatToResolve).toHaveBeenCalledWith('rev-c');
    expect(revisionStatusHarness.commands.finishResolution).toHaveBeenCalledWith('rev-c');
  });

  it('sends one machine verb for the side a person keeps', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-c',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Keep mine in src/bracket.ts' }));

    expect(revisionStatusHarness.commands.resolveFile).toHaveBeenCalledWith('rev-c', 'src/bracket.ts', 'mine');
  });

  /* The materialized text needs one product consumer, or the marker renderer
   * is a path nothing walks. *Edit manually* asks for it; the card shows the hunks a
   * person is choosing between (W10; the editable editor mode is the editor
   * lane's, and `resolvedInEditor` is already the verb it will send). */
  it('shows the conflicting lines the worker materialized', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-c',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Edit src/bracket.ts manually' }));

    expect(revisionStatusHarness.commands.openConflictInEditor).toHaveBeenCalledWith('rev-c', 'src/bracket.ts');

    act(() => {
      for (const listener of revisionStatusHarness.toasts) {
        listener({
          type: 'conflictText',
          revisionId: 'rev-c',
          path: 'src/bracket.ts',
          text: '<<<<<<< main\nthick = 4\n=======\nthick = 6\n>>>>>>> bracket-fillet\n',
          ours: 'thick = 4\n',
          theirs: 'thick = 6\n',
        });
      }
    });

    expect(await screen.findByTestId('conflict-buffer')).toHaveTextContent('thick = 6');

    /* P43: the block's two verbs rewrite the buffer, and *Mark resolved* is
       refused until no marker is left — handing back a buffer that still held
       `<<<<<<<` would write the markers into the tree (A22). */
    expect(screen.getByRole('button', { name: 'Mark src/bracket.ts resolved' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Keep theirs in change 1 of src/bracket.ts' }));
    expect(screen.getByTestId('conflict-buffer')).toHaveTextContent('thick = 6');
    expect(screen.getByTestId('conflict-buffer')).not.toHaveTextContent('<<<<<<<');

    await user.click(screen.getByRole('button', { name: 'Mark src/bracket.ts resolved' }));
    expect(revisionStatusHarness.commands.resolveFileInEditor).toHaveBeenCalledWith(
      'rev-c',
      'src/bracket.ts',
      'thick = 6\n',
    );

    /* A27/D19's third *Compare* surface, on the conflict row (review R9). */
    await user.click(screen.getByRole('button', { name: 'Compare src/bracket.ts' }));
    expect(screen.getByTestId('conflict-diff').textContent).toBe('thick = 4\n|thick = 6\n');
    expect(screen.getByTestId('conflict-diff')).toHaveAttribute('data-language', 'typescript');
  });

  /*
   * C44. `openConflictInEditor` is fire-and-forget, so the pane used to decide a
   * materialization had failed by waiting 10 s for one that never came — which
   * made every slow answer read as a failure and every real failure take ten
   * seconds to read. The worker now forwards the machine's own refusal and the
   * row reacts to it, with no timer anywhere in the file.
   */
  it('shows a conflict materialization failure the moment the worker says so (C44)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: 'rev-c',
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Edit src/bracket.ts manually' }));

    /* An answer that has not arrived is not a failure — which is the whole of
       what the timer got wrong. Until the worker says something, the row is
       still loading and there is no alert to read. */
    expect(await screen.findByRole('status', { name: 'Conflict view for src/bracket.ts' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('alert', { name: 'Conflict view for src/bracket.ts' })).not.toBeInTheDocument();

    act(() => {
      for (const listener of revisionStatusHarness.toasts) {
        listener({
          type: 'conflictTextFailed',
          revisionId: 'rev-c',
          path: 'src/bracket.ts',
          reason: 'That file is no longer in this revision.',
        });
      }
    });

    /* And the moment it does, the refusal is the server's own sentence. */
    const alert = await screen.findByRole('alert', { name: 'Conflict view for src/bracket.ts' });
    expect(alert).toHaveTextContent('That file is no longer in this revision.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Conflict view for src/bracket.ts' })).not.toBeInTheDocument();
  });

  /* P4, W4 §D: the inline card is the toast's second surface, so it reads the
     same table. `turn.machine`'s own sentence names a checkout (Rule 1). */
  it('phrases a turn that saved nothing from its code, never from the machine', () => {
    turnOutcomes = [{ projectId: 'p', kind: 'failed', turnId: 'turn-1', chatId: 'chat-1', code: 'BASE_CUT_FAILED' }];
    renderPane();

    const alert = screen.getByRole('alert', { name: 'Turn outcome' });
    expect(alert).toHaveTextContent('Tau could not save this project’s earlier edits first.');
    expect(alert.textContent).not.toMatch(/checkout/iu);
  });

  it('switches to a branch the person picked', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };

    renderPane();
    /* D3: the header's chip is the branch menu. */
    await user.click(screen.getByRole('button', { name: 'Branch: main. Switch branch' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^bracket-fillet/u }));

    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('bracket-fillet');
  });

  it('creates a branch through the branch verb, not a checkout of its own', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };

    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-1' };

    renderPane();
    await openNewBranch(user);
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  /* C3: the composer offers no branch, so a one-line project makes its second here. */
  it('offers New branch at one line, from the branch chip', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-1',
    };

    renderPane();
    await openNewBranch(user);
    /* The one naming form, which says where the branch starts (round 14). */
    expect(screen.getByText('Starts from where you are now. main stays as it is.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  /* Review W8 finding 4: the pane consumes the verb as `(name) => void`, which
     discards the answer but not its rejection — a duplicate name, the normal
     refusal here, went loose. The toast channel already reports it. */
  it('handles a refused branch rather than leaving its rejection loose', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-1' };
    const refusing = refuseCreateBranch('enclosure-v2');

    renderPane();
    await openNewBranch(user);
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    await refusing.settled();

    expect(refusing.asked).toEqual(['enclosure-v2']);
    expect(refusing.unhandled).toEqual([]);
    /* And the pane is still here, with its branch menu ready to try again. */
    expect(screen.getByRole('button', { name: 'Branch: main. Switch branch' })).toBeInTheDocument();
  });

  it('says the checkout has changes that are not in a revision yet, and offers to drop them', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-4',
      dirty: true,
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
    /* C2: Discard is a button beside Save, not a ⋮ item; it acts at once and can be undone. */
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(revisionStatusHarness.commands.restore).toHaveBeenCalledWith('rev-4');
  });

  /* D1 + RA4: a restore is a new row on the line, so there is nothing to return to. */
  it('names the line and the restore row after a restore, and offers no Return to latest', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-5', revisionNumber: 5, summary: 'Restore', source: 'restore', restoredFrom: 'rev-3' }),
      row({ revisionId: 'rev-4', revisionNumber: 4 }),
      row({ revisionId: 'rev-3', revisionNumber: 3 }),
    ];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-5',
      /* This device's restore minted the head, so the machine holds its undo target. */
      restore: { ...revisionStatusHarness.status.restore, undoable: true },
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getByText('Restored “Thicker base 3”')).toBeInTheDocument();
    });
    expect(screen.queryByText(/\bRev \d/u)).toBeNull();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return to latest' })).not.toBeInTheDocument();
    /* D2: the strip offers the undo while nothing has landed after the restore. */
    expect(screen.getByRole('button', { name: 'Undo restore' })).toBeInTheDocument();
  });

  it('offers Back up on the backup line, not in the header (C2)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-1',
    };

    renderPane();
    expect(screen.queryByRole('radio', { name: 'Tau Cloud' })).not.toBeInTheDocument();
    const header = await screen.findByRole('region', { name: 'Where you are' });
    expect(within(header).queryByRole('button', { name: /Back up/u })).not.toBeInTheDocument();
    const line = screen.getByRole('region', { name: 'Backup' });
    expect(line).toHaveTextContent('This device only');

    await user.click(within(line).getByRole('button', { name: 'Back up to Tau Cloud' }));

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeChecked();
  });

  it('names no git word in what a person reads (A18, I12)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-4',
      branches: [
        { name: 'main', head: 'rev-4', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };

    const { container } = render(<RevisionsPanelBody />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'History entries' })).toBeInTheDocument();
    });

    expect(container.textContent).not.toMatch(/checkout|worktree|lease|\bHEAD\b|\bref\b/iu);
  });
});

/** The W5 closeout pins: what the pane owed a person and did not give them. */
describe('Revisions pane closeout', () => {
  it('offers a resolution surface for a conflict on the only branch (C35)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      /* A sync divergence records its conflict on the *same* branch
       * (`sync.machine.ts` `conflictRef = refs/heads/${branch}`), so a
       * one-branch project announced *Needs resolution* with nowhere to go. */
      branches: [{ name: 'main', head: 'rev-c', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] }],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'main',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'origin/main' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();

    expect(await screen.findByRole('button', { name: 'Keep mine in src/bracket.ts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep theirs in src/bracket.ts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask chat to resolve' })).toBeInTheDocument();
  });

  it('says Nothing saved yet and offers one Save on a fresh project (C41)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true, headRevisionId: undefined };

    renderPane();

    /* "Modified since nothing" is not a state a person can read. */
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('compares the head row against the working copy while the checkout is dirty (C39)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true, headRevisionId: 'rev-1' };
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.diff = [{ path: 'src/main.scad', kind: 'modified' }];

    const user = userEvent.setup();
    renderPane();
    const headRow = await screen.findByRole('button', { name: /^Thicker base 1 · /u });
    await user.click(headRow);
    // The head row's own files compare with its parent; the working copy is an explicit comparison.
    expect(await screen.findByRole('button', { name: 'Compare src/main.scad' })).toBeInTheDocument();
    await user.click(within(headRow.closest('li')!).getByRole('button', { name: 'Compare' }));

    const since = await screen.findByRole('list', { name: 'Changed since “Thicker base 1”' });
    expect(revisionStatusHarness.diffRequests).toContain('rev-1..checkout');
    expect(
      within(since).getByRole('button', { name: 'Compare src/main.scad with the current file' }),
    ).toBeInTheDocument();
  });

  it('asks for no diff it does not render, and shows twelve rows before Show older (C52)', async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ revisionId: `rev-${String(index)}`, revisionNumber: 40 - index, capture: 'save' }),
    );
    revisionStatusHarness.rows = rows;
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-0' };

    renderPane();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^(?:Thicker base|Change) \d+ · /u }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole('button', { name: /^(?:Thicker base|Change) \d+ · /u })).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Show older' })).toBeInTheDocument();
    /* A closed row asks for nothing: its files are read when it opens. */
    expect(revisionStatusHarness.diffRequests).toEqual([]);
  });

  it('names every live region the pane owns (C43)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      attention: 2,
      headRevisionId: 'rev-1',
      remote: {
        ...revisionStatusHarness.status.remote,
        kind: 'tau',
        phase: 'failed',
        url: 'https://api.tau.new/v1/git/p.git',
        error: 'The plan does not allow it.',
      },
      sync: {
        ...revisionStatusHarness.status.sync,
        state: 'failed',
        pendingCount: 2,
        error: 'The plan does not allow it.',
        reason: 'notEntitled',
      },
    };

    const { container } = render(<RevisionsPanelBody />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'History entries' })).toBeInTheDocument();
    });

    const regions = [...container.querySelectorAll('[role="status"], [role="alert"]')];
    /* The scenario has to actually produce live regions, or the rule below is
     * a test that cannot fail. */
    expect(regions.length).toBeGreaterThan(2);
    const unnamed = regions.filter(
      (node) => node.getAttribute('aria-label') === null && node.getAttribute('aria-labelledby') === null,
    );
    expect(unnamed.map((node) => node.textContent)).toEqual([]);
  });

  /* A5, fixture B4: a turn's base cut is the person's autosave; the agent's result beside it is unchanged. */
  it('reads a turn base cut as an autosave that folds with autosaves, under the agent’s result', async () => {
    const user = userEvent.setup();
    const turn = { capture: 'turn', turnId: 'u1' } as const;
    revisionStatusHarness.rows = [
      row({
        ...turn,
        summary: 'Agent change',
        revisionId: 'rev-4',
        revisionNumber: 4,
        source: 'agent',
        who: { kind: 'recorded', identity: { kind: 'user', id: 'agent' } },
        turnCut: 'result',
      }),
      row({ ...turn, summary: 'Autosave', revisionId: 'rev-3', revisionNumber: 3, turnCut: 'base' }),
      row({ revisionId: 'rev-2', revisionNumber: 2, capture: 'idle' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, capture: 'save' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };

    renderPane();

    expect(await screen.findByRole('button', { name: /^Agent change · /u })).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: /^2 autosaves/u });
    expect(screen.queryByRole('button', { name: /^Autosave · /u })).not.toBeInTheDocument();
    await user.click(fold);
    const base = screen.getByRole('button', { name: /^Autosave · /u });
    await user.click(base);
    /* A5: the base cut's fact is the open row's fact line. */
    expect(base.closest('li')!.querySelector('[data-slot="row-facts"]')).toHaveTextContent(
      /^Your edits, saved before the agent started/u,
    );
    expect(screen.queryByText(/Agent turn/u)).not.toBeInTheDocument();
  });
});

/** RA11, M2, HQ3, HQ7 and the round 4–20 History geometry, on the shipped pane. */
describe('History over a long line (B2)', () => {
  /* 120 revisions on main, newest first, one minute apart on one day. */
  const long = Array.from({ length: 120 }, (_, index) => {
    const n = 120 - index;
    return row({
      revisionId: `rev-${String(n)}`,
      revisionNumber: n,
      createdAt: 1_788_220_800_000 + n * 60_000,
      summary: `Change ${String(n)}`,
      ...(n === 1 ? {} : { parent: `rev-${String(n - 1)}` }),
    });
  });
  const onLongLine = (over: Partial<typeof revisionStatusHarness.status> = {}): void => {
    revisionStatusHarness.rows = long;
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-120',
      branches: [{ name: 'main', head: 'rev-120', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] }],
      ...over,
    };
  };
  /* One cache for the whole render, as the app has: Show older lands its page in the cache it read. */
  const renderStablePane = (): void => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <RevisionsPanelBody />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  };
  it('reads one page, shows its rows, then reads the next page when Show older reaches the end', async () => {
    const user = userEvent.setup();
    onLongLine();
    renderStablePane();

    expect(await screen.findByRole('button', { name: 'Show older' })).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'History entries' });
    const rowButtons = (): HTMLElement[] =>
      within(history).getAllByRole('button', { name: /^(?:Thicker base|Change) \d+ · /u });
    expect(revisionStatusHarness.logRequests).toEqual(['main']);
    await user.click(screen.getByRole('button', { name: 'Show older' }));
    expect(rowButtons()).toHaveLength(50);

    await user.click(screen.getByRole('button', { name: 'Show older' }));
    await waitFor(() => {
      expect(rowButtons()).toHaveLength(100);
    });
    /* The first row the page added takes focus, as the canvas's Show older does. */
    expect(screen.getByRole('button', { name: /^Change 70 · /u })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Show older' }));
    await waitFor(() => {
      expect(rowButtons()).toHaveLength(120);
    });
    expect(screen.queryByRole('button', { name: /^Show / })).not.toBeInTheDocument();
  });

  it('keeps a revision opened for you in view below the page, read by its id, and not one from another line', async () => {
    /* The test DOM lays nothing out; the revealed row scrolls itself into view. */
    Element.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      consumeRevisionReveal('p', 'fillet-2');
    });
    onLongLine();
    revisionStatusHarness.rowsByBranch.set('fillet', [
      row({ revisionId: 'fillet-2', revisionNumber: 2, summary: 'Fillet work', parent: 'fillet-1' }),
      row({ revisionId: 'fillet-1', revisionNumber: 1, summary: 'Fillet start' }),
    ]);
    act(() => {
      requestRevisionReveal('p', 'rev-7');
    });
    renderStablePane();

    expect(await screen.findByRole('button', { name: /^Change 7 · /u })).toBeInTheDocument();
    expect(revisionStatusHarness.rowRequests).toContain('rev-7');
    /* The page itself is still one page: twelve rows, Show older, then the kept row. */
    const list = screen.getByRole('list', { name: 'History entries' });
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names.findIndex((name) => name.startsWith('Change 7 · '))).toBeGreaterThan(names.indexOf('Show older'));

    act(() => {
      requestRevisionReveal('p', 'fillet-2');
    });
    await waitFor(() => {
      expect(revisionStatusHarness.rowRequests).toContain('fillet-2');
    });
    expect(screen.queryByRole('button', { name: /Fillet work/u })).not.toBeInTheDocument();
  });

  it('names what a restore brought back even when that revision is older than the page', async () => {
    onLongLine({ headRevisionId: 'rev-121' });
    revisionStatusHarness.rows = [
      row({
        revisionId: 'rev-121',
        revisionNumber: 121,
        source: 'restore',
        capture: 'restore',
        restoredFrom: 'rev-3',
        parent: 'rev-120',
      }),
      ...long,
    ];
    renderStablePane();

    expect(await screen.findByRole('button', { name: /^Restored “Change 3” · /u })).toBeInTheDocument();
  });

  it('offers no Undo restore on a restore head the restore machine did not mint (a reload, another device)', async () => {
    onLongLine({ headRevisionId: 'rev-121' });
    revisionStatusHarness.rows = [
      row({
        revisionId: 'rev-121',
        revisionNumber: 121,
        source: 'restore',
        capture: 'restore',
        restoredFrom: 'rev-3',
        parent: 'rev-120',
      }),
      ...long,
    ];
    renderStablePane();

    expect(await screen.findByRole('button', { name: /^Restored “Change 3” · /u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo restore' })).not.toBeInTheDocument();
  });

  /* D15: the strip offers Undo where the operation log has something of this device's to reverse. */
  it('offers Undo in the strip where the log can answer it, and sends that verb', async () => {
    const user = userEvent.setup();
    onLongLine({
      restore: { ...revisionStatusHarness.status.restore, canUndo: true },
    });
    renderStablePane();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(revisionStatusHarness.commands.undoOperation).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Undo restore' })).not.toBeInTheDocument();
  });
});

describe('History lanes past the first page (D2)', () => {
  it('should keep reading the graph while it shows one lane, so a branch that forks further down gets its lane', async () => {
    const user = userEvent.setup();
    /* 70 entries on main, a minute apart; `old-fix` forks from the fifth and is older than main's newest 50. */
    const mainRows = Array.from({ length: 70 }, (_, index) => {
      const n = 70 - index;
      return row({
        revisionId: `rev-${String(n)}`,
        createdAt: 1_788_220_800_000 + n * 60_000,
        summary: `Change ${String(n)}`,
        ...(n === 1 ? {} : { parent: `rev-${String(n - 1)}` }),
      });
    });
    const fix = row({
      revisionId: 'fix-1',
      createdAt: 1_788_220_800_000 + 5 * 60_000 + 30_000,
      summary: 'Patch the lid',
      parent: 'rev-5',
    });
    const all = [...mainRows, fix].toSorted((left, right) => right.createdAt - left.createdAt);
    revisionStatusHarness.rows = mainRows;
    revisionStatusHarness.graph = {
      branches: [
        { name: 'main', head: 'rev-70' },
        { name: 'old-fix', head: 'fix-1' },
      ],
      rows: all.map((entry) => {
        const line = entry.revisionId === 'fix-1' ? 'old-fix' : 'main';
        return { ...entry, line, branch: line };
      }),
    };
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-70',
      branches: revisionStatusHarness.graph.branches.map((branch) => ({
        ...branch,
        checkoutId: branch.name,
        checkoutRoot: `/checkouts/${branch.name}`,
        leaseChatIds: [],
      })),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <RevisionsPanelBody />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('radio', { name: 'All branches' }));
    /* The first graph page holds main alone: one lane, drawn as the branch's own list. */
    expect(container.querySelector('[data-row="chip"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show older' }));
    await user.click(screen.getByRole('button', { name: 'Show older' }));

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('[data-slot="history-graph-frame"]')?.dataset['lanes']).toBe(
        'main,old-fix',
      );
    });
  });
});

describe('Revisions pane vocabulary and History', () => {
  const conflicted = {
    revisionId: 'rev-c',
    branch: 'bracket-fillet',
    into: 'main',
    foreign: false,
    labels: { ours: 'main', theirs: 'bracket-fillet' },
    paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
    busy: false,
    ready: false,
  } as const;

  it.each([
    ['at rest', {}, 'Saved on this device'],
    ['modified', { dirty: true }, 'Unsaved changes'],
    ['deciding a merge', { attention: 1, conflicts: [conflicted] }, 'Needs your decision on main'],
    ['before the line is known', { line: { kind: 'unknown' } as const, headRevisionId: undefined }, 'Loading history…'],
  ] as const)(
    'says one sentence %s, identical in the header’s name, its tooltip and the strip (RA11)',
    async (_, over, sentence) => {
      const user = userEvent.setup();
      revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
      revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4', ...over };

      render(
        <TooltipProvider>
          <RevisionStatusAction />
          <RevisionsPanelBody />
        </TooltipProvider>,
        { wrapper },
      );

      const strip = await screen.findByRole('status', { name: 'History status' });
      await waitFor(() => {
        expect(strip).toHaveTextContent(sentence);
      });
      expect(strip.textContent).toBe(sentence);
      const trigger = screen.getByRole('button', { name: /^Open History\./u });
      expect(trigger.getAttribute('aria-label')).toContain(sentence.replaceAll(' · ', ', ').replace(/…$/u, ''));
      await user.tab();
      expect(trigger).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(sentence);
    },
  );

  /* The pane's host is the History landmark (the phone surface, the Workbench tab), so the list is a named group:
     a second `region` called History fails axe's landmark-unique on the phone sheet. */
  it('names its History card as a group, never a second History landmark', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];

    renderPane();

    const card = await screen.findByRole('group', { name: 'History' });
    expect(card).toContainElement(screen.getByRole('heading', { name: 'History' }));
    expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument();
  });

  /* M2 (I6, S20): an unlocated line is History's busy frame, never *No revisions yet*, never `main`. */
  it('renders History’s busy frame while the line is unknown', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };

    renderPane();

    const card = await screen.findByRole('group', { name: 'History' });
    expect(card).toHaveAttribute('aria-busy', 'true');
    /* The header's trailing slot holds the wait; the strip's status line is the pane's one announcement. */
    const indicator = card.querySelector('[data-slot="wait-indicator"]');
    expect(indicator).toHaveAttribute('data-state', 'waiting');
    expect(indicator).toHaveTextContent('Loading history…');
    expect(indicator).not.toHaveAttribute('role');
    expect(screen.queryByText('No history yet')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Where you are' })).not.toHaveTextContent('main');
    /* HQ7: nothing is offered over a line nobody has located yet. */
    expect(screen.queryByRole('button', { name: /Switch branch/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  /* Blueprint row C13 (U17): History while it loads is its frame, never bars (frames 9/11). */
  it('draws no Skeleton in History or the branch chip while History loads (C13)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };

    renderPane();

    const card = await screen.findByRole('group', { name: 'History' });
    expect(document.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton shapes in the History pane').toHaveLength(0);
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No history yet')).not.toBeInTheDocument();
  });

  /* S20 (I6): a wait that ends in an empty History ends its indicator at once: *Loading history…* is never on screen
     with *No history yet*, even after the indicator has shown. */
  it('never shows Loading history with No history yet when a shown wait ends empty', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    onTestFinished(() => {
      now.mockRestore();
    });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };
    const { rerender } = render(<RevisionsPanelBody />, { wrapper });
    const card = await screen.findByRole('group', { name: 'History' });
    expect(card).toHaveAttribute('aria-busy', 'true');

    now.mockReturnValue(1200);
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'branch', name: 'main' } };
    rerender(<RevisionsPanelBody />);

    await waitFor(() => {
      expect(card).toHaveTextContent('No history yet');
    });
    expect(card).not.toHaveTextContent('Loading history');
  });

  /* A History read that hangs offers Retry at the slow mark: a second read, timed from the Retry, with focus kept. */
  it('reads History again on Retry while the first read is pending, keeping focus in the card', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.logRead = async () => Promise.withResolvers<never>().promise;
    render(<RevisionsPanelBody />, { wrapper });
    const card = await screen.findByRole('group', { name: 'History' });
    await waitFor(() => {
      expect(revisionStatusHarness.logRequests).toHaveLength(1);
    });

    const now = vi.spyOn(performance, 'now').mockReturnValue(30_000);
    onTestFinished(() => {
      now.mockRestore();
    });
    await user.click(within(card).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(revisionStatusHarness.logRequests).toHaveLength(2);
    });
    expect(document.activeElement).not.toBe(document.body);
    expect(card).toContainElement(document.activeElement as HTMLElement);
    const body = card.querySelector<HTMLElement>('[data-slot="wait-indicator-body"]');
    expect(body?.style.getPropertyValue('--wait-reveal-delay')).toBe('1000ms');
  });

  /* A Retry is a gesture: in a History restored with the route open (seen, not announced) its new wait is announced. */
  it('announces the wait a Retry starts in a History restored without a gesture', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator) as Navigator, {
        userActivation: { isActive: false, hasBeenActive: false },
      }),
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    revisionStatusHarness.logRead = async () => Promise.withResolvers<never>().promise;
    render(<RevisionsPanelBody />, { wrapper });
    const card = await screen.findByRole('group', { name: 'History' });
    const slot = card.querySelector('[data-slot="wait-indicator"]');
    expect(slot).not.toHaveAttribute('role');

    const now = vi.spyOn(performance, 'now').mockReturnValue(30_000);
    onTestFinished(() => {
      now.mockRestore();
    });
    await user.click(within(card).getByRole('button', { name: 'Retry' }));

    expect(card.querySelector('[data-slot="wait-indicator"]')).toBe(slot);
    expect(slot).toHaveAttribute('role', 'status');
  });

  /* One announcement per group: a History a person opens is announced by its card's indicator, not by the strip. */
  it('announces a History a person opened through its card, keeping the strip quiet while it loads', async () => {
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator) as Navigator, { userActivation: { isActive: true, hasBeenActive: true } }),
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };
    renderPane();

    const card = await screen.findByRole('group', { name: 'History' });
    expect(card.querySelector('[data-slot="wait-indicator"]')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('status', { name: 'History status' })).toHaveAttribute('aria-live', 'off');
  });

  /* A later wait in the same mount (a branch switch, a reconnect) is timed from its own start, not the mount's. */
  it('times a later History wait from when it starts, not from when the pane mounted', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    const { rerender } = render(<RevisionsPanelBody />, { wrapper });
    const card = await screen.findByRole('group', { name: 'History' });
    await waitFor(() => {
      expect(card).not.toHaveAttribute('aria-busy');
    });

    vi.spyOn(performance, 'now').mockReturnValue(5000);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };
    rerender(<RevisionsPanelBody />);

    expect(card).toHaveAttribute('aria-busy', 'true');
    const body = card.querySelector<HTMLElement>('[data-slot="wait-indicator-body"]');
    expect(body?.style.getPropertyValue('--wait-reveal-delay')).toBe('1000ms');
  });

  /*
   * B5: with Tau's debug setting off, no 40-character id renders anywhere in
   * the pane, with every row open; with it on, the ids the entry is stored
   * under are there.
   */
  describe('stored ids (B5)', () => {
    const oid = (digit: string): string => digit.repeat(40);
    const openEverything = async (): Promise<HTMLElement> => {
      const user = userEvent.setup();
      revisionStatusHarness.rows = [
        row({ revisionId: oid('a'), revisionNumber: 2, treeId: oid('b'), parent: oid('c'), capture: 'save' }),
        row({
          revisionId: oid('c'),
          revisionNumber: 1,
          treeId: oid('d'),
          capture: 'save',
          who: { kind: 'recorded', identity: { kind: 'user', id: 'anon:3fa9c1d2', anonymous: true } },
        }),
      ];
      revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: oid('a') };
      renderPane();
      for (const name of [/^Thicker base 2 · /u, /^Thicker base 1 · /u]) {
        // oxlint-disable-next-line no-await-in-loop -- one row opens at a time, as a person opens them.
        const entry = await screen.findByRole('button', { name });
        // oxlint-disable-next-line no-await-in-loop -- one row opens at a time, as a person opens them.
        await user.click(entry);
      }
      return document.body;
    };

    it('renders no 40-character id with the debug setting off', async () => {
      const pane = await openEverything();
      expect(pane.textContent).not.toMatch(/[\da-f]{40}/u);
      /* The pseudonym reads Anonymous; its hash is a diagnostic too. */
      expect(pane.textContent).toContain('Anonymous');
      expect(pane.textContent).not.toContain('3fa9c1d2');
    });

    it('renders the stored ids with the debug setting on', async () => {
      flags.tauDebug = true;
      onTestFinished(() => {
        flags.tauDebug = false;
      });
      const pane = await openEverything();
      expect(document.querySelector('dl[aria-label="Diagnostics"]')).toHaveTextContent(
        `ID${oid('a')}Tree${oid('b')}Parent${oid('c')}`,
      );
      expect(pane.textContent).toContain(oid('d'));
      expect(pane.textContent).toContain('Anonymous · 3fa9c1d2');
    });
  });

  it('names the line History shows, and says why an empty one is empty', async () => {
    renderPane();

    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
  });

  it('keeps the revision you are on in view, however far down it is (round 4)', async () => {
    revisionStatusHarness.rows = Array.from({ length: 20 }, (_, index) =>
      row({ revisionId: `rev-${String(20 - index)}`, revisionNumber: 20 - index, capture: 'save' }),
    );
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-3' };

    renderPane();

    expect(await screen.findByRole('button', { name: /^Thicker base 3 · /u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show older' })).toBeInTheDocument();
  });

  it('folds consecutive autosaves into one row that opens to them', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-4', revisionNumber: 4, capture: 'save' }),
      row({ revisionId: 'rev-3', revisionNumber: 3, capture: 'idle' }),
      row({ revisionId: 'rev-2', revisionNumber: 2, capture: 'idle' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, capture: 'save' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };

    renderPane();

    const fold = await screen.findByRole('button', { name: /^2 autosaves/u });
    expect(screen.queryByRole('button', { name: /^Thicker base 3 · /u })).not.toBeInTheDocument();
    await user.click(fold);
    expect(screen.getByRole('button', { name: /^Thicker base 3 · /u })).toBeInTheDocument();
  });

  describe('Backed up to here (D4)', () => {
    /* The canvas's `state-offline`: rev-1 is on Tau Cloud; rev-2 (an autosave) and rev-3 are not. */
    const offline = (remoteHead: string | undefined): void => {
      revisionStatusHarness.rows = [
        row({ revisionId: 'rev-3', summary: 'Tighten lid tolerance', capture: 'save' }),
        row({ revisionId: 'rev-2', summary: 'Add strain relief', capture: 'idle' }),
        row({ revisionId: 'rev-1', summary: 'Reroute the USB-C cutout', capture: 'idle' }),
        row({ revisionId: 'rev-0', summary: 'Start', capture: 'idle' }),
      ];
      revisionStatusHarness.status = {
        ...revisionStatusHarness.status,
        headRevisionId: 'rev-3',
        sync: { ...revisionStatusHarness.status.sync, state: 'queued', online: false, pendingCount: 1 },
        branches: [
          {
            name: 'main',
            head: 'rev-3',
            checkoutId: 'live',
            checkoutRoot: '/projects/p',
            leaseChatIds: [],
            ...(remoteHead === undefined ? {} : { remoteHead }),
          },
        ],
      };
    };
    const entries = (): string[] =>
      [...screen.getByRole('list', { name: 'History entries' }).children].map((item) =>
        item instanceof HTMLElement && item.dataset['row'] === 'boundary'
          ? 'boundary'
          : (item.querySelector('[data-revision-row]')?.getAttribute('aria-label')?.split(' · ')[0] ?? ''),
      );

    it('sits under exactly the entries that are not backed up, and no autosave folds across it', async () => {
      offline('rev-1');

      renderPane();

      await screen.findByText('Backed up to here');
      expect(entries().filter(Boolean)).toStrictEqual([
        'Tighten lid tolerance',
        'Add strain relief',
        'boundary',
        '2 autosaves',
      ]);
    });

    it.each([
      ['everything is backed up', 'rev-3'],
      ['nothing is backed up', undefined],
      ['the remote holds an entry this line does not have', 'rev-elsewhere'],
    ] as const)('draws no line when %s', async (_, remoteHead) => {
      offline(remoteHead);

      renderPane();

      await screen.findByRole('list', { name: 'History entries' });
      expect(screen.queryByText('Backed up to here')).not.toBeInTheDocument();
    });
  });

  /* A4: the operator's two `idle` autosaves that changed only `.gitignore` are one compact setup line. */
  it("shows Tau's setup entries as one compact line, and Current on the newest entry that is not setup", async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-4', revisionNumber: 4, capture: 'idle', isSetup: true }),
      row({ revisionId: 'rev-3', revisionNumber: 3, capture: 'idle', isSetup: true }),
      row({ revisionId: 'rev-2', revisionNumber: 2, capture: 'save', summary: 'Add vent slots' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, capture: 'save' }),
    ].map((entry, index, all) => {
      const parent = all[index + 1]?.revisionId;
      return parent === undefined ? entry : { ...entry, parent };
    });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };

    renderPane();

    const line = await screen.findByRole('button', { name: /^Tau updated project setup · 2 changes/u });
    expect(line).toHaveClass('h-6');
    expect(line).not.toHaveTextContent('Current');
    expect(screen.queryByRole('button', { name: /autosaves/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Thicker base 4 · /u })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText('Current')).toHaveLength(1);
    });
    expect(screen.getByRole('button', { name: /^Add vent slots · /u })).toHaveTextContent('Current');

    await user.click(line);
    expect(screen.getByRole('button', { name: /^Thicker base 4 · /u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Thicker base 3 · /u })).toBeInTheDocument();
  });

  it('lists Tau’s setup files last, under a plain Project setup label (A4)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-2', revisionNumber: 2, capture: 'save' })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };
    revisionStatusHarness.diff = [
      { path: '.gitattributes', kind: 'added' },
      { path: 'main.scad', kind: 'modified' },
    ];

    renderPane();

    await user.click(await screen.findByRole('button', { name: /^Thicker base 2 · /u }));
    const files = await screen.findByRole('list', { name: 'Changed files' });
    /* The label is not a file, so assistive technology counts only the two files as items. */
    expect(
      within(files)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toStrictEqual([expect.stringContaining('main.scad'), expect.stringContaining('.gitattributes')]);
    expect(files.textContent).toMatch(/main\.scad.*Project setup.*\.gitattributes/u);
  });

  it('is one Tab stop, on the row you are on, and moves by arrow keys (A1 item 14)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-3', revisionNumber: 3, capture: 'save' }),
      row({ revisionId: 'rev-2', revisionNumber: 2, capture: 'save' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, capture: 'save' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };

    renderPane();

    const current = await screen.findByRole('button', { name: /^Thicker base 2 · /u });
    await waitFor(() => {
      expect(current).toHaveAttribute('tabindex', '0');
    });
    expect(screen.getByRole('button', { name: /^Thicker base 3 · /u })).toHaveAttribute('tabindex', '-1');
    current.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^Thicker base 1 · /u })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Thicker base 1 · /u })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a removed collaborator calm: the strip and Sync say Cloud copy unavailable and what to do (HQ3)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
    revisionStatusHarness.role = 'revoked';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-4',
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
      sync: { ...revisionStatusHarness.status.sync, state: 'failed', reason: 'forbidden' },
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'History status' })).toHaveTextContent(
        'Saved · Cloud copy unavailable',
      );
    });
    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(backup).toHaveTextContent('Cloud copy unavailable');
    expect(backup).toHaveTextContent('The cloud copy was deleted or your access changed.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  /* A6, Q8: every project starts with the Start version, V1, in the column where other rows show Rev and time. */
  it.each([
    ['created', 'Version · project created'],
    ['github', 'Version · imported from GitHub'],
    ['folder', 'Version · imported from a folder'],
    ['zip', 'Version · imported from a zip'],
  ] as const)('reads a new project’s first entry as V1 · Start, %s, before any turn', async (start, fact) => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-1', revisionNumber: 1, summary: 'Project created', capture: 'create', start }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-1' };

    renderPane();

    const start1 = await screen.findByRole('button', { name: 'V1 · Start' });
    expect(start1).toHaveTextContent(fact);
    expect(start1).toHaveTextContent('V1');
    expect(start1).not.toHaveTextContent('Rev 1');
    expect(start1).not.toHaveTextContent('Project created');
  });

  it('keeps Start under the agent’s first entry, and the agent’s entry its own Rev', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-2', revisionNumber: 2, summary: 'Add vent slots', source: 'agent', capture: 'turn' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, summary: 'Agent change', capture: 'turn', start: 'created' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };

    renderPane();

    expect(await screen.findByRole('button', { name: /^Add vent slots · /u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'V1 · Start' })).toHaveTextContent('Version · project created');
  });

  it('never renders an actor id, and names the agent (HQ4)', async () => {
    revisionStatusHarness.rows = [
      row({
        revisionId: 'rev-2',
        revisionNumber: 2,
        who: { kind: 'recorded', identity: { kind: 'user', id: 'claude-opus-4' } },
        source: 'agent',
      }),
      row({
        revisionId: 'rev-1',
        revisionNumber: 1,
        who: { kind: 'recorded', identity: { kind: 'user', id: 'user_2abc' } },
      }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };

    const { container } = render(<RevisionsPanelBody />, { wrapper });

    expect(await screen.findByText('Agent')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/claude-opus-4|user_2abc|anon:/u);
  });
});

/**
 * D19: a new project on an entitled account backs up by default. The default
 * connection itself is the session's (`project-live-sessions.test.tsx`); the
 * pane adds no line of its own about it, before or after.
 */
describe('Backup by default (D19)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(['default', 'noticed'] as const)('shows no backup line before the first revision (%s)', async (intent) => {
    tauCloudIntent.set('p', intent);

    renderPane();

    expect(await screen.findByRole('region', { name: 'Where you are' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Backup by default' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off backup' })).not.toBeInTheDocument();
  });

  it('reads Saved · Backed up after the default connection, with no Connect step and no line', async () => {
    tauCloudIntent.set('p', 'connected');
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-1',
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
      sync: { ...revisionStatusHarness.status.sync, state: 'backedUp' },
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'History status' })).toHaveTextContent('Saved · Backed up');
    });
    expect(screen.queryByText('Backs up to Tau Cloud automatically.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off backup' })).not.toBeInTheDocument();
  });
});

/*
 * C2 (canvas `pane-header-states`): the header's ten states. Each is the
 * branch chip, at most one version, one sentence and at most two verbs; the
 * chip is the only menu trigger, and there is no ⋮, no Details and no number.
 */
describe('History header (C2)', () => {
  const tau = {
    remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    sync: { ...revisionStatusHarness.status.sync, state: 'backedUp' },
  } as const;
  const version = row({
    revisionId: 'rev-3',
    revisionNumber: 3,
    summary: 'Ready for print',
    versions: [{ number: 3, name: 'Ready for print' }],
  });
  const entry = row({ revisionId: 'rev-4', revisionNumber: 4, summary: 'Thicker base', parent: 'rev-3' });
  const states = [
    { id: 'at-rest', status: { headRevisionId: 'rev-4' }, sentence: 'Saved · Backed up', verbs: [] },
    {
      id: 'at-version',
      status: { headRevisionId: 'rev-3' },
      sentence: 'Saved · Backed up',
      verbs: [],
      version: 'V3 · Ready for print',
    },
    {
      id: 'unsaved',
      status: { headRevisionId: 'rev-3', dirty: true },
      sentence: 'Unsaved changes',
      verbs: ['Discard', 'Save'],
    },
    {
      id: 'agent-working',
      status: { headRevisionId: 'rev-3', dirty: true },
      running: 'chat-2',
      sentence: 'Agent is working · saves when it finishes',
      verbs: [],
    },
    {
      id: 'after-restore',
      status: { headRevisionId: 'rev-4', restore: { ...revisionStatusHarness.status.restore, undoable: true } },
      sentence: 'Saved · Backed up',
      verbs: ['Undo restore'],
    },
    {
      id: 'conflict',
      status: {
        headRevisionId: 'rev-4',
        attention: 1,
        conflicts: [
          {
            revisionId: 'merge-1',
            branch: 'main',
            into: 'main',
            foreign: false,
            busy: false,
            ready: false,
            paths: [],
            labels: undefined,
          },
        ],
      },
      sentence: 'Needs your decision on main',
      verbs: [],
    },
    {
      id: 'save-unconfirmed',
      status: { headRevisionId: 'rev-4', attention: 1 },
      sentence: 'Couldn’t confirm the save',
      verbs: ['Try again'],
    },
    {
      id: 'signed-out',
      status: {
        headRevisionId: 'rev-4',
        sync: { ...tau.sync, state: 'failed', pendingCount: 1, reason: 'unauthorized' },
      },
      sentence: 'Not backed up · Sign in to back up',
      verbs: ['Sign in'],
    },
    { id: 'view-only', status: { headRevisionId: 'rev-4' }, role: 'read', sentence: 'Saved · View only', verbs: [] },
    {
      id: 'work-arrived',
      status: { headRevisionId: 'rev-4', sync: { ...tau.sync, arrived: 'rev-9' } },
      sentence: 'New changes are ready',
      verbs: [],
    },
  ] as const;

  it.each(states)('says $id in one sentence with its verbs, and offers no other menu', async (state) => {
    revisionStatusHarness.rows = [entry, version];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      ...tau,
      ...(state.status as Partial<typeof revisionStatusHarness.status>),
    };
    if ('role' in state) {
      revisionStatusHarness.role = state.role;
    }
    if ('running' in state) {
      sessions.observed = [state.running];
      sessions.running.add(state.running);
    }

    renderPane();

    const header = await screen.findByRole('region', { name: 'Where you are' });
    await waitFor(() => {
      expect(within(header).getByRole('status', { name: 'History status' })).toHaveTextContent(state.sentence);
    });
    const chip = within(header).getByRole('button', { name: 'Branch: main. Switch branch' });
    /* The chip is the one menu trigger: no ⋮, no Details. */
    expect(
      within(header)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-haspopup')),
    ).toEqual([chip]);
    expect(within(header).queryByRole('button', { name: /^(?:More|Details)$/u })).not.toBeInTheDocument();
    const verbs = [...within(header).queryAllByRole('button'), ...within(header).queryAllByRole('link')]
      .filter((control) => control !== chip)
      .map((control) => control.textContent);
    expect(verbs).toEqual(state.verbs);
    /* No number, and the version only while the files are exactly at it. */
    expect(header.textContent).not.toMatch(/\bRev \d/u);
    if ('version' in state) {
      expect(header).toHaveTextContent(state.version);
    } else {
      expect(header.textContent).not.toMatch(/\bV\d/u);
    }
  });

  it('discards at once, as a restore of the entry the files are at', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [entry];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4', dirty: true };

    renderPane();
    const header = await screen.findByRole('region', { name: 'Where you are' });
    await user.click(await within(header).findByRole('button', { name: 'Discard' }));

    expect(revisionStatusHarness.commands.restore).toHaveBeenCalledWith('rev-4');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('switches branch from the chip, and lists no conflict line as a branch', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [entry];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-4',
      branches: [
        { name: 'main', head: 'rev-4', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        { name: 'enclosure-v2', head: 'rev-4', checkoutId: 'co-2', checkoutRoot: '/checkouts/co-2', leaseChatIds: [] },
        {
          name: 'conflicts/main/device-2',
          head: 'merge-1',
          checkoutId: undefined,
          checkoutRoot: undefined,
          leaseChatIds: [],
        },
      ],
      conflicts: [
        {
          revisionId: 'merge-1',
          branch: 'conflicts/main/device-2',
          into: 'main',
          foreign: true,
          busy: false,
          ready: false,
          paths: [],
          labels: undefined,
        },
      ],
    };

    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Branch: main. Switch branch' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['main', 'enclosure-v2']);
    expect(within(menu).getByRole('menuitemradio', { name: 'main' })).toBeChecked();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'enclosure-v2' }));
    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('enclosure-v2');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens the branch menu or New branch… when the palette asks', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [entry];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };

    renderPane();
    await screen.findByRole('button', { name: 'Branch: main. Switch branch' });
    act(() => {
      requestBranchControl('p', 'switch-branch');
    });
    expect(await screen.findByRole('menu')).toHaveTextContent('Switch branch');
    await user.keyboard('{Escape}');
    act(() => {
      requestBranchControl('p', 'new-branch');
    });
    expect(await screen.findByRole('textbox', { name: 'Branch name' })).toBeInTheDocument();
  });

  it('presses the toolbar chip while History is on screen', async () => {
    revisionStatusHarness.rows = [entry];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };
    const view = render(
      <TooltipProvider>
        <RevisionStatusAction />
      </TooltipProvider>,
      { wrapper },
    );
    const chip = (): HTMLElement => screen.getByRole('button', { name: /^Open History\./u });
    expect(chip()).toHaveAttribute('aria-pressed', 'false');

    view.rerender(
      <TooltipProvider>
        <RevisionStatusAction />
        <ChatRevisions isExpanded />
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(chip()).toHaveAttribute('aria-pressed', 'true');
    });

    view.rerender(
      <TooltipProvider>
        <RevisionStatusAction />
        <ChatRevisions isExpanded={false} />
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(chip()).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
