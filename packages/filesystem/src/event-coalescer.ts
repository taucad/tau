/**
 * Event coalescer for the filesystem watch pipeline.
 *
 * Buffers ChangeEvents within a configurable time window and applies
 * coalescing rules before delivery:
 *
 * - Repeated facts for one path collapse to the final observable fact
 * - A final delete is preserved because `fileWritten` does not prove creation
 * - Rename emits both old and new path invalidation
 *
 * {@link ChangeSetCoalescer} is the change-set form: it merges the change sets
 * one animation frame collects into one delivery (charter D6, D23).
 *
 * Originating bridge port ids are stored on events via {@link tagEventOrigin} /
 * {@link getEventOrigin} from `#event-origin-registry.js` (not a separate wire
 * type).
 *
 * @see docs/policy/filesystem-policy.md
 */

import { commonAncestor, sharedOrigin, touchedDirectoriesOf } from '#change-event-bus.js';
import type { ChangeSet, ChangeSetEntry, ChangeSetReset, ChangeSetSegment } from '#change-event-bus.js';
import { copyEventAuthorities, getEventOrigin, tagEventOrigin } from '#event-origin-registry.js';
import { parentDirectory } from '@taucad/utils/path';
import type { ChangeEvent, PathChangeEvent } from '#types.js';

/**
 * Configuration for {@link EventCoalescer}.
 * @public
 */
export type CoalescerOptions = {
  /** Window for coalescing events. Default: 50. Milliseconds. */
  coalescingWindow?: number;
  /**
   * Deliver the events that open a window on the next timer tick instead of at its end; events arriving during the
   * window still coalesce and are delivered when it closes. Default: false.
   */
  leadingEdge?: boolean;
  /** Maximum queue depth before emitting overflow. Default: 10,000. */
  maxQueueDepth?: number;
  /** Called with every event discarded when queue depth is exceeded. */
  onOverflow?: (events: readonly PathChangeEvent[]) => void;
};

/** Milliseconds. */
const defaultCoalescingWindow = 50;
const defaultMaxQueueDepth = 10_000;

function mergeOrigins(history: PathChangeEvent[]): string | undefined {
  let sawDefined = false;
  let sawUndefined = false;
  let singleDefined: string | undefined;
  for (const event of history) {
    const origin = getEventOrigin(event);
    if (origin === undefined) {
      sawUndefined = true;
    } else {
      sawDefined = true;
      if (singleDefined === undefined) {
        singleDefined = origin;
      } else if (singleDefined !== origin) {
        return undefined;
      }
    }
  }
  if (sawUndefined && sawDefined) {
    return undefined;
  }
  if (sawDefined) {
    return singleDefined;
  }
  return undefined;
}

function collapsePathHistory(history: PathChangeEvent[]): PathChangeEvent | undefined {
  if (history.length === 0) {
    return undefined;
  }
  if (history.length === 1) {
    return history[0];
  }

  const last = history.at(-1)!;
  const origin = mergeOrigins(history);
  const survivor: PathChangeEvent = { ...last };
  copyEventAuthorities(last, survivor);
  if (origin !== undefined) {
    tagEventOrigin(survivor, origin);
  }
  return survivor;
}

/**
 * Buffers {@link PathChangeEvent}s within a time window and applies coalescing
 * rules (cancel-out, collapse, dedup) before delivering the batch.
 * @public
 */
export class EventCoalescer {
  /** Milliseconds. */
  private readonly _coalescingWindow: number;
  private readonly _leadingEdge: boolean;
  private readonly _maxQueueDepth: number;
  private readonly _onOverflow?: (events: readonly PathChangeEvent[]) => void;
  private readonly _deliverCallback: (events: PathChangeEvent[]) => void;
  private _pending: PathChangeEvent[] = [];
  private _timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Create an EventCoalescer with a delivery callback and optional config.
   *
   * @param deliverCallback - Called with the coalesced batch when the window expires.
   * @param options - Timing and overflow configuration.
   */
  public constructor(deliverCallback: (events: PathChangeEvent[]) => void, options?: CoalescerOptions) {
    this._deliverCallback = deliverCallback;
    this._coalescingWindow = options?.coalescingWindow ?? defaultCoalescingWindow;
    this._leadingEdge = options?.leadingEdge ?? false;
    this._maxQueueDepth = options?.maxQueueDepth ?? defaultMaxQueueDepth;
    this._onOverflow = options?.onOverflow;
  }

  /**
   * Queue an event for coalescing.
   *
   * @param event - Change event to queue. Origin may be set via {@link tagEventOrigin} before push.
   */
  public push(event: PathChangeEvent): void {
    if (this._pending.length >= this._maxQueueDepth) {
      const discarded = [...this._pending, event];
      this._pending = [];
      if (this._timer !== undefined) {
        clearTimeout(this._timer);
        this._timer = undefined;
      }
      this._onOverflow?.(discarded);
      return;
    }

    this._pending.push(event);

    if (this._timer !== undefined) {
      return;
    }
    if (!this._leadingEdge) {
      this._timer = setTimeout(() => {
        this._timer = undefined;
        this._flush();
      }, this._coalescingWindow);
      return;
    }
    // One tick batches every event emitted by the same operation; the window opens before delivery so events a
    // handler causes are coalesced into it rather than delivered on another leading tick.
    this._timer = setTimeout(() => {
      this._timer = setTimeout(() => {
        this._timer = undefined;
        this._flush();
      }, this._coalescingWindow);
      this._flush();
    }, 0);
  }

  /** Immediately flush any pending events (e.g. on dispose). */
  public flush(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    this._flush();
  }

  /** Cancel any pending timer and discard queued events. */
  public dispose(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    this._pending = [];
  }

  private _flush(): void {
    if (this._pending.length === 0) {
      return;
    }

    const events = this._pending;
    this._pending = [];

    const coalesced = coalesceChangeEvents(events);
    if (coalesced.length > 0) {
      this._deliverCallback(coalesced);
    }
  }
}

/**
 * Apply coalescing rules to a batch of events.
 *
 * A file moved away from a path the batch later writes or moves onto again is
 * only its arrival at the target: the move-aside of a revision write's
 * replacement, whose path the publish refills. A write to a path the batch
 * then moves away, with nothing after, is told by the move alone. So a
 * replacement's four facts (stage, move aside, publish, drop the backup) net to
 * the publish and the backup's removal (STO-25 SP2g).
 *
 * Same originator across a merged path sequence preserves the tag via
 * {@link tagEventOrigin}; mixed originators (including untagged mixed with
 * tagged) leave the cloned survivor untagged so every bridge port receives
 * the batch when appropriate.
 *
 * @param events - Raw change events to coalesce.
 * @returns Coalesced event array.
 * @public
 */
export function coalesceChangeEvents(events: PathChangeEvent[]): PathChangeEvent[] {
  if (events.length <= 1) {
    return events;
  }

  const indexedEvents: Array<{ index: number; event: PathChangeEvent }> = [];
  const renamedFromPaths = new Set<string>();
  const pathHistory = new Map<string, Array<{ index: number; event: PathChangeEvent }>>();
  /* Per file path, the last fact that puts a file there and the last move away from it. */
  const lastArrival = new Map<string, number>();
  const lastMoveAway = new Map<string, number>();
  for (const [index, event] of events.entries()) {
    switch (event.type) {
      case 'fileWritten': {
        lastArrival.set(event.path, index);
        break;
      }
      case 'fileRenamed': {
        lastArrival.set(event.newPath, index);
        lastMoveAway.set(event.oldPath, index);
        break;
      }
      case 'fileCopied': {
        lastArrival.set(event.targetPath, index);
        break;
      }
      default: {
        break;
      }
    }
  }

  for (const [index, original] of events.entries()) {
    let event = original;
    if (event.type === 'fileRenamed' && (lastArrival.get(event.oldPath) ?? -1) > index) {
      const { newPath, backend, target } = event;
      event = { type: 'fileWritten', path: newPath, backend, ...(target === undefined ? {} : { target }) };
      copyEventAuthorities(original, event);
      const origin = getEventOrigin(original);
      if (origin !== undefined) {
        tagEventOrigin(event, origin);
      }
    }
    if (event.type === 'directoryChanged') {
      indexedEvents.push({ index, event });
      continue;
    }
    if (event.type === 'fileRenamed' || event.type === 'directoryRenamed') {
      indexedEvents.push({ index, event });
      renamedFromPaths.add(event.oldPath);
      continue;
    }
    const path = getEventPath(event);
    if (!path) {
      indexedEvents.push({ index, event });
      continue;
    }
    let history = pathHistory.get(path);
    if (!history) {
      history = [];
      pathHistory.set(path, history);
    }
    history.push({ index, event });
  }

  for (const [path, history] of pathHistory) {
    const collapsed = collapsePathHistory(history.map(({ event }) => event));
    if (!collapsed) {
      continue;
    }

    if (collapsed.type === 'fileDeleted' && renamedFromPaths.has(path)) {
      continue;
    }
    /* Written, then moved away with nothing after: the move says it all. */
    if (collapsed.type === 'fileWritten' && history.at(-1)!.index < (lastMoveAway.get(path) ?? -1)) {
      continue;
    }

    indexedEvents.push({ index: history.at(-1)!.index, event: collapsed });
  }

  return indexedEvents.toSorted((left, right) => left.index - right.index).map(({ event }) => event);
}

function getEventPath(event: PathChangeEvent): string | undefined {
  switch (event.type) {
    case 'fileWritten':
    case 'fileDeleted':
    case 'directoryChanged': {
      return event.path;
    }
    case 'fileRenamed': {
      return event.oldPath;
    }
    default: {
      return undefined;
    }
  }
}

/** The paths a fact names that its change leaves unknown: never a copy's untouched source. */
type NamedPaths = Partial<Record<'path' | 'oldPath' | 'newPath' | 'targetPath', string>>;

/**
 * A re-list of a whole subtree that stands for a directory removal an
 * overflowed window netted: the directory went and came back within the lost
 * window. It is a worker-side shape only, never a wire fact, so a copy keeps
 * it and every consumer has to say what it means: a port rooted beneath it
 * reads it as its whole-root reset, any other port as `directoryChanged`.
 * @public
 */
export type SubtreeReset = Readonly<{ type: 'subtreeReset'; path: string; backend: PathChangeEvent['backend'] }>;

/**
 * What {@link overflowLossSignals} answers: change facts and {@link SubtreeReset}s.
 * @public
 */
export type LossSignal = PathChangeEvent | SubtreeReset;

/**
 * What a coalescing window that overflowed is replaced with: a
 * `directoryChanged` for each directory a discarded fact touched — a file's
 * parent, a directory itself beside its parent — which every consumer reads as
 * a reset of that subtree, and a `backendChanged` only for a backend that
 * really changed. Nothing is silently dropped (I5) and nothing a discarded fact
 * named still reads as it was (I7), but a large write into one folder no longer
 * resets every root on the bus. A directory is named itself so a fact at a
 * rooted connection's own root still resets that root once scoped, and a
 * discarded removal or move of a directory is kept as itself, ahead of the
 * re-lists: a connection rooted beneath it reads that as its whole-root reset,
 * where an ancestor's re-list says only that the ancestor's listing changed.
 * When the window fills the removed path again, the directory's re-list stands
 * for the removal instead (a {@link SubtreeReset}), so no open file under it
 * reads as gone (I7) while a connection beneath it still resets.
 *
 * @param discarded - The facts the window discarded, in order.
 * @returns The loss signals, in the order their directories first appeared.
 * @public
 */
export const overflowLossSignals = (discarded: readonly PathChangeEvent[]): LossSignal[] => {
  const kept = new Map<string, PathChangeEvent>();
  const signals = new Map<string, LossSignal>();
  /* Directories a netted removal leaves to their re-list, which must still reach every port beneath them. */
  const subtrees: Array<{ backend: PathChangeEvent['backend']; path: string }> = [];
  const named = (event: PathChangeEvent): string[] => {
    const { path, oldPath, newPath, targetPath } = event as NamedPaths;
    return [path, oldPath, newPath, targetPath].filter((value) => value !== undefined);
  };
  /* Per fact, whether a later fact of its backend names a path at or under the one it removes. */
  const filledLater = new Set<string>();
  const netted = Array.from<boolean>({ length: discarded.length });
  for (let index = discarded.length - 1; index >= 0; index -= 1) {
    const event = discarded[index]!;
    if (event.type === 'directoryDeleted' || event.type === 'directoryRenamed') {
      const removed = event.type === 'directoryDeleted' ? event.path : event.oldPath;
      netted[index] = filledLater.has(`${event.backend}\0${removed}`);
    }
    for (const path of named(event)) {
      for (let at = path; !filledLater.has(`${event.backend}\0${at}`); at = parentDirectory(at)) {
        filledLater.add(`${event.backend}\0${at}`);
        if (at === '/') {
          break;
        }
      }
    }
  }
  for (const event of discarded) {
    if (event.type === 'backendChanged') {
      signals.set(event.backend, event);
    }
  }
  for (const [index, event] of discarded.entries()) {
    if (signals.has(event.backend)) {
      continue;
    }
    if (event.type === 'directoryDeleted' || event.type === 'directoryRenamed') {
      /* Something lands at or under the removed directory later in the window: told as gone, its open
       * files would flash orphaned until their re-list (I7), so the re-list alone carries it. */
      if (netted[index] === true) {
        for (const path of named(event)) {
          subtrees.push({ backend: event.backend, path });
        }
      } else {
        kept.set(`${event.type}\0${event.backend}\0${named(event).join('\0')}`, event);
      }
    }
    for (const path of named(event)) {
      for (const directory of event.type.startsWith('directory')
        ? [parentDirectory(path), path]
        : [parentDirectory(path)]) {
        const key = `${event.backend}\0${directory}`;
        if (!signals.has(key)) {
          signals.set(key, { type: 'directoryChanged', path: directory, backend: event.backend });
        }
      }
    }
  }
  for (const { backend, path } of subtrees) {
    const key = `${backend}\0${path}`;
    if (signals.get(key)?.type === 'directoryChanged') {
      signals.set(key, { type: 'subtreeReset', path, backend });
    }
  }
  return [...[...kept.values()].filter(({ backend }) => !signals.has(backend)), ...signals.values()];
};

/** A directory and every directory above it, in its own root spelling (`''` scoped, `/` absolute). */
const selfAndAncestors = (path: string): string[] => {
  const chain = [path];
  for (let at = path; at !== '' && at !== '/'; ) {
    const separator = at.lastIndexOf('/');
    at = separator > 0 ? at.slice(0, separator) : separator === 0 ? '/' : '';
    chain.push(at);
  }
  return chain;
};

/**
 * One delivery's directory summaries without repeats: a summary is dropped when
 * the same directory, or a directory above it, is summarized again later in the
 * delivery, since that later re-list reads everything the earlier one would.
 * Every other fact keeps its place.
 *
 * @param events - One delivery's facts, in order, in one path namespace.
 * @returns The facts with covered summaries removed; the same array when none is.
 * @public
 */
export const pruneDirectorySummaries = (events: readonly PathChangeEvent[]): readonly PathChangeEvent[] => {
  const later = new Set<string>();
  const covered = new Set<number>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type !== 'directoryChanged') {
      continue;
    }
    const key = (path: string): string => `${event.backend}\0${path}`;
    if (selfAndAncestors(event.path).some((path) => later.has(key(path)))) {
      covered.add(index);
    }
    later.add(key(event.path));
  }
  return covered.size === 0 ? events : events.filter((_, index) => !covered.has(index));
};

/**
 * Schedules one callback and returns its cancel; the default is the next animation frame.
 * @public
 */
export type FrameScheduler = (callback: () => void) => () => void;

/** Milliseconds: one frame at 60 Hz, for realms without `requestAnimationFrame`. */
const frameFallbackDelay = 16;

/**
 * The next animation frame where the realm has one (a page, or a dedicated
 * worker in Chromium and Firefox), otherwise a 16 ms timer.
 *
 * @param callback - Runs once.
 * @returns Cancels it.
 * @public
 */
export const nextFrame: FrameScheduler = (callback) => {
  const realm = globalThis as {
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (typeof realm.requestAnimationFrame === 'function' && typeof realm.cancelAnimationFrame === 'function') {
    const handle = realm.requestAnimationFrame(callback);
    return () => {
      realm.cancelAnimationFrame?.(handle);
    };
  }
  const timer = setTimeout(callback, frameFallbackDelay);
  return () => {
    clearTimeout(timer);
  };
};

/** Most entries one merged change set carries before it becomes a scoped `overflow` reset. */
const defaultMaxChangeSetEntries = 10_000;

const resetPrefixOf = (sets: readonly ChangeSet[]): string => {
  let prefix: string | undefined;
  const widen = (path: string): void => {
    prefix = prefix === undefined ? path : commonAncestor(prefix, path);
  };
  for (const set of sets) {
    if (set.reset !== undefined) {
      widen(set.reset.prefix);
    }
    for (const entry of set.entries) {
      widen(entry.path);
      if (entry.oldPath !== undefined) {
        widen(entry.oldPath);
      }
    }
  }
  return prefix ?? '/';
};

/**
 * The reset a merge becomes: any member's reset, or an overflow past the bound.
 *
 * @param sets - Change sets in delivery order.
 * @param maxEntries - Entry bound.
 * @returns The reset, or `undefined` when the merge stays exact.
 */
const mergedReset = (sets: readonly ChangeSet[], maxEntries: number): ChangeSetReset | undefined => {
  const resets = sets.flatMap((set) => (set.reset === undefined ? [] : [set.reset]));
  const total = sets.reduce((sum, set) => sum + set.entries.length, 0);
  if (resets.length === 0 && total <= maxEntries) {
    return undefined;
  }
  const reason =
    resets.length === 0
      ? 'overflow'
      : resets.some((reset) => reset.reason === 'topology')
        ? 'topology'
        : resets.at(-1)!.reason;
  return { prefix: resetPrefixOf(sets), reason };
};

/**
 * Collapse exact entries per path, keeping moves in place, and count the writes each surviving path absorbed.
 * A deleted directory is never folded into what follows it at that path: a recreate after it would otherwise
 * hide that the old directory's descendants are gone, so the delete stays and the create comes after it.
 *
 * @param sets - Exact change sets in delivery order.
 * @returns The surviving entries and the segments with more than one write.
 */
const foldEntries = (sets: readonly ChangeSet[]): { entries: ChangeSetEntry[]; segments: ChangeSetSegment[] } => {
  const merged: Array<ChangeSetEntry | undefined> = [];
  const slotByPath = new Map<string, number>();
  const writes = new Map<string, number>();
  for (const set of sets) {
    for (const segment of set.segments ?? []) {
      /* The segment's last write is counted below with its entry. */
      writes.set(segment.path, (writes.get(segment.path) ?? 0) + segment.writes - 1);
    }
    for (const entry of set.entries) {
      if (entry.op === 'moved') {
        merged.push(entry);
        continue;
      }
      const slot = slotByPath.get(entry.path);
      const previous = slot === undefined ? undefined : merged[slot];
      const replacedDirectory = previous?.op === 'deleted' && previous.kind === 'dir';
      if (slot !== undefined && !replacedDirectory) {
        merged[slot] = undefined;
      }
      if (entry.op === 'written') {
        writes.set(entry.path, (writes.get(entry.path) ?? 0) + 1);
      }
      const keepsCreation = previous?.op === 'created' && entry.op === 'written' && previous.kind === entry.kind;
      slotByPath.set(entry.path, merged.length);
      merged.push(keepsCreation ? { ...entry, op: 'created' } : entry);
    }
  }
  return {
    entries: merged.filter((entry): entry is ChangeSetEntry => entry !== undefined),
    segments: [...writes]
      .filter(([path, count]) => count > 1 && slotByPath.has(path))
      .map(([path, count]) => ({ path, writes: count })),
  };
};

/**
 * Merge the change sets one delivery window collected into one (D6, D23).
 *
 * Repeated facts for one path collapse to the last (a `created` stays
 * `created` through later writes), so a record log appended N times in a
 * window is one entry, named in `segments` with its write count. Moves keep
 * their place. Any reset, or more than `maxEntries` entries, makes the result
 * a reset of the common ancestor of everything merged.
 *
 * @param sets - Change sets in delivery order.
 * @param maxEntries - Entry bound before the merge overflows into a reset.
 * @returns The merged change set, or `undefined` for none.
 * @public
 */
export function mergeChangeSets(
  sets: readonly ChangeSet[],
  maxEntries = defaultMaxChangeSetEntries,
): ChangeSet | undefined {
  if (sets.length === 0) {
    return undefined;
  }
  if (sets.length === 1 && sets[0]!.entries.length <= maxEntries) {
    return sets[0];
  }
  const last = sets.at(-1)!;
  const origin = sharedOrigin(sets.map((set) => set.origin));
  const backends = new Set(sets.map((set) => set.backend));
  const backend = backends.size === 1 && last.backend !== undefined ? { backend: last.backend } : {};
  const base = { generation: last.generation, ...(origin === undefined ? {} : { origin }), ...backend };
  const reset = mergedReset(sets, maxEntries);
  if (reset !== undefined) {
    return { ...base, entries: [], touchedDirectories: [], reset };
  }
  const { entries, segments } = foldEntries(sets);
  return {
    ...base,
    entries,
    touchedDirectories: touchedDirectoriesOf(entries),
    ...(segments.length === 0 ? {} : { segments }),
  };
}

/**
 * Configuration for {@link ChangeSetCoalescer}.
 * @public
 */
export type ChangeSetCoalescerOptions = {
  /** When the window closes. Default: {@link nextFrame}. */
  schedule?: FrameScheduler;
  /** Entry bound before a window overflows into a scoped reset. Default: 10,000. */
  maxEntries?: number;
};

/**
 * Collects change sets until the next frame and delivers them as one (D6): a
 * UI subscriber does one unit of work per frame however many changesets
 * committed in it, and a chat append storm is one entry per log segment (D23).
 *
 * @public
 */
export class ChangeSetCoalescer {
  readonly #deliver: (set: ChangeSet) => void;
  readonly #schedule: FrameScheduler;
  readonly #maxEntries: number;
  #pending: ChangeSet[] = [];
  #cancel: (() => void) | undefined;

  /**
   * Create a coalescer that delivers one merged change set per window.
   *
   * @param deliver - Receives one merged change set per window.
   * @param options - Window scheduler and overflow bound.
   */
  public constructor(deliver: (set: ChangeSet) => void, options?: ChangeSetCoalescerOptions) {
    this.#deliver = deliver;
    this.#schedule = options?.schedule ?? nextFrame;
    this.#maxEntries = options?.maxEntries ?? defaultMaxChangeSetEntries;
  }

  /**
   * Queue one change set for the current window.
   *
   * @param set - A change set as the watch plane built it.
   */
  public push(set: ChangeSet): void {
    this.#pending.push(set);
    this.#cancel ??= this.#schedule(() => {
      this.#cancel = undefined;
      this.#flush();
    });
  }

  /** Deliver what the window holds now. */
  public flush(): void {
    this.#cancel?.();
    this.#cancel = undefined;
    this.#flush();
  }

  /** Cancel the window and discard what it holds. */
  public dispose(): void {
    this.#cancel?.();
    this.#cancel = undefined;
    this.#pending = [];
  }

  #flush(): void {
    const pending = this.#pending;
    this.#pending = [];
    const merged = mergeChangeSets(pending, this.#maxEntries);
    if (merged !== undefined) {
      this.#deliver(merged);
    }
  }
}

/**
 * One port's delivery as the one message it crosses the wire as: the fact
 * itself when there is one, a `changeSet` envelope otherwise, with covered
 * summaries pruned ({@link pruneDirectorySummaries}).
 *
 * @param facts - One port's facts from one delivery, in order (at least one).
 * @returns The message to emit.
 * @public
 */
export const deliveryMessage = (facts: readonly LossSignal[]): ChangeEvent => {
  const pruned = pruneDirectorySummaries(
    facts.map((fact): PathChangeEvent => (fact.type === 'subtreeReset' ? { ...fact, type: 'directoryChanged' } : fact)),
  );
  return pruned.length === 1 ? pruned[0]! : { type: 'changeSet', entries: [...pruned] };
};
