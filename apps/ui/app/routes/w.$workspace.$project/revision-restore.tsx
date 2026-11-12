import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { toast } from '@taucad/ui/components/sonner';
import { useAnalytics } from '#hooks/use-analytics.js';
import { useRevisionClient, useRevisionCommands } from '#hooks/use-revision-status.js';
import { describeRevisionFailure } from '@taucad/ui-core/lib/revision-failure-copy';
import { revisionWarningCodes } from '#lib/revision-failure-reporting.js';
import type { RevisionFailureSubject } from '@taucad/ui-core/lib/revision-failure-copy';
import type { BranchOperation } from '@taucad/revisions';
import type { RevisionToast } from '#machines/file-manager.worker.revisions.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import type { RevisionClient } from '#types/revision-client.types.js';
import {
  needsDecision,
  restoredSentence,
  switchedSentence,
  switchRefusedSentence,
  undidRestoreSentence,
  undidSentence,
  undoLabel,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import { useHeldSaveToast } from '#routes/w.$workspace.$project/held-save-toast.js';

/** What a settled branch verb other than *Switch* says. Document words only (A18, I12). */
const branchSettledCopy: Readonly<Record<Exclude<BranchOperation, 'switch'>, (branch: string) => string>> = {
  merge: (branch) => `Merged ${branch}`,
  discard: (branch) => `Closed ${branch}`,
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
 * Says a branch verb settled. A switch acted at once (I11), so its Undo is a
 * switch back to where the person was; a switch with nowhere to go back offers none.
 *
 * @param entry - The settled verb.
 * @param switchTo - Moves the working copy to a branch.
 */
function raiseBranchSettled(
  entry: Extract<RevisionToast, { type: 'branch' }>,
  switchTo: (branch: string) => void,
): void {
  if (entry.operation !== 'switch') {
    toast.success(branchSettledCopy[entry.operation](entry.branch));
    return;
  }
  const { from } = entry;
  toast.success(
    switchedSentence(entry.branch, from, entry.saved === true),
    from === undefined || from === entry.branch
      ? undefined
      : {
          action: {
            label: undoLabel,
            onClick: () => {
              switchTo(from);
            },
          },
        },
  );
}

/**
 * Says a *Restore* or *Undo restore* landed. *Undo restore* is itself the
 * undo: it says so and offers no second one. A restore acted at once (I11):
 * its toast names what came back by its version or title — the loaded card,
 * or one row read wherever it sits in History — and offers *Undo restore*.
 *
 * @param entry - The settled restore.
 * @param context - What names it and what takes it back.
 * @param context.loaded - History's loaded page.
 * @param context.client - Reads the restored row when the page does not hold it.
 * @param context.undo - Takes the restore back.
 */
function raiseRestored(
  entry: Extract<RevisionToast, { type: 'restored' }>,
  {
    loaded,
    client,
    undo,
  }: Readonly<{ loaded: readonly RevisionCard[]; client: Pick<RevisionClient, 'log'>; undo: () => void }>,
): void {
  if (entry.mode === 'undoRestore') {
    toast.success(undidRestoreSentence);
    return;
  }
  const card = loaded.find((revision) => revision.revisionId === entry.revisionId);
  if (card !== undefined) {
    toast.success(restoredSentence(card), { action: { label: undoLabel, onClick: undo } });
    return;
  }
  const announce = async (): Promise<void> => {
    let restored: Parameters<typeof restoredSentence>[0];
    try {
      [restored] = await client.log({ from: entry.revisionId, limit: 1 });
    } catch {
      /* The files are back either way; an unread row is named without its title. */
      restored = undefined;
    }
    toast.success(restoredSentence(restored), { action: { label: undoLabel, onClick: undo } });
  };
  // async-iife: toast -- one row read names what came back; a failed read still says the restore landed.
  void announce();
}

/**
 * The toasts the revision tree raises for a person (S19, PC9).
 *
 * Restore and Switch act at once and offer Undo here, in the toast (I11): a
 * restore is a new entry on top that *Undo restore* takes back, and a switch
 * saves unsaved work on the branch it leaves before it moves, so its Undo is
 * one more switch back. Nothing here asks first; the one dialog that guards
 * what cannot be undone is disconnecting the backup, which the Sync region owns.
 *
 * @returns Nothing: the toasts are the surface.
 */
export function RevisionRestore(): ReactNode {
  const commands = useRevisionCommands();
  const client = useRevisionClient();
  const analytics = useAnalytics();
  const raiseHeldSave = useHeldSaveToast();
  /* A toast names an entry by its title or version, never by its number (M11): the loaded page answers which one. */
  const { revisions } = useRevisions();
  const loaded = useRef(revisions);
  useEffect(() => {
    loaded.current = revisions;
  });

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
        // Outcome fields only: the diagnostic goes to error reporting with these tags (SB4, `reportRevisionToast`).
        analytics.capture(revisionFailureEvent[entry.subject], {
          code: entry.code,
          ...(entry.subject === 'connection'
            ? { generation: entry.generation, operation: entry.connectionOperation }
            : {}),
        });
        console.error('[revisions]', entry.subject, entry.code, entry.message);
        /* W0 N1, M1, D15: files that are back, and an undo with nothing here to undo, lost nothing; they are not failures. */
        if (entry.code !== undefined && revisionWarningCodes.has(entry.code)) {
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
        } else if (entry.subject !== 'remote') {
          // Connection status already belongs to Revisions, including automatic first backup.
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
        toast.error(switchRefusedSentence(entry.branch), { description: entry.reason });
        return;
      }
      /* A branch verb settles out of sight of the row that started it — the row
       * may not even exist any more — so the one toast sink the tree has says
       * so (A25: no removal is silent). */
      if (entry.type === 'branch') {
        analytics.capture('revision_branch_settled', { operation: entry.operation });
        raiseBranchSettled(entry, commands.switchTo);
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
          description: `${String(entry.paths.length)} ${entry.paths.length === 1 ? 'file changed' : 'files changed'} on both branches. ${entry.into} is unchanged until you choose.`,
        });
        return;
      }
      /* D15: an undo row names what it undid, as a restore row names its source. */
      if (entry.type === 'undone') {
        analytics.capture('revision_undone', { revision: entry.revisionNumber });
        const { revisionNumber } = entry;
        toast.success(
          undidSentence(
            revisionNumber === undefined ? undefined : loaded.current.find((revision) => revision.n === revisionNumber),
          ),
        );
        return;
      }
      analytics.capture('revision_restored', { revision: entry.revisionNumber, mode: entry.mode });
      raiseRestored(entry, { loaded: loaded.current, client, undo: commands.undo });
    });
  }, [analytics, client, commands, raiseHeldSave]);

  return null;
}
