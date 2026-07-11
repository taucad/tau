import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionChip } from '#routes/projects_.$id/active-revision-indicator.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionPane } from '#routes/projects_.$id/revision-pane-context.js';
import type { Revision } from '#lib/file-restore-timeline.js';

vi.mock('#hooks/use-revisions.js', () => ({ useRevisions: vi.fn() }));
vi.mock('#hooks/use-restore-to-point.js', () => ({
  useRestoreToPoint: vi.fn(),
}));
vi.mock('#routes/projects_.$id/revision-pane-context.js', () => ({
  useRevisionPane: vi.fn(),
}));

const rev = (over: Partial<Revision> = {}): Revision => ({
  n: 3,
  chatId: 'a',
  messageId: 'u1',
  anchor: 100,
  cutoffSeq: 1,
  files: [],
  changedPaths: [],
  linesAdded: 0,
  linesRemoved: 0,
  ...over,
});

const setRevisions = (view: Partial<RevisionsView>): void => {
  vi.mocked(useRevisions).mockReturnValue({
    revisions: [],
    byMessageId: new Map(),
    headRevision: undefined,
    maxRevision: 0,
    headTurnId: '',
    isDirty: false,
    canReturnToLatest: false,
    ...view,
  });
};

const returnToLatest = vi.fn();

beforeEach(() => {
  returnToLatest.mockClear();
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore: vi.fn(),
    returnToLatest,
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
  vi.mocked(useRevisionPane).mockReturnValue({
    isOpen: false,
    setOpen: vi.fn(),
    toggle: vi.fn(),
  });
});

describe('RevisionChip', () => {
  it('T-UI-CHIP: shows "Revision N / M"', () => {
    setRevisions({
      headRevision: rev({ n: 2 }),
      maxRevision: 5,
      canReturnToLatest: true,
    });
    const { container } = render(<RevisionChip />);
    expect(container.textContent).toContain('Revision 2 / 5');
  });

  it('T-UI-CHIP: "Return to latest" redoes to the newest Revision when not at the tip', () => {
    setRevisions({
      headRevision: rev({ n: 2 }),
      maxRevision: 5,
      canReturnToLatest: true,
    });
    render(<RevisionChip />);
    fireEvent.click(screen.getByRole('button', { name: /Return to latest/ }));
    expect(returnToLatest).toHaveBeenCalledOnce();
  });

  it('T-UI-CHIP: hides "Return to latest" at the tip', () => {
    setRevisions({
      headRevision: rev({ n: 5 }),
      maxRevision: 5,
      canReturnToLatest: false,
    });
    render(<RevisionChip />);
    expect(screen.queryByRole('button', { name: /Return to latest/ })).toBeNull();
  });

  it('renders nothing until the project has a Revision', () => {
    setRevisions({ maxRevision: 0 });
    const { container } = render(<RevisionChip />);
    expect(container.textContent).toBe('');
  });
});
