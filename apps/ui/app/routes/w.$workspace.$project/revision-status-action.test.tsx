// @vitest-environment jsdom
/**
 * The header's revision trigger (S29, workspace-header-actions section 2 and 6).
 *
 * `[glyph] main` at rest, one glyph for the most urgent fact, the rest in a
 * hover card and the accessible name; *Follow chat* only while the focused
 * chat works somewhere else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { CircleAlert, CircleDashed, CloudAlert, FileDiff, GitMerge, History, Rewind } from 'lucide-react';
import type { RevisionRow, RevisionStatusProjection } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  RevisionStatusAction,
  revisionAccessibleName,
  selectRevisionFacts,
} from '#routes/w.$workspace.$project/revision-status-action.js';
import type { RevisionWhere } from '#routes/w.$workspace.$project/revision-status-action.js';
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

const settlements: readonly never[] = [];
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getHostFinalizedTurns: () => settlements,
  subscribeHostFinalizedTurns: () => () => undefined,
}));
let chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'live' }];
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

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

const onMain: RevisionWhere = { branch: 'main', head: 12, latest: undefined, isDirty: false };

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
  const conflict: RevisionStatusProjection['conflicts'][number] = {
    revisionId: 'rev-13',
    branch: 'main',
    labels: undefined,
    paths: [],
    busy: false,
    ready: false,
  };

  it.each([
    ['at a revision, not backed up anywhere', status(), onMain, History, 'none', 'Saved on this device'],
    ['backed up', status({ sync: sync({ state: 'backedUp' }) }), onMain, History, 'none', 'Saved · Backed up'],
    ['modified', status(), { ...onMain, isDirty: true }, FileDiff, 'none', 'Modified since Rev 12'],
    [
      'modified before the first save',
      status(),
      { ...onMain, head: undefined, isDirty: true },
      FileDiff,
      'none',
      'Not saved yet',
    ],
    [
      'showing an older revision',
      status(),
      { ...onMain, head: 3, latest: 12 },
      Rewind,
      'none',
      'Viewing Rev 3 · main is at Rev 12',
    ],
    ['saving', status({ minting: true }), { ...onMain, isDirty: true }, CircleDashed, 'running', 'Saving…'],
    [
      'restoring',
      status({ restore: { ...revisionStatusHarness.status.restore, busy: true, revisionNumber: 9 } }),
      onMain,
      CircleDashed,
      'running',
      'Restoring Rev 9…',
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
      'Needs your decision · both sides changed main',
    ],
    [
      'backup asks for sign-in',
      status({ sync: sync({ state: 'failed', reason: 'unauthorized' }) }),
      onMain,
      CloudAlert,
      'attention',
      'Not backed up · Sign in',
    ],
    [
      'backup refused',
      status({ sync: sync({ state: 'failed', reason: 'rejected' }) }),
      onMain,
      CircleAlert,
      'failed',
      'Backup failed',
    ],
    [
      'a save that failed, over the modified glyph (RS22)',
      status({ attention: 1 }),
      { ...onMain, isDirty: true },
      CircleAlert,
      'failed',
      'Save not confirmed',
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

    expect(facts).toMatchObject({ icon: History, mark: 'none', sentence: 'Saved · Not backed up · 3 revisions' });
  });
});

describe('revisionAccessibleName', () => {
  it('says where you are, then the status sentence', () => {
    expect(revisionAccessibleName({ ...onMain, isDirty: true }, 'Modified since Rev 12')).toBe(
      'Open Revisions. You are on main, Rev 12. Modified since Rev 12.',
    );
  });

  it('names the revision you are on while it is not the latest', () => {
    expect(revisionAccessibleName({ ...onMain, head: 3, latest: 12 }, 'Viewing Rev 3 · main is at Rev 12')).toBe(
      'Open Revisions. You are on Rev 3 of main. Viewing Rev 3, main is at Rev 12.',
    );
  });

  it('says Setting up before there is a branch, without doubling an ellipsis', () => {
    expect(revisionAccessibleName({ ...onMain, branch: undefined, head: undefined }, 'Setting up history')).toBe(
      'Open Revisions. Setting up. Setting up history.',
    );
    expect(revisionAccessibleName(onMain, 'Saving…')).toBe('Open Revisions. You are on main, Rev 12. Saving…');
  });
});

describe('RevisionStatusAction', () => {
  it('shows the branch, and names the revision and its state', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-12' };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', {
      name: 'Open Revisions. You are on main, Rev 12. Saved on this device.',
    });
    expect(trigger).toHaveTextContent(/^main$/u);
  });

  it('labels the revision instead of the branch while an older one is showing', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-12', revisionNumber: 12 }),
      row({ revisionId: 'rev-3', revisionNumber: 3 }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-3' };

    render(<RevisionStatusAction />, { wrapper });

    const trigger = await screen.findByRole('button', { name: /^Open Revisions\. You are on Rev 3 of main\./u });
    expect(trigger).toHaveTextContent(/^Rev 3$/u);
  });

  it('opens Revisions when it is clicked', async () => {
    const user = userEvent.setup();

    render(<RevisionStatusAction />, { wrapper });
    await user.click(screen.getByRole('button', { name: /^Open Revisions\. You are on main\./u }));

    expect(openPanel).toHaveBeenCalledWith('revisions');
  });

  it('shows its card on keyboard focus, with the status and the recent revisions', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-12', revisionNumber: 12, summary: 'Motor mount holes' }),
      row({ revisionId: 'rev-11', revisionNumber: 11, summary: 'Thinner arms' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-12', dirty: true };

    render(<RevisionStatusAction />, { wrapper });
    await screen.findByRole('button', { name: /Modified since Rev 12\.$/u });
    await user.tab();

    const recent = await screen.findByRole('list', { name: 'Recent revisions' });
    expect(recent).toHaveTextContent('Motor mount holes');
    expect(recent).toHaveTextContent('Thinner arms');
    expect(screen.getByText('Modified since Rev 12')).toBeInTheDocument();
    expect(screen.getByText('Click to open Revisions')).toBeInTheDocument();
  });

  it('offers Follow chat only while the chat works on another branch', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Follow chat, which is working on bracket-fillet' }));

    expect(revisionStatusHarness.commands.pinTo).toHaveBeenCalledWith('co-2');
  });

  it('says nothing about following while the chat is where the workbench is', () => {
    render(<RevisionStatusAction />, { wrapper });

    expect(screen.queryByText('Follow chat')).not.toBeInTheDocument();
  });

  it('says where you are even before the first revision, rather than vanishing (review R10)', () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: undefined };

    render(<RevisionStatusAction />, { wrapper });

    expect(screen.getByRole('button', { name: 'Open Revisions. Setting up. Nothing saved yet.' })).toHaveTextContent(
      'Setting up',
    );
  });

  it('renders nothing before the project root has answered at all', () => {
    revisionStatusHarness.connected = false;

    const { container } = render(<RevisionStatusAction />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });
});
