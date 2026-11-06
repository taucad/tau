/**
 * The authority's change bus and the change-set event contract (charter D6, I4).
 *
 * Every committed changeset reaches the bus as one {@link ChangeEvent}: a path
 * fact for a changeset of one, a `changeSet` envelope otherwise. The bus stamps
 * each emit with a monotonic generation, and {@link toChangeSet} turns one emit
 * (or the facts a watch admitted from it) into the one {@link ChangeSet} a
 * subscriber receives: exact entries plus the directories whose listings
 * changed, or an explicit scoped `reset` when the facts summarise — never both,
 * and never silence.
 *
 * @module
 */
import { Topic } from '@taucad/events';
import { parentDirectory } from '@taucad/utils/path';
import type { ChangeEventStat, FileSystemBackend } from '@taucad/types';
import { getEventOrigin } from '#event-origin-registry.js';
import type { ChangeEvent, PathChangeEvent, WatchEvent } from '#types.js';

/**
 * What happened to one path. A copy target is `created`; `written` does not
 * prove the path was new.
 *
 * @public
 */
export type ChangeSetOp = 'created' | 'written' | 'deleted' | 'moved';

/**
 * One exact fact of a {@link ChangeSet}. `oldPath` is set for `moved`.
 *
 * @public
 */
export type ChangeSetEntry = Readonly<{
  op: ChangeSetOp;
  path: string;
  oldPath?: string;
  kind: 'file' | 'dir';
  target?: ChangeEventStat;
}>;

/**
 * Why a {@link ChangeSet} summarises a prefix instead of naming its paths.
 *
 * @public
 */
export type ChangeSetResetReason = 'overflow' | 'observer-uncertain' | 'topology' | 'sequence-gap' | 'permission-lost';

/**
 * An explicit, scoped loss of exactness: everything at or below `prefix` must be re-read.
 *
 * @public
 */
export type ChangeSetReset = Readonly<{ prefix: string; reason: ChangeSetResetReason }>;

/**
 * A record-log segment whose repeated writes one delivery merged into a single entry (D23).
 *
 * @public
 */
export type ChangeSetSegment = Readonly<{ path: string; writes: number }>;

/**
 * Everything one committed changeset changed, as one subscriber receives it (D6).
 *
 * - `generation` is the bus generation of the last emit it carries; it only grows.
 * - `origin` is the bridge port that issued every fact, when one port issued all of them.
 * - `entries` are exact, in commit order, and empty when `reset` is set.
 * - `touchedDirectories` are the sorted, distinct directories whose listings
 *   the entries changed, so a tree does work per directory, not per path.
 * - `segments` name the paths whose repeated writes were merged into one entry.
 * - `reset` is set instead of `entries` when the facts summarise a prefix.
 *
 * @public
 */
export type ChangeSet = Readonly<{
  generation: number;
  origin?: string;
  backend?: FileSystemBackend;
  entries: readonly ChangeSetEntry[];
  touchedDirectories: readonly string[];
  segments?: readonly ChangeSetSegment[];
  reset?: ChangeSetReset;
}>;

/**
 * The deepest directory that contains both paths (`/` at worst).
 *
 * @param left - An absolute path.
 * @param right - Another absolute path.
 * @returns Their common ancestor-or-self.
 */
export const commonAncestor = (left: string, right: string): string => {
  if (left === right) {
    return left;
  }
  const leftSegments = left.split('/');
  const rightSegments = right.split('/');
  const shared: string[] = [];
  for (let index = 0; index < Math.min(leftSegments.length, rightSegments.length); index++) {
    if (leftSegments[index] !== rightSegments[index]) {
      break;
    }
    shared.push(leftSegments[index]!);
  }
  const joined = shared.join('/');
  return joined === '' ? '/' : joined;
};

/**
 * One exact fact as a change-set entry, or the prefix it summarises.
 *
 * @param fact - A path fact from the bus.
 * @returns The entry, or the reset it implies.
 */
const entryOrReset = (fact: PathChangeEvent): ChangeSetEntry | ChangeSetReset => {
  const target = 'target' in fact && fact.target !== undefined ? { target: fact.target } : {};
  switch (fact.type) {
    case 'fileWritten': {
      return { op: 'written', path: fact.path, kind: 'file', ...target };
    }
    case 'fileDeleted': {
      return { op: 'deleted', path: fact.path, kind: 'file' };
    }
    case 'fileRenamed': {
      return { op: 'moved', path: fact.newPath, oldPath: fact.oldPath, kind: 'file', ...target };
    }
    case 'fileCopied': {
      return { op: 'created', path: fact.targetPath, kind: 'file', ...target };
    }
    case 'directoryCreated': {
      return { op: 'created', path: fact.path, kind: 'dir', ...target };
    }
    case 'directoryDeleted': {
      return { op: 'deleted', path: fact.path, kind: 'dir' };
    }
    case 'directoryRenamed': {
      return { op: 'moved', path: fact.newPath, oldPath: fact.oldPath, kind: 'dir', ...target };
    }
    case 'directoryCopied': {
      return { op: 'created', path: fact.targetPath, kind: 'dir', ...target };
    }
    case 'directoryChanged': {
      return { prefix: fact.path, reason: 'observer-uncertain' };
    }
    case 'backendChanged': {
      return { prefix: '/', reason: 'topology' };
    }
  }
};

const isReset = (value: ChangeSetEntry | ChangeSetReset): value is ChangeSetReset => 'prefix' in value;

/**
 * One reset that covers two: their common ancestor, and `topology` when either is one.
 *
 * @param earlier - The reset already held, if any.
 * @param later - The reset to fold in.
 * @returns A reset at or above both prefixes.
 */
export const mergeResets = (earlier: ChangeSetReset | undefined, later: ChangeSetReset): ChangeSetReset =>
  earlier === undefined
    ? later
    : {
        prefix: commonAncestor(earlier.prefix, later.prefix),
        reason: earlier.reason === 'topology' || later.reason === 'topology' ? 'topology' : later.reason,
      };

/**
 * The sorted, distinct parents of every path an entry names.
 *
 * @param entries - Exact entries.
 * @returns The directories whose listings changed.
 * @public
 */
export const touchedDirectoriesOf = (entries: readonly ChangeSetEntry[]): readonly string[] => {
  const directories = new Set<string>();
  for (const entry of entries) {
    directories.add(parentDirectory(entry.path));
    if (entry.oldPath !== undefined) {
      directories.add(parentDirectory(entry.oldPath));
    }
  }
  return [...directories].sort();
};

/**
 * A change set spelled as the per-path watch events a {@link WatchEvent} consumer
 * expects: a creation or write is a `change`, a deletion a `delete`, a move a
 * `rename`, and a scoped reset a `reset`.
 *
 * @param set - One delivered change set.
 * @returns Its watch events, in commit order.
 * @public
 */
export const watchEventsOfChangeSet = (set: ChangeSet): WatchEvent[] => {
  if (set.reset !== undefined) {
    return [{ type: 'reset' }];
  }
  return set.entries.map((entry): WatchEvent => {
    if (entry.op === 'deleted') {
      return { type: 'delete', path: entry.path };
    }
    if (entry.op === 'moved' && entry.oldPath !== undefined) {
      return { type: 'rename', oldPath: entry.oldPath, newPath: entry.path };
    }
    return { type: 'change', path: entry.path };
  });
};

/**
 * The one origin every fact shares, or `undefined` when any differs or is untagged.
 *
 * @param origins - Each fact's origin, in order.
 * @returns The shared origin.
 */
export const sharedOrigin = (origins: Iterable<string | undefined>): string | undefined => {
  let shared: string | undefined;
  let first = true;
  for (const origin of origins) {
    if (origin === undefined) {
      return undefined;
    }
    if (first) {
      shared = origin;
      first = false;
    } else if (shared !== origin) {
      return undefined;
    }
  }
  return shared;
};

/**
 * Build the change set a subscriber receives from the path facts it admitted
 * from one or more bus emits (D6, I4).
 *
 * Exact facts become entries. A summary fact (`directoryChanged`,
 * `backendChanged`) or an `extraReset` makes the whole set a reset of the
 * common ancestor of everything it named, so a consumer never has to reconcile
 * an exact fact with a summary of the same subtree.
 *
 * @param facts - Admitted facts, in commit order.
 * @param generation - The bus generation of the last emit the facts came from.
 * @param extraReset - A reset the caller already decided (a watch on a replaced ancestor).
 * @returns The change set, or `undefined` when nothing was admitted.
 * @public
 */
export const toChangeSet = (
  facts: readonly PathChangeEvent[],
  generation: number,
  extraReset?: ChangeSetReset,
): ChangeSet | undefined => {
  if (facts.length === 0 && extraReset === undefined) {
    return undefined;
  }
  const origin = sharedOrigin(facts.map((fact) => getEventOrigin(fact)));
  const backends = new Set(facts.map((fact) => fact.backend));
  const backend = backends.size === 1 ? { backend: [...backends][0]! } : {};
  const entries: ChangeSetEntry[] = [];
  let reset = extraReset;
  for (const fact of facts) {
    const converted = entryOrReset(fact);
    if (isReset(converted)) {
      reset = mergeResets(reset, converted);
    } else {
      entries.push(converted);
    }
  }
  if (reset !== undefined) {
    let { prefix } = reset;
    for (const entry of entries) {
      prefix = commonAncestor(prefix, entry.path);
      if (entry.oldPath !== undefined) {
        prefix = commonAncestor(prefix, entry.oldPath);
      }
    }
    return {
      generation,
      ...(origin === undefined ? {} : { origin }),
      ...backend,
      entries: [],
      touchedDirectories: [],
      reset: { prefix, reason: reset.reason },
    };
  }
  return {
    generation,
    ...(origin === undefined ? {} : { origin }),
    ...backend,
    entries,
    touchedDirectories: touchedDirectoriesOf(entries),
  };
};

/**
 * Simple pub/sub bus for broadcasting {@link ChangeEvent}s to subscribers.
 *
 * Each emit is one committed changeset and advances {@link ChangeEventBus.generation}
 * before any subscriber runs, so a subscriber reading it during delivery sees
 * the generation of the event it is handling.
 *
 * @public
 */
export class ChangeEventBus {
  #generation = 0;

  readonly #topic = new Topic<ChangeEvent>({
    name: 'ChangeEventBus',
    onError: (error) => {
      console.error('[ChangeEventBus] Subscriber error:', error);
    },
  });

  /**
   * The generation of the most recent emit.
   *
   * @returns 0 before the first emit, then one more per emit.
   */
  public get generation(): number {
    return this.#generation;
  }

  /**
   * Register a handler to receive all change events.
   *
   * Originating bridge port ids are attached to events via `tagEventOrigin`
   * in {@link WorkspaceFileService} before emit.
   *
   * @param handler - Callback invoked for every emitted event.
   * @param options - Optional AbortSignal lifecycle binding.
   * @returns Unsubscribe function.
   */
  public subscribe(handler: (event: ChangeEvent) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#topic.subscribe(handler, options);
  }

  /**
   * Broadcast an event to all current subscribers.
   *
   * @param event - Change event to emit.
   */
  public emit(event: ChangeEvent): void {
    this.#generation += 1;
    this.#topic.emit(event);
  }

  /** Remove all subscribers. */
  public dispose(): void {
    this.#topic.dispose();
  }
}
