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
import type { PathChangeEvent } from '#types.js';

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

  for (const [index, event] of events.entries()) {
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
      if (slot !== undefined) {
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
