/**
 * The restore dialog renders the plan the worker computed — it does not have one
 * (S19, PC9).
 *
 * `restore.machine` sits beside the trees, so "risky" is a real deletion in the
 * diff of head against the target, or a checkout that has diverged from its
 * head. The dialog asks only when that plan says to ask, and names the count
 * that plan found; a safe restore applies with no question at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionRestore } from '#routes/w.$workspace.$project/revision-restore.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const toastSuccess = vi.hoisted(() => vi.fn<(title: string, options?: { description?: string }) => void>());
const toastError = vi.hoisted(() => vi.fn<(title: string, options?: { description?: string }) => void>());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
const toastWarning = vi.hoisted(() => vi.fn<(title: string, options?: { description?: string }) => void>());
vi.mock('#components/ui/sonner.js', () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo, warning: toastWarning },
}));
const capture = vi.hoisted(() => vi.fn<(event: string, payload?: Record<string, unknown>) => void>());
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));

const plan = (over: Partial<(typeof revisionStatusHarness)['status']['restore']>): void => {
  revisionStatusHarness.status = {
    ...revisionStatusHarness.status,
    restore: { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: 3, ...over },
  };
};

beforeEach(() => {
  revisionStatusHarness.reset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  toastWarning.mockReset();
  capture.mockReset();
});

describe('RevisionRestore', () => {
  it('names the deletions the plan found, not a page-side guess', () => {
    plan({ asking: true, removedPathCount: 2 });

    render(<RevisionRestore />);

    expect(screen.getByText(/2 files added since will be removed\./)).toBeInTheDocument();
    /* D1: the dialog says the restore is a new revision, so History loses nothing. */
    expect(screen.getByText(/as a new revision, so nothing in History is lost\./)).toBeInTheDocument();
  });

  it('asks about unsaved editor changes without inventing a deletion', () => {
    plan({ asking: true, removedPathCount: 0, dirty: true });

    render(<RevisionRestore />);

    /* D1: dirty work is minted before the restore touches it, so nothing is overwritten. */
    expect(screen.getByText(/Your unsaved edits are saved first\./)).toBeInTheDocument();
    expect(screen.queryByText(/will be removed/)).not.toBeInTheDocument();
  });

  it('never asks about a restore the plan found safe, even while it applies', () => {
    plan({ asking: false, busy: true, removedPathCount: 0, dirty: false });

    render(<RevisionRestore />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Restore this revision?')).not.toBeInTheDocument();
  });

  it('hands confirm and cancel straight to the machine', () => {
    plan({ asking: true, removedPathCount: 1 });

    render(<RevisionRestore />);
    /* The verb keeps its object through the confirmation (DESIGN: controls name their effect). */
    expect(screen.getByText('Restore Rev 3?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Rev 3' }));
    expect(revisionStatusHarness.commands.confirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revisionStatusHarness.commands.cancel).toHaveBeenCalledTimes(1);
  });

  it('asks D10\u2019s question for a branch verb, and answers the machine (review R4)', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branchVerb: {
        busy: false,
        asking: true,
        operation: 'switch',
        branch: 'bracket-fillet',
        question: 'A chat is working in the files you have open. Move anyway?',
      },
    };

    render(<RevisionRestore />);

    expect(screen.getByText('Work in bracket-fillet?')).toBeInTheDocument();
    expect(screen.getByText('A chat is working in the files you have open. Move anyway?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }));
    expect(revisionStatusHarness.commands.confirmBranch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revisionStatusHarness.commands.cancelBranch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing for a branch verb that needs no person', () => {
    render(<RevisionRestore />);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('reports the restore the worker attested, with Undo', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'restored', revisionNumber: 3 });
    }

    const [title, options] = toastSuccess.mock.calls[0] ?? [];
    expect(title).toBe('Restored Rev 3');
    expect(options).toMatchObject({ action: { label: 'Undo restore' } });
  });

  /* HQ1, HQ2: a merge that collided says the one conflict sentence, naming the line the decision lands on. */
  it('announces a conflicted merge as a decision on the line merged into', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'mergeConflicted', branch: 'fillet', into: 'main', paths: ['main.scad'] });
    }

    expect(toastWarning.mock.calls[0]?.[0]).toBe('Needs your decision on main');
  });

  /* W2b: a remote or resolution child's notice is already a person's sentence; it is never a restore. */
  it('shows a child notice in its own tone, never as a restore', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'notice', subject: 'remote', tone: 'info', message: 'Backed up to Tau Cloud.' });
      listener({ type: 'notice', subject: 'resolution', tone: 'error', message: 'That file could not be opened.' });
    }

    expect(toastInfo).toHaveBeenCalledWith('Backed up to Tau Cloud.');
    expect(toastError).toHaveBeenCalledWith('That file could not be opened.');
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
          'The earlier files are back, but something else changed this project at the same time, so this restore is not in History as its own revision. Your files are kept.',
      },
    ]);
    expect(toastWarning.mock.calls[1]?.[1]).toEqual({
      description: 'That restore was made on another branch. Open it there to undo it.',
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  /* D15: an Undo names the revision it undid, and a refusal with nothing to undo is not a failure. */
  it('announces an Undo by the revision it undid, and warns rather than fails when nothing is left', () => {
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
        message: 'A later revision changed the same lines, so Rev 2 can’t be undone.',
        revisionNumber: 2,
      });
    }

    expect(toastSuccess.mock.calls[0]).toEqual(['Undid Rev 4']);
    expect(toastWarning.mock.calls[0]).toEqual([
      'Nothing to undo here',
      { description: 'Nothing you did on this branch is left to undo.' },
    ]);
    expect(toastError.mock.calls[0]).toEqual([
      'That change can’t be undone',
      {
        description:
          'A later revision changed the same lines, so Rev 2 can’t be undone. Restore an earlier revision instead.',
      },
    ]);
  });

  it('names a restore of a revision off the line without inventing its number (A9)', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'restored', revisionNumber: undefined });
    }

    expect(toastSuccess.mock.calls[0]?.[0]).toBe('Restored an earlier revision');
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
    expect(title).toBe('That branch change did not go through');
    expect(options?.description).toBe('There is nothing to branch from yet. Add a file, then try again.');
    expect(options?.description).not.toMatch(/checkout|unborn/iu);
  });

  /* W18 DEF-7 wanted the toast to say why. E5 ruled where "why" goes: a person
     cannot act on `Buffer is not defined`, so they get the one thing they can
     do, and the developer who can act on it reads it in analytics and the
     console. The count the Revisions pane showed is still not a reason (I12). */
  it('sends the engine\u2019s own words to analytics and the console, not to the person (W18 DEF-7, E5)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'error', subject: 'save', message: 'Buffer is not defined' });
    }

    const [title, options] = toastError.mock.calls[0] ?? [];
    expect(title).toBe('That change could not be saved');
    expect(options?.description).toBe('Tau could not record this change. Reload the page and try again.');
    expect(capture).toHaveBeenCalledWith('revision_save_failed', {
      message: 'Buffer is not defined',
      code: undefined,
    });
    expect(consoleError).toHaveBeenCalledWith('[revisions]', 'save', undefined, 'Buffer is not defined');
    consoleError.mockRestore();
  });
});
