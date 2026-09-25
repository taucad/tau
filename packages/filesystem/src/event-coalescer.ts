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
 * Originating bridge port ids are stored on events via {@link tagEventOrigin} /
 * {@link getEventOrigin} from `#event-origin-registry.js` (not a separate wire
 * type).
 *
 * @see docs/policy/filesystem-policy.md
 */

import { copyEventAuthorities, getEventOrigin, tagEventOrigin } from '#event-origin-registry.js';
import type { ChangeEvent } from '#types.js';

/**
 * Configuration for {@link EventCoalescer}.
 * @public
 */
export type CoalescerOptions = {
  /** Window for coalescing events. Default: 50. Milliseconds. */
  coalescingWindow?: number;
  /** Maximum queue depth before emitting overflow. Default: 10,000. */
  maxQueueDepth?: number;
  /** Called with every event discarded when queue depth is exceeded. */
  onOverflow?: (events: readonly ChangeEvent[]) => void;
};

/** Milliseconds. */
const defaultCoalescingWindow = 50;
const defaultMaxQueueDepth = 10_000;

function mergeOrigins(history: ChangeEvent[]): string | undefined {
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

function collapsePathHistory(history: ChangeEvent[]): ChangeEvent | undefined {
  if (history.length === 0) {
    return undefined;
  }
  if (history.length === 1) {
    return history[0];
  }

  const last = history.at(-1)!;
  const origin = mergeOrigins(history);
  const survivor: ChangeEvent = { ...last };
  copyEventAuthorities(last, survivor);
  if (origin !== undefined) {
    tagEventOrigin(survivor, origin);
  }
  return survivor;
}

/**
 * Buffers {@link ChangeEvent}s within a time window and applies coalescing
 * rules (cancel-out, collapse, dedup) before delivering the batch.
 * @public
 */
export class EventCoalescer {
  /** Milliseconds. */
  private readonly _coalescingWindow: number;
  private readonly _maxQueueDepth: number;
  private readonly _onOverflow?: (events: readonly ChangeEvent[]) => void;
  private readonly _deliverCallback: (events: ChangeEvent[]) => void;
  private _pending: ChangeEvent[] = [];
  private _timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Create an EventCoalescer with a delivery callback and optional config.
   *
   * @param deliverCallback - Called with the coalesced batch when the window expires.
   * @param options - Timing and overflow configuration.
   */
  public constructor(deliverCallback: (events: ChangeEvent[]) => void, options?: CoalescerOptions) {
    this._deliverCallback = deliverCallback;
    this._coalescingWindow = options?.coalescingWindow ?? defaultCoalescingWindow;
    this._maxQueueDepth = options?.maxQueueDepth ?? defaultMaxQueueDepth;
    this._onOverflow = options?.onOverflow;
  }

  /**
   * Queue an event for coalescing.
   *
   * @param event - Change event to queue. Origin may be set via {@link tagEventOrigin} before push.
   */
  public push(event: ChangeEvent): void {
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
    this._timer = setTimeout(() => {
      this._flush();
    }, this._coalescingWindow);
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
    this._timer = undefined;

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
export function coalesceChangeEvents(events: ChangeEvent[]): ChangeEvent[] {
  if (events.length <= 1) {
    return events;
  }

  const indexedEvents: Array<{ index: number; event: ChangeEvent }> = [];
  const renamedFromPaths = new Set<string>();
  const pathHistory = new Map<string, Array<{ index: number; event: ChangeEvent }>>();

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

function getEventPath(event: ChangeEvent): string | undefined {
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
