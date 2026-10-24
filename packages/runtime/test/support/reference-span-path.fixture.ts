/**
 * Frozen reference copies of the span path as it stood before the operation-root and open-span-stack repairs:
 * `RuntimeTracer` with its single `activeSpanId` slot and the unbounded `WorkerTelemetryCollector`.
 *
 * The tracer bench measures the live classes against these in the same process, interleaved, so a regression on the
 * span path reads as a ratio to a fixed baseline instead of an absolute number that moves with the runner. Do not edit
 * these classes to follow the live ones: the baseline is only meaningful if it never changes.
 */

import type { TelemetryEntry } from '#types/runtime-wire.types.js';

type SpanAttributes = Record<string, string | number | boolean>;

/** The span tracer before the open-span stack. */
export class ReferenceRuntimeTracer {
  private nextId = 0;
  private epoch = 0;
  private activeSpanId: string | undefined;
  private entrySink: ((entry: TelemetryEntry) => void) | undefined;
  private devtoolsTimelineEnabled = false;

  /**
   * Route completed spans to a sink.
   *
   * @param sink - Receives every completed span.
   */
  public setEntrySink(sink: ((entry: TelemetryEntry) => void) | undefined): void {
    this.entrySink = sink;
  }

  /**
   * Mirror spans into the Performance Timeline.
   *
   * @param enabled - Whether to mirror.
   */
  public setDevtoolsTimelineEnabled(enabled: boolean): void {
    this.devtoolsTimelineEnabled = enabled;
  }

  /**
   * Open a span nested under the active one.
   *
   * @param name - The span name.
   * @param attributes - Scalar attributes.
   * @returns A handle that ends the span.
   */
  public startSpan(name: string, attributes?: SpanAttributes): { end: (endAttributes?: SpanAttributes) => void } {
    const id = String(this.nextId++);
    const parentId = this.activeSpanId;
    const spanEpoch = this.epoch;
    const startTime = performance.now();
    let ended = false;
    this.activeSpanId = id;

    return {
      end: (endAttributes?: SpanAttributes) => {
        if (ended || spanEpoch !== this.epoch) {
          return;
        }
        ended = true;

        const mergedAttributes = {
          ...attributes,
          ...endAttributes,
        };
        const detail: Record<string, unknown> = {
          spanId: id,
          parentSpanId: parentId,
          ...mergedAttributes,
        };

        const duration = performance.now() - startTime;
        try {
          this.entrySink?.({
            name,
            startTime,
            duration,
            detail,
            workerTimeOrigin: performance.timeOrigin,
          });
        } catch {
          // Telemetry is observational and must not change runtime outcomes.
        }

        if (this.devtoolsTimelineEnabled) {
          try {
            performance.measure(`tau:${name}:${spanEpoch}:${id}`, {
              start: startTime,
              duration,
              detail: {
                ...detail,
                devtools: {
                  dataType: 'track-entry',
                  track: 'Kernel Pipeline',
                  trackGroup: 'Tau',
                  properties: Object.entries(mergedAttributes).map(([k, v]) => [k, String(v)]),
                },
              },
            });
          } catch {
            // DevTools mirroring is optional and must not change runtime outcomes.
          }
        }

        this.activeSpanId = parentId;
      },
    };
  }

  /** Reset span ancestry. */
  public reset(): void {
    this.epoch++;
    this.activeSpanId = undefined;
  }
}

/** The span collector before the pending bound. */
export class ReferenceWorkerTelemetryCollector {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly send: (entries: TelemetryEntry[]) => void;
  private readonly pending: TelemetryEntry[] = [];
  private disposed = false;

  /**
   * Collect spans for an explicit flush.
   *
   * @param send - Receives each flushed batch.
   */
  public constructor(send: (entries: TelemetryEntry[]) => void) {
    this.send = send;
  }

  /**
   * Add one completed span to the next batch.
   *
   * @param entry - The completed span.
   */
  public collect(entry: TelemetryEntry): void {
    if (!this.disposed) {
      this.pending.push(entry);
    }
  }

  /** Send all pending entries. No-op when empty. */
  public flush(): void {
    if (this.pending.length === 0) {
      return;
    }

    const batch = this.pending.splice(0);
    this.send(batch);
  }

  /** Flush remaining entries and reject subsequent collection. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.flush();
    this.disposed = true;
  }
}
