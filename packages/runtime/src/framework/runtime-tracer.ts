import type { SpanHandle, RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

type SpanAttributes = Record<string, string | number | boolean>;

type SpanFrame = {
  id: string;
  parent: SpanFrame | undefined;
  ended: boolean;
};

/**
 * Lightweight span tracker for the runtime worker.
 *
 * Follows the OpenTelemetry span model (parent-child via explicit IDs)
 * without any SDK dependency. Emits completed entries directly to the worker
 * telemetry batcher. Optional Performance Timeline mirroring exists only for
 * explicit Chrome DevTools profiling sessions.
 *
 * All heavy lifting happens here on the worker side — the client simply
 * reads `detail.spanId` / `detail.parentSpanId` to build a tree.
 */
export class RuntimeTracer implements RuntimeSpanTracer {
  private nextId = 0;
  private epoch = 0;
  private activeSpan: SpanFrame | undefined;
  private entrySink: ((entry: TelemetryEntry) => void) | undefined;
  private devtoolsTimelineEnabled = false;

  /** Route completed spans directly to the worker telemetry batcher. */
  public setEntrySink(sink: ((entry: TelemetryEntry) => void) | undefined): void {
    this.entrySink = sink;
  }

  /** Mirror spans into the Performance Timeline for explicit DevTools profiling. */
  public setDevtoolsTimelineEnabled(enabled: boolean): void {
    this.devtoolsTimelineEnabled = enabled;
  }

  /**
   * Starts a new tracing span, optionally nested under the currently active span.
   *
   * @param name - the span name used for the performance mark
   * @param attributes - optional key-value attributes attached to the span
   * @returns a handle with an `end()` method to close the span
   */
  public startSpan(name: string, attributes?: SpanAttributes): SpanHandle {
    const id = String(this.nextId++);
    const parentId = this.activeSpan?.id;
    const frame: SpanFrame = { id, parent: this.activeSpan, ended: false };
    const spanEpoch = this.epoch;
    const startTime = performance.now();
    this.activeSpan = frame;

    return {
      end: (endAttributes?: SpanAttributes) => {
        if (frame.ended || spanEpoch !== this.epoch) {
          return;
        }
        frame.ended = true;
        // Overlapping scopes can finish out of order. Keep a live descendant,
        // but never restore a completed ancestor, including during sink callbacks.
        while (this.activeSpan?.ended) {
          this.activeSpan = this.activeSpan.parent;
        }

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
              /* The `devtools` track payload is only meaningful as `performance.measure`
               * detail, and every entry consumer strips it. Building it per span cost
               * 57 % of span CPU and 45 % of the bytes on the wire, so it is built here
               * and nowhere else. */
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
      },
    };
  }

  /** Reset span ancestry without mutating the realm-wide Performance Timeline. */
  public reset(): void {
    this.epoch++;
    this.activeSpan = undefined;
  }
}
