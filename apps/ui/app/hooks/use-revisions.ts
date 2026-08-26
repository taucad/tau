import { useMemo } from 'react';
import { useSelector } from '@xstate/react';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';
import { activeOps, buildRevisions, buildTimeline } from '#lib/file-restore-timeline.js';
import type { Revision } from '#lib/file-restore-timeline.js';

export type RevisionsView = {
  /** Non-superseded Revisions across every project chat, contiguous 1..N. */
  revisions: Revision[];
  /** Maps `messageId` to its Revision, for per-bubble lookup. */
  byMessageId: Map<string, Revision>;
  /** The Revision the live FS currently reflects — always defined once any Revision exists. */
  headRevision: Revision | undefined;
  maxRevision: number;
  /** Head Revision by stable user-message id; `''` = following the tip. */
  headTurnId: string;
  isDirty: boolean;
  canReturnToLatest: boolean;
};

/**
 * Derives the Revision list (and head) from the chat timeline plus the
 * machine's persisted `headTurnId` / `supersededTurnIds`. One source of
 * truth for the inline button, the ring/tag, the top-bar chip, and the pane.
 *
 * The chat fetch is deduped by React Query (shared `['chats', …]` key), and the
 * derivation is memoized per render.
 *
 * ponytail: recomputed per consuming component; buildRevisions is O(ops), so
 * many mounted bubbles are O(bubbles·ops). Fine for typical chats; lift into
 * the RevisionProvider context if a huge project ever makes it measurable.
 */
export function useRevisions(): RevisionsView {
  const { projectId } = useProject();
  const { chats } = useChats(projectId, { includeDeleted: true });
  const actor = useRevisionActor();
  const headTurnId = useSelector(actor, (s) => s.context.headTurnId);
  const supersededTurnIds = useSelector(actor, (s) => s.context.supersededTurnIds);
  const isDirty = useSelector(actor, (s) => s.context.dirty);

  return useMemo(() => {
    const revisions = buildRevisions(chats, buildTimeline(activeOps(chats, supersededTurnIds)));
    const byMessageId = new Map(revisions.map((r) => [r.messageId, r]));
    const latest = revisions.at(-1);
    // The FS reflects the Revision identified by `headTurnId`. '' is the tip
    // sentinel (follow the newest); an id resolves that Revision, falling back to
    // the tip when it no longer exists — so the head is NEVER stranded while
    // Revisions exist (kills the stale "Revision 0 · baseline" chip).
    const headRevision = headTurnId === '' ? latest : (revisions.find((r) => r.messageId === headTurnId) ?? latest);
    const maxRevision = latest?.n ?? 0;
    return {
      revisions,
      byMessageId,
      headRevision,
      maxRevision,
      headTurnId,
      isDirty,
      canReturnToLatest: maxRevision > 0 && (headRevision?.n ?? 0) < maxRevision,
    };
  }, [chats, supersededTurnIds, headTurnId, isDirty]);
}
