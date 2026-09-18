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
import { getRevisionSessionUser } from '#lib/revision-actor.js';
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

const emptyRows: readonly RevisionRow[] = Object.freeze([]);

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

/**
 * The title a person reads, never the generator's own string (C37).
 *
 * `RevisionRow.summary` is `edited ?? generated`, so a surface cannot tell a
 * human title from `revision-effects.ts`'s placeholder — but it can
 * *reconstruct* the placeholder from fields the row already carries and refuse
 * to render it. That is an equality check against known values, not a parse of
 * a sentence (I12). The generator itself is `packages/revisions`' to fix.
 *
 * @param row - One graph row.
 * @returns The headline every revision surface shows.
 */
const titleOf = (row: RevisionRow): string => {
  if (row.turnId !== undefined && row.summary === `Agent turn ${row.turnId}`) {
    return 'Agent change';
  }
  if (row.trigger !== undefined && row.summary === `Saved changes (${row.trigger})`) {
    return row.trigger === 'save' ? 'Saved changes' : 'Autosave';
  }
  return row.summary;
};

/**
 * Who made a revision, in a person's words (C45, D18/A26).
 *
 * `RevisionRow.actor` is `provenance.actorId`: a model id for an agent turn,
 * this app's own `anon:<hash>` pseudonym for an anonymous author, an account id
 * otherwise. The pseudonym scheme is ours (`lib/revision-actor.ts`), so naming
 * it is reading our own format. An account id belonging to somebody else cannot
 * be named here — `RevisionRow` carries no `provenance.actor` — so it is
 * described rather than printed raw.
 *
 * @param row - One graph row.
 * @returns The attribution line.
 */
const actorOf = (row: RevisionRow): string => {
  if (row.source === 'agent') {
    return row.actor;
  }
  if (row.actor.startsWith('anon:')) {
    return `Anonymous · ${row.actor.slice('anon:'.length)}`;
  }
  const session = getRevisionSessionUser();
  if (session !== undefined && session.id === row.actor) {
    return session.name ?? session.email ?? 'You';
  }
  return row.actor === '' ? 'Unknown' : 'Another account';
};

const cardOf = (row: RevisionRow): RevisionCard => ({
  revisionId: row.revisionId,
  n: row.revisionNumber,
  createdAt: row.createdAt,
  summary: titleOf(row),
  actor: actorOf(row),
  turnId: row.turnId,
  conflicted: row.conflicted,
  tags: row.tags,
  trigger: row.trigger,
});

/**
 * Attach one card to the turn it recorded, keeping the turn's own save.
 *
 * A turn can hold *two* rows, and only one of them is its save.
 * `turn.machine`'s `basing` mints the pre-turn tree under this turn's own id
 * (D17), so a turn that started dirty — which the first turn of a new project
 * always does, its scaffold still uncommitted — is named by both that base
 * mint and its own later cut. Plain last-write-wins over a newest-first log
 * handed every surface the base: `Rev 1 saved` for a turn still working,
 * pointing at the scaffold.
 *
 * The settlement names the row the host actually recorded for the turn, so it
 * decides. With no settlement in this tab, the turn's save is the newer row,
 * because its base can only precede it.
 *
 * @param byTurnId - The map being built.
 * @param settledIds - Revision ids the host attested, by turn.
 * @param card - The card to attach.
 */
const attachTurnCard = (
  byTurnId: Map<string, RevisionCard>,
  settledIds: ReadonlyMap<string, string>,
  card: RevisionCard,
): void => {
  if (card.turnId === undefined) {
    return;
  }
  const held = byTurnId.get(card.turnId);
  if (held === undefined) {
    byTurnId.set(card.turnId, card);
    return;
  }
  const settledId = settledIds.get(card.turnId);
  if (settledId === undefined ? card.createdAt > held.createdAt : card.revisionId === settledId) {
    byTurnId.set(card.turnId, card);
  }
};

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
  /*
   * `combine` is not an optimisation here, it is the difference between this
   * hook having a memo and not (B9, C51).
   *
   * Without it, `QueriesObserver.getOptimisticResult` hands back a **fresh
   * array** on every render, so the `useMemo` below never hits and every
   * consumer — the always-on header chip, the palette, the pane, and one per
   * chat turn — rebuilt `revisions`, `byTurnId`, `selectedIds` and
   * `branchFacts` per render. With it, query-core caches the combined value
   * through `replaceEqualDeep`, so nothing moves until the graph does.
   */
  const settledBranchRows = useQueries({
    queries: finalizedBranchHeads.map(([settledBranch, finalizedRevisionId]) => ({
      queryKey: ['revision-log', projectId, settledBranch, finalizedRevisionId],
      enabled: client !== undefined,
      queryFn: async () => client?.log({ branch: settledBranch }) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => ({
      rows: results.flatMap((result) => result.data ?? []),
      isPending: results.some((result) => result.isPending),
    }),
  });
  const branchRows = useQueries({
    queries: (status?.branches ?? []).map((entry) => ({
      queryKey: ['revision-log', projectId, entry.name, entry.head ?? ''],
      enabled: client !== undefined && entry.head !== undefined,
      queryFn: async () => client?.log({ branch: entry.name }) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => ({
      /* Positional, because `branchFacts` pairs each log with its own branch. */
      logs: results.map((result) => result.data ?? emptyRows),
      pending: results.map((result) => result.isPending),
    }),
  });

  return useMemo(() => {
    if (client === undefined || branch === undefined) {
      return emptyView;
    }
    const revisions = (rows ?? []).map((row) => cardOf(row));
    const byTurnId = new Map<string, RevisionCard>();
    const settledIdByTurn = new Map(
      finalized.flatMap(({ card }) => (card.turnId === undefined ? [] : [[card.turnId, card.revisionId] as const])),
    );
    /* The settlements first, then the graph that names them: a turn a remote
     * host recorded has no row here, and a turn this graph holds is the better
     * card because it carries its own number. */
    for (const { card } of finalized) {
      attachTurnCard(byTurnId, settledIdByTurn, card);
    }
    for (const card of revisions) {
      attachTurnCard(byTurnId, settledIdByTurn, card);
    }
    for (const row of settledBranchRows.rows) {
      attachTurnCard(byTurnId, settledIdByTurn, cardOf(row));
    }
    const selectedIds = new Set((rows ?? []).map((row) => row.revisionId));
    const branchFacts = new Map<string, { revisionNumber: number | undefined; ahead: number; behind: number }>();
    for (const [index, entry] of (status?.branches ?? []).entries()) {
      const branchLog = branchRows.logs[index] ?? emptyRows;
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
        settledBranchRows.isPending ||
        branchRows.pending.some((pending, index) => status?.branches[index]?.head !== undefined && pending),
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
