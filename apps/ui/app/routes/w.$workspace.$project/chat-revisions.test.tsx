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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { RevisionRow } from '@taucad/revisions';
import { RevisionsPanelBody, groupRevisionHistory } from '#routes/w.$workspace.$project/chat-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

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
  DiffViewer: ({ originalContent, modifiedContent }: { originalContent: string; modifiedContent: string }) => (
    <pre data-testid='conflict-diff'>{`${originalContent}|${modifiedContent}`}</pre>
  ),
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
const chats = [{ id: 'chat-1', name: 'Optimize bracket', checkoutId: 'co-2' }];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));

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
