import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import { useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard, RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';

vi.mock('#hooks/use-revisions.js', () => ({ useRevisions: vi.fn(), useRevisionChanges: vi.fn() }));
vi.mock('#hooks/use-restore-to-point.js', () => ({ useRestoreToPoint: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

const revision = (over: Partial<RevisionCard> = {}): RevisionCard => ({
  revisionId: 'rev-2',
  n: 2,
  createdAt: 200,
  summary: 'Agent turn u1',
  actor: 'tau-browser-agent-host',
  turnId: 'u1',
  conflicted: false,
  trigger: 'turn',
  ...over,
});

const restore = vi.fn();

const setRevisions = (view: Partial<RevisionsView>): void => {
  vi.mocked(useRevisions).mockReturnValue({
    revisions: view.revisions ?? [],
    byTurnId: view.byTurnId ?? new Map<string, RevisionCard>(),
    headRevisionId: view.headRevisionId,
    branch: view.branch ?? 'main',
    isDirty: view.isDirty ?? false,
    canReturnToLatest: view.canReturnToLatest ?? false,
    isLoading: false,
  });
};

beforeEach(() => {
  restore.mockClear();
  vi.mocked(useRevisionChanges).mockReturnValue([{ path: 'main.ts', kind: 'modified' }]);
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore,
    returnToLatest: vi.fn(),
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
});

describe('ChatRevisionMarker', () => {
  it('T-CRM-NONMUTATING: renders nothing for a turn that recorded no revision (RV1)', () => {
    setRevisions({ byTurnId: new Map() });
    const { container } = render(<ChatRevisionMarker userMessageId='u2' />);
    expect(container.firstChild).toBeNull();
  });

  it('T-CRM-INACTIVE: an older turn shows a Restore button and no Current badge', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-9' });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.getByRole('button', { name: 'Restore to Revision 2' })).not.toBeNull();
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('T-CRM-ACTIVE: the head revision reads Current with no Restore or Modified', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-2' });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.getByText('Current')).not.toBeNull();
    expect(screen.queryByText('Modified')).toBeNull();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('T-CRM-MODIFIED: leaves dirty state to the single Where-you-are surface', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-2', isDirty: true });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.queryByText('Modified')).toBeNull();
    expect(screen.queryByRole('button', { name: /Discard changes/ })).toBeNull();
  });

  it('T-CRM-RESTORE: restoring names this card’s own revision id, never a transcript node', () => {
    setRevisions({ byTurnId: new Map([['u1', revision()]]), headRevisionId: 'rev-9' });
    render(<ChatRevisionMarker userMessageId='u1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore to Revision 2' }));
    expect(restore).toHaveBeenCalledWith('rev-2');
  });
});
