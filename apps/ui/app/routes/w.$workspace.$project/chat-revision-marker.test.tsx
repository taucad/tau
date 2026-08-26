import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import type { Revision } from '#lib/file-restore-timeline.js';

vi.mock('#hooks/use-revisions.js', () => ({ useVisibleRevisions: vi.fn() }));
vi.mock('#hooks/use-restore-to-point.js', () => ({ useRestoreToPoint: vi.fn() }));

const revision = (over: Partial<Revision> = {}): Revision => ({
  n: 2,
  chatId: 'a',
  messageId: 'u1',
  anchor: 200,
  cutoffSeq: 1,
  files: [{ path: 'main.ts', linesAdded: 4, linesRemoved: 1 }],
  changedPaths: ['main.ts'],
  linesAdded: 4,
  linesRemoved: 1,
  ...over,
});

const restore = vi.fn();

const setRevisions = (view: Partial<RevisionsView>): void => {
  vi.mocked(useVisibleRevisions).mockReturnValue({
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

beforeEach(() => {
  restore.mockClear();
  vi.mocked(useRestoreToPoint).mockReturnValue({
    restore,
    returnToLatest: vi.fn(),
    undo: vi.fn(),
    isDirty: false,
    isBusy: false,
  });
});

describe('ChatRevisionMarker', () => {
  it('T-CRM-NONMUTATING: renders nothing for a turn that produced no Revision (RV1)', () => {
    setRevisions({ byMessageId: new Map() });
    const { container } = render(<ChatRevisionMarker userMessageId='u2' />);
    expect(container.firstChild).toBeNull();
  });

  it('T-CRM-INACTIVE: an older turn shows a Restore button and no Current badge', () => {
    setRevisions({
      byMessageId: new Map([['u1', revision({ n: 2 })]]),
      headRevision: revision({ messageId: 'u9', n: 9 }),
    });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.getByRole('button', { name: 'Restore to Revision 2' })).not.toBeNull();
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('T-CRM-ACTIVE: the head turn reads Current with no Restore or Modified', () => {
    setRevisions({
      byMessageId: new Map([['u1', revision({ n: 2 })]]),
      headRevision: revision({ messageId: 'u1', n: 2 }),
    });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.getByText('Current')).not.toBeNull();
    expect(screen.queryByText('Modified')).toBeNull();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('T-CRM-MODIFIED: the head turn reads Modified with a Discard button when dirty', () => {
    setRevisions({
      byMessageId: new Map([['u1', revision({ n: 2 })]]),
      headRevision: revision({ messageId: 'u1', n: 2 }),
      isDirty: true,
    });
    render(<ChatRevisionMarker userMessageId='u1' />);
    expect(screen.getByText('Modified')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Discard changes/ })).not.toBeNull();
  });

  it('T-CRM-RESTORE: restoring dispatches this revision messageId and anchor', () => {
    setRevisions({
      byMessageId: new Map([['u1', revision({ n: 2, messageId: 'u1', anchor: 200 })]]),
      headRevision: revision({ messageId: 'u9', n: 9 }),
    });
    render(<ChatRevisionMarker userMessageId='u1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore to Revision 2' }));
    expect(restore).toHaveBeenCalledWith({ messageId: 'u1', anchor: 200 });
  });
});
