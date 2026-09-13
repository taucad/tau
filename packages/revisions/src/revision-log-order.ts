/**
 * The order `RevisionPort.log` promises, walked once for both legs.
 *
 * Review 4 R12: the order was unspecified, and the two engines answered
 * differently — a breadth-first walk in the page, `git rev-list --topo-order`
 * on disk — so the same graph read as two different histories depending on the
 * host. The port promises first-parent-first topological order, newest first,
 * and this is the single implementation of it.
 *
 * Review 4 R28: a *bounded* walk is lazy. It reads a revision only when the
 * order needs it, so `log({ limit: 5 })` over a long history reads a handful of
 * objects rather than all of them. Safety there comes from the committer time,
 * the same assumption `git rev-list --topo-order` makes: before a revision is
 * emitted, every discovered revision whose time is not older is expanded.
 *
 * Review 4 R39: that assumption is the *bounded* walk's alone. Bounded walks
 * assume non-decreasing committer time from parent to child; under an inverted
 * clock — an NTP step, an imported revision, a backdated merge — a bounded
 * result may place a parent before a child. An unbounded walk expands the whole
 * reachable set before it emits anything, so its order depends on the graph and
 * nothing else, and `seconds` never enters it.
 */

import type { RevisionId } from '@taucad/filesystem/revisions';

/** One revision as the walk needs it: its parents, its time, and the caller's entry. @internal */
export type RevisionLogNode<Entry> = Readonly<{
  parents: readonly RevisionId[];
  /** Committer time in seconds. Newest first means greatest first. */
  seconds: number;
  entry: Entry;
}>;

/**
 * Walk revisions in first-parent-first topological order, newest first.
 *
 * A revision is emitted only after every revision that names it as a parent,
 * and among those eligible the one reached by following first parents is taken,
 * so a merge is followed by its first-parent side, then the side it merged,
 * then their common history. The result is a property of the graph, not of the
 * engine that stored it.
 *
 * ponytail: the bound is the committer time's, and only as wide as the tied
 * frontier. Revisions sharing a timestamp cannot be ordered by it, so all of
 * them are expanded before one is emitted — a linear chain of identical stamps
 * still costs one read per emitted revision; a *wide* tied frontier (an octopus,
 * many concurrent branch tips) costs that width. A generation number is the
 * upgrade, and git's own walk has the same window (it calls it "slop").
 *
 * @param heads - Where to start, in the caller's order.
 * @param read - Reads one revision, or `undefined` when the store has none.
 * @param limit - Stop after this many revisions. Absent, the walk is exhaustive
 *   and its order is time-independent; present, it is bounded and assumes a
 *   non-decreasing committer time from parent to child.
 * @returns The entries in the order the port promises.
 */
export const walkRevisionLog = async <Entry>(
  heads: readonly RevisionId[],
  read: (id: RevisionId) => Promise<RevisionLogNode<Entry> | undefined>,
  limit = Number.POSITIVE_INFINITY,
): Promise<readonly Entry[]> => {
  const known = new Map<string, RevisionLogNode<Entry>>();
  /** Discovered children that have not been emitted yet. */
  const children = new Map<string, number>();
  /** Known, but whose parents have not been read. */
  const unexpanded = new Set<string>();
  const emitted = new Set<string>();
  const ordered: Entry[] = [];
  const ready: string[] = [];

  const discover = async (id: string): Promise<void> => {
    if (known.has(id)) {
      return;
    }
    const node = await read(id as RevisionId);
    if (node !== undefined) {
      known.set(id, node);
      unexpanded.add(id);
    }
  };

  const expand = async (id: string): Promise<void> => {
    if (!unexpanded.delete(id)) {
      return;
    }
    for (const parent of known.get(id)!.parents) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- reading one parent at a time is the bound.
      await discover(parent);
      if (known.has(parent)) {
        children.set(parent, (children.get(parent) ?? 0) + 1);
      }
    }
  };

  const offer = (ids: readonly string[]): void => {
    /* Reversed onto a stack: the first parent is the next one taken, so a
     * first-parent chain is emitted before either side it merged. */
    for (const id of [...ids].reverse()) {
      if (known.has(id) && !emitted.has(id) && !ready.includes(id)) {
        ready.push(id);
      }
    }
  };

  /* The newest unexpanded revision that could still be a descendant of `id`:
   * anything not older has to be expanded before `id` can be emitted. */
  const blocking = (id: string): string | undefined => {
    const { seconds } = known.get(id)!;
    let found: string | undefined;
    for (const candidate of unexpanded) {
      if (candidate !== id && known.get(candidate)!.seconds >= seconds) {
        found = found === undefined || known.get(candidate)!.seconds > known.get(found)!.seconds ? candidate : found;
      }
    }
    return found;
  };

  for (const head of heads) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the heads are read before any of them is emitted.
    await discover(head);
  }
  offer(heads);

  if (limit === Number.POSITIVE_INFINITY) {
    /* No bound to buy: expanding everything first makes the order a property of
     * the graph alone, so an inverted clock cannot reorder it (review 4 R39).
     * `blocking` then has nothing to find and the walk is purely topological. */
    while (unexpanded.size > 0) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one revision's parents are only known once it is read.
      await expand([...unexpanded][0]!);
    }
  }

  while (ordered.length < limit && ready.length > 0) {
    const current = ready.at(-1)!;
    if (emitted.has(current) || (children.get(current) ?? 0) > 0) {
      // A revision offered before its last child was discovered waits for it.
      ready.pop();
      continue;
    }
    const next = blocking(current);
    if (next !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- expanding one at a time is the bound this walk exists for.
      await expand(next);
      continue;
    }
    ready.pop();
    emitted.add(current);
    ordered.push(known.get(current)!.entry);
    // oxlint-disable-next-line eslint/no-await-in-loop -- the next revision is only known once this one is read.
    await expand(current);
    const { parents } = known.get(current)!;
    for (const parent of parents) {
      if (known.has(parent)) {
        children.set(parent, Math.max((children.get(parent) ?? 0) - 1, 0));
      }
    }
    offer(parents);
  }

  return ordered;
};

/**
 * One revision as the merge base needs it: its identity and its parents.
 *
 * The shape `RevisionPort.log` already answers in, narrowed to the two fields a
 * graph question uses, so a caller passes the log straight through.
 *
 * @internal
 */
export type RevisionAncestryNode = Readonly<{ id: RevisionId; parents: readonly RevisionId[] }>;

/**
 * Every revision one head reaches, itself included.
 *
 * @param start - Where to walk back from.
 * @param parents - Parents by revision id.
 * @returns The reachable set.
 */
const ancestorsOf = (start: RevisionId, parents: ReadonlyMap<string, readonly RevisionId[]>): ReadonlySet<string> => {
  const reached = new Set<string>();
  const frontier = [start as string];
  while (frontier.length > 0) {
    const current = frontier.pop()!;
    if (reached.has(current)) {
      continue;
    }
    reached.add(current);
    frontier.push(...(parents.get(current) ?? []));
  }
  return reached;
};

/**
 * The revision two lines last had in common.
 *
 * There is no second graph walk here: `entries` is what `RevisionPort.log`
 * already answers — first-parent-first topological order, newest first — so the
 * *first* common ancestor in that order is one no other common ancestor
 * descends from, which is what a three-way merge means by "base".
 *
 * ponytail: one base, not all of them. A criss-cross history has several equally
 * good bases and Git itself merges them recursively into a virtual one; this
 * takes the newest, which is what `git merge-base` without `--all` prints. The
 * upgrade, if a criss-cross ever produces a merge a person disputes, is to
 * recurse over the full candidate set.
 *
 * Seed the `log` that produced `entries` with {@link mergeBaseHeads}, or two
 * callers can answer the same question differently.
 *
 * @param entries - The reachable graph in `log` order, newest first.
 * @param left - One head.
 * @param right - The other head.
 * @returns Their merge base, or `undefined` when the two share no history.
 * @internal
 */
/**
 * The heads to seed `log` with when the question is a merge base.
 *
 * `walkRevisionLog` takes the first head first, so two callers asking the same
 * merge-base question with the heads the other way round can be handed two
 * different orders of the same set — and, in a criss-cross, two different
 * bases. The merge and the resolution of that merge are exactly those two
 * callers, so the order is fixed here rather than remembered twice (review R6).
 *
 * @param left - One head.
 * @param right - The other head.
 * @returns Both heads, in the one order every merge-base question uses.
 * @internal
 */
export const mergeBaseHeads = (left: RevisionId, right: RevisionId): readonly RevisionId[] =>
  [left, right].toSorted() as readonly RevisionId[];

export const mergeBaseOf = (
  entries: readonly RevisionAncestryNode[],
  left: RevisionId,
  right: RevisionId,
): RevisionId | undefined => {
  const parents = new Map(entries.map((entry) => [entry.id as string, entry.parents]));
  const leftSide = ancestorsOf(left, parents);
  const rightSide = ancestorsOf(right, parents);
  return entries.find((entry) => leftSide.has(entry.id) && rightSide.has(entry.id))?.id;
};

/** What one head owes another: nothing, the other's work, or a composition. @internal */
export type RevisionIntegration = 'upToDate' | 'fastForward' | 'diverged';

/**
 * How one line relates to another — the question "do I have to merge?".
 *
 * Three cases, not two. A head that *contains* the other has nothing to
 * integrate whichever side it is on: behind, it takes the other's work by
 * moving a ref; **ahead**, there is nothing to take at all and the push that
 * follows fast-forwards the far side. Only two heads where neither contains the
 * other are a fork, and only a fork is a merge (A22).
 *
 * ponytail: one `port.log` answer, read by {@link mergeBaseOf}, so there is no
 * second graph walk and no second idea of "base" (W10 owns that one). A
 * *bounded* `entries` that does not reach the base answers `diverged`, which is
 * the safe wrong answer: it composes instead of overwriting.
 *
 * @param entries - The reachable graph in `log` order, newest first, read from
 *   both heads.
 * @param local - This device's head.
 * @param remote - What the remote advertises.
 * @returns What this device has to do about the remote's head.
 * @internal
 */
export const integrationOf = (
  entries: readonly RevisionAncestryNode[],
  local: RevisionId,
  remote: RevisionId,
): RevisionIntegration => {
  if (local === remote) {
    return 'upToDate';
  }
  const base = mergeBaseOf(entries, local, remote);
  if (base === remote) {
    return 'upToDate';
  }
  return base === local ? 'fastForward' : 'diverged';
};
