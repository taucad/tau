/**
 * The History graph read: every branch's history in one walk, and the line each
 * entry is drawn on (History D1).
 *
 * `readRevisionLog` answers one branch. History's graph draws several, so this
 * reads the union of their heads with one `port.log({ heads })` — the order the
 * port promises, newest first, a merge before the side it brought in — and says
 * which line owns each entry. Git does not record that, so it is derived the way
 * the blueprint fixes it: `main`'s first-parent chain is its line, and each other
 * branch's first-parent chain, until it meets an entry a line already owns, is
 * that branch's line. The meeting point is the fork.
 *
 * A merge can bring in history no branch names: an imported repository whose
 * merged branch was deleted before Tau saw it. Such a side is a line of its own,
 * keyed by its newest entry's id, with no branch name.
 *
 * Only branches are read. Chat records (`refs/tau/chats/*`) are not branches and
 * a bare `listRefs` never lists them; conflict lines (`conflicts/…`) are stored
 * decisions, never drawn as a branch.
 *
 * Read-only, like every verb in `revision-verbs`.
 */

import { revisionId } from '#algorithms/index.js';
import { isReservedBranchName } from '#revision-conflict.js';
import type { RevisionLogEntry, RevisionPort } from '#revision-port.js';
import { rowsOf } from '#revision-verbs.js';
import type { RevisionRow } from '#revision-verbs.js';

/** The branch drawn on lane 0, and first to own an entry. */
const trunk = 'main';

/** What {@link readRevisionGraph} was asked for. @public */
export type RevisionGraphRequest = Readonly<{
  /**
   * The branches to read, in the order they claim entries; every branch when
   * absent, `main` first and the rest by name. A name the project does not
   * hold is skipped.
   */
  branches?: readonly string[] | undefined;
  /** Newest first across every branch read; every entry when absent. A limit bounds the walk itself. */
  limit?: number | undefined;
}>;

/** One history entry as the graph reads it. @public */
export type RevisionGraphRow = RevisionRow &
  Readonly<{
    /**
     * The line the entry is drawn on: a branch's name, or for history a merge
     * brought in that no branch names, the id of that side's newest entry.
     */
    line: string;
    /** The branch whose line holds the entry; `undefined` on a side no branch names. */
    branch: string | undefined;
  }>;

/** Every branch read, and their history. @public */
export type RevisionGraph = Readonly<{
  /** The branches read, in the order they claimed entries: `main` first by default. */
  branches: ReadonlyArray<Readonly<{ name: string; head: string }>>;
  /** Newest first, in the port's order. Not numbered: `revisionNumber` is always `undefined`. */
  rows: readonly RevisionGraphRow[];
}>;

/**
 * Read several branches' history in one walk, with the line each entry is on.
 *
 * @param port - The store to read.
 * @param request - Which branches, in the order they claim entries, and how many rows.
 * @returns The branches read and their rows, newest first; empty in a project with no revisions.
 * @public
 *
 * @example <caption>main and every branch, the 50 newest entries</caption>
 * ```typescript
 * import { readRevisionGraph } from '@taucad/revisions';
 * import type { RevisionPort } from '@taucad/revisions';
 *
 * declare const port: RevisionPort;
 * const { rows } = await readRevisionGraph(port, { limit: 50 });
 * rows[0]?.line; // 'enclosure-v2'
 * ```
 */
export const readRevisionGraph = async (
  port: RevisionPort,
  request: RevisionGraphRequest = {},
): Promise<RevisionGraph> => {
  const limit = request.limit === undefined ? undefined : Math.max(0, request.limit);
  const references = await port.listRefs();
  const listed = references.filter((reference) => !isReservedBranchName(reference.name));
  const byName = new Map(listed.map((reference) => [reference.name, reference.head] as const));
  const names =
    request.branches === undefined
      ? listed
          .map((reference) => reference.name)
          .toSorted((left, right) => Number(right === trunk) - Number(left === trunk))
      : [...new Set(request.branches)].filter((name) => byName.has(name));
  const branches = names.map((name) => Object.freeze({ name, head: byName.get(name)! }));
  if (branches.length === 0 || limit === 0) {
    return Object.freeze({ branches: Object.freeze(branches), rows: Object.freeze([]) });
  }

  const heads = [...new Set(branches.map((branch) => revisionId(branch.head)))];
  const entries = new Map<string, RevisionLogEntry>();
  for (const entry of await port.log(limit === undefined ? { heads } : { heads, limit })) {
    entries.set(entry.id, entry);
  }

  /* Lines by entry id. A claim follows first parents from `head` until it meets an entry already owned or not read. */
  const owners = new Map<string, string>();
  const claim = (head: string, line: string): void => {
    let current: string | undefined = head;
    while (current !== undefined && entries.has(current) && !owners.has(current)) {
      owners.set(current, line);
      current = entries.get(current)?.parents[0];
    }
  };
  for (const branch of branches) {
    claim(branch.head, branch.name);
  }
  /* A side no branch names, newest merge first: the port lists a merge before
   * the side it brought in, so a side's own merges are reached after it is claimed. */
  for (const entry of entries.values()) {
    if (!owners.has(entry.id)) {
      claim(entry.id, entry.id);
    }
    for (const side of entry.parents.slice(1)) {
      claim(side, side);
    }
  }

  const named = new Set(names);
  const page = limit === undefined ? [...entries.values()] : [...entries.values()].slice(0, limit);
  const read = await rowsOf(port, page);
  const rows = read.map((row): RevisionGraphRow => {
    const line = owners.get(row.revisionId)!;
    return Object.freeze({ ...row, line, branch: named.has(line) ? line : undefined });
  });
  return Object.freeze({
    branches: Object.freeze(branches),
    rows: Object.freeze(rows),
  });
};
