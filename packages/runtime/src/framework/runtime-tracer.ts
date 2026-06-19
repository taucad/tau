import type { SpanHandle, RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

type SpanAttributes = Record<string, string | number | boolean>;

/**
 * Lightweight span tracker for the runtime worker.
 *
 * Follows the OpenTelemetry span model (parent-child via explicit IDs)
 * without any SDK dependency. Emits `performance.measure()` calls enriched
 * with `spanId`/`parentSpanId` for hierarchy reconstruction and Chrome
 * DevTools Performance Extensibility API metadata for custom track display.
 *
 * All heavy lifting happens here on the worker side — the client simply
 * reads `detail.spanId` / `detail.parentSpanId` to build a tree.
 */
export class RuntimeTracer implements RuntimeSpanTracer {
  private nextId = 0;
  private epoch = 0;
  private activeSpanId: string | undefined;

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
    const markName = `tau:span:${spanEpoch}:${id}`;
    performance.mark(markName);
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

        try {
          performance.measure(name, { start: markName, detail });
        } catch {
          // Mark was cleared by a concurrent reset -- safe to ignore
        }

        this.activeSpanId = parentId;
      },
    };
  }

  /** Resets all tracer state and clears associated performance marks and measures. */
  public reset(): void {
    this.epoch++;
    this.activeSpanId = undefined;
    performance.clearMarks();
    performance.clearMeasures();
  }
}
