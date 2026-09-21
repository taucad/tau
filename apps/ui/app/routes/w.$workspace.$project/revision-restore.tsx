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
import type { BranchOperation } from '@taucad/revisions/branch-machine';

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
        const copy = describeRevisionFailure(entry.subject, entry.code);
        analytics.capture(revisionFailureEvent[entry.subject], { message: entry.message, code: entry.code });
        console.error('[revisions]', entry.subject, entry.code, entry.message);
        toast.error(copy.title, { description: copy.description });
        return;
      }
      if (entry.type === 'nothingToSave') {
        toast.info('Nothing to save');
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
        toast.warning(`${entry.branch} needs your attention`, {
          description: `${String(entry.paths.length)} ${entry.paths.length === 1 ? 'file changed' : 'files changed'} on both lines. ${entry.into} is untouched until you choose.`,
        });
        return;
      }
      analytics.capture('revision_restored', {
        revision: entry.revisionNumber,
        unrecoverableCount: entry.unrecoverable.length,
      });
      toast.success(`Restored to Revision ${String(entry.revisionNumber)}`, {
        description:
          entry.unrecoverable.length > 0
            ? `${String(entry.unrecoverable.length)} ${entry.unrecoverable.length === 1 ? 'file could' : 'files could'} not be recovered (recorded before content capture).`
            : undefined,
        action: { label: 'Undo', onClick: commands.undo },
      });
    });
  }, [analytics, client, commands]);

  const deleteCount = restore?.removedPathCount ?? 0;
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
              {restore?.revisionNumber === undefined
                ? 'Restore this revision?'
                : `Restore Revision ${String(restore.revisionNumber)}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCount > 0
                ? `This deletes ${String(deleteCount)} ${deleteCount === 1 ? 'file' : 'files'} created since. `
                : ''}
              {restore?.dirty === true ? 'Unsaved editor changes will be overwritten. ' : ''}
              You can undo this restore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button autoFocus variant='outline' onClick={commands.cancel}>
              Cancel
            </Button>
            <Button onClick={commands.confirm}>Restore</Button>
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
