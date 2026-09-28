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
import { RevisionsPanelBody, groupRevisionHistory } from '#routes/w.$workspace.$project/chat-revisions.js';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { refuseCreateBranch, revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type { TurnOutcomeNotice } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { consumeRevisionReveal, requestRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';
import { tauCloudIntent } from '#hooks/use-cloud-projects.js';

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
const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ updateProject: vi.fn() }),
}));
/* Monaco and Shiki are the editor's, not this pane's: the conflict rows are
 * asserted by their verbs and the bytes they hand back (P43). */
vi.mock('#components/code/code-editor.client.js', () => ({
  CodeEditor: ({ value }: { readonly value?: string }) => <pre data-testid='conflict-buffer'>{value}</pre>,
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
const settlements: readonly never[] = [];
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getHostFinalizedTurns: () => settlements,
  subscribeHostFinalizedTurns: () => () => undefined,
}));
const chats = [
  { id: 'chat-1', name: 'Optimize bracket', checkoutId: 'co-2' },
  /* Unplaced: it works in the live checkout. */
  { id: 'chat-2', name: 'Sketch lid', checkoutId: undefined },
];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
/* Whether the creation toast is still carrying the backup offer. */
let backupAnnouncing = false;
/* D19: the backup-by-default line asks about the account; these rows are signed in and entitled. */
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTauCloudEligibility: () => ({ auth: 'authed', isResolved: true, canSyncFiles: true }),
  useBackupAnnouncing: () => backupAnnouncing,
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
  actor: 'You',
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Thicker base',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

/* A router, because the pane resolves the *Sign in* destination the rest of the
   app resolves (`useAuthLinks`) rather than inventing a second one (N3). */
const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const renderPane = (): void => {
  render(<RevisionsPanelBody />, { wrapper });
};

beforeEach(() => {
  revisionStatusHarness.reset();
  turnOutcomes = [];
});

describe('Revisions pane', () => {
  it('folds only consecutive unnamed autosaves', () => {
    const card = (
      revisionId: string,
      trigger: RevisionCard['trigger'],
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
      trigger,
    });
    const groups = groupRevisionHistory(
      [card('head', 'idle'), card('a', 'hidden'), card('b', 'close'), card('named', 'idle', ['v1'])],
      'head',
    );

    expect(groups.map((group) => group.kind)).toStrictEqual(['revision', 'autosaves', 'revision']);
    expect(groups[1]).toMatchObject({ kind: 'autosaves', revisions: [{ revisionId: 'a' }, { revisionId: 'b' }] });
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
    expect(screen.getByRole('listitem', { current: true })).toHaveTextContent('main');
  });

  it('shows the branch region only once a second branch exists', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'branch', name: 'main' } };

    const { rerender } = render(<RevisionsPanelBody />, { wrapper });
    expect(screen.queryByRole('list', { name: 'Branches' })).not.toBeInTheDocument();

    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: ['chat-1'],
        },
      ],
    };
    rerender(<RevisionsPanelBody />);

    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Branches' })).toBeInTheDocument();
    });
    /* The chips say who is working where, by the chat's own name. */
    expect(screen.getByText('Optimize bracket')).toBeInTheDocument();
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
    expect(screen.getByRole('status', { name: 'Revision status' })).toHaveTextContent('Needs your decision on main');
    expect(screen.getByLabelText('Needs your decision')).toHaveClass('text-warning');
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
    await user.click(screen.getByRole('button', { name: 'Switch to bracket-fillet' }));

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
    await user.click(await screen.findByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  /* C3: the composer offers no branch, so a one-line project makes its second here. */
  it('offers New branch at one line, where the Branches region does not exist yet', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-1',
    };

    renderPane();
    expect(screen.queryByRole('list', { name: 'Branches' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'New branch' }));
    /* The one naming form, which says where the branch starts (round 14). */
    expect(screen.getByText('Starts from Rev 1. main stays as it is.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  it('places the chat in focus on a branch from that branch’s row', async () => {
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

    render(<RevisionsPanelBody />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/w/home/p?chat=chat-1']}>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    });
    /* The chat in focus already works in bracket-fillet, so only main offers to take it. */
    await user.click(screen.getByRole('button', { name: 'Actions for bracket-fillet' }));
    expect(screen.queryByRole('menuitem', { name: /in this chat$/u })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Actions for main' }));
    await user.click(screen.getByRole('menuitem', { name: 'Use main in this chat' }));

    expect(placeChat).toHaveBeenCalledWith('chat-1', 'live');
  });

  /* Review W8 finding 4: the pane consumes the verb as `(name) => void`, which
     discards the answer but not its rejection — a duplicate name, the normal
     refusal here, went loose. The toast channel already reports it. */
  it('handles a refused branch rather than leaving its rejection loose', async () => {
    const user = userEvent.setup();
    /* The *Branches* region appears at two branches (S26). */
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
    await user.click(await screen.findByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    await refusing.settled();

    expect(refusing.asked).toEqual(['enclosure-v2']);
    expect(refusing.unhandled).toEqual([]);
    /* And the pane is still here, with its *New branch* ready to try again. */
    expect(screen.getByRole('button', { name: 'New branch' })).toBeInTheDocument();
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
      expect(screen.getByText('Modified since Rev 4')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Discard changes' }));
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
      expect(screen.getByText('Restored Rev 3')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Rev 5').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'History · main' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return to latest' })).not.toBeInTheDocument();
    /* D2: the strip offers the undo while nothing has landed after the restore. */
    expect(screen.getByRole('button', { name: 'Undo restore' })).toBeInTheDocument();
  });

  it('shows the Sync region only once a remote exists, and offers to open it otherwise', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      headRevisionId: 'rev-1',
    };

    renderPane();
    expect(screen.queryByRole('radio', { name: 'Tau Cloud' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Back up' }));

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeInTheDocument();
    /* A29: the offer that opened Sync does not keep standing beside it. */
    expect(screen.queryByRole('button', { name: 'Back up' })).not.toBeInTheDocument();
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
      expect(screen.getAllByText(/Rev 4/u).length).toBeGreaterThan(0);
    });

    expect(container.textContent).not.toMatch(/checkout|worktree|lease|\bHEAD\b|\bref\b/iu);
  });
  it('renames a branch in place, the one verb whose effect has landed (review R3)', async () => {
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

    render(<RevisionsPanelBody />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Actions for bracket-fillet' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename bracket-fillet…' }));
    const field = await screen.findByRole('textbox', { name: 'New name for bracket-fillet' });
    await user.clear(field);
    await user.type(field, 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Rename branch' }));

    expect(revisionStatusHarness.commands.renameBranch).toHaveBeenCalledWith('bracket-fillet', 'enclosure-v2');
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

  it('says Not saved yet and offers one Save revision on a fresh project (C41)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true, headRevisionId: undefined };

    renderPane();

    /* "Modified since nothing" is not a state a person can read. */
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument();
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save revision' })).toBeInTheDocument();
  });

  it('compares the head row against the working copy while the checkout is dirty (C39)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true, headRevisionId: 'rev-1' };
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.diff = [{ path: 'src/main.scad', kind: 'modified' }];

    const user = userEvent.setup();
    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Rev 1 · Thicker base' }));

    expect(
      await screen.findByRole('button', { name: 'Compare src/main.scad with the current file' }),
    ).toBeInTheDocument();
  });

  it('marks a branch on a host data directory as Linked (C40, I2)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      checkoutId: 'live',
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          /* A disk host puts linked checkouts under its own data directory, so
           * the old `/checkouts/` prefix test never fired off the browser. */
          checkoutRoot: '/Users/x/Library/Application Support/Tau/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };

    renderPane();

    expect(await screen.findByText('Linked')).toBeInTheDocument();
  });

  it('places no chat on a remote-only branch, which has no checkout (D37)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'branch', name: 'main' },
      checkoutId: 'live',
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        { name: 'upstream-only', head: undefined, checkoutId: undefined, checkoutRoot: undefined, leaseChatIds: [] },
      ],
    };

    renderPane();

    const badge = await screen.findByText('Remote only');
    const remote = badge.closest('li');
    expect(remote).not.toBeNull();
    expect(remote).not.toHaveTextContent('Sketch lid');
  });

  it('asks for no diff it does not render, and shows twelve rows before Show more (C52)', async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ revisionId: `rev-${String(index)}`, revisionNumber: 40 - index, trigger: 'save' }),
    );
    revisionStatusHarness.rows = rows;
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-0' };

    renderPane();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Rev \d+ · /u }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole('button', { name: /^Rev \d+ · /u })).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Show 28 more' })).toBeInTheDocument();
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
      expect(screen.getAllByText(/Rev 1/u).length).toBeGreaterThan(0);
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
  /* One cache for the whole render, as the app has: Show more lands its page in the cache it read. */
  const renderStablePane = (): void => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RevisionsPanelBody />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const rowButtons = (): HTMLElement[] => screen.getAllByRole('button', { name: /^Rev \d+ · /u });

  it('reads one page, shows its rows, then reads the next page when Show more reaches the end', async () => {
    const user = userEvent.setup();
    onLongLine();
    renderStablePane();

    expect(await screen.findByRole('button', { name: 'Show 38 more' })).toBeInTheDocument();
    expect(revisionStatusHarness.logRequests).toEqual(['main']);
    await user.click(screen.getByRole('button', { name: 'Show 38 more' }));
    expect(rowButtons()).toHaveLength(50);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => {
      expect(rowButtons()).toHaveLength(100);
    });
    /* The first row the page added takes focus, as the canvas's Show more does. */
    expect(screen.getByRole('button', { name: 'Rev 70 · Change 70' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Show more' }));
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

    expect(await screen.findByRole('button', { name: 'Rev 7 · Change 7' })).toBeInTheDocument();
    expect(revisionStatusHarness.rowRequests).toContain('rev-7');
    /* The page itself is still one page: twelve rows, Show more, then the kept row. */
    const list = screen.getByRole('list', { name: 'Revision history' });
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names.indexOf('Rev 7 · Change 7')).toBeGreaterThan(names.findIndex((name) => /^Show \d+ more/u.test(name)));

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
        trigger: 'restore',
        restoredFrom: 'rev-3',
        parent: 'rev-120',
      }),
      ...long,
    ];
    renderStablePane();

    expect(await screen.findByRole('button', { name: 'Rev 121 · Restored Rev 3' })).toBeInTheDocument();
  });

  it('offers no Undo restore on a restore head the restore machine did not mint (a reload, another device)', async () => {
    onLongLine({ headRevisionId: 'rev-121' });
    revisionStatusHarness.rows = [
      row({
        revisionId: 'rev-121',
        revisionNumber: 121,
        source: 'restore',
        trigger: 'restore',
        restoredFrom: 'rev-3',
        parent: 'rev-120',
      }),
      ...long,
    ];
    renderStablePane();

    expect(await screen.findByRole('button', { name: 'Rev 121 · Restored Rev 3' })).toBeInTheDocument();
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
    ['modified', { dirty: true }, 'Modified since Rev 4'],
    ['deciding a merge', { attention: 1, conflicts: [conflicted] }, 'Needs your decision on main'],
    ['before the line is known', { line: { kind: 'unknown' } as const, headRevisionId: undefined }, 'Loading history…'],
  ] as const)(
    'says one sentence %s, identical in the header’s name, its card and the strip (RA11)',
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

      const strip = await screen.findByRole('status', { name: 'Revision status' });
      await waitFor(() => {
        expect(strip).toHaveTextContent(sentence);
      });
      expect(strip.textContent).toBe(sentence);
      const trigger = screen.getByRole('button', { name: /^Open Revisions\./u });
      expect(trigger.getAttribute('aria-label')).toContain(sentence.replaceAll(' · ', ', ').replace(/…$/u, ''));
      await user.tab();
      expect(trigger).toHaveFocus();
      const card = await waitFor(() => {
        const found = document.querySelector('[data-slot="revision-card"]');
        expect(found).not.toBeNull();
        return found!;
      });
      expect(card).toHaveTextContent(sentence);
    },
  );

  /* M2 (I6, S20): an unlocated line is loading geometry, never *No revisions yet*, never `main`. */
  it('renders History’s loading geometry while the line is unknown', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };

    renderPane();

    expect(await screen.findByRole('status', { name: 'Loading history' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No revisions yet')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Where you are' })).not.toHaveTextContent('main');
    /* HQ7: nothing is offered over a line nobody has located yet. */
    expect(screen.queryByRole('button', { name: 'New branch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  /* Canvas round 16: the strip's Details keep Head, Branch tip and This device. */
  it.each([
    ['web', 'Workbench (browser)'],
    ['desktop', 'Workbench (desktop app)'],
  ] as const)('names this device in the strip’s Details on the %s build', async (target, device) => {
    vi.stubEnv('TAU_TARGET', target);
    const user = userEvent.setup();
    revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };
    renderPane();

    const strip = await screen.findByRole('region', { name: 'Where you are' });
    await user.click(within(strip).getByRole('button', { name: 'Details' }));
    const details = within(strip).getByLabelText('Details of where you are');
    expect(details).toHaveTextContent(/Headrev-4/u);
    expect(details).toHaveTextContent(`This device${device}`);
    vi.unstubAllEnvs();
  });

  it('names the line History shows, and says why an empty one is empty', async () => {
    renderPane();

    expect(await screen.findByRole('heading', { name: 'History · main' })).toBeInTheDocument();
    expect(await screen.findByText('No revisions yet')).toBeInTheDocument();
  });

  it('keeps the revision you are on in view, however far down it is (round 4)', async () => {
    revisionStatusHarness.rows = Array.from({ length: 20 }, (_, index) =>
      row({ revisionId: `rev-${String(20 - index)}`, revisionNumber: 20 - index, trigger: 'save' }),
    );
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-3' };

    renderPane();

    expect(await screen.findByRole('button', { name: 'Rev 3 · Thicker base' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 2 more' })).toBeInTheDocument();
  });

  it('folds consecutive autosaves into one row that opens to them', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-4', revisionNumber: 4, trigger: 'save' }),
      row({ revisionId: 'rev-3', revisionNumber: 3, trigger: 'idle' }),
      row({ revisionId: 'rev-2', revisionNumber: 2, trigger: 'idle' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, trigger: 'save' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-4' };

    renderPane();

    const fold = await screen.findByRole('button', { name: /^2 autosaves/u });
    expect(screen.queryByRole('button', { name: 'Rev 3 · Thicker base' })).not.toBeInTheDocument();
    await user.click(fold);
    expect(screen.getByRole('button', { name: 'Rev 3 · Thicker base' })).toBeInTheDocument();
  });

  it('is one Tab stop, on the row you are on, and moves by arrow keys (A1 item 14)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-3', revisionNumber: 3, trigger: 'save' }),
      row({ revisionId: 'rev-2', revisionNumber: 2, trigger: 'save' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, trigger: 'save' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };

    renderPane();

    const current = await screen.findByRole('button', { name: 'Rev 2 · Thicker base' });
    await waitFor(() => {
      expect(current).toHaveAttribute('tabindex', '0');
    });
    expect(screen.getByRole('button', { name: 'Rev 3 · Thicker base' })).toHaveAttribute('tabindex', '-1');
    current.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Rev 1 · Thicker base' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Rev 1 · Thicker base' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a removed collaborator calm: the strip and Sync say Access removed and what to do (HQ3)', async () => {
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
      expect(screen.getByRole('status', { name: 'Revision status' })).toHaveTextContent('Saved · Access removed');
    });
    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(backup).toHaveTextContent('Access removed');
    expect(backup).toHaveTextContent('Ask them to add you again');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('never renders an actor id, and names the agent (HQ4)', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-2', revisionNumber: 2, actor: 'claude-opus-4', source: 'agent' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, actor: 'user_2abc' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-2' };

    const { container } = render(<RevisionsPanelBody />, { wrapper });

    expect(await screen.findByText('Tau agent')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/claude-opus-4|user_2abc|anon:/u);
  });
});

/**
 * D19: a new project on an entitled account backs up by default, with one line
 * in *Where you are* and a per-project opt-out. The default connection itself
 * is the session's (`project-live-sessions.test.tsx`); this is what the person
 * sees and turns off.
 */
describe('Backup by default (D19)', () => {
  beforeEach(() => {
    localStorage.clear();
    backupAnnouncing = false;
  });

  it.each(['default', 'noticed'] as const)(
    'offers the opt-out, with its consequence, before the first revision leaves the device (%s)',
    async (intent) => {
      const user = userEvent.setup();
      tauCloudIntent.set('p', intent);

      renderPane();

      const line = await screen.findByRole('group', { name: 'Backup by default' });
      expect(line).toHaveTextContent('Backs up to Tau Cloud automatically.');
      /* Nothing is on Tau Cloud yet, so no copy there is promised (W10-L B-1). */
      expect(line).toHaveTextContent('Turning it off keeps this project on this device.');
      expect(line).not.toHaveTextContent('The copy already on Tau Cloud stays.');
      await user.click(within(line).getByRole('button', { name: 'Turn off backup' }));

      /* Nothing was connected yet, so there is nothing to disconnect; the intent is gone, so a reload stays off. */
      expect(revisionStatusHarness.commands.disconnectRemote).not.toHaveBeenCalled();
      expect(tauCloudIntent.get('p')).toBeUndefined();
      expect(screen.queryByRole('group', { name: 'Backup by default' })).not.toBeInTheDocument();
    },
  );

  it('cancels a default connection still being made rather than disconnecting it', async () => {
    const user = userEvent.setup();
    tauCloudIntent.set('p', 'connected');
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-1',
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    renderPane();
    const line = await screen.findByRole('group', { name: 'Backup by default' });
    /* The live remote, read when the button is pressed, has moved on from the drawn one. */
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connecting' },
    };

    await user.click(within(line).getByRole('button', { name: 'Turn off backup' }));

    expect(revisionStatusHarness.commands.cancelRemote).toHaveBeenCalledOnce();
    expect(revisionStatusHarness.commands.disconnectRemote).not.toHaveBeenCalled();
    expect(tauCloudIntent.get('p')).toBeUndefined();
  });

  it('reads Saved · Backed up after the default connection, with no Connect step, and turns it off', async () => {
    const user = userEvent.setup();
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
      expect(screen.getByRole('status', { name: 'Revision status' })).toHaveTextContent('Saved · Backed up');
    });
    expect(screen.getByText('Backs up to Tau Cloud automatically.')).toBeInTheDocument();
    expect(screen.getByText('Stops backing up. The copy already on Tau Cloud stays.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn off backup' }));

    expect(revisionStatusHarness.commands.disconnectRemote).toHaveBeenCalledOnce();
    expect(tauCloudIntent.get('p')).toBeUndefined();
  });

  it('dismisses the line and keeps the backup', async () => {
    const user = userEvent.setup();
    tauCloudIntent.set('p', 'connected');
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-1',
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };

    renderPane();
    const line = await screen.findByRole('group', { name: 'Backup by default' });
    await user.click(within(line).getByRole('button', { name: 'Dismiss' }));

    expect(revisionStatusHarness.commands.disconnectRemote).not.toHaveBeenCalled();
    expect(screen.queryByText('Backs up to Tau Cloud automatically.')).not.toBeInTheDocument();
  });

  /* DESIGN's one concise offer: the creation toast carries it first, and the line
     takes it over once the toast closes, still before the first save (W10-L B-2). */
  it('holds the pending offer back while the creation toast shows it', async () => {
    tauCloudIntent.set('p', 'noticed');
    backupAnnouncing = true;

    const { rerender } = render(<RevisionsPanelBody />, { wrapper });

    await screen.findByRole('region', { name: 'Where you are' });
    expect(screen.queryByRole('group', { name: 'Backup by default' })).not.toBeInTheDocument();

    backupAnnouncing = false;
    rerender(<RevisionsPanelBody />);
    expect(await screen.findByRole('group', { name: 'Backup by default' })).toHaveTextContent('Turn off backup');
  });

  it('shows no line for a project nothing is owed on', () => {
    renderPane();

    expect(screen.queryByText('Backs up to Tau Cloud automatically.')).not.toBeInTheDocument();
  });
});
