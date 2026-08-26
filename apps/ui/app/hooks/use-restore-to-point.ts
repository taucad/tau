import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';
import type { RestoreTarget } from '#machines/revision.machine.js';

export type UseRestoreToPoint = {
  restore: (target: RestoreTarget) => void;
  returnToLatest: () => void;
  undo: () => void;
  isDirty: boolean;
  isBusy: boolean;
};

/**
 * Thin read/dispatch surface over the per-project `revisionMachine` (mirrors
 * `useChatActions`). Components call `restore`/`returnToLatest`/`undo` and read
 * the derived selectors. `headRevision` / `revisions` (which need the chat
 * timeline) live in `useRevisions`.
 */
export function useRestoreToPoint(): UseRestoreToPoint {
  const actor = useRevisionActor();

  const isDirty = useSelector(actor, (state) => state.context.dirty);
  const isBusy = useSelector(actor, (state) => !state.matches('idle'));

  const restore = useCallback(
    (target: RestoreTarget) => {
      actor.send({ type: 'RESTORE', target });
    },
    [actor],
  );
  const returnToLatest = useCallback(() => {
    actor.send({ type: 'RETURN_TO_LATEST' });
  }, [actor]);
  const undo = useCallback(() => {
    actor.send({ type: 'UNDO' });
  }, [actor]);

  return {
    restore,
    returnToLatest,
    undo,
    isDirty,
    isBusy,
  };
}
