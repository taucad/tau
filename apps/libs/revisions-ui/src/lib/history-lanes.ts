/**
 * Which branches History draws as lanes, and what it shows of them (History D2).
 *
 * Pure: the graph read in, the entries in view and each line's part out. The
 * blueprint's rules:
 *
 * - **This branch** (the default) draws the current branch, `main` and anything
 *   merged into either; **All branches** draws every branch.
 * - A lane appears only where a fork is in view: a line with entries of its own
 *   among the rows shown, or the branch you are on while it has none yet. With a
 *   single lane History renders exactly as a one-branch project does.
 * - Tau's own setup entries never make a lane (A4): a line whose only entries
 *   are setup changes is not a fork a person made, so it stays out of view
 *   unless it is the branch you are on.
 * - A branch merged into another branch in view keeps its lane and loses its
 *   chip; its rows name it instead.
 * - A conflict line is never a branch (D3): its entries take no lane and its
 *   name no chip. A merge waiting on it is one pending node on the branch it
 *   lands on, linked to the branch it brings in, which is then in view.
 */
import type { RevisionConflictFacet, RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { branchSlotsOf } from '#components/revisions/revision-graph-view.js';
import type { BranchSlot } from '#components/revisions/revision-graph-view.js';

/** Which branches History draws. */
export type HistoryFilter = 'this' | 'all';

/** What {@link historyLanesOf} reads. */
export type HistoryLanesInput = Readonly<{
  /** Every branch read, with its head; `main` first. */
  branches: ReadonlyArray<Readonly<{ name: string; head: string }>>;
  /** Newest first, every branch's entries. */
  revisions: readonly RevisionCard[];
  /** The line each entry is drawn on. */
  lineOf: ReadonlyMap<string, string>;
  /** The branch the files are on. */
  current: string | undefined;
  filter: HistoryFilter;
  /** The conflicts waiting on a decision, from the status projection. */
  conflicts?: ReadonlyArray<Pick<RevisionConflictFacet, 'revisionId' | 'branch' | 'into' | 'labels'>>;
}>;

/** A merge waiting on a decision, drawn as one node on the branch it lands on. */
export type PendingMerge = Readonly<{
  /** The conflicted entry. */
  revisionId: string;
  /** The branch it lands on. */
  into: string;
  /** The branch it brings in, when that is a branch History can draw. */
  from: string | undefined;
}>;

/** What History shows of the graph. */
export type HistoryLanes = Readonly<{
  /** The entries in view, newest first. */
  revisions: readonly RevisionCard[];
  /** The line each entry in view is drawn on. */
  lineOf: ReadonlyMap<string, string>;
  /** The lines that take a lane, `main` first, then by the age of their fork. */
  lanePreference: readonly string[];
  /** Branches whose name chip shows, above their newest entry. */
  chips: ReadonlySet<string>;
  /** Branches in view with no entries of their own yet, by the entry each starts from. */
  emptyAt: ReadonlyMap<string, readonly string[]>;
  /** Branches merged into another branch in view: no chip, their rows name them. */
  merged: ReadonlySet<string>;
  /** What each chip says beside the name: ahead and behind `main` in history entries, or *No changes yet*. */
  notes: ReadonlyMap<string, string>;
  /** Each line's colour and shape. */
  slots: ReadonlyMap<string, BranchSlot>;
  /** Merges waiting on a decision, each on a branch in view. */
  pending: readonly PendingMerge[];
  /** More than one lane is in view, so History draws the graph. */
  hasLanes: boolean;
}>;

const trunkName = 'main';

/**
 * The stored lines that hold a conflict waiting on a decision (D14), which no
 * surface lists as a branch (D3). A conflict recorded on the line it lands on
 * has no line of its own.
 *
 * @param conflicts - The conflicts, from the status projection.
 * @returns Their lines' names.
 */
export const conflictLinesOf = (
  conflicts: ReadonlyArray<Pick<RevisionConflictFacet, 'branch' | 'into'>> | undefined,
): ReadonlySet<string> =>
  new Set(
    (conflicts ?? []).flatMap((conflict) =>
      conflict.branch === undefined || conflict.branch === conflict.into ? [] : [conflict.branch],
    ),
  );

/**
 * The branches a person can pick: every branch the projection lists except the
 * lines that hold a conflict (D3).
 *
 * @param status - The status projection, while it is known.
 * @returns The branches, in the projection's order.
 */
export const listedBranchesOf = (
  status: Pick<RevisionStatusProjection, 'branches' | 'conflicts'> | undefined,
): RevisionStatusProjection['branches'] => {
  const conflictLines = conflictLinesOf(status?.conflicts);
  return (status?.branches ?? []).filter((branch) => !conflictLines.has(branch.name));
};

/**
 * Lay out which lines History draws.
 *
 * @param input - The graph read, where the files are, and the filter.
 * @returns The entries in view and each line's part.
 */
export const historyLanesOf = ({
  branches: everyLine,
  revisions: everyEntry,
  lineOf,
  current,
  filter,
  conflicts = [],
}: HistoryLanesInput): HistoryLanes => {
  const conflictLines = conflictLinesOf(conflicts);
  const branches = everyLine.filter((branch) => !conflictLines.has(branch.name));
  const revisions = everyEntry.filter((revision) => !conflictLines.has(lineOf.get(revision.revisionId) ?? ''));
  const byId = new Map(everyEntry.map((revision) => [revision.revisionId, revision] as const));
  const trunk = branches.some((branch) => branch.name === trunkName) ? trunkName : branches[0]?.name;
  const named = new Set(branches.map((branch) => branch.name));
  const lineOfId = (id: string): string => lineOf.get(id) ?? trunk ?? '';

  const ancestors = (head: string | undefined): Set<string> => {
    const seen = new Set<string>();
    const queue = head === undefined ? [] : [head];
    while (queue.length > 0) {
      const revision = byId.get(queue.pop()!);
      if (revision === undefined || seen.has(revision.revisionId)) {
        continue;
      }
      seen.add(revision.revisionId);
      queue.push(...(revision.parent === undefined ? [] : [revision.parent]), ...(revision.otherParents ?? []));
    }
    return seen;
  };

  const ownOf = new Map<string, RevisionCard[]>();
  for (const revision of revisions) {
    const line = lineOfId(revision.revisionId);
    ownOf.set(line, [...(ownOf.get(line) ?? []), revision]);
  }
  /* A4: a line made of Tau's setup changes alone is not a fork anyone made. */
  const isForked = (line: string): boolean => (ownOf.get(line) ?? []).some((revision) => revision.isSetup !== true);

  /* A pending merge brings in the branch it waits on: its link is drawn to that branch's lane. */
  const pendingAll = conflicts.flatMap((conflict): PendingMerge[] => {
    if (conflict.branch === undefined || !conflictLines.has(conflict.branch)) {
      return [];
    }
    const theirs = conflict.labels?.theirs;
    const side = byId.get(conflict.revisionId)?.otherParents?.[0];
    const from = theirs !== undefined && named.has(theirs) ? theirs : side === undefined ? undefined : lineOfId(side);
    return [
      {
        revisionId: conflict.revisionId,
        into: conflict.into,
        from: from === undefined || from === conflict.into || conflictLines.has(from) ? undefined : from,
      },
    ];
  });
  const sources = new Set(pendingAll.flatMap((merge) => (merge.from === undefined ? [] : [merge.from])));

  const anchors = branches.filter((branch) => branch.name === current || branch.name === trunk);
  const reach = new Set(anchors.flatMap((branch) => [...ancestors(branch.head)]));
  const inView = (line: string): boolean => {
    if (line === current || line === trunk || (sources.has(line) && isForked(line))) {
      return true;
    }
    return (
      isForked(line) && (filter === 'all' || (ownOf.get(line) ?? []).some((revision) => reach.has(revision.revisionId)))
    );
  };
  const lines = new Set([...ownOf.keys()].filter((line) => inView(line)));
  const visible = revisions.filter((revision) => lines.has(lineOfId(revision.revisionId)));
  const shownIds = new Set(visible.map((revision) => revision.revisionId));

  /* A branch with no entries of its own: its head is an entry another line owns. */
  const empty = branches.filter(
    (branch) =>
      branch.name !== trunk &&
      !ownOf.has(branch.name) &&
      shownIds.has(branch.head) &&
      (branch.name === current || filter === 'all'),
  );
  const laneLines = [...lines, ...empty.map((branch) => branch.name)];
  const hasLanes = laneLines.length > 1;

  const heads = branches.filter((branch) => laneLines.includes(branch.name));
  const merged = new Set(
    heads
      .filter(
        (branch) =>
          branch.name !== trunk &&
          ownOf.has(branch.name) &&
          heads.some((other) => other.name !== branch.name && ancestors(other.head).has(branch.head)),
      )
      .map((branch) => branch.name),
  );

  const forkAge = (line: string): number => {
    const oldest = ownOf.get(line)?.at(-1);
    const from = oldest?.parent ?? branches.find((branch) => branch.name === line)?.head;
    return (from === undefined ? undefined : byId.get(from)?.createdAt) ?? oldest?.createdAt ?? 0;
  };
  const lanePreference = [
    ...(trunk === undefined || !laneLines.includes(trunk) ? [] : [trunk]),
    ...laneLines.filter((line) => line !== trunk).toSorted((left, right) => forkAge(left) - forkAge(right)),
  ];

  const emptyAt = new Map<string, string[]>();
  for (const branch of empty) {
    emptyAt.set(branch.head, [...(emptyAt.get(branch.head) ?? []), branch.name]);
  }

  /* Counted in the entries read: a branch further apart than one page reads its page's count. */
  const trunkHead = branches.find((branch) => branch.name === trunk)?.head;
  const trunkHistory = ancestors(trunkHead);
  const noteOf = (branch: Readonly<{ name: string; head: string }>): string => {
    if (branch.name === trunk) {
      return '';
    }
    if (!ownOf.has(branch.name)) {
      return 'No changes yet';
    }
    const mine = ancestors(branch.head);
    const ahead = [...mine].filter((id) => !trunkHistory.has(id)).length;
    const behind = [...trunkHistory].filter((id) => !mine.has(id)).length;
    const parts = [
      ahead > 0 ? `${String(ahead)} ahead` : '',
      behind > 0 ? `${String(behind)} behind ${trunk ?? ''}` : '',
    ];
    return ahead === 0 && behind === 0 ? `Up to date with ${trunk ?? ''}` : parts.filter(Boolean).join(' · ');
  };

  return {
    revisions: visible,
    lineOf: new Map(visible.map((revision) => [revision.revisionId, lineOfId(revision.revisionId)] as const)),
    lanePreference,
    chips: new Set(hasLanes ? laneLines.filter((line) => named.has(line) && !merged.has(line)) : []),
    emptyAt,
    merged,
    notes: new Map(heads.map((branch) => [branch.name, noteOf(branch)] as const)),
    slots: branchSlotsOf(lanePreference),
    pending: pendingAll.filter((merge) => laneLines.includes(merge.into)),
    hasLanes,
  };
};
