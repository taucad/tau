/**
 * Worker Telemetry System
 *
 * Collects completed runtime spans directly and flushes them on demand.
 * The main thread aggregates data from all workers with timestamp correlation.
 *
 * Flushing is explicit only -- the dispatcher calls flush() after every terminal
 * reply. No timers are used, so the collector adds zero overhead when idle and
 * does not keep the event loop alive.
 *
 * See docs/policy/runtime-telemetry-policy.md for the full telemetry policy.
 *
 * Naming convention: {subsystem}.{operation} (OTel-inspired)
 *
 * Root spans:          kernel.bootstrap, and one per operation: kernel.describe, kernel.evaluate,
 *                      kernel.render, kernel.export, kernel.transcode (each carries `operation.id`)
 * Framework lifecycle: kernel.init, kernel.select, kernel.detect-import, kernel.compute, kernel.extract-params
 * Framework infra:     kernel.bundle, kernel.execute, kernel.bundler-init, kernel.resolve-deps, kernel.load-middleware
 * Dependency pipeline: deps.discover, deps.read, deps.hash, deps.content-hash
 * Filesystem:          fs.read, fs.readBatch, fs.exists, fs.readdir
 * WASM:                wasm.compile
 * Middleware:           middleware.wrap({name})
 * Kernel-authored:     {kernelName}.{operation} (e.g., replicad.wasm-init, replicad.run-main, openrscad.export-3d)
 */

import { randomUuid } from '@taucad/utils/id';

import { isWebWorker } from '#framework/environment.js';
import type { TelemetryEntry, TelemetryOrigin } from '#types/runtime-wire.types.js';

/**
 * Name this realm's process role.
 *
 * Electron stamps the role on `process.type` (`browser` for main, plus
 * `renderer` and `utility`), which is the only place the desktop's three realms
 * are distinguishable without a wire hop.
 *
 * @returns The producer label for {@link createTelemetryOrigin}.
 */
function producerLabel(): string {
  const { process: hostProcess } = globalThis as {
    process?: { type?: string; versions?: { node?: string } };
  };
  const electronRole = hostProcess?.type;
  if (electronRole !== undefined && electronRole !== '') {
    return electronRole === 'browser' ? 'main' : electronRole;
  }
  if (hostProcess?.versions?.node !== undefined) {
    return 'node';
  }
  return isWebWorker() ? 'worker' : 'browser';
}

/**
 * Mint this realm's producer identity. Called once where the dispatcher is
 * wired, never per span.
 *
 * @returns A label plus a nonce that no other producer shares.
 */
export function createTelemetryOrigin(): TelemetryOrigin {
  const label = producerLabel();
  const { process: hostProcess } = globalThis as { process?: { pid?: number } };
  const hostPid = hostProcess?.pid;
  const instance = randomUuid();
  return {
    label,
    instance:
      label === 'utility' && typeof hostPid === 'number' && Number.isSafeInteger(hostPid) && hostPid > 0
        ? `pid-${String(hostPid)}-${instance}`
        : instance,
  };
}

/**
 * Anchor this realm's monotonic clock to the wall clock.
 *
 * Taken per flush rather than once at realm start: `performance.timeOrigin` is
 * never re-anchored, so realms that started on opposite sides of a system
 * suspend or an NTP step disagree by that step and merge into a silently wrong
 * trace.
 *
 * @returns Absolute Unix-epoch milliseconds of `performance.now()` zero.
 */
export function telemetryEpoch(): number {
  return Date.now() - performance.now();
}

/** Pending spans a collector holds before it refuses more and counts them as dropped. */
export const workerTelemetryCollectorLimit = 10_000;

/** At most this many dropped operation roots are remembered per batch. */
const droppedRootLimit = 64;

/** What one collector flush sends: the spans, and what was lost since the previous flush. */
export type WorkerTelemetryFlush = Readonly<{
  entries: TelemetryEntry[];
  /** Spans refused since the previous flush (the bound, or a span that ended after a tracer reset). */
  dropped: number;
  /**
   * Operation roots among the dropped spans, as span id → `operation.id`, so a sink can still put the
   * root's surviving children into the trace of their operation. Absent when no root was dropped.
   */
  droppedRoots?: Readonly<Record<string, string>>;
}>;

/**
 * Collects runtime telemetry entries in a worker and flushes them in batches.
 * No timers -- flush is called explicitly by the framework after each operation.
 *
 * The queue is bounded: once {@link workerTelemetryCollectorLimit} spans are
 * pending, further spans are refused and counted, and the count rides the next
 * batch, so a stalled dispatcher costs a bounded amount of memory and the loss
 * is reported where it happens.
 */
export class WorkerTelemetryCollector {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly send: (flush: WorkerTelemetryFlush) => void;
  private readonly limit: number;
  private readonly pending: TelemetryEntry[] = [];
  private dropped = 0;
  private droppedRoots: Record<string, string> | undefined;
  private disposed = false;

  /**
   * Create a new telemetry collector wired to the given send callback.
   *
   * @param send - callback that transmits batched entries to the main thread
   * @param limit - pending spans held before further spans are dropped and counted
   */
  public constructor(send: (flush: WorkerTelemetryFlush) => void, limit = workerTelemetryCollectorLimit) {
    this.send = send;
    this.limit = limit;
  }

  /** Add one completed span to the next explicit batch, or count it when the queue is full. */
  public collect(entry: TelemetryEntry): void {
    if (this.disposed) {
      return;
    }
    if (this.pending.length >= this.limit) {
      this.refuse(entry);
      return;
    }
    this.pending.push(entry);
  }

  /** Count one span that was lost before it reached {@link WorkerTelemetryCollector.collect}. */
  public noteDropped(): void {
    if (!this.disposed) {
      this.dropped++;
    }
  }

  /** Send all pending entries and the dropped count to the main thread. No-op when nothing was collected or lost. */
  public flush(): void {
    if (this.pending.length === 0 && this.dropped === 0) {
      return;
    }

    const entries = this.pending.splice(0);
    const { dropped, droppedRoots } = this;
    this.dropped = 0;
    this.droppedRoots = undefined;
    this.send(droppedRoots === undefined ? { entries, dropped } : { entries, dropped, droppedRoots });
  }

  /** Flush remaining entries and reject subsequent collection. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.flush();
    this.disposed = true;
  }

  /* Off the common path: runs only while the queue is full. */
  private refuse(entry: TelemetryEntry): void {
    this.dropped++;
    const operationId = entry.detail?.['operation.id'];
    const spanId = entry.detail?.['spanId'];
    if (typeof operationId !== 'string' || typeof spanId !== 'string') {
      return;
    }
    this.droppedRoots ??= {};
    if (Object.keys(this.droppedRoots).length < droppedRootLimit) {
      this.droppedRoots[spanId] = operationId;
    }
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
