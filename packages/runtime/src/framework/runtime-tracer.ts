import type { SpanHandle, RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

type SpanAttributes = Record<string, string | number | boolean>;

/**
 * Lightweight span tracker for the runtime worker.
 *
 * Follows the OpenTelemetry span model (parent-child via explicit IDs)
 * without any SDK dependency. Emits completed entries directly to the worker
 * telemetry batcher. Optional Performance Timeline mirroring exists only for
 * explicit Chrome DevTools profiling sessions.
 *
 * Ancestry is an open-span stack: a new span's parent is the innermost span
 * that is still open. A span that ends pops itself and any descendant that is
 * still open above it, so a child that outlives its parent never leaves the
 * next sibling parented to a span that already ended. Operations open their
 * root span first, so a span started after an earlier sibling ended still
 * lands under that operation's root.
 *
 * All heavy lifting happens here on the worker side — the client simply
 * reads `detail.spanId` / `detail.parentSpanId` to build a tree.
 */
export class RuntimeTracer implements RuntimeSpanTracer {
  private nextId = 0;
  private epoch = 0;
  /** Ids of the spans that are open, outermost first. The only per-span ancestry state. */
  private readonly open: string[] = [];
  private entrySink: ((entry: TelemetryEntry) => void) | undefined;
  private droppedSink: (() => void) | undefined;
  private devtoolsTimelineEnabled = false;

  /**
   * Route completed spans directly to the worker telemetry batcher.
   *
   * @param sink - Receives every completed span of the current epoch.
   * @param onDropped - Told about each span that ended after {@link RuntimeTracer.reset}, so the loss is counted.
   */
  public setEntrySink(sink: ((entry: TelemetryEntry) => void) | undefined, onDropped?: () => void): void {
    this.entrySink = sink;
    this.droppedSink = onDropped;
  }

  /** Mirror spans into the Performance Timeline for explicit DevTools profiling. */
  public setDevtoolsTimelineEnabled(enabled: boolean): void {
    this.devtoolsTimelineEnabled = enabled;
  }

  /**
   * Starts a new tracing span, nested under the innermost span that is still open.
   *
   * @param name - the span name used for the performance mark
   * @param attributes - optional key-value attributes attached to the span
   * @returns a handle with an `end()` method to close the span
   */
  public startSpan(name: string, attributes?: SpanAttributes): SpanHandle {
    const id = String(this.nextId++);
    const { open } = this;
    const parentId = open.at(-1);
    const spanEpoch = this.epoch;
    const startTime = performance.now();
    let ended = false;
    open.push(id);

    return {
      end: (endAttributes?: SpanAttributes) => {
        if (ended) {
          return;
        }
        ended = true;
        /* Pop this span and every still-open descendant above it. In the common
         * case this span is on top and the pop is one array operation. */
        const stack = this.open;
        if (stack.at(-1) === id) {
          stack.pop();
        } else {
          const at = stack.lastIndexOf(id);
          if (at !== -1) {
            stack.length = at;
          }
        }
        if (spanEpoch !== this.epoch) {
          try {
            this.droppedSink?.();
          } catch {
            // Telemetry is observational and must not change runtime outcomes.
          }
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

  /**
   * Start a new span epoch without mutating the realm-wide Performance Timeline.
   *
   * Every span still open belongs to the previous epoch: it is forgotten as a
   * parent, and if it ends later it is counted through the dropped sink rather
   * than discarded silently.
   */
  public reset(): void {
    this.epoch++;
    this.open.length = 0;
  }
}
