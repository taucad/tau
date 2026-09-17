/**
 * The renderer's half of the span pipeline (D8, D21).
 *
 * Main-thread cost was outside the trace entirely: the worker's spans reached a
 * JSONL file while the frame that presented their geometry left no record. The
 * renderer produces the same `TelemetrySpanRecord` the worker does, under its
 * own producer identity, and buffers it — a browser tab has no host-visible
 * file to write, so the trace leaves through a manual export (OQ1's ruling in
 * D8: buffer and offer an export, nothing posted anywhere).
 *
 * The observers here are out-of-band by construction: nothing on the frame path
 * calls into this module except one `record` per presented model, and Long
 * Animation Frames are reported by the platform only for frames that already
 * blocked for 50 ms or more. I7's "no observer" clause scopes to the span
 * *producer* path — the worker's tracer and collector — not to this.
 */

import { randomUuid } from '@taucad/utils/id';
import type { TelemetryOrigin, TelemetrySpanRecord } from '@taucad/runtime';

/**
 * Renderer spans retained before the oldest are dropped.
 *
 * A Long Animation Frame is at least 50 ms, so this is minutes of a janky
 * session; the export is a manual act and nothing here is ever flushed
 * automatically, which is exactly why it must not grow without bound (I6).
 */
const maxRendererSpans = 500;

/** Minted once per page: `spanId` restarts at 0 in every realm, so identity is this plus the id (I5). */
const rendererOrigin: TelemetryOrigin = { label: 'renderer', instance: randomUuid() };

const spans: TelemetrySpanRecord[] = [];
let nextSpanId = 0;

/** One renderer measurement, in this realm's `performance.now()` clock. */
export type RendererSpanInput = {
  /** Milliseconds since this realm's time origin. */
  readonly startTime: number;
  /** Milliseconds. */
  readonly duration: number;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
};

/**
 * Retain one renderer span.
 *
 * @param name - Span name, `{subsystem}.{operation}` as the telemetry policy requires.
 * @param input - When it happened, how long it took, and what describes it.
 */
export const recordRendererSpan = (name: string, input: RendererSpanInput): void => {
  spans.push({
    name,
    startTime: input.startTime,
    duration: input.duration,
    workerTimeOrigin: performance.timeOrigin,
    origin: rendererOrigin,
    /* Re-anchored per record for the same reason the worker re-anchors per flush: a realm that
     * slept or saw an NTP step reconciles on this, not on a time origin taken once at start. */
    epoch: Date.now() - performance.now(),
    detail: { spanId: String(nextSpanId++), ...input.attributes },
  });
  if (spans.length > maxRendererSpans) {
    spans.splice(0, spans.length - maxRendererSpans);
  }
};

/** Every retained renderer span, oldest first. */
export const rendererSpans = (): readonly TelemetrySpanRecord[] => spans;

/** Drop every retained renderer span. Exists for tests and for a fresh export. */
export const clearRendererSpans = (): void => {
  spans.length = 0;
};

/** The shape Chromium reports for `long-animation-frame`, which TypeScript's DOM lib does not declare. */
type LongAnimationFrameEntry = PerformanceEntry & {
  readonly blockingDuration?: number;
  readonly renderStart?: number;
  readonly scripts?: readonly unknown[];
};

/**
 * Record every Long Animation Frame as a span until the returned stop is called.
 *
 * @returns An idempotent unsubscribe; a no-op where the entry type is unsupported.
 */
export const observeLongAnimationFrames = (): (() => void) => {
  if (!('PerformanceObserver' in globalThis)) {
    return () => undefined;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LongAnimationFrameEntry[]) {
      recordRendererSpan('renderer.long-animation-frame', {
        startTime: entry.startTime,
        duration: entry.duration,
        attributes: {
          blockingDuration: entry.blockingDuration ?? 0,
          scriptCount: entry.scripts?.length ?? 0,
          ...(entry.renderStart === undefined ? {} : { renderDelay: entry.renderStart - entry.startTime }),
        },
      });
    }
  });
  try {
    /* `buffered` collects the frames that blocked before this ran, which on a cold open is where
     * the interesting ones are. Only Chromium reports the type; elsewhere the observe throws and
     * the renderer simply contributes the spans it does have. */
    observer.observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    return () => undefined;
  }
  return () => {
    observer.disconnect();
  };
};

/**
 * Serialize spans as the JSONL the desktop sink writes, one span per line.
 *
 * @param records - Spans from any producer, in any order.
 * @returns The file body, ordered on the absolute clock so producers interleave correctly.
 */
export const telemetryJsonl = (records: readonly TelemetrySpanRecord[]): string =>
  [...records]
    .sort((left, right) => left.epoch + left.startTime - (right.epoch + right.startTime))
    .map((record) => JSON.stringify(record))
    .join('\n');
