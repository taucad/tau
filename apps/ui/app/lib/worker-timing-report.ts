/**
 * How the file-manager worker reports its own timings: telemetry span totals,
 * one console line a person can read without opening the worker in DevTools,
 * and the bridge's pending-request gauge.
 *
 * @module
 */
import { formatWorkerTimingSummary, workerTimingSpans, workerTimings } from '@taucad/filesystem';
import type { WorkerTimingSpan, WorkerTimingSummary, WorkerTimings } from '@taucad/filesystem';

/**
 * Total milliseconds per span, as the ingest's `spans` detail carries them; a span that never ran is absent.
 *
 * @param summary - One window's summary.
 * @returns The totals.
 */
export const workerSpanTotals = (summary: WorkerTimingSummary): Partial<Record<WorkerTimingSpan, number>> =>
  Object.fromEntries(
    workerTimingSpans.flatMap((span) => {
      const row = summary.spans[span];
      return row === undefined ? [] : [[span, row.totalMilliseconds]];
    }),
  );

/**
 * Summarise a window that ran `durationMilliseconds` up to now.
 *
 * @param durationMilliseconds - How long the window was.
 * @param timings - The recorder; the worker's own by default.
 * @returns The window's summary.
 */
export const summarizeLast = (
  durationMilliseconds: number,
  timings: WorkerTimings = workerTimings,
): WorkerTimingSummary => timings.summarize(timings.now() - Math.max(0, durationMilliseconds));

/**
 * Log one window's summary as a single `console.info` line.
 *
 * @param label - What the window was ("fill of 439 objects", "apply of 439 paths").
 * @param summary - The window.
 */
export const logWorkerTimings = (label: string, summary: WorkerTimingSummary): void => {
  console.info(formatWorkerTimingSummary(label, summary));
};

/**
 * Count each promise-returning handler call as pending on the `bridge.pending` gauge until it settles.
 *
 * Only calls that return a promise are counted; a synchronous answer (a stream,
 * a watch disposer) passes through untouched, as does every non-function property.
 *
 * @param handlers - The handlers a bridge server answers from.
 * @param timings - The recorder; the worker's own by default.
 * @returns The same handlers, counted.
 */
export const withPendingGauge = <Handlers extends Record<string, unknown>>(
  handlers: Handlers,
  timings: Pick<WorkerTimings, 'gauge'> = workerTimings,
): Handlers =>
  new Proxy(handlers, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (...arguments_: unknown[]): unknown => {
        const answer: unknown = Reflect.apply(value, target, arguments_);
        if (!(answer instanceof Promise)) {
          return answer;
        }
        timings.gauge('bridge.pending', 1);
        // async-iife: bootstrap -- the caller awaits the original promise; this only observes when it settles.
        void (async (): Promise<void> => {
          try {
            await answer;
          } catch {
            /* The caller handles the rejection; this copy only counts it as settled. */
          } finally {
            timings.gauge('bridge.pending', -1);
          }
        })();
        return answer;
      };
    },
  });
