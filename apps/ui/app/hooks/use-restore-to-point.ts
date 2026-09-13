import { useMemo } from 'react';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';

export type UseRestoreToPoint = {
  /** Restore one recorded revision by id; a risky plan asks first (S19). */
  restore: (revisionId: string) => void;
  returnToLatest: () => void;
  undo: () => void;
  isDirty: boolean;
  isBusy: boolean;
};

/**
 * The restore verbs, and the two facts a control needs to render them.
 *
 * **One writer.** `restore.machine` in the file-manager worker owns the plan and
 * applies it over the port; the page holds no revision actor and writes no
 * files of its own (A38). The verbs here are that machine's own events.
 *
 * @returns The verbs plus `isDirty` / `isBusy` from the projection.
 * @public
 */
export function useRestoreToPoint(): UseRestoreToPoint {
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const isDirty = status?.dirty ?? false;
  const isBusy = (status?.restore.busy ?? false) || (status?.restore.asking ?? false);
  return useMemo(
    () => ({
      restore: commands.restore,
      returnToLatest: commands.returnToLatest,
      undo: commands.undo,
      isDirty,
      isBusy,
    }),
    [commands, isBusy, isDirty],
  );
}
