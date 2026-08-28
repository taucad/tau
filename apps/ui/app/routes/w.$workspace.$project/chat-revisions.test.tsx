import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ChatRevisions } from '#routes/w.$workspace.$project/chat-revisions.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import type { Revision } from '#lib/file-restore-timeline.js';

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

const setRevisions = (view: Partial<RevisionsView>): void => {
  vi.mocked(useVisibleRevisions).mockReturnValue({
    revisions: [rev1, rev2],
    byMessageId: new Map(),
    headRevision: rev2,
    maxRevision: 2,
    headTurnId: '',
    isDirty: false,
    canReturnToLatest: false,
    ...view,
  });
};

beforeEach(() => {
  restore.mockClear();
  returnToLatest.mockClear();
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
});
