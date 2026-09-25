// @vitest-environment jsdom
/**
 * The Revisions pane's four regions, driven by a scripted projection (S26, A29).
 *
 * Every region reads the same two hooks the product does, mocked through the
 * one revision harness, so "what a person sees for this projection" is what is
 * asserted — no worker, no actor, no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { RevisionRow } from '@taucad/revisions';
import { RevisionsPanelBody, groupRevisionHistory } from '#routes/w.$workspace.$project/chat-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { refuseCreateBranch, revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type { TurnOutcomeNotice } from '#routes/w.$workspace.$project/revision-outcomes.js';

const projectSnapshot = { context: { project: { syncChats: true } } };
const projectRef = {
  getSnapshot: () => projectSnapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', projectRef }) }));
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
      branch: 'main',
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
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main' };

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

  /* W10 red pin (d): a conflicted head is a *Needs resolution* card on that
   * branch's row, and every per-file choice is one machine verb. Nothing here
   * touches main — the card says so, because that is AC14's promise to a
   * person. */
  it('renders a Needs resolution card for a conflicted branch head', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
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

    expect(await screen.findByText('Needs resolution')).toBeInTheDocument();
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
      branch: 'main',
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
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: 'theirs' }],
          busy: false,
          ready: true,
        },
      ],
    };

    renderPane();
    expect(await screen.findByRole('button', { name: 'Keep bracket-fillet in src/bracket.ts' })).toHaveAttribute(
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
      branch: 'main',
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
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();
    await user.click(await screen.findByRole('button', { name: 'Keep main in src/bracket.ts' }));

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
      branch: 'main',
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
      branch: 'main',
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
    turnOutcomes = [{ projectId: 'p', kind: 'failed', turnId: 'turn-1', chatId: 'chat-1', code: 'CUT_TIMED_OUT' }];
    renderPane();

    const alert = screen.getByRole('alert', { name: 'Turn outcome' });
    expect(alert).toHaveTextContent('Tau took too long to record that change.');
    expect(alert.textContent).not.toMatch(/checkout/iu);
  });

  it('switches to a branch the person picked', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
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
      branch: 'main',
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
    await user.click(screen.getByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  /* C3: the composer offers no branch, so a one-line project makes its second here. */
  it('offers New branch at one line, where the Branches region does not exist yet', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main' };

    renderPane();
    expect(screen.queryByRole('list', { name: 'Branches' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2');
  });

  it('places the chat in focus on a branch from that branch’s row', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
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
      branch: 'main',
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
    const refusing = refuseCreateBranch('enclosure-v2');

    renderPane();
    await user.click(screen.getByRole('button', { name: 'New branch' }));
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
      branch: 'main',
      headRevisionId: 'rev-4',
      dirty: true,
    };

    renderPane();

    await waitFor(() => {
      expect(screen.getByText('Modified since Rev 4')).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole('button', { name: 'Discard changes' })[0]!);
    expect(revisionStatusHarness.commands.restore).toHaveBeenCalledWith('rev-4');
  });

  it('offers Return to latest only while the checkout sits behind the branch tip', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-4', revisionNumber: 4 }),
      row({ revisionId: 'rev-3', revisionNumber: 3 }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-3' };

    renderPane();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Return to latest' })).toBeInTheDocument();
    });
  });

  it('shows the Sync region only once a remote exists, and offers to open it otherwise', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main' };

    renderPane();
    expect(screen.queryByRole('radio', { name: 'Tau Cloud' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Connect Tau Cloud' }));

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeInTheDocument();
  });

  it('names no git word in what a person reads (A18, I12)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-4', revisionNumber: 4 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
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
      branch: 'main',
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
    await user.click(screen.getByRole('menuitem', { name: 'Rename bracket-fillet' }));
    const field = screen.getByRole('textbox', { name: 'New name for bracket-fillet' });
    await user.clear(field);
    await user.type(field, 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(revisionStatusHarness.commands.renameBranch).toHaveBeenCalledWith('bracket-fillet', 'enclosure-v2');
  });
});

/** The W5 closeout pins: what the pane owed a person and did not give them. */
describe('Revisions pane closeout', () => {
  it('offers a resolution surface for a conflict on the only branch (C35)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      /* A sync divergence records its conflict on the *same* branch
       * (`sync.machine.ts` `conflictRef = refs/heads/${branch}`), so a
       * one-branch project announced *Needs resolution* with nowhere to go. */
      branches: [{ name: 'main', head: 'rev-c', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] }],
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'main',
          labels: { ours: 'main', theirs: 'origin/main' },
          paths: [{ path: 'src/bracket.ts', openable: true, side: undefined }],
          busy: false,
          ready: false,
        },
      ],
    };

    renderPane();

    expect(await screen.findByRole('button', { name: 'Keep main in src/bracket.ts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep origin/main in src/bracket.ts' })).toBeInTheDocument();
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

    renderPane();

    expect(
      await screen.findByRole('button', { name: 'Compare src/main.scad with the current file' }),
    ).toBeInTheDocument();
  });

  it('marks a branch on a host data directory as Linked (C40, I2)', async () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
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
      branch: 'main',
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

  it('asks for no diff it does not render, including inside the closed Earlier fold (C52)', async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ revisionId: `rev-${String(index)}`, revisionNumber: 40 - index, trigger: 'save' }),
    );
    revisionStatusHarness.rows = rows;
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-0' };

    renderPane();

    await waitFor(() => {
      expect(screen.getAllByRole('listitem', { name: /^Revision \d+$/u }).length).toBeGreaterThan(0);
    });
    const visible = screen.getAllByRole('listitem', { name: /^Revision \d+$/u }).length;
    expect(visible).toBeLessThanOrEqual(8);
    /* One `revision-diff` query per *rendered* row, not per row in the graph. */
    expect(new Set(revisionStatusHarness.diffRequests).size).toBeLessThanOrEqual(visible);
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
