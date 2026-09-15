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

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#components/ui/sonner.js', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));

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
});

describe('RevisionRestore', () => {
  it('names the deletions the plan found, not a page-side guess', () => {
    plan({ asking: true, removedPathCount: 2 });

    render(<RevisionRestore />);

    expect(screen.getByText(/This deletes 2 file\(s\) created since\./)).toBeInTheDocument();
  });

  it('asks about unsaved editor changes without inventing a deletion', () => {
    plan({ asking: true, removedPathCount: 0, dirty: true });

    render(<RevisionRestore />);

    expect(screen.getByText(/Unsaved editor changes will be overwritten\./)).toBeInTheDocument();
    expect(screen.queryByText(/This deletes/)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(revisionStatusHarness.commands.confirmBranch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revisionStatusHarness.commands.cancelBranch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing for a branch verb that needs no person', () => {
    render(<RevisionRestore />);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('reports the restore the worker attested, with its unrecoverable files', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({ type: 'restored', revisionNumber: 3, unrecoverable: ['old.scad'] });
    }

    const [title, options] = toastSuccess.mock.calls[0] ?? [];
    expect(title).toBe('Restored to Revision 3');
    expect(options?.description).toContain('1 file(s) could not be recovered');
  });

  it('says why a save failed, not just that one did (W18 DEF-7)', () => {
    render(<RevisionRestore />);

    for (const listener of revisionStatusHarness.toasts) {
      /* The Revisions pane counted this and named nothing: "one change could
       * not be saved" is a count, not a reason a person can act on (I12). */
      listener({ type: 'error', subject: 'save', message: 'Buffer is not defined' });
    }

    const [title, options] = toastError.mock.calls[0] ?? [];
    expect(title).toBe('That change could not be saved');
    expect(options?.description).toBe('Buffer is not defined');
  });
});
