/**
 * Live conflation at the source (chat performance plan WP-08, decision 5). A live delta is a preview of state the
 * durable log will state exactly, so a subscriber is sent the latest state at its own pace rather than every supplier
 * delta: adjacent deltas of one block are merged into one event, at most once per {@link liveConflationMilliseconds}
 * window, and a subscriber that has not read its last event accumulates and merges more instead of queueing.
 *
 * The wire is unchanged. A merged delta is an ordinary `text-delta`, `thinking-delta` or `tool-input-delta` whose
 * text is the concatenation and whose `offset` is the first one's, which every reader already applies the same way
 * as the deltas it replaces. Merging never crosses a block, a step boundary or any other event: those start a new
 * entry, in order.
 */

/** The coalescing window, one frame at 60 Hz. @internal */
export const liveConflationMilliseconds = 16;

/** Live events that carry an appended suffix of one block. */
const deltaTypes = new Set(['text-delta', 'thinking-delta', 'tool-input-delta']);

/** Fields that may differ between two mergeable deltas: the text, its position, and a summary that replaces itself. */
const mergedFields = new Set(['delta', 'offset', 'reasoningSummary']);

type LiveDelta = Readonly<{ type: string; delta: string; offset?: number | undefined }>;

const isDelta = (event: unknown): event is LiveDelta =>
  typeof event === 'object' &&
  event !== null &&
  deltaTypes.has((event as { type?: unknown }).type as string) &&
  typeof (event as { delta?: unknown }).delta === 'string';

/**
 * The single event equal to `first` followed by `next`, when one exists.
 *
 * Two deltas merge when they are the same kind of delta of the same block (every identifying field equal: chat, run,
 * writer incarnation, message, content index, tool call, phase) and `next` starts where `first` ends. A Codex
 * reasoning summary is cumulative and each delta's replaces the last, so the merged event carries the later one.
 *
 * @param first - The earlier event.
 * @param next - The event right after it.
 * @returns The merged event, or `undefined` when the two must stay separate.
 * @internal
 */
export const mergeLiveEvents = <Event extends { readonly type: string }>(
  first: Event,
  next: Event,
): Event | undefined => {
  if (!isDelta(first) || !isDelta(next) || first.type !== next.type) {
    return undefined;
  }
  const keys = new Set([...Object.keys(first), ...Object.keys(next)]);
  for (const key of keys) {
    if (!mergedFields.has(key) && (first as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
      return undefined;
    }
  }
  if (first.offset === undefined ? next.offset !== undefined : next.offset !== first.offset + first.delta.length) {
    return undefined;
  }
  return {
    ...first,
    ...next,
    delta: first.delta + next.delta,
    ...(first.offset === undefined ? {} : { offset: first.offset }),
  };
};

/** One subscriber's conflation buffer. @internal */
export type LiveConflater<Event> = {
  /** Buffered entries, for the subscriber's overflow bound. */
  readonly size: number;
  /** Take one event, in order. It is delivered at once after a quiet window, otherwise within one window. */
  push(event: Event): void;
  /** The sink can take events again (a stream's `pull`): deliver what has accumulated. */
  ready(): void;
  /** Deliver everything buffered now, whether or not the sink has caught up, and stop the window's timer. */
  flush(): void;
  /** Drop what is buffered and stop the timer. */
  close(): void;
};

/** What a conflater delivers to and times on. @internal */
export type LiveConflaterOptions<Event> = Readonly<{
  /** Receive one event. Called in order, synchronously, within a delivery. */
  deliver: (event: Event) => void;
  /** Whether the sink can take events now; while it cannot, events merge in the buffer. Defaults to always. */
  canDeliver?: (() => boolean) | undefined;
  /** A monotonic clock in milliseconds. Defaults to `performance.now`. */
  now?: (() => number) | undefined;
}>;

/**
 * Create one subscriber's conflation buffer.
 *
 * The window opens when a delta is delivered: the first delta after {@link liveConflationMilliseconds} of quiet goes at
 * once, so time to first token is unchanged, and the deltas after it inside the window are merged and delivered when
 * it ends. A `*-start`, `*-end` or tool event that arrives while no window is open goes at once as well.
 *
 * @param options - The sink and the clock.
 * @returns The buffer.
 * @internal
 */
export const createLiveConflater = <Event extends { readonly type: string }>(
  options: LiveConflaterOptions<Event>,
): LiveConflater<Event> => {
  const now = options.now ?? (() => performance.now());
  const canDeliver = options.canDeliver ?? (() => true);
  let pending: Event[] = [];
  let lastDeltaAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stopTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const deliver = (force = false): void => {
    if (pending.length === 0 || (!force && !canDeliver())) {
      return;
    }
    const batch = pending;
    pending = [];
    if (batch.some((event) => isDelta(event))) {
      lastDeltaAt = now();
    }
    for (const event of batch) {
      options.deliver(event);
    }
  };

  const arm = (windowRemainder: number): void => {
    timer = setTimeout(() => {
      timer = undefined;
      deliver();
    }, windowRemainder);
    /* A window never holds a Node process open. */
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    push: (event) => {
      if (closed) {
        return;
      }
      const last = pending.at(-1);
      const merged = last === undefined ? undefined : mergeLiveEvents(last, event);
      if (merged === undefined) {
        pending.push(event);
      } else {
        pending[pending.length - 1] = merged;
      }
      if (timer !== undefined) {
        return;
      }
      const remaining = lastDeltaAt + liveConflationMilliseconds - now();
      if (remaining <= 0 || !isDelta(event)) {
        deliver();
        return;
      }
      arm(remaining);
    },
    ready: () => {
      if (!closed && timer === undefined) {
        deliver();
      }
    },
    flush: () => {
      stopTimer();
      deliver(true);
    },
    close: () => {
      closed = true;
      stopTimer();
      pending = [];
    },
    get size() {
      return pending.length;
    },
  };
};
