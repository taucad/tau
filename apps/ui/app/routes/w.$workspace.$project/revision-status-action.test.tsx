// @vitest-environment jsdom
/**
 * The always-on header chip (S29, A19).
 *
 * The chip is the only place outside the Revisions pane that names a branch,
 * so what it says for a given projection is the whole contract: the branch and
 * the revision at all times, and *Follow chat* only while the focused chat
 * works somewhere else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { RevisionRow } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { RevisionStatusAction } from '#routes/w.$workspace.$project/revision-status-action.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

let focusedChatId: string | undefined = 'chat-1';
const editorRef = {
  getSnapshot: () => ({ context: { focusedChatId } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', editorRef }) }));

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

beforeEach(() => {
  revisionStatusHarness.reset();
  openPanel.mockClear();
  focusedChatId = 'chat-1';
});

describe('RevisionStatusAction', () => {
  it('names the branch and the revision at all times', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-12', revisionNumber: 12 })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-12' };

    render(<RevisionStatusAction />, { wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Revisions. You are on main, Rev 12.' })).toBeInTheDocument();
    });
    expect(screen.getByText('Rev 12')).toBeInTheDocument();
  });

  it('opens Revisions when it is clicked', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main' };

    render(<RevisionStatusAction />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Open Revisions. You are on main.' }));

    expect(openPanel).toHaveBeenCalledWith('revisions');
  });

  it('offers Follow chat only while the chat works on another branch', async () => {
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
          leaseChatIds: ['chat-1'],
        },
      ],
    };

    render(<RevisionStatusAction />, { wrapper });
    const follow = screen.getByRole('button', { name: 'Follow chat, which is working on bracket-fillet' });
    await user.click(follow);

    expect(revisionStatusHarness.commands.followChat).toHaveBeenCalledWith('chat-1');
  });

  it('says nothing about following while the chat is where the workbench is', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: ['chat-1'] },
      ],
    };

    render(<RevisionStatusAction />, { wrapper });

    expect(screen.queryByText('Follow chat')).not.toBeInTheDocument();
  });

  it('says where you are even before the first revision, rather than vanishing (review R10)', () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: undefined };

    render(<RevisionStatusAction />, { wrapper });

    expect(screen.getByRole('button', { name: 'Open Revisions. You are on Setting up.' })).toBeInTheDocument();
  });

  it('renders nothing before the project root has answered at all', () => {
    revisionStatusHarness.connected = false;

    const { container } = render(<RevisionStatusAction />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });
});
