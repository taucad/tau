import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ChatRevisions } from '#routes/w.$workspace.$project/chat-revisions.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import type { Revision } from '#lib/file-restore-timeline.js';
import { ImmutableRevisionTree, revisionBranchName, revisionId } from '@taucad/filesystem';
import type { RevisionGraph, RevisionGraphNode } from '#lib/revision-graph.js';

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
  FloatingPanelContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeaderActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FloatingPanelContentTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FloatingPanelContentBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FloatingPanelClose: () => <button type='button'>close</button>,
}));
vi.mock('#hooks/use-revisions.js', () => ({ useVisibleRevisions: vi.fn() }));
vi.mock('#hooks/use-restore-to-point.js', () => ({ useRestoreToPoint: vi.fn() }));
const editSummary = vi.fn();
vi.mock('#hooks/use-revision-graph.js', () => ({
  useRevisionGraphActions: () => ({ editSummary }),
}));

const rev = (over: Partial<Revision> = {}): Revision => ({
  n: 1,
  chatId: 'a',
  messageId: 'u1',
  anchor: 100,
  cutoffSeq: 1,
  files: [{ path: 'main.ts', linesAdded: 2, linesRemoved: 1 }],
  changedPaths: ['main.ts'],
  linesAdded: 2,
  linesRemoved: 1,
  ...over,
});

const rev1 = rev({ n: 1, messageId: 'u1', anchor: 100 });
const rev2 = rev({ n: 2, messageId: 'u2', anchor: 200 });

const restore = vi.fn();
const returnToLatest = vi.fn();

const graphNode = (revision: Revision, over: Partial<RevisionGraphNode> = {}): RevisionGraphNode => {
  const id = revisionId(`rev:${revision.messageId}`);
  const tree = new ImmutableRevisionTree(revision.changedPaths.map((path) => [path, 'content'] as const));
  return {
    id,
    identitySource: 'authoritative',
    turnId: revision.messageId,
    parents: [],
    parentTurnIds: [],
    parentSource: 'recorded',
    branch: revisionBranchName('main'),
    tree,
    treeId: revisionId(`tree:${revision.messageId}`),
    provenance: { source: 'agent', actorId: revision.chatId, runId: revision.messageId, createdAt: revision.anchor },
    summary: { generated: `Changed ${revision.changedPaths.length} file` },
    diff: {
      changedPaths: revision.changedPaths,
      filesChanged: revision.changedPaths.length,
      linesAdded: revision.linesAdded,
      linesRemoved: revision.linesRemoved,
    },
    chatId: revision.chatId,
    chatName: 'Design chat',
    jobIds: [],
    revision,
    isRestorable: true,
    ...over,
  };
};

const graphFor = (revisions: readonly Revision[], head: Revision | undefined): RevisionGraph => {
  const nodes = revisions.map((revision) => graphNode(revision));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byTurnId = new Map(nodes.map((node) => [node.turnId, node]));
  const headId = head === undefined ? undefined : byTurnId.get(head.messageId)?.id;
  return {
    nodes,
    byId,
    byTurnId,
    branches: [
      { name: revisionBranchName('main'), ...(headId === undefined ? {} : { headId, headTurnId: head!.messageId }) },
    ],
    ...(headId === undefined ? {} : { headId }),
  };
};

const setRevisions = (view: Partial<RevisionsView>): void => {
  const revisions = view.revisions ?? [rev1, rev2];
  const headRevision =
    view.headRevision === undefined && 'headRevision' in view ? undefined : (view.headRevision ?? rev2);
  vi.mocked(useVisibleRevisions).mockReturnValue({
    revisions,
    byMessageId: view.byMessageId ?? new Map<string, Revision>(),
    headRevision,
    maxRevision: view.maxRevision ?? 2,
    headTurnId: view.headTurnId ?? '',
    isDirty: view.isDirty ?? false,
    canReturnToLatest: view.canReturnToLatest ?? false,
    graph: view.graph ?? graphFor(revisions, headRevision),
  });
};

beforeEach(() => {
  restore.mockClear();
  returnToLatest.mockClear();
  editSummary.mockClear();
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore,
    returnToLatest,
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
  setRevisions({});
});

describe('ChatRevisions', () => {
  it('renders a bounded invitation when no revisions exist', () => {
    setRevisions({ revisions: [], headRevision: undefined, maxRevision: 0 });

    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('No revisions yet')).not.toBeNull();
    expect(screen.getByText('Agent changes will appear here.')).not.toBeNull();
  });

  it('T-PANE-LIST: lists every Revision newest-first with the head marked current', () => {
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);
    const headers = screen.getAllByText(/^Revision \d+$/);
    expect(headers.map((element) => element.textContent)).toEqual(['Revision 2', 'Revision 1']);
    expect(screen.getByText('Current')).not.toBeNull();
  });

  it('T-PANE-RESTORE: a Restore click restores that Revision by messageId + anchor', () => {
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore to Revision 1' }));
    expect(restore).toHaveBeenCalledWith({ messageId: 'u1', anchor: 100 });
  });

  it('T-PANE-HEAD: the current (head) Revision reads Current and offers no Restore', () => {
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);
    expect(screen.getByText('Current')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore to Revision 2' })).toBeNull();
  });

  it('T-PANE-MODIFIED: the head Revision reads Modified with a Discard action when dirty', () => {
    setRevisions({ headRevision: rev2, isDirty: true });
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);
    expect(screen.getByText('Modified')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/ }));
    expect(restore).toHaveBeenCalledWith({ messageId: 'u2', anchor: 200 });
  });

  it('renders nothing when the pane is collapsed', () => {
    const { container } = render(<ChatRevisions isExpanded={false} setIsExpanded={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('exposes "Return to latest" only when behind the tip', () => {
    setRevisions({ headRevision: rev1, canReturnToLatest: true });
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Return to latest/ }));
    expect(returnToLatest).toHaveBeenCalledOnce();
  });

  it('renders the branch, fork point, conflict, publication, and inspect-only state', () => {
    const historical = graphNode(rev1, {
      branch: revisionBranchName('explore/lightweight'),
      parentTurnIds: ['u0'],
      forkPointTurnId: 'u0',
      conflict: { type: 'merge', kind: 'text', paths: ['main.ts'] },
      publication: {
        status: 'conflicted',
        branchName: 'explore/lightweight',
        expectedHeadRevisionId: 'rev-u0',
        actualHeadRevisionId: 'rev-u9',
        proposedHeadRevisionId: 'rev-u1',
      },
      isRestorable: false,
    });
    const graph: RevisionGraph = {
      nodes: [historical],
      byId: new Map([[historical.id, historical]]),
      byTurnId: new Map([[historical.turnId, historical]]),
      branches: [{ name: historical.branch, headTurnId: 'u0' }],
    };
    setRevisions({ revisions: [rev1], headRevision: undefined, graph });

    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByRole('list', { name: 'Revision branch graph' })).not.toBeNull();
    expect(screen.getByText('explore/lightweight')).not.toBeNull();
    expect(screen.getByText('forked from u0')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('text conflict');
    expect(screen.getByText('Head publication rejected')).not.toBeNull();
    expect(screen.getByText('Historical branch · inspect only')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore to Revision 1' })).toBeDisabled();
  });

  it('exposes exact revision/tree/path/job metadata and saves an accessible edited summary', () => {
    const node = graphNode(rev1, {
      parentTurnIds: ['u0'],
      jobIds: ['job-fea-2'],
      summary: { generated: 'Changed one file' },
      baseRevisionId: revisionId('rev-base'),
      workspaceId: 'workspace-1',
      nativeGit: { status: 'stored', commitId: 'abc123', objectFormat: 'sha1' },
      publication: {
        status: 'updated',
        branchName: 'main',
        expectedHeadRevisionId: 'rev-base',
        previousHeadRevisionId: 'rev-base',
        headRevisionId: 'rev-u1',
      },
    });
    const graph: RevisionGraph = {
      nodes: [node],
      byId: new Map([[node.id, node]]),
      byTurnId: new Map([[node.turnId, node]]),
      branches: [{ name: node.branch, headId: node.id, headTurnId: node.turnId }],
      headId: node.id,
    };
    setRevisions({ revisions: [rev1], headRevision: rev1, maxRevision: 1, graph });
    render(<ChatRevisions isExpanded setIsExpanded={vi.fn()} />);

    fireEvent.click(screen.getByText('Inspect revision metadata'));
    expect(screen.getByText(String(node.id))).not.toBeNull();
    expect(screen.getByText(String(node.treeId))).not.toBeNull();
    expect(screen.getByText(String(node.baseRevisionId))).not.toBeNull();
    expect(screen.getAllByText('main.ts')).toHaveLength(2);
    expect(screen.getByText('job-fea-2')).not.toBeNull();
    expect(screen.getByText('sha1 abc123')).not.toBeNull();
    expect(screen.getByText('rev-base → rev-u1')).not.toBeNull();

    const input = screen.getByRole('textbox', { name: 'Summary for Revision 1' });
    fireEvent.change(input, { target: { value: 'FEA-ready bracket' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    expect(editSummary).toHaveBeenCalledWith('u1', 'FEA-ready bracket');
  });
});
