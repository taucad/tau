/**
 * Every revision surface's one reader: the host-attested graph (S10, A4, I3).
 *
 * `Rev N` is the first-parent ordinal on the selected branch, "Current" is the
 * selected checkout's head, and dirty is the checkout machine's own state —
 * all derived at read time from the graph and the projection, never stored and
 * never counted over chat membership. Deleting a chat therefore renumbers
 * nothing, because no number was ever a position in a transcript.
 *
 * History holds a page, not the whole line (B4): the first read is
 * {@link revisionPageSize} rows and *Show more* reads the next page. A turn's
 * card is looked up by the revision its settlement names — the `turn.finalized`
 * record in the chat's own durable log, replayed on open — so a turn recorded
 * five hundred revisions ago keeps its `Rev N` without the page holding it, and
 * a turn a *remote* host placed, whose graph this page cannot read, keeps the
 * settlement's own card. One schema, two transports.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RevisionDiffEntry, RevisionLine, RevisionRow } from '@taucad/revisions';
import { useProject } from '#hooks/use-project.js';
import { useRevisionSessionUser } from '#lib/revision-actor.js';
import type { RevisionSessionUser } from '#lib/revision-actor.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import type { RevisionClient } from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

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
  /** Object id of the tree it carries; absent on a remote settlement's card. */
  readonly treeId?: string;
  /** The turn this revision recorded, when a turn did. */
  readonly turnId: string | undefined;
  readonly conflicted: boolean;
  readonly tags?: readonly string[];
  readonly trigger: RevisionRow['trigger'];
  /**
   * The revision a restore brought back (D1): present only on the row a restore
   * minted, which is how History names a *Restored* row (A9).
   */
  readonly restoredFrom?: string;
  /** The revision this one follows, its first parent by id; absent on a branch's first revision. */
  readonly parent?: string;
  /**
   * Paths the settling host attested, for a card whose revision is not in this
   * page's graph. Otherwise the diff is asked of the graph on demand.
   */
  readonly changedPaths?: readonly string[];
};

/** What every revision surface reads. @public */
export type RevisionsView = {
  /** The loaded part of the selected branch's history, newest first. */
  readonly revisions: readonly RevisionCard[];
  /** Older revisions exist below the loaded ones (B4). */
  readonly hasOlder: boolean;
  /** Read the next page of older revisions onto `revisions`. */
  readonly loadOlder: () => Promise<void>;
  /**
   * Cards by the turn they recorded, from the loaded page and this tab's
   * settlements. A chat turn reads {@link useTurnRevision}, which also finds
   * a turn older than the page.
   */
  readonly byTurnId: ReadonlyMap<string, RevisionCard>;
  /** The revision the selected checkout reflects — the one that reads "Current". */
  readonly headRevisionId: string | undefined;
  /** The line the checkout is on; `unknown` until the projection arrives (D3). */
  readonly line: RevisionLine;
  /** The checkout has been written to since its head (A19). */
  readonly isDirty: boolean;
  readonly isLoading: boolean;
  readonly branchFacts?: ReadonlyMap<
    string,
    Readonly<{ revisionNumber: number | undefined; ahead: number; behind: number }>
  >;
};

/**
 * Whether revisions older than the loaded ones exist. The port's order puts
 * parents after children, so the oldest loaded row names a parent only while
 * something older is unread.
 *
 * @param log - The loaded rows and how many were asked for.
 * @returns Whether Show more has a page to read.
 */
const hasOlderThan = (log: HeadLog | undefined): boolean => {
  const oldest = log?.rows.at(-1);
  return (
    log !== undefined &&
    log.rows.length >= log.wanted &&
    (oldest?.parent !== undefined || oldest?.otherParents !== undefined)
  );
};

/** History's first read, and each *Show more* after it (B4, E6). @public */
export const revisionPageSize = 50;

const unknownLine: RevisionLine = { kind: 'unknown' };

const noOlder = async (): Promise<void> => undefined;

const emptyView: RevisionsView = {
  revisions: [],
  hasOlder: false,
  loadOlder: noOlder,
  byTurnId: new Map(),
  headRevisionId: undefined,
  line: unknownLine,
  isDirty: false,
  isLoading: false,
  branchFacts: new Map(),
};

/* An unknown line is a history still on its way, never an empty one (I6, D3). */
const loadingView: RevisionsView = { ...emptyView, isLoading: true };

/** One branch's loaded rows, the head they were read at, and how many rows the reader asked for. */
type HeadLog = Readonly<{
  head: string | undefined;
  rows: readonly RevisionRow[];
  wanted: number;
  /** The store did not hold `head` yet: its log was read without it. */
  unheld?: true;
}>;

const headLog = (head: string | undefined, rows: readonly RevisionRow[], wanted: number): HeadLog =>
  head !== undefined && rows[0]?.revisionId !== head ? { head, rows, wanted, unheld: true } : { head, rows, wanted };

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
 * @param session - The signed-in person, as the hook subscribed to them.
 * @returns The attribution line.
 */
export const actorOf = (
  row: Readonly<{ actor: string; source: string }>,
  session: RevisionSessionUser | undefined,
): string => {
  /* The actor id of an agent turn is a model id: a person reads who did it, not which model. */
  if (row.source === 'agent') {
    return 'Tau agent';
  }
  if (row.actor.startsWith('anon:')) {
    return `Anonymous · ${row.actor.slice('anon:'.length)}`;
  }
  /* HQ4: your own revisions say You; everyone else's say who they are. */
  if (session !== undefined && session.id === row.actor) {
    return 'You';
  }
  return row.actor === '' ? 'Unknown' : 'Another account';
};

const cardOf = (row: RevisionRow, session: RevisionSessionUser | undefined): RevisionCard => ({
  revisionId: row.revisionId,
  n: row.revisionNumber,
  createdAt: row.createdAt,
  summary: titleOf(row),
  actor: actorOf(row, session),
  treeId: row.treeId,
  turnId: row.turnId,
  conflicted: row.conflicted,
  tags: row.tags,
  trigger: row.trigger,
  ...(row.restoredFrom === undefined ? {} : { restoredFrom: row.restoredFrom }),
  ...(row.parent === undefined ? {} : { parent: row.parent }),
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

/** Host-attested settlements selected directly from every observed chat's projection. */
type FinalizedRevision = Readonly<{ branch: string | undefined; card: RevisionCard }>;

const useHostFinalizedTurns = (projectId: string): readonly FinalizedRevision[] => {
  const store = useChatSessionStore();
  const subscribe = useCallback(
    (listener: () => void) => {
      let chatSubscriptions: Array<() => void> = [];
      const bind = (notify = true): void => {
        for (const unsubscribe of chatSubscriptions) {
          unsubscribe();
        }
        chatSubscriptions = store
          .observedChatIdsOf(projectId)
          .map((chatId) => store.subscribeProjection(chatId, listener));
        if (notify) {
          listener();
        }
      };
      const unsubscribeMembership = store.subscribeMembership(() => bind());
      bind(false);
      return () => {
        unsubscribeMembership();
        for (const unsubscribe of chatSubscriptions) {
          unsubscribe();
        }
      };
    },
    [projectId, store],
  );
  const snapshot = useCallback(
    () =>
      store
        .observedChatIdsOf(projectId)
        .map((chatId) => {
          const projection = store.getProjection(chatId);
          return `${chatId}:${projection?.ledger.position.cursor ?? 0}:${projection?.remote?.digest ?? ''}`;
        })
        .join('|'),
    [projectId, store],
  );
  const version = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(
    () =>
      store.observedChatIdsOf(projectId).flatMap((chatId): FinalizedRevision[] => {
        const projection = store.getProjection(chatId);
        if (projection === undefined) {
          return [];
        }
        return Object.values(projection.ledger.runs).flatMap((run) =>
          run.settlements.flatMap(({ event }): FinalizedRevision[] =>
            event.type === 'turn.finalized' && event.revisionId !== undefined
              ? [
                  {
                    branch: event.branch,
                    card: {
                      revisionId: event.revisionId,
                      n: undefined,
                      createdAt: 0,
                      summary: '',
                      actor: '',
                      turnId: event.turnId,
                      conflicted: false,
                      tags: [],
                      trigger: 'turn',
                      changedPaths: event.changedPaths,
                      ...(event.treeId === undefined ? {} : { treeId: event.treeId }),
                    },
                  },
                ]
              : [],
          ),
        );
      }),
    [projectId, store, version],
  );
};

/**
 * Rows for revisions a surface names by id, read one by one (B4).
 *
 * A revision is immutable and so is its first-parent ordinal, so each answer
 * is cached for the session. `Rev N` is the ordinal on the revision's own line,
 * which is its line's number whenever it lies on that line.
 *
 * @param client - The page's revision client.
 * @param projectId - The project the ids belong to.
 * @param ids - The revisions to read.
 * @returns Each row found, by id; a revision this graph does not hold is absent.
 */
const useRevisionRows = (
  client: RevisionClient | undefined,
  projectId: string,
  ids: readonly string[],
): ReadonlyMap<string, RevisionRow> => {
  /* An array, not a Map: `combine`'s structural sharing keeps it the same reference until a row arrives (rule 20's log cost). */
  const rows = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['revision-row', projectId, id],
      enabled: client !== undefined,
      /* The one-row log itself: empty for a revision this graph does not hold. */
      queryFn: async (): Promise<readonly RevisionRow[]> => client?.log({ from: id, limit: 1 }) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => results.flatMap((result) => result.data ?? []),
  });
  return useMemo(() => new Map(rows.map((row) => [row.revisionId, row] as const)), [rows]);
};

/**
 * The selected branch's history and where the checkout sits on it.
 *
 * The log follows the projection's head, which is what a settled turn, a save,
 * a restore and a switch all move — so no surface has to be told that the graph
 * changed. The query is keyed by the branch alone and remembers the head it was
 * read at (D3), and no head — earlier or later — is ever answered from a log
 * read at another. A head that moved by one ordinary revision on top of the
 * one the log was read at is *appended* from a one-row read (E6); anything
 * else — a restore, a merge, a switch, two mints at once — re-reads as many
 * rows as were loaded, with the rows still on screen.
 *
 * The first read is one page (B4); every other branch costs one row and one
 * `divergence` count, never its whole history.
 *
 * @returns The view every revision surface reads.
 * @public
 */
export function useRevisions(): RevisionsView {
  const { projectId } = useProject();
  const client = useRevisionClient();
  const status = useRevisionStatus();
  const line = status?.line ?? unknownLine;
  /* The only kind with a history to read: `unborn` has no revision yet. */
  const branch = line.kind === 'branch' ? line.name : undefined;
  const headRevisionId = status?.headRevisionId;
  /* Subscribed, not read once: a sign-in mid-session relabels every card. */
  const session = useRevisionSessionUser();
  const finalized = useHostFinalizedTurns(projectId);
  const queryClient = useQueryClient();
  const logKey = useMemo(() => ['revision-log', projectId, branch ?? ''] as const, [branch, projectId]);

  const {
    data: log,
    isPending,
    refetch,
  } = useQuery({
    queryKey: logKey,
    enabled: client !== undefined && branch !== undefined,
    queryFn: async (): Promise<HeadLog> => {
      /* A re-read keeps what the reader loaded with Show more, and never less than a page. */
      const wanted = queryClient.getQueryData<HeadLog>(logKey)?.wanted ?? revisionPageSize;
      return headLog(
        headRevisionId,
        (await client?.log(branch === undefined ? { limit: wanted } : { branch, limit: wanted })) ?? [],
        wanted,
      );
    },
    /* Exact for the head it was read at; the effect below re-reads it for any other. */
    staleTime: Number.POSITIVE_INFINITY,
  });
  const readAt = log?.head;
  useEffect(() => {
    if (readAt === headRevisionId || log === undefined) {
      return;
    }
    /* Every mounted reader sees the same move; `cancelRefetch: false` makes them one read. */
    const reread = (): void => {
      void refetch({ cancelRefetch: false });
    };
    const top = log.rows[0];
    if (client === undefined || branch === undefined || headRevisionId === undefined || top?.revisionId !== readAt) {
      reread();
      return;
    }
    /*
     * E6: the newest row alone, a bounded read the worker numbers from the
     * parent it remembers. A revision whose only parent is the log's head is
     * exactly that head's log with one row on top, in the port's order; a merge
     * brings its other side in further down, so it is re-read instead.
     */
    const appendMinted = async (): Promise<void> => {
      try {
        const [minted] = await queryClient.fetchQuery({
          queryKey: ['revision-log-head', projectId, branch, headRevisionId],
          queryFn: async () => client.log({ branch, limit: 1 }),
          staleTime: Number.POSITIVE_INFINITY,
          gcTime: 0,
        });
        if (minted?.revisionId !== headRevisionId || minted.parent !== readAt || minted.otherParents !== undefined) {
          reread();
          return;
        }
        /* Only onto the log it was asked against: another reader may have appended it already. Still one
           page (B4): the oldest row moves behind Show more rather than a long session growing the log a row a save. */
        queryClient.setQueryData<HeadLog>(logKey, (current) =>
          current !== undefined && current.head === readAt
            ? { head: headRevisionId, rows: [minted, ...current.rows].slice(0, current.wanted), wanted: current.wanted }
            : current,
        );
      } catch {
        /* A failed one-row read is a history not yet known: read it again. */
        reread();
      }
    };
    void appendMinted();
  }, [branch, client, headRevisionId, log, logKey, projectId, queryClient, readAt, refetch]);
  /*
   * A head the store does not hold yet (a host's revision whose objects are
   * still on their way) moves nothing when it lands, so the effect above never
   * fires again for it. Read again whenever the root reports anything new —
   * the fetch that brings the revision is one such report — until it is held.
   */
  const unheld = log?.unheld === true;
  useEffect(() => {
    if (unheld && status !== undefined) {
      void refetch({ cancelRefetch: false });
    }
  }, [refetch, status, unheld]);
  /*
   * ponytail: Show more re-reads the loaded rows with the next page under them,
   * so page k walks k pages of commits, once per click — `limit` already crosses
   * every hop. A cursor on the wire if deep paging ever shows up hot.
   */
  const loadOlder = useCallback(async (): Promise<void> => {
    const current = queryClient.getQueryData<HeadLog>(logKey);
    if (client === undefined || branch === undefined || current === undefined) {
      return;
    }
    const wanted = current.rows.length + revisionPageSize;
    const rows = await client.log({ branch, limit: wanted });
    /* Only onto the log it was read against: a head that moved meanwhile re-reads on its own. */
    queryClient.setQueryData<HeadLog>(logKey, (latest) =>
      latest?.head === current.head ? headLog(current.head, rows, wanted) : latest,
    );
  }, [branch, client, logKey, queryClient]);
  const rows = log?.rows;
  /* Every other branch: its head's row for `Rev N`, and one count against the selected head. */
  const others = useMemo(
    () =>
      (status?.branches ?? []).flatMap((entry) =>
        entry.head === undefined || entry.name === branch ? [] : [{ name: entry.name, head: entry.head }],
      ),
    [branch, status?.branches],
  );
  const otherHeads = useRevisionRows(
    client,
    projectId,
    useMemo(() => others.map((entry) => entry.head), [others]),
  );
  /*
   * `combine` is not an optimisation here, it is the difference between this
   * hook having a memo and not (rule 20's log cost, C51).
   *
   * Without it, `QueriesObserver.getOptimisticResult` hands back a **fresh
   * array** on every render, so the `useMemo` below never hits and every
   * consumer — the always-on header chip, the palette, the pane, and one per
   * chat turn — rebuilt `revisions`, `byTurnId` and `branchFacts` per render.
   * With it, query-core caches the combined value through `replaceEqualDeep`,
   * so nothing moves until the graph does.
   */
  const divergences = useQueries({
    queries: others.map((entry) => ({
      /* Two immutable ids: the count between them never changes. */
      queryKey: ['revision-divergence', projectId, entry.head, headRevisionId ?? ''],
      enabled: client !== undefined && headRevisionId !== undefined,
      queryFn: async () => client?.divergence(entry.head, headRevisionId ?? '') ?? { ahead: 0, behind: 0 },
      staleTime: Number.POSITIVE_INFINITY,
    })),
    /* Positional, because `branchFacts` pairs each count with its own branch. */
    combine: (results) => results.map((result) => result.data),
  });

  return useMemo(() => {
    if (client === undefined || branch === undefined) {
      /* I6/D3: until the projection names the line, or while the line's worker
       * has not connected, History is loading. Only an `unborn` line is a
       * history with nothing in it yet. */
      if (line.kind === 'unknown') {
        return line === unknownLine ? loadingView : { ...loadingView, line };
      }
      return { ...emptyView, line, isDirty: status?.dirty ?? false, isLoading: line.kind === 'branch' };
    }
    const revisions = (rows ?? []).map((row) => cardOf(row, session));
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
    const branchFacts = new Map<string, { revisionNumber: number | undefined; ahead: number; behind: number }>();
    for (const entry of status?.branches ?? []) {
      /* Unknown until its walk answers, and read as no counts: History never waits on a branch it is not on (B4). */
      const count = divergences[others.findIndex((other) => other.name === entry.name)];
      branchFacts.set(
        entry.name,
        entry.name === branch
          ? { revisionNumber: rows?.[0]?.revisionNumber, ahead: 0, behind: 0 }
          : {
              revisionNumber: entry.head === undefined ? undefined : otherHeads.get(entry.head)?.revisionNumber,
              ahead: count?.ahead ?? 0,
              behind: count?.behind ?? 0,
            },
      );
    }
    return {
      revisions,
      hasOlder: hasOlderThan(log),
      loadOlder,
      byTurnId,
      headRevisionId,
      line,
      isDirty: status?.dirty ?? false,
      isLoading: isPending,
      branchFacts,
    };
  }, [
    branch,
    client,
    divergences,
    finalized,
    headRevisionId,
    isPending,
    line,
    loadOlder,
    log,
    otherHeads,
    others,
    rows,
    session,
    status,
  ]);
}

/**
 * Cards for revisions a surface names by id, wherever they sit in the history:
 * the pinned rows History keeps visible below its loaded page, and the
 * revision a restore row brought back (B4).
 *
 * @param ids - The revisions to read; leave out the ids the caller already holds.
 * @returns Each card found, by id.
 * @public
 */
export function useRevisionCards(ids: readonly string[]): ReadonlyMap<string, RevisionCard> {
  const { projectId } = useProject();
  const client = useRevisionClient();
  const session = useRevisionSessionUser();
  const rows = useRevisionRows(client, projectId, ids);
  return useMemo(() => new Map([...rows].map(([id, row]) => [id, cardOf(row, session)] as const)), [rows, session]);
}

/**
 * The revisions among `ids` that belong to the selected line's history, read
 * one by one: History's pinned rows below its loaded page (B4). A revision
 * belongs when the head holds it — the port counts nothing in it the head
 * lacks — so a *View revision* from a chat on another branch pins nothing here.
 *
 * ponytail: the count is asked again at each new head, while a row stays
 * pinned; one walk to the pinned row per save in the browser leg, a cursor on
 * the port if a deep pin ever shows up hot.
 *
 * @param ids - Revisions to keep in view that the loaded page does not hold.
 * @returns Their cards, in the order asked, for those on this line.
 * @public
 */
export function useRevisionsOnLine(ids: readonly string[]): readonly RevisionCard[] {
  const { projectId } = useProject();
  const client = useRevisionClient();
  const head = useRevisionStatus()?.headRevisionId;
  const cards = useRevisionCards(ids);
  const isOnLine = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['revision-divergence', projectId, id, head ?? ''],
      enabled: client !== undefined && head !== undefined,
      queryFn: async () => client?.divergence(id, head ?? '') ?? { ahead: 1, behind: 0 },
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => results.map((result) => result.data?.ahead === 0),
  });
  return useMemo(
    () =>
      ids.flatMap((id, index) => {
        const card = cards.get(id);
        return card !== undefined && isOnLine[index] === true ? [card] : [];
      }),
    [cards, ids, isOnLine],
  );
}

/**
 * The cards, plus each revision a restore among them brought back that they do
 * not hold, so `revisionTitle` names a restore by its target however far back
 * that target is (B4).
 *
 * @param cards - The loaded cards a surface titles.
 * @returns The cards, then the looked-up restore targets.
 * @public
 */
export function useWithRestoreTargets(cards: readonly RevisionCard[]): readonly RevisionCard[] {
  const missing = useMemo(() => {
    const held = new Set(cards.map((card) => card.revisionId));
    return [...new Set(cards.flatMap((card) => (card.restoredFrom === undefined ? [] : [card.restoredFrom])))].filter(
      (id) => !held.has(id),
    );
  }, [cards]);
  const targets = useRevisionCards(missing);
  return useMemo(() => [...cards, ...targets.values()], [cards, targets]);
}

/**
 * The revision one chat turn saved, found by the revision its settlement names.
 *
 * The loaded page answers a recent turn; an older one is read on its own by the
 * id the `turn.finalized` record attested, so a turn recorded five hundred
 * revisions ago keeps its `Rev N` after a reload (B4). A turn a remote host
 * recorded, which this graph does not hold, keeps the settlement's own card.
 *
 * @param turnId - The user message that anchors the turn.
 * @returns The turn's card, or `undefined` while nothing names one.
 * @public
 */
export function useTurnRevision(turnId: string): RevisionCard | undefined {
  const { byTurnId, revisions } = useRevisions();
  const held = byTurnId.get(turnId);
  const isLoaded = held === undefined || revisions.some((card) => card.revisionId === held.revisionId);
  const lookedUp = useRevisionCards(isLoaded ? [] : [held.revisionId]).get(held?.revisionId ?? '');
  return lookedUp ?? held;
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
 * Which paths differ between one revision and the checkout's head, for
 * *Compare with current* (canvas round 4b): the whole revision against the
 * files as they are now, each path then opening the same checkout comparison a
 * file row does.
 *
 * Both revisions are immutable, so the answer is exact for the head it was
 * asked at; a new head is a new question.
 *
 * @param card - The revision to compare, or `undefined` while nothing is asked.
 * @returns The paths, empty until the first answer.
 * @public
 */
export function useRevisionChangesSince(card: RevisionCard | undefined): Readonly<{
  changes: readonly RevisionDiffEntry[];
  isLoaded: boolean;
}> {
  const client = useRevisionClient();
  const head = useRevisionStatus()?.headRevisionId;
  const { data } = useQuery({
    queryKey: ['revision-diff-since', card?.revisionId ?? '', head ?? ''],
    enabled: client !== undefined && card !== undefined && head !== undefined,
    queryFn: async () =>
      card === undefined || head === undefined ? [] : ((await client?.diff(head, card.revisionId)) ?? []),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { changes: data ?? [], isLoaded: data !== undefined };
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
