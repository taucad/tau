import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { activeOps, buildRevisions, buildTimeline } from '#lib/file-restore-timeline.js';
import type { Revision } from '#lib/file-restore-timeline.js';
import { buildRevisionGraph, filterRevisionGraph } from '#lib/revision-graph.js';
import type { RevisionGraph } from '#lib/revision-graph.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';

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
  /** Full branch projection, including inspect-only superseded revisions. */
  graph: RevisionGraph;
};

/**
 * Derives the raw Revision list (and head) from the chat timeline plus the
 * machine's persisted `headTurnId` / `supersededTurnIds`. Raw milestone
 * revisions remain available while a request runs so restore and recovery
 * mechanics retain their durable filesystem evidence. UI surfaces should use
 * `useVisibleRevisions`, which withholds unfinished turns.
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
  const persistedGraph = useSelector(actor, (s) => s.context.graph);

  return useMemo(() => {
    const timeline = buildTimeline(activeOps(chats, supersededTurnIds));
    const authoritativeTurnIds = new Set(
      Object.values(persistedGraph.nodes).flatMap((node) => (node.revisionId === undefined ? [] : [node.turnId])),
    );
    const committedTimeline = timeline.filter((operation) => authoritativeTurnIds.has(operation.turnMessageId));
    const revisions = buildRevisions(chats, committedTimeline);
    const byMessageId = new Map(revisions.map((r) => [r.messageId, r]));
    const latest = revisions.at(-1);
    // The FS reflects the Revision identified by `headTurnId`. '' is the tip
    // sentinel (follow the newest); an id resolves that Revision, falling back to
    // the tip when it no longer exists — so the head is NEVER stranded while
    // Revisions exist (kills the stale "Revision 0 · baseline" chip).
    const headRevision = headTurnId === '' ? latest : (revisions.find((r) => r.messageId === headTurnId) ?? latest);
    const maxRevision = latest?.n ?? 0;
    const projectedGraph = buildRevisionGraph({
      chats,
      persisted: persistedGraph,
      supersededTurnIds,
      headTurnId,
    });
    const transcriptOnlyTurnIds = new Set(
      buildRevisions(chats, timeline)
        .filter((revision) => persistedGraph.nodes[revision.messageId] === undefined)
        .map((revision) => revision.messageId),
    );
    const graph = filterRevisionGraph(projectedGraph, transcriptOnlyTurnIds, revisions);
    return {
      revisions,
      byMessageId,
      headRevision,
      maxRevision,
      headTurnId,
      isDirty,
      canReturnToLatest: maxRevision > 0 && (headRevision?.n ?? 0) < maxRevision,
      graph,
    };
  }, [chats, supersededTurnIds, headTurnId, isDirty, persistedGraph]);
}

const inFlightTurnIdDelimiter = '\0';

/**
 * Resolves the active turn from the authoritative persistence lifecycle.
 * `invoking`, `retrying`, and `stopping` all represent unfinished requests;
 * AI SDK `error` alone is not terminal because transparent retries retain it.
 *
 * The initial `invoking` transition can precede the Chat instance appending a
 * new user message. Waiting for either an active transport status or a retry
 * attempt prevents the previously completed turn from disappearing during
 * that hand-off window.
 */
const inFlightTurnId = (store: ChatSessionStore, session: ChatSession): string | undefined => {
  const snapshot = session.persistenceActorRef.getSnapshot();
  if (snapshot.matches({ requestLifecycle: 'idle' })) {
    return undefined;
  }

  const lifecycleHasCurrentTurn =
    !snapshot.matches({ requestLifecycle: 'invoking' }) ||
    store.getStatus(session.chatId) !== 'ready' ||
    snapshot.context.retryAttempt > 0;
  if (!lifecycleHasCurrentTurn) {
    return undefined;
  }

  return session.chat.messages.findLast((message) => message.role === 'user')?.id;
};

/** Subscribe to every live session belonging to the project, including background chats. */
function useInFlightTurnIds(chatIds: readonly string[]): ReadonlySet<string> {
  const store = useChatSessionStore();

  const subscribe = useCallback(
    (listener: () => void) => {
      let sessionCleanups: Array<() => void> = [];

      const bindSessions = (): void => {
        for (const cleanup of sessionCleanups) {
          cleanup();
        }
        sessionCleanups = [];

        for (const chatId of chatIds) {
          const session = store.get(chatId);
          if (!session) {
            continue;
          }
          const actorSubscription = session.persistenceActorRef.subscribe(listener);
          const unsubscribeChat = store.subscribeChat(chatId, listener);
          sessionCleanups.push(() => {
            actorSubscription.unsubscribe();
            unsubscribeChat();
          });
        }
      };

      bindSessions();
      const unsubscribeMembership = store.subscribeMembership(() => {
        bindSessions();
        listener();
      });

      return () => {
        unsubscribeMembership();
        for (const cleanup of sessionCleanups) {
          cleanup();
        }
      };
    },
    [store, chatIds],
  );

  const getSnapshot = useCallback(
    () =>
      chatIds
        .map((chatId) => store.get(chatId))
        .filter((session): session is ChatSession => session !== undefined)
        .map((session) => inFlightTurnId(store, session))
        .filter((turnId): turnId is string => turnId !== undefined)
        .sort()
        .join(inFlightTurnIdDelimiter),
    [store, chatIds],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => new Set(snapshot === '' ? [] : snapshot.split(inFlightTurnIdDelimiter)), [snapshot]);
}

/**
 * Completed-turn projection for every revision UI surface. In-flight turns are
 * removed and the remaining revisions are renumbered contiguously without
 * changing raw cutoffs, anchors, or stable turn identities.
 */
export function useVisibleRevisions(): RevisionsView {
  const raw = useRevisions();
  const { projectId } = useProject();
  const { chats } = useChats(projectId, { includeDeleted: true });
  const chatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const inFlightTurnIds = useInFlightTurnIds(chatIds);

  return useMemo(() => {
    if (inFlightTurnIds.size === 0) {
      return raw;
    }

    const revisions = raw.revisions
      .filter((revision) => !inFlightTurnIds.has(revision.messageId))
      .map((revision, index) => ({ ...revision, n: index + 1 }));
    const byMessageId = new Map(revisions.map((revision) => [revision.messageId, revision]));
    const latest = revisions.at(-1);
    const headRevision = raw.headTurnId === '' ? latest : (byMessageId.get(raw.headTurnId) ?? latest);
    const maxRevision = latest?.n ?? 0;

    return {
      revisions,
      byMessageId,
      headRevision,
      maxRevision,
      headTurnId: raw.headTurnId,
      isDirty: raw.isDirty,
      canReturnToLatest: maxRevision > 0 && (headRevision?.n ?? 0) < maxRevision,
      graph: filterRevisionGraph(raw.graph, inFlightTurnIds, revisions),
    };
  }, [raw, inFlightTurnIds]);
}
