/**
 * Worker Telemetry System
 *
 * Collects completed runtime spans directly and flushes them on demand.
 * The main thread aggregates data from all workers with timestamp correlation.
 *
 * Flushing is explicit only -- the dispatcher calls flush() after each render
 * and export operation. No timers are used, so the collector adds zero overhead
 * when idle and does not keep the event loop alive.
 *
 * See docs/policy/runtime-telemetry-policy.md for the full telemetry policy.
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
 * Kernel-authored:     {kernelName}.{operation} (e.g., replicad.wasm-init, replicad.run-main, openrscad.export-3d)
 */

import type { TelemetryEntry } from '#types/runtime-protocol.types.js';

/**
 * Collects runtime telemetry entries in a worker and flushes them in batches.
 * No timers -- flush is called explicitly by the framework after each operation.
 */
export class WorkerTelemetryCollector {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly send: (entries: TelemetryEntry[]) => void;
  private readonly pending: TelemetryEntry[] = [];
  private disposed = false;

  /**
   * Create a new telemetry collector wired to the given send callback.
   *
   * @param send - callback that transmits batched entries to the main thread
   */
  public constructor(send: (entries: TelemetryEntry[]) => void) {
    this.send = send;
  }

  /** Add one completed span to the next explicit batch. */
  public collect(entry: TelemetryEntry): void {
    if (!this.disposed) {
      this.pending.push(entry);
    }
  }

  /** Send all pending entries to the main thread. No-op when empty. */
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

/**
 * Convert a worker-relative timestamp to an absolute timestamp
 * for cross-worker correlation.
 *
 * @param entry - performance entry with worker-relative timing
 * @returns absolute timestamp (workerTimeOrigin + startTime)
 */
export function toAbsoluteTime(entry: TelemetryEntry): number {
  return entry.workerTimeOrigin + entry.startTime;
}
