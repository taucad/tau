/**
 * Restore and Switch act at once and offer Undo in their toast (C7, I11).
 *
 * A restore is a new entry on top that *Undo restore* takes back, and a switch
 * saves unsaved work on the branch it leaves before it moves, so neither asks:
 * this surface renders no dialog in any state, and every settled verb is a
 * toast whose action undoes it. The one dialog left in History guards what
 * cannot be undone, disconnecting the backup, and lives with the Sync region.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { RevisionRow } from '@taucad/revisions';
import { RevisionRestore } from '#routes/w.$workspace.$project/revision-restore.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

type ToastOptions = { description?: string; action?: { label: string; onClick: () => void } };
const toastSuccess = vi.hoisted(() => vi.fn<(title: string, options?: ToastOptions) => void>());
const toastError = vi.hoisted(() => vi.fn<(title: string, options?: { description?: string }) => void>());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
const toastWarning = vi.hoisted(() => vi.fn<(title: string, options?: { description?: string }) => void>());
vi.mock('@taucad/ui/components/sonner', () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo, warning: toastWarning },
}));
const capture = vi.hoisted(() => vi.fn<(event: string, payload?: Record<string, unknown>) => void>());
/* A toast names an entry by its title or version (M11), read from the loaded History page. */
vi.mock('#hooks/use-revisions.js', () => ({
  useRevisions: () => ({
    revisions: [
      { revisionId: 'rev-4', n: 4, createdAt: 1, summary: 'Thicker walls for the lid', actor: '', conflicted: false },
      { revisionId: 'rev-3', n: 3, createdAt: 1, summary: 'Add vent slots', actor: '', conflicted: false },
    ],
  }),
}));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
const raiseHeldSave = vi.hoisted(() => vi.fn());
vi.mock('#routes/w.$workspace.$project/held-save-toast.js', () => ({ useHeldSaveToast: () => raiseHeldSave }));

const revisionRow = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'user-1' } },
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Saved changes',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

const emit = (toast: Parameters<Parameters<typeof revisionStatusHarness.toasts.add>[0]>[0]): void => {
  for (const listener of revisionStatusHarness.toasts) {
    listener(toast);
  }
};

/** The toast's action, pressed the way a person presses Undo. */
const pressUndo = (options: ToastOptions | undefined): void => {
  expect(options?.action?.label).toBe('Undo');
  options?.action?.onClick();
};

beforeEach(() => {
  revisionStatusHarness.reset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  toastWarning.mockReset();
  capture.mockReset();
  raiseHeldSave.mockReset();
});

describe('RevisionRestore', () => {
  it('should name a connection failure as history attachment without claiming a failed save', () => {
    render(<RevisionRestore />);
    for (const listener of revisionStatusHarness.toasts) {
      listener({
        type: 'error',
        subject: 'connection',
        code: 'HOST_CONFIGURATION_MISMATCH',
        message: 'The host refused this history connection.',
        generation: 1,
        connectionOperation: 'status',
      });
    }
    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError.mock.calls[0]?.[0]).toBe('Couldn’t load history');
    expect(capture).toHaveBeenCalledWith(
      'revision_connection_failed',
      expect.objectContaining({ code: 'HOST_CONFIGURATION_MISMATCH', generation: 1, operation: 'status' }),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('shows no dialog while a restore or a switch runs (I11)', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      restore: { busy: true, revisionNumber: 3 },
      branchVerb: { busy: true, operation: 'switch', branch: 'bracket-fillet' },
    };

    const { container } = render(<RevisionRestore />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names what a restore brought back, and its Undo is Undo restore', async () => {
    revisionStatusHarness.rows = [revisionRow({ revisionId: 'rev-2', revisionNumber: 2, summary: 'Add vent slots' })];
    render(<RevisionRestore />);

    emit({ type: 'restored', mode: 'restore', revisionId: 'rev-2', revisionNumber: 2 });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledOnce();
    });
    const [title, options] = toastSuccess.mock.calls[0] ?? [];
    expect(title).toBe('Restored “Add vent slots”');
    expect(revisionStatusHarness.rowRequests).toEqual(['rev-2']);
    pressUndo(options);
    expect(revisionStatusHarness.commands.undo).toHaveBeenCalledOnce();
  });

  it('names a restore of a loaded entry by its title without reading its row', () => {
    render(<RevisionRestore />);

    emit({ type: 'restored', mode: 'restore', revisionId: 'rev-3', revisionNumber: 3 });

    const [title, options] = toastSuccess.mock.calls[0] ?? [];
    expect(title).toBe('Restored “Add vent slots”');
    expect(revisionStatusHarness.rowRequests).toEqual([]);
    pressUndo(options);
  });

  it('names a restored version by its number, and a target it cannot read without a number (A9)', async () => {
    revisionStatusHarness.rows = [
      revisionRow({
        revisionId: 'rev-9',
        revisionNumber: 9,
        tags: ['Ready for print'],
        versions: [{ name: 'Ready for print', number: 3 }],
      }),
    ];
    render(<RevisionRestore />);

    emit({ type: 'restored', mode: 'restore', revisionId: 'rev-9', revisionNumber: 9 });
    emit({ type: 'restored', mode: 'restore', revisionId: 'rev-gone', revisionNumber: undefined });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(2);
    });
    expect(toastSuccess.mock.calls.map(([title]) => title).toSorted()).toEqual([
      'Restored V3',
      'Restored an earlier point',
    ]);
  });

  it('says an Undo restore undid the restore, and offers no second Undo', () => {
    render(<RevisionRestore />);

    emit({ type: 'restored', mode: 'undoRestore', revisionId: 'rev-1', revisionNumber: 1 });

    expect(toastSuccess.mock.calls).toEqual([['Undid the restore']]);
  });

  it('says a switch that saved first where it saved, and its Undo switches back (I11)', () => {
    render(<RevisionRestore />);

    emit({ type: 'branch', operation: 'switch', branch: 'enclosure-v2', from: 'main', saved: true });

    const [title, options] = toastSuccess.mock.calls[0] ?? [];
    expect(title).toBe('Saved your changes on main, then switched to enclosure-v2');
    pressUndo(options);
    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('main');
  });

  it('says a clean switch moved, with Undo, and offers none when it cannot say where from', () => {
    render(<RevisionRestore />);

    emit({ type: 'branch', operation: 'switch', branch: 'enclosure-v2', from: 'main' });
    emit({ type: 'branch', operation: 'switch', branch: 'main' });

    expect(toastSuccess.mock.calls[0]?.[0]).toBe('Switched to enclosure-v2');
    pressUndo(toastSuccess.mock.calls[0]?.[1]);
    expect(revisionStatusHarness.commands.switchTo).toHaveBeenCalledWith('main');
    expect(toastSuccess.mock.calls[1]).toEqual(['Switched to main', undefined]);
  });

  it('says a refused switch in the branch menu\u2019s words', () => {
    render(<RevisionRestore />);

    emit({ type: 'refused', branch: 'enclosure-v2', reason: 'A chat is working in these files.' });

    expect(toastError).toHaveBeenCalledWith('Couldn’t switch to enclosure-v2', {
      description: 'A chat is working in these files.',
    });
  });

  /* Merge acts at once but has no Undo yet (D3): the toast says what happened and nothing more. */
  it('says a merge landed, with no dialog before it', () => {
    render(<RevisionRestore />);

    emit({ type: 'branch', operation: 'merge', branch: 'enclosure-v2' });

    expect(toastSuccess.mock.calls).toEqual([['Merged enclosure-v2']]);
  });

  /* A discarded branch reads as closed, the branch menu's word for it. */
  it('says a discarded branch was closed', () => {
    render(<RevisionRestore />);

    emit({ type: 'branch', operation: 'discard', branch: 'enclosure-v2' });

    expect(toastSuccess.mock.calls).toEqual([['Closed enclosure-v2']]);
  });

  /* V5 A6, TS-R17: a save another run's lease held names that run, never "Nothing to save". */
  it('names the run a held save waits for, and says Nothing to save only for a clean tree', () => {
    render(<RevisionRestore />);
    const heldBy = { chatId: 'chat-mount', turnId: 'u7', runId: 'run-7', attempt: 1 };

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'nothingToSave', heldBy });
    }
    expect(raiseHeldSave).toHaveBeenCalledWith(heldBy);
    expect(toastInfo).not.toHaveBeenCalled();

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'nothingToSave' });
    }
    expect(toastInfo).toHaveBeenCalledWith('Nothing to save');
  });

  /* HQ1, HQ2: a merge that collided says the one conflict sentence, naming the line the decision lands on. */
  it('announces a conflicted merge as a decision on the line merged into', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'mergeConflicted', branch: 'fillet', into: 'main', paths: ['main.scad'] });
    }

    expect(toastWarning.mock.calls[0]).toEqual([
      'Needs your decision on main',
      { description: '1 file changed on both branches. main is unchanged until you choose.' },
    ]);
  });

  /* W2b: a remote or resolution child's notice is already a person's sentence; it is never a restore. */
  it('should keep remote status quiet while retaining actionable notices', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'notice', subject: 'remote', tone: 'info', message: 'Backed up to Tau Cloud.' });
      listener({ type: 'notice', subject: 'resolution', tone: 'error', message: 'That file could not be opened.' });
      listener({ type: 'notice', subject: 'remote', tone: 'error', message: 'The backup could not finish.' });
    }

    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('That file could not be opened.');
    expect(toastError).toHaveBeenCalledWith('The backup could not finish.');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  /* W0 N1, M1: files that are back, and an undo that belongs to another line, lost nothing. */
  it('says a restore that is not in History kept the files, with no Try again', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'error', subject: 'restore', message: 'cut lost its CAS', code: 'RESTORE_UNRECORDED' });
      listener({ type: 'error', subject: 'restore', message: 'selection moved', code: 'UNDO_UNAVAILABLE' });
    }

    expect(toastWarning.mock.calls[0]).toEqual([
      'Files restored',
      {
        description:
          'The earlier files are back, but something else changed this project at the same time, so this restore is not in History as its own entry. Your files are kept.',
      },
    ]);
    expect(toastWarning.mock.calls[1]?.[1]).toEqual({
      description: 'That restore was made on another branch. Open it there to undo it.',
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  /* D15: an Undo names the entry it undid, and a refusal with nothing to undo is not a failure. */
  it('announces an Undo by the entry it undid, and warns rather than fails when nothing is left', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'undone', revisionNumber: 4 });
      listener({
        type: 'error',
        subject: 'restore',
        code: 'NOTHING_TO_UNDO',
        message: 'Nothing you did on this branch is left to undo.',
      });
      listener({
        type: 'error',
        subject: 'restore',
        code: 'UNDO_CONFLICT',
        message: 'A later change touched the same lines, so this one can’t be undone.',
        revisionNumber: 2,
      });
    }

    expect(toastSuccess.mock.calls[0]).toEqual(['Undid “Thicker walls for the lid”']);
    expect(toastWarning.mock.calls[0]).toEqual([
      'Nothing to undo here',
      { description: 'Nothing you did on this branch is left to undo.' },
    ]);
    expect(toastError.mock.calls[0]).toEqual([
      'That change can’t be undone',
      {
        description:
          'A later change touched the same lines, so this one can’t be undone. Restore an earlier point instead.',
      },
    ]);
  });

  /* The refusal crosses the boundary as a code; the page owns the words (P4).
     The engine's own sentence names a checkout and calls the branch unborn,
     which is banned product vocabulary (Rule 1) and unactionable besides. */
  it('phrases a refused branch from its code, not the sentence the engine wrote', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({
        type: 'error',
        subject: 'branch',
        message: 'Branch x is unborn; a checkout of it needs an explicit base revision.',
        code: 'BRANCH_NEEDS_REVISION',
      });
    }

    const [title, options] = toastError.mock.calls[0] ?? [];
    expect(title).toBe('Couldn’t change the branch');
    expect(options?.description).toBe('There is nothing to branch from yet. Add a file, then try again.');
    expect(options?.description).not.toMatch(/checkout|unborn/iu);
  });

  /* W18 DEF-7 wanted the toast to say why. E5 ruled where "why" goes: a person
     cannot act on `Buffer is not defined`, so they get the one thing they can
     do, and the developer who can act on it reads it in analytics and the
     console. The count the Revisions pane showed is still not a reason (I12). */
  it('sends the engine\u2019s words to the console, outcome fields to analytics, neither to the person (E5)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'error', subject: 'save', message: 'Buffer is not defined' });
    }

    const [title, options] = toastError.mock.calls[0] ?? [];
    expect(title).toBe('Couldn’t save');
    expect(options?.description).toBe('Tau could not record this change. Reload the page and try again.');
    // SB4: the product event keeps outcome fields; the diagnostic goes to error reporting (`reportRevisionToast`).
    expect(capture).toHaveBeenCalledWith('revision_save_failed', { code: undefined });
    expect(consoleError).toHaveBeenCalledWith('[revisions]', 'save', undefined, 'Buffer is not defined');
    consoleError.mockRestore();
  });
});
