import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import { toast } from '#components/ui/sonner.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import type { WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

/**
 * A turn that ended without recording a revision, as a surface reads it.
 *
 * It carries the refusal's `code` and not the machine's `reason`: the sentences
 * `turn.machine` authors are diagnostics — two of them name a checkout, which
 * is Rule 1's first banned word — so the notice holds the category and every
 * surface phrases it through `describeRevisionFailure` (P4, W4 §D).
 *
 * @public
 */
export type TurnOutcomeNotice = Readonly<{
  projectId: string;
  kind: 'conflicted' | 'failed';
  turnId: string;
  chatId: string;
  code: string | undefined;
}>;

const topic = new Topic<void>({ name: 'revision-turn-outcomes' });
const outcomes = new Map<string, TurnOutcomeNotice[]>();
const noOutcomes: readonly TurnOutcomeNotice[] = Object.freeze([]);

/** Forget the notice a surface has acted on. @public */
export const clearTurnOutcome = (projectId: string, turnId?: string): void => {
  outcomes.set(
    projectId,
    turnId === undefined ? [] : (outcomes.get(projectId) ?? []).filter((notice) => notice.turnId !== turnId),
  );
  topic.emit();
};

/**
 * The turns that ended without a revision for one project.
 *
 * A module store rather than component state: the toast and the pane's
 * attention line are two surfaces for one fact, and two subscriptions to the
 * port would mean two toasts for one failure.
 *
 * @returns The notice, until a surface clears it.
 * @public
 */
export const useTurnOutcomes = (projectId: string): readonly TurnOutcomeNotice[] =>
  useSyncExternalStore(
    (listener) => topic.subscribe(listener),
    () => outcomes.get(projectId) ?? noOutcomes,
    () => noOutcomes,
  );

const noticeOf = (projectId: string, event: WorkerRevisionEvent): TurnOutcomeNotice | undefined => {
  if (event.type === 'turn.finalized' || event.type === 'chats.projected') {
    return undefined;
  }
  return {
    projectId,
    kind: event.type === 'turn.conflicted' ? 'conflicted' : 'failed',
    turnId: event.turnId,
    chatId: event.chatId,
    code: event.type === 'turn.failed' ? event.code : undefined,
  };
};

/**
 * The two outcomes that are not a settlement, given a surface (W5 review R5).
 *
 * `turn.conflicted` and `turn.failed` are published by every host in the same
 * schema as `turn.finalized` (S9, A4) and were read by nothing: a turn that
 * recorded no revision was silent on both hosts, which is exactly what "no
 * outcome is silent" forbids. This is the one place they are heard — a notice
 * a person sees now, and a line the Revisions pane keeps until it is read.
 *
 * Mounted once per project route, beside the restore dialog.
 *
 * @returns Nothing; it only listens.
 */
export function RevisionOutcomes(): undefined {
  const client = useRevisionClient();
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    return client.subscribeEvents((event) => {
      if (event.type === 'chats.projected') {
        if (event.projectId !== projectId) {
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ['chats', projectId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        for (const chatId of event.chatIds) {
          void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
        }
        return;
      }
      const notice = noticeOf(projectId, event);
      if (notice === undefined) {
        return;
      }
      const current = outcomes.get(projectId) ?? [];
      outcomes.set(projectId, [...current.filter((entry) => entry.turnId !== notice.turnId), notice]);
      topic.emit();
      if (notice.kind === 'conflicted') {
        toast.error('That change needs your attention', {
          description: 'Two versions of this project changed the same files. Open Revisions to sort it out.',
        });
        return;
      }
      /* The diagnostic goes where someone can act on it, which is not a toast
       * (E5); the code becomes the words. */
      if (event.type === 'turn.failed') {
        console.error('[revisions]', 'turn', event.code, event.reason);
      }
      const copy = describeRevisionFailure('turn', notice.code);
      toast.error(copy.title, { description: copy.description });
    });
  }, [client, projectId, queryClient]);

  return undefined;
}
