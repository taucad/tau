/* oxlint-disable promise/prefer-await-to-then, promise/prefer-catch -- Subscriber settlement races independent abort handlers; the serial admission barrier must settle after its predecessor. */
import { plateForBedType } from '#components/printer/printer-plates.js';
import { sha256Bytes } from '@taucad/utils/hash';
import type { PrinterProgram } from '#components/printer/printer-program.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';

export type PrinterPreparationResult =
  | Readonly<{
      kind: 'ready';
      value: PrinterProgram;
      preparationDuration: number;
      stageDurations?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      kind: 'refused';
      summary: SliceSummary;
      preparationDuration: number;
      stageDurations?: Readonly<Record<string, number>>;
    }>;
type WorkerResponse =
  | PrinterPreparationResult
  | Readonly<{ kind: 'error'; name: string; message: string; code?: string }>;
type Request = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  kind: PrinterFileKind;
  signal: AbortSignal;
  retain?: boolean;
}>;
type Task = {
  key: string;
  controller: AbortController;
  subscribers: number;
  result: Promise<PrinterPreparationResult>;
};
const byteBudget = 192 * 1024 * 1024;
const sourceBudget = 256 * 1024 * 1024;

/** One cancellable job; the worker relinquishes final arrays to the application owner. */
const createWorkerExecutor = (): ((request: Request) => Promise<PrinterPreparationResult>) & {
  dispose: () => void;
} => {
  let residentWorker: Worker | undefined;
  let cancelCurrent: (() => void) | undefined;
  const dispose = (): void => {
    cancelCurrent?.();
    residentWorker?.terminate();
    residentWorker = undefined;
  };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', dispose, { once: true });
  }
  return Object.assign(
    async (request: Request): Promise<PrinterPreparationResult> =>
      new Promise((resolve, reject) => {
        residentWorker ??= new Worker(new URL('printer-preparation.worker.ts', import.meta.url), {
          type: 'module',
          name: 'tau-printer-preparation',
        });
        const worker = residentWorker;
        const finish = (): void => {
          cancelCurrent = undefined;
          request.signal.removeEventListener('abort', abort);
          worker.removeEventListener('message', receive);
          worker.removeEventListener('error', failed);
        };
        const abort = (): void => {
          finish();
          worker.terminate();
          residentWorker = undefined;
          reject(
            request.signal.reason instanceof Error
              ? request.signal.reason
              : new DOMException('Toolpath preparation cancelled.', 'AbortError'),
          );
        };
        const receive = (event: MessageEvent<WorkerResponse>): void => {
          finish();
          if (event.data.kind === 'error') {
            reject(Object.assign(new Error(event.data.message), { name: event.data.name, code: event.data.code }));
          } else {
            const result = event.data;
            resolve(
              result.kind === 'ready'
                ? { ...result, value: { ...result.value, slicedPlate: plateForBedType(result.value.recordedBedType) } }
                : result,
            );
          }
        };
        const failed = (event: ErrorEvent): void => {
          finish();
          worker.terminate();
          residentWorker = undefined;
          reject(new Error(event.message || 'Toolpath preparation worker failed.'));
        };
        cancelCurrent = abort;
        worker.addEventListener('message', receive);
        worker.addEventListener('error', failed);
        request.signal.addEventListener('abort', abort, { once: true });
        if (request.signal.aborted) {
          abort();
          return;
        }
        // File authority/callers own their source. Transfer only this job's snapshot, never their shared buffer.
        const { bytes } = request;
        worker.postMessage({ bytes, kind: request.kind }, [bytes.buffer]);
      }),
    { dispose },
  );
};

/** Portable JS hashing stays off the UI thread on insecure LAN origins too. */
const hashSnapshot = async (bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<string> => {
  const { subtle } = globalThis.crypto as { subtle?: SubtleCrypto };
  if (subtle) {
    return sha256Bytes(bytes);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('printer-preparation.worker.ts', import.meta.url), { type: 'module' });
    const finish = (): void => {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = (): void => {
      finish();
      reject(new DOMException('Toolpath hash cancelled.', 'AbortError'));
    };
    worker.addEventListener(
      'message',
      (event: MessageEvent<{ digest: string }>) => {
        finish();
        resolve(event.data.digest);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (event) => {
        finish();
        reject(new Error(event.message));
      },
      { once: true },
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    // Retain the snapshot for preparation; the hash worker receives an isolated copy.
    worker.postMessage({ bytes, kind: 'hash' });
  });
};

const residentBytes = (result: PrinterPreparationResult): number => {
  if (result.kind !== 'ready') {
    return 4096;
  }
  const { program } = result.value;
  let bytes = 0;
  for (const value of [...Object.values(program), ...Object.values(program.deposition ?? {})]) {
    if (ArrayBuffer.isView(value)) {
      bytes += value.byteLength;
    }
  }
  for (const column of Object.values(result.value.eventIndex)) {
    bytes += column.times.byteLength + column.values.byteLength;
  }
  return (
    bytes +
    result.value.prefix.byteLength +
    result.value.grouping.groupOf.byteLength +
    result.value.grouping.lineIndices.reduce((total, indices) => total + indices.byteLength, 0) +
    result.value.beads.bytes +
    program.events.length * 128 +
    program.layerTable.length * 64
  );
};

export type PrinterPreparation = Readonly<{
  prepare: (request: Request) => Promise<PrinterPreparationResult & { digest: `sha256:${string}` }>;
  diagnostics: () => Readonly<{
    residentBytes: number;
    sourceBytes: number;
    activeBytes: number;
    active: number;
    completed: number;
    pending: number;
  }>;
  dispose: () => void;
}>;

/** Byte-bounded resident results and one serial CPU worker, coalesced across summary and views. */
export const createPrinterPreparation = (
  execute: ((request: Request) => Promise<PrinterPreparationResult>) & {
    dispose?: () => void;
  } = createWorkerExecutor(),
): PrinterPreparation => {
  const completed = new Map<string, { result: PrinterPreparationResult; bytes: number }>();
  const pending = new Map<string, Task>();
  const active = new Map<string, { result: PrinterPreparationResult; owners: Set<AbortSignal> }>();
  const activeBytes = (): number => {
    let total = 0;
    for (const { result, owners } of active.values()) {
      total += residentBytes(result);
      if (result.kind === 'ready') {
        // Compact instances plus shared path positions/indices owned by each GPU context.
        total +=
          owners.size *
          (result.value.beads.bytes +
            result.value.program.positions.byteLength +
            result.value.program.segmentCount * 8);
      }
    }
    return total;
  };
  const hold = (key: string, result: PrinterPreparationResult, request: Request): void => {
    if (request.retain === false || request.signal.aborted || result.kind !== 'ready') {
      return;
    }
    const retained = active.get(key) ?? { result, owners: new Set<AbortSignal>() };
    if (retained.owners.has(request.signal)) {
      return;
    }
    retained.owners.add(request.signal);
    active.set(key, retained);
    const footprint = (): number =>
      activeBytes() +
      [...completed].reduce((total, [identity, cached]) => total + (active.has(identity) ? 0 : cached.bytes), 0);
    for (const [identity, cached] of completed) {
      if (footprint() <= 512 * 1024 * 1024) {
        break;
      }
      if (!active.has(identity)) {
        completed.delete(identity);
        resident -= cached.bytes;
      }
    }
    if (footprint() > 512 * 1024 * 1024) {
      retained.owners.delete(request.signal);
      if (retained.owners.size === 0) {
        active.delete(key);
      }
      throw new RangeError('Toolpath view memory budget exceeded. Close another preview and retry.');
    }
    request.signal.addEventListener(
      'abort',
      () => {
        retained.owners.delete(request.signal);
        if (retained.owners.size === 0) {
          active.delete(key);
        }
      },
      { once: true },
    );
  };
  let resident = 0;
  let sources = 0;
  let disposed = false;
  const assertUsable = (): void => {
    if (disposed) {
      throw new Error('Printer preparation has been disposed.');
    }
  };
  let admission: Promise<void> = Promise.resolve();
  const prepare = async (request: Request): Promise<PrinterPreparationResult & { digest: `sha256:${string}` }> => {
    request.signal.throwIfAborted();
    assertUsable();
    const length = request.bytes.byteLength;
    if (sources + length > sourceBudget) {
      throw new RangeError('Toolpath preparation source budget exceeded. Close another loading preview and retry.');
    }
    sources += length;
    // Snapshot before the first await: later caller writes cannot change the verified content.
    const bytes = new Uint8Array(request.bytes);
    let digest: `sha256:${string}`;
    const hashStarted = performance.now();
    try {
      digest = `sha256:${await hashSnapshot(bytes, request.signal)}`;
      request.signal.throwIfAborted();
      assertUsable();
      performance.clearMeasures('tau.printer.hash');
      performance.measure('tau.printer.hash', {
        start: hashStarted,
        end: performance.now(),
        detail: { bytes: length },
      });
    } catch (error) {
      sources -= length;
      throw error;
    }
    const key = `${request.kind}:${digest}:toolpath-5`;
    const pinned = active.get(key);
    if (pinned) {
      sources -= length;
      hold(key, pinned.result, request);
      return { ...pinned.result, digest };
    }
    const cached = completed.get(key);
    if (cached) {
      sources -= length;
      completed.delete(key);
      completed.set(key, cached);
      hold(key, cached.result, request);
      return { ...cached.result, digest };
    }
    let task = pending.get(key);
    if (task) {
      sources -= length;
    } else {
      const controller = new AbortController();
      const previous = admission;
      let release = (): void => undefined;
      admission = new Promise<void>((resolve) => {
        release = resolve;
      });
      const result = previous.then(async () => {
        controller.signal.throwIfAborted();
        return execute({ bytes, kind: request.kind, signal: controller.signal });
      });
      task = { key, controller, subscribers: 0, result };
      pending.set(key, task);
      // A cancelled queued job still waits for its predecessor before releasing admission.
      // async-iife: bootstrap — Cache settlement owns this shared task until admission is released.
      void result
        .then((value) => {
          if (controller.signal.aborted) {
            return;
          }
          const bytes = residentBytes(value);
          if (bytes <= byteBudget) {
            while (resident + bytes > byteBudget && completed.size > 0) {
              const first = completed.entries().next().value;
              if (!first) {
                break;
              }
              completed.delete(first[0]);
              resident -= first[1].bytes;
            }
            completed.set(key, { result: value, bytes });
            resident += bytes;
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (pending.get(key)?.controller === controller) {
            pending.delete(key);
          }
          sources -= length;
          release();
        });
    }
    const subscribed = task;
    subscribed.subscribers += 1;
    return new Promise((resolve, reject) => {
      let settled = false;
      const release = (): void => {
        request.signal.removeEventListener('abort', abort);
        subscribed.subscribers -= 1;
        if (subscribed.subscribers === 0 && pending.get(key) === subscribed) {
          pending.delete(key);
          subscribed.controller.abort(new DOMException('Toolpath no longer needed.', 'AbortError'));
        }
      };
      const abort = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        release();
        reject(
          request.signal.reason instanceof Error
            ? request.signal.reason
            : new DOMException('Toolpath preparation cancelled.', 'AbortError'),
        );
      };
      request.signal.addEventListener('abort', abort, { once: true });
      subscribed.result.then(
        (result) => {
          if (settled) {
            return;
          }
          settled = true;
          release();
          try {
            hold(key, result, request);
            resolve({ ...result, digest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
        (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          release();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
      if (request.signal.aborted) {
        abort();
      }
    });
  };
  return {
    prepare,
    diagnostics: (): ReturnType<PrinterPreparation['diagnostics']> => ({
      residentBytes: resident,
      sourceBytes: sources,
      activeBytes: activeBytes(),
      active: active.size,
      completed: completed.size,
      pending: pending.size,
    }),
    dispose(): void {
      disposed = true;
      for (const task of pending.values()) {
        task.controller.abort(new DOMException('Printer preparation disposed.', 'AbortError'));
      }
      pending.clear();
      execute.dispose?.();
      completed.clear();
      active.clear();
      resident = 0;
    },
  };
};

export const printerPreparation = createPrinterPreparation();
