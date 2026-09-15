/**
 * Every revision surface's one reader: the host-attested graph (S10, A4, I3).
 *
 * `Rev N` is the first-parent ordinal on the selected branch, "Current" is the
 * selected checkout's head, and dirty is the checkout machine's own state —
 * all derived at read time from the graph and the projection, never stored and
 * never counted over chat membership. Deleting a chat therefore renumbers
 * nothing, because no number was ever a position in a transcript.
 *
 * Cards attach to turns by the settlement the host attested: the revision
 * carries the turn it recorded (`provenance.turnId`), so a card is recovered
 * from `log(branch)` alone after a reload, and a turn a *remote* host placed —
 * whose graph this page cannot read — is carried by its `turn.finalized`
 * record in the chat's own durable log. One schema, two transports.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { RevisionDiffEntry, RevisionRow } from '@taucad/revisions';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import {
  getHostFinalizedTurns,
  subscribeHostFinalizedTurns,
} from '#chat-clients/_internal/browser-agent-host-transport.js';

/** One revision, as every card and history row reads it. @public */
export type RevisionCard = {
  readonly revisionId: string;
  /**
   * First-parent ordinal on the selected branch.
   *
   * `undefined` for a revision this page's graph does not name on that line: a
   * revision merged in from another branch, or a turn a remote host recorded.
   */
  readonly n: number | undefined;
  /** Milliseconds since the Unix epoch. */
  readonly createdAt: number;
  readonly summary: string;
  readonly actor: string;
  /** The turn this revision recorded, when a turn did. */
  readonly turnId: string | undefined;
  readonly conflicted: boolean;
  readonly tags?: readonly string[];
  readonly trigger: RevisionRow['trigger'];
  /**
   * Paths the settling host attested, for a card whose revision is not in this
   * page's graph. Otherwise the diff is asked of the graph on demand.
   */
  readonly changedPaths?: readonly string[];
};

/** What every revision surface reads. @public */
export type RevisionsView = {
  /** The selected branch's history, newest first. */
  readonly revisions: readonly RevisionCard[];
  /** Cards by the turn they recorded, for the chat bubble that anchors one. */
  readonly byTurnId: ReadonlyMap<string, RevisionCard>;
  /** The revision the selected checkout reflects — the one that reads "Current". */
  readonly headRevisionId: string | undefined;
  readonly branch: string | undefined;
  /** The checkout has been written to since its head (A19). */
  readonly isDirty: boolean;
  /** The checkout sits behind the newest revision on its branch. */
  readonly canReturnToLatest: boolean;
  readonly isLoading: boolean;
  readonly branchFacts?: ReadonlyMap<
    string,
    Readonly<{ revisionNumber: number | undefined; ahead: number; behind: number }>
  >;
};

const emptyView: RevisionsView = {
  revisions: [],
  byTurnId: new Map(),
  headRevisionId: undefined,
  branch: undefined,
  isDirty: false,
  canReturnToLatest: false,
  isLoading: false,
  branchFacts: new Map(),
};

const cardOf = (row: RevisionRow): RevisionCard => ({
  revisionId: row.revisionId,
  n: row.revisionNumber,
  createdAt: row.createdAt,
  summary: row.summary,
  actor: row.actor,
  turnId: row.turnId,
  conflicted: row.conflicted,
  tags: row.tags,
  trigger: row.trigger,
});

/** Host-attested settlements this tab holds for the project on screen. */
type FinalizedRevision = Readonly<{ branch: string | undefined; card: RevisionCard }>;

const useHostFinalizedTurns = (projectId: string): readonly FinalizedRevision[] => {
  const settlements = useSyncExternalStore(subscribeHostFinalizedTurns, getHostFinalizedTurns, getHostFinalizedTurns);
  return useMemo(
    () =>
      settlements.flatMap((settlement): FinalizedRevision[] =>
        settlement.projectId === projectId && settlement.revisionId !== undefined
          ? [
              {
                branch: settlement.branch,
                card: {
                  revisionId: settlement.revisionId,
                  n: undefined,
                  createdAt: 0,
                  summary: '',
                  actor: '',
                  turnId: settlement.turnId,
                  conflicted: false,
                  tags: [],
                  trigger: 'turn',
                  changedPaths: settlement.changedPaths,
                },
              },
            ]
          : [],
      ),
    [projectId, settlements],
  );
};

/**
 * The selected branch's history and where the checkout sits on it.
 *
 * The log is re-read whenever the projection's head moves, which is what a
 * settled turn, a save, a restore and a switch all do — so no surface has to be
 * told that the graph changed.
 *
 * @returns The view every revision surface reads.
 * @public
 */
export function useRevisions(): RevisionsView {
  const { projectId } = useProject();
  const client = useRevisionClient();
  const status = useRevisionStatus();
  const branch = status?.branch;
  const headRevisionId = status?.headRevisionId;
  const finalized = useHostFinalizedTurns(projectId);
  const finalizedBranchHeads = useMemo(
    () => [
      ...new Map(
        finalized.flatMap((entry) =>
          entry.branch && entry.branch !== branch ? [[entry.branch, entry.card.revisionId] as const] : [],
        ),
      ),
    ],
    [branch, finalized],
  );

  const { data: rows, isPending } = useQuery({
    queryKey: ['revision-log', projectId, branch ?? '', headRevisionId ?? ''],
    enabled: client !== undefined && branch !== undefined,
    queryFn: async () => client?.log(branch === undefined ? {} : { branch }) ?? [],
    /* The graph is append-only and the key carries the head, so a cached answer
     * for a head that has not moved is exact rather than merely fresh. */
    staleTime: Number.POSITIVE_INFINITY,
  });
  const settledBranchRows = useQueries({
    queries: finalizedBranchHeads.map(([settledBranch, finalizedRevisionId]) => ({
      queryKey: ['revision-log', projectId, settledBranch, finalizedRevisionId],
      enabled: client !== undefined,
      queryFn: async () => client?.log({ branch: settledBranch }) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });
  const branchRows = useQueries({
    queries: (status?.branches ?? []).map((entry) => ({
      queryKey: ['revision-log', projectId, entry.name, entry.head ?? ''],
      enabled: client !== undefined && entry.head !== undefined,
      queryFn: async () => client?.log({ branch: entry.name }) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });

  return useMemo(() => {
    if (client === undefined || branch === undefined) {
      return emptyView;
    }
    const revisions = (rows ?? []).map((row) => cardOf(row));
    const byTurnId = new Map<string, RevisionCard>();
    /* The graph first, then the settlements it does not name: a turn a remote
     * host recorded has no row here, and a turn this graph holds is the better
     * card because it carries its own number. */
    for (const { card } of finalized) {
      if (card.turnId !== undefined) {
        byTurnId.set(card.turnId, card);
      }
    }
    for (const card of revisions) {
      if (card.turnId !== undefined) {
        byTurnId.set(card.turnId, card);
      }
    }
    for (const row of settledBranchRows.flatMap((query) => query.data ?? [])) {
      const card = cardOf(row);
      if (card.turnId !== undefined) {
        byTurnId.set(card.turnId, card);
      }
    }
    const selectedIds = new Set((rows ?? []).map((row) => row.revisionId));
    const branchFacts = new Map<string, { revisionNumber: number | undefined; ahead: number; behind: number }>();
    for (const [index, entry] of (status?.branches ?? []).entries()) {
      const branchLog = branchRows[index]?.data ?? [];
      const branchIds = new Set(branchLog.map((row) => row.revisionId));
      branchFacts.set(entry.name, {
        revisionNumber: branchLog[0]?.revisionNumber,
        ahead: branchLog.filter((row) => !selectedIds.has(row.revisionId)).length,
        behind: (rows ?? []).filter((row) => !branchIds.has(row.revisionId)).length,
      });
    }
    return {
      revisions,
      byTurnId,
      headRevisionId,
      branch,
      isDirty: status?.dirty ?? false,
      canReturnToLatest:
        headRevisionId !== undefined && revisions.length > 0 && revisions[0]?.revisionId !== headRevisionId,
      isLoading:
        isPending ||
        settledBranchRows.some((query) => query.isPending) ||
        branchRows.some((query, index) => status?.branches[index]?.head !== undefined && query.isPending),
      branchFacts,
    };
  }, [branch, branchRows, client, finalized, headRevisionId, isPending, rows, settledBranchRows, status]);
}

/**
 * Which paths one revision changed, against its own first parent.
 *
 * A revision is immutable, so the answer never goes stale; a card whose
 * settlement already named its paths (a turn a remote host recorded) is served
 * from those instead of asking a graph that does not hold it.
 *
 * @param card - The card whose files a surface is rendering.
 * @returns The changed paths, empty until the first answer.
 * @public
 */
export function useRevisionChanges(card: RevisionCard | undefined): readonly RevisionDiffEntry[] {
  const client = useRevisionClient();
  const attested = card?.changedPaths;
  const { data } = useQuery({
    queryKey: ['revision-diff', card?.revisionId ?? ''],
    enabled: client !== undefined && card !== undefined && attested === undefined,
    queryFn: async () => (card === undefined ? [] : (client?.diff(card.revisionId) ?? [])),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return useMemo(() => attested?.map((path) => ({ path, kind: 'modified' }) as const) ?? data ?? [], [attested, data]);
}

/**
 * One file's text on both sides of a revision, for *Compare* (S38, A27).
 *
 * Two comparisons, one round trip each: against the revision's own first parent
 * ("what did this revision change") and, with `against: 'checkout'`, against
 * the files as they are now ("what have I changed since it"). The worker owns
 * the port and the checkout, so it resolves both sides there rather than making
 * the page ask three questions to answer one.
 *
 * A revision is immutable, but the checkout is not, and nothing on the
 * projection says how many times it has been written — a per-write counter on
 * the wire would move the projection on every keystroke, which is the opposite
 * of "settled values out" (A38, ruling P28). So the working side is simply not
 * cached: one round trip per open of the compare view, resolved in the worker
 * against the live tree (W7 review R7).
 *
 * @param revisionId - The revision to compare.
 * @param path - The file inside it.
 * @param against - `'checkout'` to compare with the working copy.
 * @returns Both sides, empty until the first answer.
 * @public
 */
export function useRevisionFileComparison(
  revisionId: string | undefined,
  path: string | undefined,
  against?: 'checkout',
): Readonly<{
  original: string;
  modified: string;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | undefined;
  retry: () => void;
}> {
  const client = useRevisionClient();
  const status = useRevisionStatus();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [
      'revision-compare',
      revisionId ?? '',
      path ?? '',
      against ?? 'parent',
      against === 'checkout' ? (status?.headRevisionId ?? '') : '',
    ],
    enabled: client !== undefined && revisionId !== undefined && path !== undefined,
    queryFn: async () =>
      revisionId === undefined || path === undefined
        ? { original: '', modified: '' }
        : ((await client?.compare(revisionId, path, against === undefined ? undefined : { against })) ?? {
            original: '',
            modified: '',
          }),
    /* A revision against its own parent is immutable and cached for the
     * session; the working side is re-read every time it is opened. */
    staleTime: against === 'checkout' ? 0 : Number.POSITIVE_INFINITY,
  });
  return {
    original: data?.original ?? '',
    modified: data?.modified ?? '',
    isLoading: isPending,
    isLoaded: data !== undefined,
    error: error instanceof Error ? error.message : undefined,
    retry: () => {
      void refetch();
    },
  };
}
