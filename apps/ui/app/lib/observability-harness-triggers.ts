import type { runtime } from '#runtime/ui-runtime.definition.js';
import { recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';
import { reportRuntimeFailures } from '#lib/runtime-failure-reporting.js';
import { reportWorkerFailures } from '#lib/worker-error-reporting.js';

/** One canvas step: 2048 x 2048 RGBA is 16 MiB, the same step as one WebAssembly allocation. */
const canvasPressureEdge = 2048;

/**
 * Allocate and touch memory gradually until the operating system ends the tab.
 *
 * Two allocators, used in that order. WebAssembly memory is the cheap one and
 * the one a desktop browser dies on. iOS Safari caps WebAssembly memory per tab
 * and throws `RangeError: Out of memory` well before the process is large
 * enough to be killed, so a refusal there is not the end of the run: it
 * escalates to canvas backing stores, which are charged to the process rather
 * than to that cap and are what actually ends a tab on iOS. The WebAssembly
 * pages stay held across the escalation, because releasing them would give back
 * the pressure already built. Stop releases every reference and prevents
 * further allocations.
 */
export const startObservabilityMemoryPressure = (status: (message: string) => void): (() => void) => {
  const allocations: WebAssembly.Memory[] = [];
  const canvases: HTMLCanvasElement[] = [];
  let allocatedBytes = 0;
  let allocator: 'canvas' | 'wasm' = 'wasm';

  const allocateWasmPages = (): number => {
    const memory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
    const bytes = new Uint8Array(memory.buffer);
    // Touch every OS page so the allocation becomes resident, rather than only reserving virtual memory.
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      bytes[offset] = 1;
    }
    allocations.push(memory);
    return bytes.length;
  };

  const allocateCanvasBackingStore = (): number => {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = canvasPressureEdge;
    canvas.height = canvasPressureEdge;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas backing store refused');
    }
    // Paint a colour that differs per canvas, so no two backing stores can be shared or the paint elided.
    context.fillStyle = `rgb(${String(canvases.length % 256)} ${String((canvases.length * 7) % 256)} 1)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Read one pixel back so the paint cannot be deferred past this tick.
    context.getImageData(0, 0, 1, 1);
    canvases.push(canvas);
    return canvas.width * canvas.height * 4;
  };

  const release = (): void => {
    allocations.length = 0;
    for (const canvas of canvases) {
      // Zero the dimensions first: that is what frees the backing store, not dropping the reference.
      canvas.width = 0;
      canvas.height = 0;
    }
    canvases.length = 0;
  };

  const timer = globalThis.setInterval(() => {
    try {
      allocatedBytes += allocator === 'wasm' ? allocateWasmPages() : allocateCanvasBackingStore();
      recordMemoryBreadcrumb('render');
      const held = String(Math.round(allocatedBytes / 1024 / 1024));
      const source = allocator === 'wasm' ? 'WebAssembly memory' : 'canvas backing stores';
      status(`Memory pressure running: ${held} MiB allocated with ${source}. Stop to release it.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (allocator === 'wasm') {
        // Safari on iOS lands here: its WebAssembly cap is reached long before the tab is big enough to kill.
        allocator = 'canvas';
        status(
          `WebAssembly memory refused at ${String(Math.round(allocatedBytes / 1024 / 1024))} MiB (${message}); escalating to canvas backing stores.`,
        );
        return;
      }
      globalThis.clearInterval(timer);
      release();
      status(`Allocation refused without a tab kill: ${message}`);
    }
  }, 250);
  recordMemoryBreadcrumb('render');
  return () => {
    globalThis.clearInterval(timer);
    release();
  };
};

/** A dedicated worker throws; do not substitute a main-thread capture for missing worker instrumentation. */
export const triggerObservabilityWorkerError = (status: (message: string) => void): (() => void) => {
  const worker = reportWorkerFailures(
    new Worker(new URL('observability-harness.worker.ts', import.meta.url), { type: 'module' }),
    'observability-harness',
  );
  worker.addEventListener(
    'error',
    () => {
      status('Worker error observed. Check the reporting destination for delivery.');
      worker.terminate();
    },
    { once: true },
  );
  worker.postMessage('throw');
  return () => {
    worker.terminate();
  };
};

/** Terminate the actual product kernel worker while a document evaluation is pending. */
export const triggerObservabilityKernelTermination = async (status: (message: string) => void): Promise<void> => {
  const [
    { createRuntimeClient },
    { webWorkerTransport },
    { fromMemoryFs },
    { createUiRuntimeConfig },
    { ENV: environment },
  ] = await Promise.all([
    import('@taucad/runtime/client'),
    import('@taucad/runtime/transport/web'),
    import('@taucad/runtime/filesystem'),
    import('#runtime/ui-runtime.config.js'),
    import('#environment.config.js'),
  ]);
  const worker = reportWorkerFailures(
    new Worker(new URL('../runtime/runtime.worker.ts', import.meta.url), { type: 'module' }),
    'kernel',
  );
  const client = createRuntimeClient<typeof runtime>({
    transport: webWorkerTransport({ createWorker: () => worker, fileSystem: fromMemoryFs() }),
    config: createUiRuntimeConfig(environment),
    operationTimeout: 10_000,
  });
  /* The product's own reporter, as `observeRuntimeClient` attaches it, reports the failed attempt. It stays
   * subscribed past cleanup, so an observation the client emits as it terminates is still reported. */
  reportRuntimeFailures(client);
  try {
    await client.connect();
    const document = client.open({ source: { files: { 'model.scad': 'cube([10, 10, 10]);' } }, watch: false });
    const started = Promise.withResolvers<void>();
    let terminated = false;
    let observedFailure: unknown;
    const unsubscribe = document.on('progress', ({ phase }) => {
      if (phase === 'evaluate' && !terminated) {
        terminated = true;
        worker.terminate();
        started.resolve();
      }
    });
    const deadline = globalThis.setTimeout(() => {
      started.reject(new Error('Kernel evaluation did not start within 30 seconds; no termination was induced.'));
    }, 30_000);
    const evaluation = document.evaluation();
    const observeEvaluation = async (): Promise<void> => {
      try {
        await evaluation;
        if (!terminated) {
          started.reject(
            new Error('Kernel evaluation finished before the termination trigger could observe its start.'),
          );
        }
      } catch (error) {
        observedFailure = error;
        if (!terminated) {
          started.reject(error);
        }
      }
    };
    const evaluationSettled = observeEvaluation();
    try {
      await started.promise;
      // Worker.terminate has no browser close event. Let the real runtime deadline settle the attempt
      // before normal cleanup, rather than turning the induced failure into caller abandonment.
      await evaluationSettled;
      if (observedFailure === undefined) {
        throw new Error('Evaluation settled without a runtime failure after worker termination.');
      }
      status(
        `Kernel worker terminated; runtime reported ${observedFailure instanceof Error ? `${observedFailure.name}: ${observedFailure.message}` : 'a non-Error rejection'}`,
      );
    } finally {
      globalThis.clearTimeout(deadline);
      unsubscribe();
      document.close();
      client.terminate();
      await evaluationSettled;
    }
  } finally {
    worker.terminate();
    client.terminate();
  }
};
