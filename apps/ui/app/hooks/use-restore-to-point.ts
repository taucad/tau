import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
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
  const authority = useOptionalChatWorkspaceAuthority();

  const isDirty = useSelector(actor, (state) => state.context.dirty);
  const isBusy = useSelector(actor, (state) => !state.matches('idle'));

  /**
   * Restore one point.
   *
   * An authoritative node is a *checkout*: its bytes come from the revision
   * store, so any finalized revision is restorable whichever agent wrote it,
   * and the store — not replayed chat evidence — decides the tree. The machine
   * still gets its `RESTORE`, because `Current`, `isLatest`, `dirty` and the
   * undo step are its bookkeeping and nothing else keeps them.
   *
   * ponytail: the checkout runs before the machine's own plan, so a divergent
   * transcript replay still writes last. Making the store terminal needs the
   * `applyPlan` actor in `revision-provider.tsx` to skip an authoritative
   * target, which is a shared owner this change does not hold.
   */
  const restore = useCallback(
    (target: RestoreTarget) => {
      const { revisionId } = target;
      if (target.identitySource !== 'authoritative' || revisionId === undefined || authority === undefined) {
        actor.send({ type: 'RESTORE', target });
        return;
      }
      // async-iife: bootstrap -- a click cannot await; the machine reports failures.
      void (async () => {
        try {
          await authority.checkout(revisionId);
        } catch (error) {
          console.error('[useRestoreToPoint] authoritative checkout failed', error);
        }
        actor.send({ type: 'RESTORE', target });
      })();
    },
    [actor, authority],
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
