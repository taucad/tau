/**
 * Worker Telemetry System
 *
 * Collects performance.mark()/measure() entries from within a worker using
 * PerformanceObserver and flushes them on demand via explicit flush() calls.
 * The main thread aggregates data from all workers with timestamp correlation.
 *
 * Flushing is explicit only -- the dispatcher calls flush() after each render
 * and export operation. No timers are used, so the collector adds zero overhead
 * when idle and does not keep the event loop alive.
 *
 * See docs/policy/kernel-telemetry-policy.md for the full telemetry policy.
 *
 * Naming convention: {subsystem}.{operation} (OTel-inspired)
 *
 * Root spans:          kernel.bootstrap, kernel.render, kernel.export
 * Framework lifecycle: kernel.init, kernel.select, kernel.detect-import, kernel.compute, kernel.extract-params
 * Framework infra:     kernel.bundle, kernel.execute, kernel.bundler-init, kernel.resolve-deps, kernel.load-middleware
 * Dependency pipeline: deps.discover, deps.read, deps.hash, deps.content-hash
 * Filesystem:          fs.read, fs.readBatch, fs.exists, fs.readdir
 * WASM:                wasm.compile
 * Middleware:           middleware.wrap({name})
 * Kernel-authored:     {kernelName}.{operation} (e.g., replicad.wasm-init, replicad.run-main, openscad.call-main)
 */

import type { PerformanceEntryData } from '#types/kernel-protocol.types.js';

/**
 * Collects performance measure entries in a worker and flushes them in batches.
 * Zero overhead when no measures are recorded (observer is passive).
 * No timers -- flush is called explicitly by the framework after each operation.
 */
export class WorkerTelemetryCollector {
  // eslint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly send: (entries: PerformanceEntryData[]) => void;
  private readonly pending: PerformanceEntryData[] = [];
  private readonly observer: PerformanceObserver;

  public constructor(send: (entries: PerformanceEntryData[]) => void) {
    this.send = send;
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.pending.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          detail: (entry as PerformanceMeasure).detail as Record<string, unknown> | undefined,
          workerTimeOrigin: performance.timeOrigin,
        });
      }
    });
    this.observer.observe({ type: 'measure', buffered: true });
  }

  /** Send all pending entries to the main thread. No-op when empty. */
  public flush(): void {
    if (this.pending.length === 0) {
      return;
    }

    const batch = this.pending.splice(0);
    this.send(batch);
  }

  /** Disconnect the observer and flush any remaining entries. */
  public dispose(): void {
    this.observer.disconnect();
    this.flush();
  }
}

/**
 * Convert a worker-relative timestamp to an absolute timestamp
 * for cross-worker correlation.
 */
export function toAbsoluteTime(entry: PerformanceEntryData): number {
  return entry.workerTimeOrigin + entry.startTime;
}
