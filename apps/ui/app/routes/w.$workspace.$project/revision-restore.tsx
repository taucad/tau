import { useEffect } from 'react';
import { toast } from '#components/ui/sonner.js';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import { useAnalytics } from '#hooks/use-analytics.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import type { RevisionFailureSubject } from '#lib/revision-failure-copy.js';
import type { BranchOperation } from '@taucad/revisions';
import { needsDecision, revisionName } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import { useHeldSaveToast } from '#routes/w.$workspace.$project/held-save-toast.js';

/** What the question above a waiting branch verb asks. Document words only (A18, I12). */
const branchVerbTitle: Readonly<Record<BranchOperation, string>> = {
  switch: 'Work in',
  merge: 'Bring in',
  discard: 'Discard',
  create: 'Start',
  rename: 'Rename to',
};

const branchVerbAction: Readonly<Record<BranchOperation, string>> = {
  switch: 'Switch branch',
  merge: 'Merge branch',
  discard: 'Discard branch changes',
  create: 'Create branch',
  rename: 'Rename branch',
};

/** What a settled branch verb says. Document words only (A18, I12). */
const branchSettledCopy: Readonly<Record<BranchOperation, (branch: string) => string>> = {
  switch: (branch) => `Switched to ${branch}`,
  merge: (branch) => `Merged ${branch}`,
  discard: (branch) => `Discarded ${branch}`,
  create: (branch) => `Created ${branch}`,
  rename: (branch) => `Renamed to ${branch}`,
};

/** The analytics name each of those failures is counted under. */
const revisionFailureEvent: Readonly<Record<RevisionFailureSubject, string>> = {
  restore: 'revision_restore_failed',
  branch: 'revision_branch_failed',
  save: 'revision_save_failed',
  connection: 'revision_connection_failed',
  /* Not raised here: a turn announces its own failure through `turn.failed`,
   * which `revision-outcomes.tsx` phrases from the same table (W9). */
  turn: 'revision_turn_failed',
  /* Not raised here either: the Sync line and the two removal dialogs own their own. */
  backup: 'revision_backup_failed',
  removeName: 'revision_remove_name_failed',
  removeConflictLine: 'revision_remove_conflict_line_failed',
};

/**
 * The one surface a restore needs a person for (S19, PC9).
 *
 * `restore.machine` runs in the worker beside the graph, so the plan is
 * computed where the trees are: the real diff of head against the target over
 * versioned paths, plus whether the checkout has diverged from its head. Those
 * two facts ride the `RevisionStatus` projection, and this renders them — no
 * page-side plan, no second restore writer.
 */
export function RevisionRestore(): React.JSX.Element {
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const client = useRevisionClient();
  const analytics = useAnalytics();
  const raiseHeldSave = useHeldSaveToast();
  const restore = status?.restore;

  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    return client.subscribeToasts((entry) => {
      /* The restore child, the branch child and a failed ambient cut all raise
       * `error` on this one channel; the frame names its subject so the title
       * can (W14 R2, W18 DEF-7). */
      if (entry.type === 'error') {
        /* The refusal arrives as a code and a diagnostic. The code becomes the
         * words (P4, Rule 1); the diagnostic — `Buffer is not defined`, a port
         * sentence naming a checkout — goes where someone can act on it, which
         * is not a toast (E5). */
        const copy = describeRevisionFailure(entry.subject, entry.code, { revisionNumber: entry.revisionNumber });
        analytics.capture(revisionFailureEvent[entry.subject], {
          message: entry.message,
          code: entry.code,
          ...(entry.subject === 'connection'
            ? { generation: entry.generation, operation: entry.connectionOperation }
            : {}),
        });
        console.error('[revisions]', entry.subject, entry.code, entry.message);
        /* W0 N1, M1, D15: files that are back, and an undo with nothing here to undo, lost nothing; they are not failures. */
        if (
          entry.code === 'RESTORE_UNRECORDED' ||
          entry.code === 'UNDO_UNAVAILABLE' ||
          entry.code === 'NOTHING_TO_UNDO' ||
          entry.code === 'UNDO_PAST_MERGE'
        ) {
          toast.warning(copy.title, { description: copy.description });
          return;
        }
        toast.error(copy.title, { description: copy.description });
        return;
      }
      /* W2b: the remote and resolution children phrase their own notices for a person. */
      if (entry.type === 'notice') {
        if (entry.tone === 'error') {
          toast.error(entry.message);
        } else {
          toast.info(entry.message);
        }
        return;
      }
      /* A save another run's lease held names that run, never "Nothing to save" (V5 A6). */
      if (entry.type === 'nothingToSave') {
        if (entry.heldBy === undefined) {
          toast.info('Nothing to save');
        } else {
          raiseHeldSave(entry.heldBy);
        }
        return;
      }
      /* D10 answers *Switch* with a refusal, in the guard's own document words
       * — a verb that quietly does nothing is what "no outcome is silent"
       * forbids (A25, I12; review R3). */
      if (entry.type === 'refused') {
        analytics.capture('revision_branch_refused', { branch: entry.branch });
        toast.error(`Could not move to ${entry.branch}`, { description: entry.reason });
        return;
      }
      /* A branch verb settles out of sight of the row that started it — the row
       * may not even exist any more — so the one toast sink the tree has says
       * so (A25: no removal is silent). */
      if (entry.type === 'branch') {
        analytics.capture('revision_branch_settled', { operation: entry.operation });
        toast.success(branchSettledCopy[entry.operation](entry.branch));
        return;
      }
      /* The two conflict notices are not messages for a person: the marker text
       * belongs to whatever editor asked for it, and the chat request to whatever
       * starts turns. Both have their own subscribers (W10). */
      if (entry.type === 'conflictText' || entry.type === 'conflictTextFailed' || entry.type === 'resolveWithChat') {
        return;
      }
      /* The merge that collided. The branch merged into is untouched by design
       * (A22), so without this the person who pressed *Merge* sees a pane that
       * did not move; the card on the branch's row says the rest (review R1). */
      if (entry.type === 'mergeConflicted') {
        analytics.capture('revision_merge_conflicted', { pathCount: entry.paths.length });
        /* HQ1, HQ2: the one sentence, naming the line the decision lands on. */
        toast.warning(`${needsDecision} on ${entry.into}`, {
          description: `${String(entry.paths.length)} ${entry.paths.length === 1 ? 'file changed' : 'files changed'} on both lines. ${entry.into} is untouched until you choose.`,
        });
        return;
      }
      /* D15: an undo row names what it undid, as a restore row names its source. */
      if (entry.type === 'undone') {
        analytics.capture('revision_undone', { revision: entry.revisionNumber });
        toast.success(
          entry.revisionNumber === undefined
            ? 'Undid an earlier revision'
            : `Undid Rev ${String(entry.revisionNumber)}`,
        );
        return;
      }
      analytics.capture('revision_restored', { revision: entry.revisionNumber });
      /* A target off the line has no `Rev N` of its own, and none is invented (A9). */
      toast.success(
        entry.revisionNumber === undefined
          ? 'Restored an earlier revision'
          : `Restored Rev ${String(entry.revisionNumber)}`,
        { action: { label: 'Undo restore', onClick: commands.undo } },
      );
    });
  }, [analytics, client, commands, raiseHeldSave]);

  const deleteCount = restore?.removedPathCount ?? 0;
  const restoreTarget = revisionName(restore?.revisionNumber);
  const branchVerb = status?.branchVerb;
  return (
    <>
      <AlertDialog
        open={restore?.asking ?? false}
        onOpenChange={(next) => {
          if (!next) {
            commands.cancel();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {restoreTarget === undefined ? 'Restore this revision?' : `Restore ${restoreTarget}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {/* D1: a restore is a new revision on the line, so the dialog says nothing is lost. */}
              {`Your files go back to ${restoreTarget ?? 'this revision'} as a new revision, so nothing in History is lost. `}
              {deleteCount > 0
                ? `${String(deleteCount)} ${deleteCount === 1 ? 'file' : 'files'} added since will be removed. `
                : ''}
              {restore?.dirty === true ? 'Your unsaved edits are saved first. ' : ''}
              You can undo this restore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button autoFocus variant='outline' onClick={commands.cancel}>
              Cancel
            </Button>
            <Button onClick={commands.confirm}>
              {restoreTarget === undefined ? 'Restore' : `Restore ${restoreTarget}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* The other verb that needs a person: D10's guard answers `checkBranch`
        with a question, and `branch.machine` waits in `confirming` until it is
        answered. Without this the state has no exit — the verb is stuck and the
        rows look idle (review R4). */}
      <AlertDialog
        open={branchVerb?.asking ?? false}
        onOpenChange={(next) => {
          if (!next) {
            commands.cancelBranch();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {branchVerb?.branch === undefined
                ? 'Continue?'
                : `${branchVerbTitle[branchVerb.operation ?? 'switch']} ${branchVerb.branch}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {branchVerb?.question ?? 'This affects the files you have open.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button autoFocus variant='outline' onClick={commands.cancelBranch}>
              Cancel
            </Button>
            <Button onClick={commands.confirmBranch}>{branchVerbAction[branchVerb?.operation ?? 'switch']}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
