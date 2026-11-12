// @vitest-environment jsdom
/**
 * The header's revision trigger (S29, workspace-header-actions section 2 and 6).
 *
 * `[glyph] main` at rest, one glyph for the most urgent fact, the branch and
 * the status sentence in its tooltip and accessible name, and no hover card
 * (C6); *Switch to ⟨branch⟩* only while the focused chat works somewhere else.
 */

import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ArrowDownToLine, CircleAlert, CircleDashed, CloudAlert, FileDiff, GitMerge, History } from 'lucide-react';
import type { RevisionRow, RevisionStatusProjection } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { revisionAccessibleName, selectRevisionFacts } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionWhere } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

let focusedChatId: string | undefined = 'chat-1';
const editorRef = {
  getSnapshot: () => ({ context: { focusedChatId } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p', editorRef }),
}));

const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ observedChatIdsOf: () => [], subscribeMembership: () => () => undefined }),
}));
let chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'live' }];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'You' } },
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Thicker base',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

const onMain: RevisionWhere = { branch: 'main', head: 12, isDirty: false };

beforeEach(() => {
  revisionStatusHarness.reset();
  openPanel.mockClear();
  focusedChatId = 'chat-1';
  chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'live' }];
});

describe('selectRevisionFacts', () => {
  const status = (over: Partial<RevisionStatusProjection> = {}): RevisionStatusProjection => ({
    ...revisionStatusHarness.status,
    ...over,
  });
  const sync = (over: Partial<RevisionStatusProjection['sync']>): RevisionStatusProjection['sync'] => ({
    ...revisionStatusHarness.status.sync,
    ...over,
  });
  const remoteOf = (over: Partial<RevisionStatusProjection['remote']>): RevisionStatusProjection['remote'] => ({
    ...revisionStatusHarness.status.remote,
    phase: 'connected',
    ...over,
  });
  const tauRemote = remoteOf({ kind: 'tau', url: 'https://api.test/v1/git/p.git' });
  const githubRemote = remoteOf({
    kind: 'git',
    url: 'https://github.com/o/r.git',
    provider: 'github',
    repositoryId: '99',
  });
  const gitRemote = remoteOf({ kind: 'git', url: 'https://gitlab.example.com/o/r.git' });
  const conflict: RevisionStatusProjection['conflicts'][number] = {
    revisionId: 'rev-13',
    branch: 'main',
    into: 'main',
    foreign: false,
    labels: undefined,
    paths: [],
    busy: false,
    ready: false,
  };

  it.each([
    ['at a revision, not backed up anywhere', status(), onMain, History, 'none', 'Saved on this device'],
    ['backed up', status({ sync: sync({ state: 'backedUp' }) }), onMain, History, 'none', 'Saved · Backed up'],
    ['modified', status(), { ...onMain, isDirty: true }, FileDiff, 'none', 'Unsaved changes'],
    [
      'modified before the first save',
      status(),
      { ...onMain, head: undefined, isDirty: true },
      FileDiff,
      'none',
      'Nothing saved yet',
    ],
    ['saving', status({ minting: true }), { ...onMain, isDirty: true }, CircleDashed, 'running', 'Saving…'],
    [
      'restoring',
      status({ restore: { ...revisionStatusHarness.status.restore, busy: true, revisionNumber: 9 } }),
      onMain,
      CircleDashed,
      'running',
      'Restoring…',
    ],
    [
      'a branch verb running',
      status({
        branchVerb: { ...revisionStatusHarness.status.branchVerb, busy: true, operation: 'create', branch: 'gear' },
      }),
      onMain,
      CircleDashed,
      'running',
      'Creating gear…',
    ],
    [
      'both sides changed the branch',
      status({ attention: 1, conflicts: [conflict] }),
      onMain,
      GitMerge,
      'attention',
      'Needs your decision on main',
    ],
    [
      'Tau Cloud asking for sign-in',
      status({ remote: tauRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Sign in to back up',
    ],
    [
      'GitHub refusing its credential (R-U4)',
      status({ remote: githubRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Reconnect GitHub',
    ],
    [
      'another Git host refusing its credential (R-U4)',
      status({ remote: gitRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Your Git host refused access',
    ],
    [
      'GitHub refusing its credential after acknowledging everything (D68)',
      status({ remote: githubRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 0 }) }),
      onMain,
      CloudAlert,
      'attention',
      'Backed up · Reconnect GitHub',
    ],
    [
      'GitHub withheld while signed out of Tau, with nothing waiting (D100)',
      status({ remote: githubRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 0 }) }),
      { ...onMain, isSignedOut: true },
      CloudAlert,
      'attention',
      'Backed up · Sign in to back up',
    ],
    [
      'GitHub withheld while signed out of Tau, with a revision waiting (D100)',
      status({ remote: githubRemote, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }) }),
      { ...onMain, isSignedOut: true },
      CloudAlert,
      'attention',
      'Not backed up · Sign in to back up',
    ],
    [
      'a Git remote refusing large files (R-U4)',
      status({ remote: gitRemote, sync: sync({ state: 'failed', reason: 'largeFiles' }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Some files are too large for your Git host',
    ],
    [
      'a moved GitHub repository (D11)',
      status({ remote: githubRemote, sync: sync({ state: 'failed', reason: 'moved' }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Repository moved',
    ],
    [
      'backup refused',
      status({ sync: sync({ state: 'failed', reason: 'rejected' }) }),
      onMain,
      CircleAlert,
      'failed',
      'Couldn’t back up',
    ],
    [
      'a save that failed, over the modified glyph (RS22)',
      status({ attention: 1 }),
      { ...onMain, isDirty: true },
      CircleAlert,
      'failed',
      'Couldn’t confirm the save',
    ],
  ] as const)('draws %s', (...row) => {
    const [, input, where, icon, mark, sentence] = row;
    expect(selectRevisionFacts(input, where)).toMatchObject({ icon, mark, sentence });
  });

  it('keeps a queued or offline backup calm: the card owns it', () => {
    const facts = selectRevisionFacts(
      status({ sync: sync({ state: 'queued', pendingCount: 3, online: false }) }),
      onMain,
    );

    expect(facts).toMatchObject({ icon: History, mark: 'none', sentence: 'Saved · Not backed up · 3 changes' });
  });

  describe('a revision that arrived while a turn holds the files (W5b, D12)', () => {
    const arrivedStatus = status({ remote: tauRemote, sync: sync({ state: 'backedUp', arrived: 'rev-14' }) });
    const card = (actor: string, isYours?: true): RevisionCard => ({
      revisionId: 'rev-14',
      n: 14,
      createdAt: 0,
      summary: 'Remote work',
      actor,
      ...(isYours === undefined ? {} : { isYours }),
      turnId: undefined,
      conflicted: false,
      capture: 'turn',
    });

    it.each([
      ['the agent on Tau Cloud', card('Agent'), 'Changes from Agent are ready'],
      [
        'the viewer’s own other session, claiming no device (RV-W5b F11)',
        card('', true),
        'Changes from your other device are ready',
      ],
      ['a member of a shared project', card('Maya'), 'Changes from Maya are ready'],
      ['nobody the resolver can name, naming nobody', card(''), 'New changes are ready'],
      ['a card History has not read yet', undefined, 'New changes are ready'],
    ] as const)('says it arrived from %s, calmly', (_, arrived, sentence) => {
      expect(selectRevisionFacts(arrivedStatus, onMain, arrived)).toMatchObject({
        icon: ArrowDownToLine,
        mark: 'none',
        sentence,
      });
    });

    it('lets work in progress speak first', () => {
      expect(
        selectRevisionFacts({ ...arrivedStatus, minting: true }, { ...onMain, isDirty: true }, card('Agent')),
      ).toMatchObject({ mark: 'running', sentence: 'Saving…' });
    });
  });
});

describe('revisionAccessibleName', () => {
  it('says where you are, then the status sentence', () => {
    expect(revisionAccessibleName({ ...onMain, isDirty: true }, 'Unsaved changes')).toBe(
      'Open History. You are on main. Unsaved changes.',
    );
  });

  it('says Setting up before there is a branch, without doubling an ellipsis', () => {
    expect(revisionAccessibleName({ ...onMain, branch: undefined, head: undefined }, 'Setting up…')).toBe(
      'Open History. Setting up. Setting up…',
    );
    expect(revisionAccessibleName(onMain, 'Saving…')).toBe('Open History. You are on main. Saving…');
  });
});

describe('RevisionStatusAction', () => {
  it('shows the branch, and names the revision and its state', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-12' };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', {
      name: 'Open History. You are on main. Saved on this device.',
    });
    expect(trigger).toHaveTextContent(/^main$/u);
  });

  /*
   * RA2: a restore is a revision on the line (D1), so after restoring Rev 3 of
   * a twelve-revision `main` the header names the line — never *Rev 3*, never
   * *Viewing* — and the new head is `Rev 13` in the accessible name.
   */
  it('reads main with the History glyph after a restore (RA2)', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-13', revisionNumber: 13, summary: 'Restore', source: 'restore', restoredFrom: 'rev-3' }),
      row({ revisionId: 'rev-12', revisionNumber: 12 }),
      row({ revisionId: 'rev-3', revisionNumber: 3 }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-13' };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', {
      name: 'Open History. You are on main. Saved on this device.',
    });
    expect(trigger).toHaveTextContent(/^main$/u);
    expect(trigger.querySelector('[data-slot="revision-icon"]')).toHaveClass('lucide-history');
    expect(trigger).not.toHaveTextContent(/Viewing|Rev 3/u);
  });

  /* D100: signed out, this device withholds its GitHub credential, so GitHub refused nothing. */
  it('should ask a signed-out viewer to sign in, and a signed-in one to reconnect GitHub', async () => {
    onTestFinished(() => {
      setRevisionSessionUser(undefined);
    });
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-12',
      remote: {
        ...revisionStatusHarness.status.remote,
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/r.git',
        provider: 'github',
      },
      sync: { ...revisionStatusHarness.status.sync, state: 'failed', reason: 'unauthorized', pendingCount: 0 },
    };

    render(<RevisionStatusAction />, { wrapper });

    expect(
      await screen.findByRole('button', { name: 'Open History. You are on main. Backed up, Sign in to back up.' }),
    ).toBeInTheDocument();

    act(() => {
      setRevisionSessionUser({ id: 'user-1' });
    });

    expect(
      await screen.findByRole('button', {
        name: 'Open History. You are on main. Backed up, Reconnect GitHub.',
      }),
    ).toBeInTheDocument();
  });

  it('opens Revisions when it is clicked', async () => {
    const user = userEvent.setup();

    render(<RevisionStatusAction />, { wrapper });
    await user.click(screen.getByRole('button', { name: /^Open History\. You are on main\./u }));

    expect(openPanel).toHaveBeenCalledWith('revisions');
  });

  /* C6: the tooltip is the branch and the status sentence; the hover card, its facts and its recent list are gone. */
  it.each([
    ['keyboard focus', async (user: ReturnType<typeof userEvent.setup>) => user.tab()],
    [
      'hover',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.hover(screen.getByRole('button', { name: /^Open History\./u })),
    ],
  ] as const)('shows the status sentence as a tooltip on %s, and no hover card', async (_, reach) => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-12', revisionNumber: 12, summary: 'Motor mount holes' }),
      row({ revisionId: 'rev-11', revisionNumber: 11, summary: 'Thinner arms' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-12', dirty: true };

    render(<RevisionStatusAction />, { wrapper });
    const trigger = await screen.findByRole('button', { name: /Unsaved changes\.$/u });
    await reach(user);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^main · Unsaved changes$/u);
    expect(trigger).toHaveAccessibleDescription('main · Unsaved changes');
    expect(document.querySelector('[data-slot="revision-card"], [data-slot="hover-card-content"]')).toBeNull();
    expect(screen.queryByText('Motor mount holes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Click to open/u)).not.toBeInTheDocument();
  });

  it('says Setting up in the tooltip while the line is unknown', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };

    render(<RevisionStatusAction />, { wrapper });
    await screen.findByRole('button', { name: /^Open History\./u });
    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Setting up · Loading history…$/u);
  });

  it('offers Switch to the chat’s branch only while the chat works there, and switches (M2)', async () => {
    const user = userEvent.setup();
    chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'co-2' }];
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

    render(<RevisionStatusAction />, { wrapper });
    const switchTo = screen.getByRole('button', { name: 'Switch to bracket-fillet' });
    expect(switchTo.nextElementSibling).toBe(screen.getByRole('button', { name: /^Open History\./u }));
    await user.hover(switchTo);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^This chat is working on bracket-fillet$/u);
    await user.click(switchTo);

    expect(revisionStatusHarness.commands.pinTo).toHaveBeenCalledWith('co-2');
    expect(screen.queryByText(/Follow chat/u)).not.toBeInTheDocument();
  });

  it('offers no switch while the chat is where the workbench is', () => {
    render(<RevisionStatusAction />, { wrapper });

    expect(screen.queryByRole('button', { name: /^Switch to/u })).not.toBeInTheDocument();
  });

  /* R10, M2 (I6): before the projection names the line, History is loading — never empty, never `main`. */
  it('says History is loading while the line is unknown, rather than vanishing or saying nothing was saved', () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'unknown' } };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = screen.getByRole('button', { name: 'Open History. Setting up. Loading history…' });
    expect(trigger).toHaveTextContent('Setting up');
    expect(trigger).not.toHaveTextContent(/main|Nothing saved/u);
  });

  it('says the conflicted line in its name, and draws the amber GitMerge (HQ1, HQ2)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-12',
      attention: 1,
      conflicts: [
        {
          revisionId: 'rev-c',
          branch: 'bracket-fillet',
          into: 'main',
          foreign: false,
          labels: { ours: 'main', theirs: 'bracket-fillet' },
          paths: [],
          busy: false,
          ready: false,
        },
      ],
    };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', {
      name: 'Open History. You are on main. Needs your decision on main.',
    });
    expect(trigger.querySelector('[data-slot="revision-icon"]')).toHaveClass('lucide-git-merge', 'text-warning');
  });

  it('says a removed collaborator’s state calmly, never as a failure (HQ3)', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.role = 'revoked';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      headRevisionId: 'rev-12',
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
      sync: { ...revisionStatusHarness.status.sync, state: 'failed', reason: 'forbidden' },
    };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', {
      name: 'Open History. You are on main. Saved, Cloud copy unavailable.',
    });
    expect(trigger.querySelector('[data-slot="revision-icon"]')).toHaveClass('lucide-history');
  });

  it('renders nothing before the project root has answered at all', () => {
    revisionStatusHarness.connected = false;

    const { container } = render(<RevisionStatusAction />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });
});
