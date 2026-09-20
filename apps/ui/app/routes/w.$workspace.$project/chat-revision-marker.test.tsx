import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import { useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard, RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { requestRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';

const chatState = vi.hoisted(() => ({
  messagesById: new Map<string, { role: string }>([
    ['u1', { role: 'user' }],
    ['a1', { role: 'assistant' }],
  ]),
  status: 'ready' as string,
  error: undefined as Error | undefined,
  persistedError: undefined as unknown,
}));
const retry = vi.hoisted(() => ({ retryAttempt: 0, retryMaxAttempts: 5 }));
const continueChat = vi.hoisted(() => vi.fn());
const openPanel = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
const host = vi.hoisted(() => ({ settlement: undefined as unknown, workspace: undefined as unknown }));

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat-1' }),
  useChatSelector: (selector: (state: typeof chatState) => unknown) => selector(chatState),
  useChatRetrySnapshot: () => retry,
  useChatActions: () => ({ continueChat }),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revisions.js', () => ({
  useRevisions: vi.fn(),
  useRevisionChanges: vi.fn(),
  useRevisionFileComparison: vi.fn(),
}));
vi.mock('#hooks/use-restore-to-point.js', () => ({ useRestoreToPoint: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#hooks/use-sidebar-status.js', () => ({ useChatSidebarStatus: vi.fn() }));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({ useTurnOutcomes: () => [] }));
vi.mock('#routes/w.$workspace.$project/revision-reveal.js', () => ({ requestRevisionReveal: vi.fn() }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getHostTurnSettlement: () => host.settlement,
  subscribeHostTurnSettlements: () => () => undefined,
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({
    ready: true,
    get: () => host.workspace,
    subscribe: () => () => undefined,
  }),
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

const setRevisions = (view: Partial<RevisionsView>): void => {
  vi.mocked(useRevisions).mockReturnValue({
    revisions: view.revisions ?? [],
    byTurnId: view.byTurnId ?? new Map<string, RevisionCard>(),
    headRevisionId: view.headRevisionId,
    branch: view.branch ?? 'main',
    isDirty: false,
    canReturnToLatest: false,
    isLoading: false,
  });
};

const setRun = (state: ChatSidebarStatus['state'] | undefined): void => {
  vi.mocked(useChatSidebarStatus).mockReturnValue(
    state === undefined ? undefined : ({ state } as unknown as ChatSidebarStatus),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  chatState.status = 'ready';
  chatState.error = undefined;
  chatState.persistedError = undefined;
  retry.retryAttempt = 0;
  host.settlement = undefined;
  host.workspace = undefined;
  setRun(undefined);
  setRevisions({});
  vi.mocked(useRevisionChanges).mockReturnValue([
    { path: 'bracket.scad', kind: 'modified' },
    { path: '.tau/parameters/bracket.scad.json', kind: 'modified' },
  ]);
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore,
    returnToLatest: vi.fn(),
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
});

describe('ChatRevisionMarker', () => {
  it('should render nothing for a turn not anchored by a user message', () => {
    setRevisions({ byTurnId: new Map([['a1', revision({ turnId: 'a1' })]]) });
    const { container } = render(<ChatRevisionMarker userMessageId='a1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when the host confirms the request changed no files', () => {
    host.settlement = { type: 'turn.finalized', turnId: 'u1', chatId: 'chat-1', changedPaths: [] };
    host.workspace = { execution: { baseRevisionId: 'rev-4' } };
    setRun('done');
    const { container } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(container.firstChild).toBeNull();
  });

  it('should keep a saved revision compact until its changes are requested', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-9' });
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
    expect(screen.getByRole('button', { name: 'Name version' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Files · 2' }));
    expect(screen.getByText('bracket.scad')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore to Revision 5' }));
    expect(restore).toHaveBeenCalledWith('rev-5');
  });

  it('should read Current as neutral text on the head revision', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-5' });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    fireEvent.click(screen.getByRole('button', { name: /revision details$/ }));
    expect(screen.getByText('Current')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('should link an earlier saved request to its revision in Revisions', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]) });
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'View revision' }));
    /* Keyed by project: one document can hold two panes (C47). */
    expect(requestRevisionReveal).toHaveBeenCalledWith('p', 'rev-5');
    expect(openPanel).toHaveBeenCalledWith('revisions');
  });

  it('should show the confirmed starting revision while work runs', () => {
    host.workspace = { execution: { baseRevisionId: 'rev-4' } };
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    setRun('working');
    chatState.status = 'streaming';
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Starting from Rev 4');
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('should not read the turn base as a save while work runs', () => {
    /* A turn that starts dirty mints its base under its own turn id (D17), so
       the graph attaches a card to a turn that has saved nothing yet — on a new
       project that card is the scaffold, minted as Rev 1. */
    host.workspace = { execution: { baseRevisionId: 'rev-1' } };
    setRevisions({
      revisions: [revision({ revisionId: 'rev-1', n: 1, turnId: 'u1' })],
      byTurnId: new Map([['u1', revision({ revisionId: 'rev-1', n: 1 })]]),
    });
    setRun('working');
    chatState.status = 'streaming';
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Starting from Rev 1');
  });

  it('should hold the last known label while the stream reconnects', () => {
    host.workspace = { execution: { baseRevisionId: 'rev-4' } };
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    setRun('finishing');
    const { rerender } = render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Saving revision');

    setRun('reconnecting');
    retry.retryAttempt = 1;
    rerender(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);
    expect(screen.getByRole('status').textContent).toBe('Saving revision');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('should offer Retry when a placed request errors without a settlement', () => {
    host.workspace = { execution: { baseRevisionId: 'rev-4' } };
    setRevisions({ revisions: [revision({ revisionId: 'rev-4', n: 4, turnId: undefined })] });
    chatState.persistedError = { category: 'generic', title: 'Error', message: 'Network error', code: 'ERR' };
    render(<ChatRevisionMarker userMessageId='u1' isLatestTurn />);

    expect(screen.getByRole('status').textContent).toBe('Save not confirmed');
    fireEvent.click(screen.getByRole('button', { name: /revision details$/ }));
    expect(screen.getByText(/Rev 4 is the last confirmed revision/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(continueChat).toHaveBeenCalledOnce();
  });
});
