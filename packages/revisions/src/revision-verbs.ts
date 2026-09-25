/**
 * The read verbs of the revision graph, in the words a person reads (S13, S28).
 *
 * `Rev N`, the branch, who made it and what it says: the same four facts the
 * Revisions pane renders, the `tau revisions` verbs print and the agent's
 * read-only `revisions` tool returns. One implementation, because three surfaces
 * that each derived `Rev N` their own way is exactly how a project ended up with
 * two different answers to "which revision am I on".
 *
 * Read-only by construction — nothing here writes a ref, mints a revision or
 * moves a tree — which is what makes it safe to hand to an agent (I10). The
 * write verbs are machines (`project-revisions.machine` and its children) and a
 * caller drives those, not this.
 *
 * `Rev N` is the **first-parent ordinal** on the branch (A3, I3): the first
 * revision on a branch is `Rev 1`, and a revision merged in from elsewhere has
 * no number of its own on this branch. Numbers are derived at read time from the
 * graph, so deleting a chat never renumbers anything.
 */

import type { RevisionId } from '#algorithms/index.js';
import { revisionId } from '#algorithms/index.js';
import type { RevisionProvenance } from '#revision-authority.js';
import type { RevisionDiffEntry, RevisionLogEntry, RevisionPort } from '#revision-port.js';

/** One revision as a person reads it. @public */
export type RevisionRow = Readonly<{
  /** First-parent ordinal on the branch, or `undefined` for a revision merged in. */
  revisionNumber: number | undefined;
  revisionId: string;
  changeId: string;
  /** Who made it: the model id for an agent turn, the user's actor otherwise. */
  actor: string;
  source: RevisionProvenance['source'];
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
  /** The edited title when someone wrote one, the generated one otherwise. */
  summary: string;
  conflicted: boolean;
  /** Stable user-message id of the turn this revision recorded, when a turn did. */
  turnId: string | undefined;
  /**
   * Named versions pointing at this revision, by name (S31, A21).
   *
   * On the row rather than in the `RevisionStatus` projection, for the same
   * reason `Rev N` is: it is derived from the graph at read time (I3), so
   * History renders the name beside the number from one read and there is no
   * second copy of the tag set to keep in step.
   */
  tags: readonly string[];
  /**
   * What asked for this revision (S30), when the store recorded it.
   *
   * History folds consecutive `idle`, `hidden` and `close` rows into one
   * *n autosaves* row (A20), and only the trigger can tell an autosave from a
   * `save` the person asked for. Derived at read like `tags` (I3), and
   * `undefined` for a revision written before the vocabulary existed — which is
   * also why the field is optional: a fixture that predates it is still a row.
   */
  trigger?: RevisionProvenance['trigger'];
  /**
   * The revision a restore brought back (D1), by id.
   *
   * Present only on the revision a restore minted: the cut that recorded the
   * checkout before the restore carries the same `restore` trigger and none, so
   * this, never the trigger, is what names a *Restored* row (A9).
   */
  restoredFrom?: string;
  /**
   * The revision this one follows: its first parent, by id, or `undefined` for
   * a branch's first revision. A merge's second parent is the side it brought
   * in, which History already lists without a number.
   */
  parent?: string;
  /**
   * A merge's other parents — the sides it brought in — by id; absent on an
   * ordinary revision. A reader that holds the history below a new head can
   * append a revision that has none, but must re-read after a merge, whose
   * sides appear further down the order.
   */
  otherParents?: readonly string[];
}>;

/** Where the reader is, and what else this project holds. @public */
export type RevisionPlace = Readonly<{
  /** The branch the live tree is on, or `undefined` in a project with no revisions yet. */
  branch: string | undefined;
  revisionNumber: number | undefined;
  revisionId: string | undefined;
  /** Every branch this project has, with the ordinal of its own latest revision. */
  branches: ReadonlyArray<Readonly<{ name: string; revisionNumber: number; revisionId: string }>>;
  /** The one line every surface shows: `main · Rev 12`. */
  line: string;
}>;

/** What {@link readRevisionLog} was asked for. @public */
export type RevisionLogRequest = Readonly<{
  /** Defaults to the branch the live tree is on. */
  branch?: string | undefined;
  /**
   * Newest first; every revision on the branch when absent. A limit bounds the
   * walk itself, not only the rows returned (E6).
   */
  limit?: number | undefined;
}>;

/**
 * The first-parent chain from one head, newest first.
 *
 * @param head - Where to start.
 * @param entries - Every reachable revision, by id.
 * @returns Ids from `head` back to the branch's first revision.
 */
const firstParentChain = (head: RevisionId, entries: ReadonlyMap<string, RevisionLogEntry>): readonly string[] => {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = head;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = entries.get(current)?.parents[0];
  }
  return chain;
};

/**
 * The head this request is about, and the graph behind it in the port's order.
 *
 * With a limit the walk itself is bounded — the port reads what the first
 * `limit` rows need and no more — and `Rev N` comes from {@link numbersOn}
 * rather than from a count of the whole chain (E6, L4-F5).
 *
 * @param port - The store to read.
 * @param branch - The branch to read, or the live tree's when absent.
 * @param limit - How many rows, newest first; the whole history when absent.
 * @returns The branch, its head, and the entries read, by id, in the port's order.
 */
const readGraph = async (
  port: RevisionPort,
  branch: string | undefined,
  limit?: number,
): Promise<
  Readonly<{ branch: string | undefined; head: RevisionId | undefined; entries: ReadonlyMap<string, RevisionLogEntry> }>
> => {
  const live = await port.readHead();
  const name = branch ?? live?.branch;
  const head = name === undefined ? undefined : name === live?.branch ? live.head : await port.readRef(name);
  const entries = new Map<string, RevisionLogEntry>();
  if (head !== undefined) {
    for (const entry of await port.log(limit === undefined ? { heads: [head] } : { heads: [head], limit })) {
      entries.set(entry.id, entry);
    }
  }
  return { branch: name, head, entries };
};

/*
 * First-parent ordinals already known, by revision id (E6).
 *
 * A revision's ordinal is a property of the revision alone — its first-parent
 * chain is fixed by its id — so an entry is never stale, and one table serves
 * every port, branch and caller in the process: the ordinal of a new head is
 * its first parent's plus one.
 *
 * ponytail: insertion-order eviction at 4 096 ids (a few hundred KiB). A long
 * history evicts its oldest ordinals first, and a miss costs one unbounded walk,
 * which refills the table. An LRU if a workload ever thrashes it.
 */
const ordinals = new Map<string, number>();
const maximumOrdinals = 4096;

const rememberOrdinal = (id: string, ordinal: number): void => {
  ordinals.delete(id);
  ordinals.set(id, ordinal);
  if (ordinals.size > maximumOrdinals) {
    ordinals.delete(ordinals.keys().next().value!);
  }
};

/**
 * `Rev N` of every revision on `head`'s first-parent line that `page` holds.
 *
 * The line is followed through the page until it meets a revision whose
 * ordinal is known or the branch's first revision; only when neither is in
 * reach is the whole chain walked, once, and remembered.
 *
 * @param port - The store, for the one walk a cold table needs.
 * @param head - The branch head.
 * @param page - The entries read, by id.
 * @returns Ordinals by revision id, for the page's first-parent line.
 */
const numbersOn = async (
  port: RevisionPort,
  head: RevisionId,
  page: ReadonlyMap<string, RevisionLogEntry>,
): Promise<ReadonlyMap<string, number>> => {
  /* The page's own stretch of the line, newest first. */
  const line = firstParentChain(head, page).filter((id) => page.has(id));
  const knownAt = line.findIndex((id) => ordinals.has(id));
  const below = page.get(line.at(-1) ?? head)?.parents[0];
  /* The branch's first revision is `Rev 1`, so a line that reaches it has the head's ordinal as its length. */
  const belowOrdinal = below === undefined ? 0 : ordinals.get(below);
  const headOrdinal =
    knownAt === -1
      ? belowOrdinal === undefined
        ? undefined
        : belowOrdinal + line.length
      : ordinals.get(line[knownAt]!)! + knownAt;
  if (headOrdinal === undefined) {
    /* ponytail: a cold table reads the whole chain once, and remembers it. */
    const whole = new Map(page);
    for (const entry of await port.log({ heads: [head] })) {
      whole.set(entry.id, entry);
    }
    const chain = firstParentChain(head, whole);
    for (const [index, id] of chain.entries()) {
      rememberOrdinal(id, chain.length - index);
    }
    return new Map(chain.flatMap((id, index) => (page.has(id) ? [[id, chain.length - index] as const] : [])));
  }
  const numbers = new Map(line.map((id, index) => [id, headOrdinal - index]));
  for (const [id, ordinal] of numbers) {
    rememberOrdinal(id, ordinal);
  }
  return numbers;
};

const rowOf = (
  entry: RevisionLogEntry,
  revisionNumber: number | undefined,
  tags: readonly string[] = [],
): RevisionRow =>
  Object.freeze({
    revisionNumber,
    revisionId: entry.id,
    changeId: entry.changeId,
    actor: entry.provenance.actorId,
    source: entry.provenance.source,
    createdAt: entry.provenance.createdAt,
    summary: entry.summary.edited ?? entry.summary.generated,
    conflicted: entry.conflicted,
    turnId: entry.provenance.turnId,
    tags,
    trigger: entry.provenance.trigger,
    ...(entry.provenance.restoredFrom === undefined ? {} : { restoredFrom: entry.provenance.restoredFrom }),
    ...(entry.parents[0] === undefined ? {} : { parent: entry.parents[0] }),
    ...(entry.parents.length > 1 ? { otherParents: Object.freeze(entry.parents.slice(1)) } : {}),
  });

/**
 * Read one branch's history, newest first.
 *
 * @param port - The store to read.
 * @param request - Which branch, and how many rows.
 * @returns The rows, newest first; empty in a project with no revisions.
 * @public
 *
 * @example <caption>The five most recent revisions on `main`</caption>
 * ```typescript
 * import { readRevisionLog } from '@taucad/revisions';
 * import type { RevisionPort } from '@taucad/revisions';
 *
 * declare const port: RevisionPort;
 * const rows = await readRevisionLog(port, { branch: 'main', limit: 5 });
 * rows[0]?.revisionNumber; // 12
 * ```
 */
export const readRevisionLog = async (
  port: RevisionPort,
  request: RevisionLogRequest = {},
): Promise<readonly RevisionRow[]> => {
  const limit = request.limit === undefined ? undefined : Math.max(0, request.limit);
  if (limit === 0) {
    return Object.freeze([]);
  }
  const { head, entries } = await readGraph(port, request.branch, limit);
  if (head === undefined) {
    return Object.freeze([]);
  }
  const numbers = await numbersOn(port, head, entries);
  /* One `listTags` for the whole page, not one per row. */
  const named = new Map<string, string[]>();
  for (const tag of await port.listTags()) {
    named.set(tag.revisionId, [...(named.get(tag.revisionId) ?? []), tag.name]);
  }
  /* The port's own order, not the chain's: a merge is followed by the side it
   * merged, and those revisions are in this branch's history without being on
   * its first-parent line, so they appear with no number of their own. */
  const rows = [...entries.values()].map((entry) =>
    rowOf(entry, numbers.get(entry.id), Object.freeze((named.get(entry.id) ?? []).toSorted())),
  );
  return Object.freeze(limit === undefined ? rows : rows.slice(0, limit));
};

/**
 * Read which paths changed between two revisions.
 *
 * Tree-free by contract: paths and how each changed, never content.
 *
 * @param port - The store to read.
 * @param from - The older revision, or `undefined` for the empty tree.
 * @param to - The newer revision.
 * @returns One entry per changed path, sorted.
 * @public
 */
export const readRevisionDiff = async (
  port: RevisionPort,
  from: string | undefined,
  to: string,
): Promise<readonly RevisionDiffEntry[]> =>
  port.diff({ from: from === undefined ? undefined : revisionId(from), to: revisionId(to) });

/**
 * Read where the live tree is and what else the project holds.
 *
 * @param port - The store to read.
 * @returns The branch, its `Rev N`, and every branch in the project.
 * @public
 *
 * @example <caption>The line every surface shows</caption>
 * ```typescript
 * import { readRevisionPlace } from '@taucad/revisions';
 * import type { RevisionPort } from '@taucad/revisions';
 *
 * declare const port: RevisionPort;
 * (await readRevisionPlace(port)).line; // 'main · Rev 12'
 * ```
 */
export const readRevisionPlace = async (port: RevisionPort): Promise<RevisionPlace> => {
  const [live, references] = await Promise.all([port.readHead(), port.listRefs()]);
  const { branch, head } = { branch: live?.branch, head: live?.head };
  /* One walk for every head at once, not one per branch (B5). `log` takes the
   * whole set and answers their union, and `Rev N` is read out of that union by
   * following first parents — the same ids, in the same order, that a walk per
   * branch produced at N times the cost. A project with eight branches was
   * eight full histories every time the place line was refreshed. */
  const heads = [...new Set([...(head === undefined ? [] : [head]), ...references.map((reference) => reference.head)])];
  const entries = new Map<string, RevisionLogEntry>();
  for (const entry of heads.length === 0 ? [] : await port.log({ heads })) {
    entries.set(entry.id, entry);
  }
  const revisionNumber = head === undefined ? undefined : firstParentChain(head, entries).length;
  const branches = references.map((reference) =>
    Object.freeze({
      name: reference.name,
      revisionNumber: firstParentChain(reference.head, entries).length,
      revisionId: reference.head,
    }),
  );
  /* This walk already answered every head's ordinal: a later page reads it back. */
  for (const entry of branches) {
    rememberOrdinal(entry.revisionId, entry.revisionNumber);
  }
  return Object.freeze({
    branch,
    revisionNumber,
    revisionId: head,
    branches: Object.freeze(branches),
    /* The words are the operator's (A18, I12): a branch name and a revision
     * number, never a commit id, a head or a checkout. */
    line:
      branch === undefined
        ? 'No revisions yet'
        : revisionNumber === undefined
          ? `${branch} · no revisions yet`
          : `${branch} · Rev ${String(revisionNumber)}`,
  });
};
