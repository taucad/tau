// @vitest-environment jsdom
/**
 * Branch actions after the Branches card (History D3): every verb the card
 * offered, reached from where it lives now — the header's branch chip, a
 * branch chip's ⋮ on History's lanes, or the palette (its own suite) — and no
 * conflict line listed as a branch anywhere. A conflict's decision stays on its
 * card, where another device's conflict is dismissed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { RevisionConflictFacet } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ConflictDecision } from '#routes/w.$workspace.$project/revision-branches.js';
import { RevisionsPanelBody } from '#routes/w.$workspace.$project/chat-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';
import { conflictLine, lanesScenarios } from '#routes/w.$workspace.$project/history-lanes.test-harness.js';
import type { LanesScenario } from '#routes/w.$workspace.$project/history-lanes.test-harness.js';
import { describeRevisionFailure } from '@taucad/ui-core/lib/revision-failure-copy';

const projectSnapshot = { context: { project: { syncChats: true } } };
const editorSnapshot = { context: { focusedChatId: undefined } };
const projectRef = { getSnapshot: () => projectSnapshot, subscribe: () => ({ unsubscribe: () => undefined }) };
const editorRef = { getSnapshot: () => editorSnapshot, subscribe: () => ({ unsubscribe: () => undefined }) };
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', projectRef, editorRef }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: vi.fn() }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ updateProject: vi.fn() }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    observedChatIdsOf: () => [],
    subscribeMembership: () => () => undefined,
    subscribeProjection: () => () => undefined,
    getProjection: () => undefined,
  }),
}));
const chats = [
  /* The chat in focus, placed on a checkout no branch below holds yet. */
  { id: 'chat-1', name: 'Optimize bracket', checkoutId: 'checkout-elsewhere' },
];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTauCloudEligibility: () => ({ auth: 'authed', isResolved: true, canSyncFiles: true }),
}));
const placeChat = vi.fn(async () => undefined);
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({ placeChat }),
}));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({
  useTurnOutcomes: () => [],
  clearTurnOutcome: vi.fn(),
}));
vi.mock('#routes/w.$workspace.$project/revision-ref-removal.js', () => ({ requestRefRemoval: vi.fn() }));
vi.mock('#components/code/diff-viewer.js', () => ({ DiffViewer: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-conflict-editor.js', () => ({ RevisionConflictEditor: () => null }));

const line = 'conflicts/main/device-b';
const foreign: RevisionConflictFacet = {
  revisionId: 'rev-c',
  branch: line,
  into: 'main',
  foreign: true,
  labels: { ours: 'main', theirs: 'tau/main' },
  paths: [
    { path: 'part.scad', openable: true, side: undefined },
    { path: '.tau/parameters/part.json', openable: false, side: undefined, keys: ['height'] },
  ],
  busy: false,
  ready: false,
};

const decision = (conflict: RevisionConflictFacet, onKeepSide = vi.fn()) =>
  render(
    <ConflictDecision
      conflict={conflict}
      conflictTexts={{}}
      onKeepSide={onKeepSide}
      onOpenConflict={vi.fn()}
      onAskChat={vi.fn()}
      onFinishResolution={vi.fn()}
      onResolveInEditor={vi.fn()}
    />,
  );

beforeEach(() => {
  revisionStatusHarness.reset();
  revisionStatusHarness.status = {
    ...revisionStatusHarness.status,
    remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
  };
  revisionStatusHarness.role = 'owner';
  vi.mocked(requestRefRemoval).mockReset();
  placeChat.mockClear();
});

describe('a decision that travels (D14)', () => {
  it('names the line it lands on and keeps sides device-relative, with a parameter as choose-one', async () => {
    const user = userEvent.setup();
    const onKeepSide = vi.fn();
    decision(foreign, onKeepSide);

    expect(
      screen.getByText(
        'Another device and this one changed the same lines in 2 files on main. main is untouched until you choose.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeDisabled();
    expect(screen.getByText('Both changed height')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit .tau/parameters/part.json manually' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep theirs in .tau/parameters/part.json' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep mine in part.scad' }));
    expect(onKeepSide).toHaveBeenCalledWith('rev-c', 'part.scad', 'mine');
  });

  it('says an editor overlap is your edit against the line', () => {
    decision({ ...foreign, foreign: false, labels: { ours: 'main', theirs: 'main' }, paths: [foreign.paths[0]!] });

    expect(
      screen.getByText(
        'Your edit and the latest main changed the same lines in 1 file. main is untouched until you choose.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a decision whose file count is not a choice (R13)', () => {
  it('should say Checking files while the conflict is being read, never a count', () => {
    decision({ ...foreign, labels: undefined, paths: [], busy: true });

    expect(screen.getByRole('status')).toHaveTextContent('Checking files…');
    expect(screen.queryByText(/0 files/u)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeDisabled();
  });

  it('should say nothing still differs, with Merge as the one action, when a later merge reconciled every file', async () => {
    const user = userEvent.setup();
    const onFinishResolution = vi.fn();
    render(
      <ConflictDecision
        conflict={{ ...foreign, paths: [], ready: true }}
        conflictTexts={{}}
        onKeepSide={vi.fn()}
        onOpenConflict={vi.fn()}
        onAskChat={vi.fn()}
        onFinishResolution={onFinishResolution}
        onResolveInEditor={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing still differs on main. Merge to finish this decision.')).toBeInTheDocument();
    expect(screen.queryByText(/0 files/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask chat to resolve' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Merge into main' }));
    expect(onFinishResolution).toHaveBeenCalledWith('rev-c');
  });

  it('should say the conflict could not be read when its read failed, never a count', () => {
    decision({ ...foreign, labels: undefined, paths: [], busy: false });

    expect(screen.getByText('This conflict could not be read. Reload the page to read it again.')).toBeInTheDocument();
    expect(screen.queryByText(/0 files/u)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeDisabled();
  });
});

const scenario = (id: string): LanesScenario => lanesScenarios.find((entry) => entry.id === id)!;
/* `main`'s own history, for the divergence the header and Update from count. */
const mainHistory = scenario('this-branch-main-alone').rows;

type PaneOptions = Readonly<{
  current?: string;
  search?: string;
  facets?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Show every branch, as the filter's All branches does. */
  isAll?: boolean;
}>;

/**
 * Script the client with one canvas scenario's graph and render the pane.
 *
 * @param id - The scenario.
 * @param options - Where the files are, the route's search, changes to each branch's facet, and the filter.
 */
const renderPane = async (id: string, options: PaneOptions = {}): Promise<void> => {
  const { graph, head, rows, conflicts = [] } = scenario(id);
  const current = options.current ?? scenario(id).current;
  const isScenarioPlace = current === scenario(id).current;
  revisionStatusHarness.rows = isScenarioPlace ? rows : mainHistory;
  revisionStatusHarness.rowsByBranch.set('main', mainHistory);
  revisionStatusHarness.graph = graph;
  revisionStatusHarness.status = {
    ...revisionStatusHarness.status,
    line: { kind: 'branch', name: current },
    headRevisionId: isScenarioPlace ? head : mainHistory[0]!.revisionId,
    checkoutId: `checkout-${current}`,
    liveCheckoutId: `checkout-${current}`,
    branches: graph.branches.map((branch) => ({
      name: branch.name,
      head: branch.head,
      checkoutId: branch.name === conflictLine ? undefined : `checkout-${branch.name}`,
      checkoutRoot: branch.name === conflictLine ? undefined : `/checkouts/${branch.name}`,
      leaseChatIds: [],
      ...options.facets?.[branch.name],
    })),
    conflicts,
  };
  render(<RevisionsPanelBody />, {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[`/w/home/p${options.search ?? ''}`]}>{children}</MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  });
  await screen.findByRole('list', { name: 'History entries' });
  if (options.isAll === true) {
    await userEvent.setup().click(await screen.findByRole('radio', { name: 'All branches' }));
  }
  await waitFor(() => {
    expect(document.querySelector('[data-row="chip"]')).not.toBeNull();
  });
};

const openBranchMenu = async (user: ReturnType<typeof userEvent.setup>, branch: string): Promise<void> => {
  await user.click(await screen.findByRole('button', { name: `More for ${branch}` }));
};

describe('the Branches card is gone (D3)', () => {
  it('should render no Branches region or list, with two branches', async () => {
    await renderPane('graph-two-branches');

    expect(screen.queryByRole('heading', { name: 'Branches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Branches' })).not.toBeInTheDocument();
  });
});

describe('every action the card offered, from its new entry point (D3)', () => {
  it('should switch from the header’s branch chip, which is the branch menu', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await user.click(screen.getByRole('button', { name: 'Branch: enclosure-v2. Switch branch' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^main/u }));

    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('main');
  });

  it('should switch from a branch chip’s ⋮, as Switch to x', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await openBranchMenu(user, 'main');
    await user.click(screen.getByRole('menuitem', { name: 'Switch to main' }));

    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('main');
  });

  it('should merge a branch into the one you are on from its chip, at once and with no dialog (I11)', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches', { current: 'main', isAll: true });

    await openBranchMenu(user, 'enclosure-v2');
    await user.click(screen.getByRole('menuitem', { name: 'Merge into main' }));

    expect(revisionStatusHarness.commands.mergeBranch).toHaveBeenCalledWith('enclosure-v2');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('should bring main in with Update from main on the branch you are on while it is behind', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await openBranchMenu(user, 'enclosure-v2');
    const update = await screen.findByRole('menuitem', { name: /^Update from main/u });
    expect(update).toHaveTextContent('3 behind');
    await user.click(update);

    expect(revisionStatusHarness.commands.mergeBranch).toHaveBeenCalledWith('main');
  });

  it('should rename a branch from its chip, in the one naming form', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await openBranchMenu(user, 'enclosure-v2');
    await user.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    const field = await screen.findByRole('textbox', { name: 'New name for enclosure-v2' });
    await user.clear(field);
    await user.type(field, 'enclosure-v3');
    await user.click(screen.getByRole('button', { name: 'Rename branch' }));

    expect(revisionStatusHarness.commands.renameBranch).toHaveBeenCalledWith('enclosure-v2', 'enclosure-v3');
  });

  /* D91, audit R1: the refusal's own sentence, so the menu and the toast never disagree. */
  it.each([
    ['main', { onRemote: true }, 'BRANCH_RENAME_PUSHED'],
    ['enclosure-v2', { checkoutId: 'checkout-linked' }, 'BRANCH_RENAME_LINKED'],
  ] as const)(
    'should list Rename… for %s as unavailable, with the refusal as its reason',
    async (name, facet, code) => {
      const user = userEvent.setup();
      await renderPane('graph-two-branches', { current: 'main', facets: { [name]: facet }, isAll: true });

      await openBranchMenu(user, name);
      const item = screen.getByRole('menuitem', { name: /^Rename…/u });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent(describeRevisionFailure('branch', code).description);
      await user.click(item);

      expect(screen.queryByRole('textbox', { name: `New name for ${name}` })).not.toBeInTheDocument();
      expect(revisionStatusHarness.commands.renameBranch).not.toHaveBeenCalled();
    },
  );

  it('should run the chat in focus on a branch, as Run this chat here, only where it would move the chat', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches', {
      search: '?chat=chat-1',
      facets: { main: { checkoutId: 'checkout-elsewhere' } },
    });

    /* The chat in focus already works where main's files are, so main does not offer to take it. */
    await openBranchMenu(user, 'main');
    expect(screen.queryByRole('menuitem', { name: 'Run this chat here' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await openBranchMenu(user, 'enclosure-v2');
    await user.click(screen.getByRole('menuitem', { name: 'Run this chat here' }));

    expect(placeChat).toHaveBeenCalledWith('chat-1', 'checkout-enclosure-v2');
  });

  it('should close a branch you are not on from its chip, at once, as Close branch', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches', { current: 'main', isAll: true });

    await openBranchMenu(user, 'enclosure-v2');
    await user.click(screen.getByRole('menuitem', { name: 'Close branch' }));

    expect(revisionStatusHarness.commands.discardBranch).toHaveBeenCalledWith('enclosure-v2', 'checkout-enclosure-v2');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('should never offer to close main, from its chip, while you are on another branch', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await openBranchMenu(user, 'main');
    const menu = screen.getByRole('menu');

    expect(within(menu).getByRole('menuitem', { name: 'Switch to main' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Close branch' })).not.toBeInTheDocument();
  });

  it('should offer no Switch, Merge or Close for the branch you are on', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches');

    await openBranchMenu(user, 'enclosure-v2');
    const menu = screen.getByRole('menu');

    expect(within(menu).queryByRole('menuitem', { name: /^Switch to/u })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^Merge into/u })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Close branch' })).not.toBeInTheDocument();
  });

  it('should say Not on this device in the branch menu for a branch only Tau Cloud has (D93)', async () => {
    const user = userEvent.setup();
    await renderPane('graph-two-branches', {
      current: 'main',
      facets: { 'enclosure-v2': { checkoutId: undefined, checkoutRoot: undefined, onRemote: true } },
      isAll: true,
    });

    await user.click(screen.getByRole('button', { name: 'Branch: main. Switch branch' }));

    expect(screen.getByRole('menuitemradio', { name: /^enclosure-v2/u })).toHaveTextContent('Not on this device');
    expect(screen.queryByText('Remote only')).not.toBeInTheDocument();
    expect(screen.queryByText('Linked')).not.toBeInTheDocument();
  });

  /* A merge is undone by restoring the entry before it: Undo never reaches past a merge (RV-W7 #7). */
  it('should keep Restore on the entry before a merge, which is how a merge is undone', async () => {
    const user = userEvent.setup();
    await renderPane('branch-merged');

    await user.click(screen.getByRole('button', { name: /^Update BOM/u }));
    await user.click(await screen.findByRole('button', { name: 'Restore “Update BOM”' }));

    expect(revisionStatusHarness.commands.restore).toHaveBeenCalledWith('c7bom000');
  });
});

describe('a conflict line is never listed as a branch (D3)', () => {
  it('should leave it out of the header’s branch menu, the lanes and the chips, and draw the merge as one node', async () => {
    const user = userEvent.setup();
    await renderPane('branch-conflict');

    const frame = document.querySelector<HTMLElement>('[data-slot="history-graph-frame"]');
    expect(frame?.dataset['lanes']).toBe('main,enclosure-v2');
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-row="chip"]')].map((chip) => chip.dataset['branch']),
    ).toEqual(['main', 'enclosure-v2']);
    expect(screen.queryByText(conflictLine)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Your|Another device’s) decision on main$/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More for conflicts/u })).not.toBeInTheDocument();
    /* The pending merge is one row above main, and Resolve takes you to its card. */
    const pending = document.querySelector<HTMLElement>('[data-row="merge"]');
    expect(pending).toHaveTextContent('Merge enclosure-v2 into main');
    expect(pending).toHaveTextContent('1 file · main is unchanged until you choose');
    /* Jsdom lays nothing out, so it has no scrolling to do. */
    Element.prototype.scrollIntoView = vi.fn();
    await user.click(within(pending!).getByRole('button', { name: 'Resolve' }));
    expect(document.activeElement).toHaveAccessibleName('Keep mine in lid.tsx');

    await user.click(screen.getByRole('button', { name: 'Branch: main. Switch branch' }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(
      expect.not.arrayContaining([expect.stringContaining('conflicts/')]),
    );
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
  });
});

describe('another device’s conflict, on its card (D3, D14)', () => {
  it('should offer Dismiss this conflict… to the project’s owner only (RV-W6 F5)', () => {
    revisionStatusHarness.role = 'write';
    decision(foreign);

    expect(screen.queryByRole('button', { name: 'Dismiss this conflict…' })).not.toBeInTheDocument();
  });

  it('should offer nothing to dismiss for this device’s own conflict', () => {
    decision({ ...foreign, branch: 'conflicts/main/device-a', foreign: false });

    expect(screen.queryByRole('button', { name: 'Dismiss this conflict…' })).not.toBeInTheDocument();
  });

  it('should dismiss it through the audited verb, then sync', async () => {
    const user = userEvent.setup();
    vi.mocked(requestRefRemoval).mockResolvedValue({ kind: 'removed' });
    decision(foreign);

    await user.click(screen.getByRole('button', { name: 'Dismiss this conflict…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Dismiss another device’s conflict on main?' });
    expect(dialog).toHaveTextContent('part.scad, .tau/parameters/part.json');
    /* The raw line is for engineers, behind Details. */
    expect(dialog).toHaveTextContent(`refs/heads/${line}`);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(requestRefRemoval).toHaveBeenCalledWith('p', `refs/heads/${line}`);
    expect(revisionStatusHarness.commands.syncNow).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('should say who may dismiss it when the remote refuses', async () => {
    const user = userEvent.setup();
    vi.mocked(requestRefRemoval).mockResolvedValue({ kind: 'refused', code: 'GIT_REF_REMOVAL_OWNER_ONLY' });
    decision(foreign);

    await user.click(screen.getByRole('button', { name: 'Dismiss this conflict…' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the project’s owner can remove another device’s decision.',
    );
    expect(revisionStatusHarness.commands.syncNow).not.toHaveBeenCalled();
  });
});
