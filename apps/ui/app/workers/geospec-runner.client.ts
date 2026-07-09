import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import { rpcClientErrorCode } from '@taucad/chat';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type CreateGeoSpecWorker = () => Worker;

export type GeoSpecWorkerRpcClientOptions = {
  openFileSystemBridge: () => FileSystemBridgeConnection;
  projectRootPath: string;
  runtimeConfig: UiRuntimeConfigInput;
  filePoolBuffer?: SharedArrayBuffer;
  createWorker?: CreateGeoSpecWorker;
  /** Milliseconds. */
  runnerTimeout?: number;
  /** Milliseconds to wait for worker initialization before failing in-flight runs. */
  initTimeout?: number;
  /** Milliseconds to wait after cooperative abort before hard-resetting the worker. */
  abortGrace?: number;
};

export type GeoSpecWorkerRpcClient = RpcGeoSpecClient & {
  close(): Promise<void>;
};

type PendingRun = {
  timeoutId: ReturnType<typeof globalThis.setTimeout>;
  abortTimeoutId?: ReturnType<typeof globalThis.setTimeout>;
  resolve(result: RunGeoSpecTestsRpcResult): void;
};

/** Milliseconds. */
const defaultTimeout = 120_000;
/** Milliseconds. */
const defaultAbortGrace = 5000;

const createDefaultGeoSpecWorker = (): Worker =>
  new Worker(new URL('#workers/geospec-runner.worker.js', import.meta.url), {
    type: 'module',
    name: 'tau-geospec-runner-worker',
  });

const createRequestId = (): string => {
  return globalThis.crypto.randomUUID();
};

const errorResult = (message: string): RunGeoSpecTestsRpcResult => ({
  success: false,
  errorCode: rpcClientErrorCode.unknown,
  message,
});

const createTimeoutMessage = (runnerTimeout: number): string => `GeoSpec worker timed out after ${runnerTimeout}ms.`;

export const createGeoSpecWorkerRpcClient = (options: GeoSpecWorkerRpcClientOptions): GeoSpecWorkerRpcClient => {
  let worker: Worker | undefined;
  let sessionId: string | undefined;
  let initializePromise: Promise<void> | undefined;
  let initializeRequestId: string | undefined;
  let resolveInitialize: (() => void) | undefined;
  let rejectInitialize: ((error: Error) => void) | undefined;
  let closeRequestId: string | undefined;
  let resolveClose: (() => void) | undefined;
  let initTimeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  let closed = false;
  const pendingRuns = new Map<string, PendingRun>();

  const runnerTimeout = options.runnerTimeout ?? defaultTimeout;
  const initTimeout = options.initTimeout ?? defaultTimeout;
  const abortGrace = options.abortGrace ?? defaultAbortGrace;

  const requireSessionId = (): string => {
    if (sessionId === undefined) {
      throw new Error('GeoSpec worker failed to initialize.');
    }
    return sessionId;
  };

  const clearPendingRun = (requestId: string): void => {
    const pending = pendingRuns.get(requestId);
    if (!pending) {
      return;
    }
    globalThis.clearTimeout(pending.timeoutId);
    if (pending.abortTimeoutId) {
      globalThis.clearTimeout(pending.abortTimeoutId);
    }
    pendingRuns.delete(requestId);
  };

  const resolveRun = (requestId: string, result: RunGeoSpecTestsRpcResult): void => {
    const pending = pendingRuns.get(requestId);
    if (!pending) {
      return;
    }
    clearPendingRun(requestId);
    pending.resolve(result);
  };

  const failAllPendingRuns = (message: string): void => {
    for (const [requestId, pending] of pendingRuns) {
      globalThis.clearTimeout(pending.timeoutId);
      if (pending.abortTimeoutId) {
        globalThis.clearTimeout(pending.abortTimeoutId);
      }
      pending.resolve(errorResult(message));
      pendingRuns.delete(requestId);
    }
  };

  const clearInitialize = (): void => {
    if (initTimeoutId !== undefined) {
      globalThis.clearTimeout(initTimeoutId);
      initTimeoutId = undefined;
    }
    initializePromise = undefined;
    initializeRequestId = undefined;
    resolveInitialize = undefined;
    rejectInitialize = undefined;
  };

  const detachWorker = (): void => {
    worker?.removeEventListener('message', onMessage);
    worker?.removeEventListener('error', onError);
    worker = undefined;
    sessionId = undefined;
    closeRequestId = undefined;
    resolveClose = undefined;
    clearInitialize();
  };

  const terminateWorker = (message: string): void => {
    rejectInitialize?.(new Error(message));
    failAllPendingRuns(message);
    worker?.terminate();
    detachWorker();
  };

  function onMessage(event: MessageEvent<GeoSpecRunnerWorkerResponse>): void {
    const message = event.data;

    if (message.type === 'initialized') {
      if (message.requestId !== initializeRequestId) {
        return;
      }
      sessionId = message.sessionId;
      resolveInitialize?.();
      clearInitialize();
      return;
    }

    if (message.type === 'closed') {
      if (closeRequestId === undefined) {
        // Unsolicited close: the worker went away without a close() request, so
        // fail any in-flight runs instead of leaving their promises unresolved.
        terminateWorker('GeoSpec worker closed unexpectedly.');
        return;
      }
      if (message.requestId !== closeRequestId) {
        return;
      }
      resolveClose?.();
      detachWorker();
      return;
    }

    if (message.type === 'result') {
      resolveRun(message.requestId, message.result);
      return;
    }

    if (message.requestId === initializeRequestId) {
      rejectInitialize?.(new Error(message.message));
      worker?.terminate();
      detachWorker();
      return;
    }

    resolveRun(message.requestId, errorResult(message.message));
  }

  function onError(event: ErrorEvent): void {
    const message = event.message || 'GeoSpec worker crashed.';
    terminateWorker(message);
  }

  const ensureInitialized = async (): Promise<string> => {
    if (closed) {
      throw new Error('GeoSpec worker client is closed.');
    }
    if (sessionId !== undefined) {
      return sessionId;
    }
    if (initializePromise) {
      await initializePromise;
      return requireSessionId();
    }

    worker = (options.createWorker ?? createDefaultGeoSpecWorker)();
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const vmFileSystemBridge = options.openFileSystemBridge();
    const runtimeFileSystemBridge = options.openFileSystemBridge();
    const nextSessionId = createRequestId();
    const requestId = createRequestId();
    initializeRequestId = requestId;

    initializePromise = new Promise<void>((resolve, reject) => {
      resolveInitialize = resolve;
      rejectInitialize = reject;
    });
    initTimeoutId = globalThis.setTimeout(() => {
      terminateWorker(`GeoSpec worker initialization timed out after ${initTimeout}ms.`);
    }, initTimeout);

    try {
      const request: GeoSpecRunnerWorkerRequest = {
        type: 'initialize',
        requestId,
        sessionId: nextSessionId,
        projectRootPath: options.projectRootPath,
        runtimeConfig: options.runtimeConfig,
        vmFileSystemPort: vmFileSystemBridge.port,
        runtimeFileSystemPort: runtimeFileSystemBridge.port,
        ...(options.filePoolBuffer ? { filePoolBuffer: options.filePoolBuffer } : {}),
      };
      worker.postMessage(request, [vmFileSystemBridge.port, runtimeFileSystemBridge.port]);
    } catch (error) {
      vmFileSystemBridge.dispose();
      runtimeFileSystemBridge.dispose();
      const message = error instanceof Error ? error.message : 'GeoSpec worker failed to start.';
      terminateWorker(message);
      throw new Error(message);
    }

    await initializePromise;
    return requireSessionId();
  };

  const hardResetRun = (requestId: string, message: string): void => {
    resolveRun(requestId, errorResult(message));
    terminateWorker(message);
  };

  const runTests = async (args: Parameters<RpcGeoSpecClient['runTests']>[0]): Promise<RunGeoSpecTestsRpcResult> => {
    let activeSessionId: string;
    try {
      activeSessionId = await ensureInitialized();
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'GeoSpec worker failed to start.');
    }

    if (!worker) {
      return errorResult('GeoSpec worker is not available.');
    }

    const activeWorker = worker;
    const requestId = createRequestId();
    return new Promise<RunGeoSpecTestsRpcResult>((resolve) => {
      const timeoutId = globalThis.setTimeout(() => {
        const pending = pendingRuns.get(requestId);
        if (!pending || !worker || !sessionId) {
          return;
        }
        const reason = createTimeoutMessage(runnerTimeout);
        try {
          worker.postMessage({
            type: 'abort',
            requestId: createRequestId(),
            sessionId,
            targetRequestId: requestId,
            reason,
          } satisfies GeoSpecRunnerWorkerRequest);
        } catch {
          hardResetRun(requestId, reason);
          return;
        }
        pending.abortTimeoutId = globalThis.setTimeout(() => {
          hardResetRun(requestId, reason);
        }, abortGrace);
      }, runnerTimeout);

      pendingRuns.set(requestId, { resolve, timeoutId });
      try {
        activeWorker.postMessage({
          type: 'run',
          requestId,
          sessionId: activeSessionId,
          args,
        } satisfies GeoSpecRunnerWorkerRequest);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'GeoSpec worker failed to start a test run.';
        hardResetRun(requestId, message);
      }
    });
  };

  const close = async (): Promise<void> => {
    closed = true;
    rejectInitialize?.(new Error('GeoSpec worker client closed.'));
    failAllPendingRuns('GeoSpec worker client closed.');

    if (!worker) {
      detachWorker();
      return;
    }

    const requestId = createRequestId();
    closeRequestId = requestId;
    await new Promise<void>((resolve) => {
      resolveClose = resolve;
      const timeoutId = globalThis.setTimeout(() => {
        worker?.terminate();
        detachWorker();
        resolve();
      }, abortGrace);
      const previousResolveClose = resolveClose;
      resolveClose = () => {
        globalThis.clearTimeout(timeoutId);
        previousResolveClose();
      };
      try {
        worker?.postMessage({
          type: 'close',
          requestId,
          ...(sessionId ? { sessionId } : {}),
        } satisfies GeoSpecRunnerWorkerRequest);
      } catch {
        globalThis.clearTimeout(timeoutId);
        worker?.terminate();
        detachWorker();
        resolve();
      }
    });
  };

  return {
    runTests,
    close,
  };
};
