/**
 * Every revision surface's one reader, bound to this app's services.
 *
 * The graph, branch and history derivation, the paging and the comparisons are
 * `@taucad/revisions-ui`'s ({@link createRevisionHistoryHooks}). What only this
 * app can reach is handed in here, once: the open project, the revision client
 * and projection from `use-revision-status`, the chat session store whose
 * settlements name each turn's revision, the library's who-resolver over
 * `lib/revision-actor`'s context (session, push record and the debug flag) and the push
 * records of `lib/revision-pushes` (both bound to `window.ENV`'s API origin). App suites mock
 * this module and the ones it binds, so its path stays; the types and
 * `revisionPageSize` are imported from the library itself.
 */

import { useMemo } from 'react';
import { createRevisionHistoryHooks } from '@taucad/revisions-ui/hooks/use-revisions';
import type { RevisionAuthorship } from '@taucad/revisions-ui/hooks/use-revisions';
import { useProject } from '#hooks/use-project.js';
import { revisionWho } from '@taucad/revisions-ui/lib/revision-who';
import { useRevisionWhoContext } from '#lib/revision-actor.js';
import { holdRevisionGraph, refreshPushRecords } from '#lib/revision-pushes.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

const useProjectId = (): string => useProject().projectId;

/* Subscribed, not read once: a sign-in mid-session relabels every card. */
const useRevisionAuthorship = (projectId: string): RevisionAuthorship => {
  const who = useRevisionWhoContext(projectId);
  return useMemo(() => ({ accountId: who.session?.id, whoOf: (row) => revisionWho(row, who) }), [who]);
};

/* Every service is read when it is used, so a module mock is seen as it stands then. */
const revisionHistoryHooks = createRevisionHistoryHooks({
  useProjectId: () => useProjectId(),
  useRevisionClient: () => useRevisionClient(),
  useRevisionStatus: () => useRevisionStatus(),
  useSettlementStore: () => useChatSessionStore(),
  useRevisionAuthorship: (projectId) => useRevisionAuthorship(projectId),
  pushRecords: {
    holdRevisionGraph: (projectId, rows) => {
      holdRevisionGraph(projectId, rows);
    },
    refreshPushRecords: (input) => {
      refreshPushRecords(input);
    },
  },
});

/**
 * The selected branch's history and where the checkout sits on it.
 *
 * @public
 */
export const { useRevisions } = revisionHistoryHooks;

/**
 * Every branch's history in one walk, for History's lanes (D2).
 *
 * @public
 */
export const { useRevisionGraph } = revisionHistoryHooks;

/**
 * Cards for revisions a surface names by id, wherever they sit in the history (B4).
 *
 * @public
 */
export const { useRevisionCards } = revisionHistoryHooks;

/**
 * The revisions among `ids` that belong to the selected line's history (B4).
 *
 * @public
 */
export const { useRevisionsOnLine } = revisionHistoryHooks;

/**
 * The cards, plus each restore target among them they do not hold (B4).
 *
 * @public
 */
export const { useWithRestoreTargets } = revisionHistoryHooks;

/**
 * The revision one chat turn saved, found by the revision its settlement names.
 *
 * @public
 */
export const { useTurnRevision } = revisionHistoryHooks;

/**
 * Which paths one revision changed, against its own first parent.
 *
 * @public
 */
export const { useRevisionChanges } = revisionHistoryHooks;

/**
 * Paths that differ between a revision and the selected live checkout.
 *
 * @public
 */
export const { useRevisionChangesSince } = revisionHistoryHooks;

/**
 * One file's text on both sides of a revision, for *Compare* (S38, A27).
 *
 * @public
 */
export const { useRevisionFileComparison } = revisionHistoryHooks;
