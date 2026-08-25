import type { SpanHandle, RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { TelemetryEntry } from '#types/runtime-protocol.types.js';

type SpanAttributes = Record<string, string | number | boolean>;

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
  private activeSpanId: string | undefined;
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
    const parentId = this.activeSpanId;
    const spanEpoch = this.epoch;
    const startTime = performance.now();
    this.activeSpanId = id;

    return {
      end: (endAttributes?: SpanAttributes) => {
        if (spanEpoch !== this.epoch) {
          return;
        }

        const mergedAttributes = {
          ...attributes,
          ...endAttributes,
        };
        const detail: Record<string, unknown> = {
          spanId: id,
          parentSpanId: parentId,
          ...mergedAttributes,
          devtools: {
            dataType: 'track-entry',
            track: 'Kernel Pipeline',
            trackGroup: 'Tau',
            properties: Object.entries(mergedAttributes).map(([k, v]) => [k, String(v)]),
          },
        };

        const duration = performance.now() - startTime;
        this.entrySink?.({
          name,
          startTime,
          duration,
          detail,
          workerTimeOrigin: performance.timeOrigin,
        });

        if (this.devtoolsTimelineEnabled) {
          performance.measure(`tau:${name}:${spanEpoch}:${id}`, {
            start: startTime,
            duration,
            detail,
          });
        }

        this.activeSpanId = parentId;
      },
    };
  }

  /** Reset span ancestry without mutating the realm-wide Performance Timeline. */
  public reset(): void {
    this.epoch++;
    this.activeSpanId = undefined;
  }
}
