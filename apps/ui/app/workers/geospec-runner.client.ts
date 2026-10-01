import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import { rpcClientErrorCode } from '@taucad/chat';
import { rpcExecutionTimeout } from '@taucad/chat/constants';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { randomUuid } from '@taucad/utils/id';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import { createBrowserGeoSpecWorker } from '#services/browser-geospec-worker.js';
import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type CreateGeoSpecWorker = () => Worker;

export type GeoSpecWorkerRpcClientOptions = {
  openFileSystemBridge: () => FileSystemBridgeConnection;
  runtimeConfig: UiRuntimeConfigInput;
  geoSpecEngine?: 'legacy' | 'native' | undefined;
  /** Private optional Git candidate route; errors never change authored GeoSpec results. */
  candidateSync?: Readonly<{
    fetch: () => Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>>;
    publish: (candidate: Uint8Array<ArrayBuffer>) => Promise<unknown>;
  }>;
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
  signal?: AbortSignal;
  abortListener?: () => void;
  resolve(result: RunGeoSpecTestsRpcResult): void;
};

/**
 * Milliseconds of slack between the client's worst case and the API's RPC
 * budget, so the client's specific error always wins the race.
 */
const rpcTimeoutHeadroom = 5000;
/** Milliseconds to wait after cooperative abort before hard-resetting. */
const defaultAbortGrace = 5000;
/**
 * Milliseconds. Worker startup is a fetch plus module evaluation — measured in
 * hundreds of milliseconds — so a startup that has not finished by now is hung,
 * and waiting longer only buys a less useful error.
 */
const defaultInitTimeout = 10_000;
/** Milliseconds. Whatever is left of the API's budget once startup and the abort grace are paid for. */
const defaultTimeout = rpcExecutionTimeout - defaultInitTimeout - defaultAbortGrace - rpcTimeoutHeadroom;

/**
 * The longest a `runTests` call can take before resolving: a full startup
 * timeout, then a full run timeout, then the abort grace. Pinned by a test
 * against {@link rpcExecutionTimeout}.
 *
 * @public
 */
export const geoSpecClientWorstCaseTimeout = defaultInitTimeout + defaultTimeout + defaultAbortGrace;

const createRequestId = (): string => randomUuid();

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
  // ponytail: quarantine an oversized remote for this client session; reopening the project retries.
  let candidateFetchLimitReached = false;
  let candidateFetchInFlight: Promise<void> | undefined;
  let availableCandidates: ReadonlyArray<Uint8Array<ArrayBuffer>> = [];
  const pendingRuns = new Map<string, PendingRun>();

  const runnerTimeout = options.runnerTimeout ?? defaultTimeout;
  const initTimeout = options.initTimeout ?? defaultInitTimeout;
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
    if (pending.abortListener) {
      pending.signal?.removeEventListener('abort', pending.abortListener);
    }
    pendingRuns.delete(requestId);
  };

  const resolveRun = (requestId: string, result: RunGeoSpecTestsRpcResult): void => {
    const pending = pendingRuns.get(requestId);
    if (!pending) {
      return;
    }
    const settledResult = pending.signal?.aborted ? errorResult('GeoSpec request cancelled.') : result;
    clearPendingRun(requestId);
    pending.resolve(settledResult);
  };

  const publishCandidate = async (candidate: Uint8Array<ArrayBuffer>): Promise<void> => {
    try {
      await options.candidateSync?.publish(candidate);
    } catch {
      // Optional publication cannot change an authored result.
    }
  };

  const failAllPendingRuns = (message: string): void => {
    for (const [requestId, pending] of pendingRuns) {
      clearPendingRun(requestId);
      pending.resolve(errorResult(message));
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
      const pending = pendingRuns.get(message.requestId);
      const mayPublish =
        pending !== undefined &&
        !closed &&
        pending.abortTimeoutId === undefined &&
        !pending.signal?.aborted &&
        sessionId !== undefined;
      resolveRun(message.requestId, message.result);
      if (mayPublish && message.result.success) {
        for (const candidate of message.candidates ?? []) {
          void publishCandidate(candidate);
        }
      }
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

    worker = (options.createWorker ?? createBrowserGeoSpecWorker)();
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const fileSystemBridge = options.openFileSystemBridge();
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
        runtimeConfig: options.runtimeConfig,
        geoSpecEngine: options.geoSpecEngine ?? 'legacy',
        fileSystemPort: fileSystemBridge.port,
      };
      worker.postMessage(request, [fileSystemBridge.port]);
    } catch (error) {
      fileSystemBridge.dispose();
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

  const runTests: RpcGeoSpecClient['runTests'] = async (args, context) => {
    if (context?.signal?.aborted) {
      return errorResult('GeoSpec request cancelled.');
    }
    let candidateSharingEnabled = false;
    if (
      !closed &&
      !candidateFetchLimitReached &&
      candidateFetchInFlight === undefined &&
      options.geoSpecEngine === 'native' &&
      options.candidateSync !== undefined
    ) {
      const sync = options.candidateSync;
      const fetchCandidates = async (): Promise<void> => {
        try {
          availableCandidates = await sync.fetch();
          candidateSharingEnabled = true;
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'FETCH_LIMIT_EXCEEDED') {
            candidateFetchLimitReached = true;
          }
        } finally {
          candidateFetchInFlight = undefined;
        }
      };
      candidateFetchInFlight = fetchCandidates();
    }
    let activeSessionId: string;
    try {
      activeSessionId = await ensureInitialized();
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'GeoSpec worker failed to start.');
    }

    if (!worker) {
      return errorResult('GeoSpec worker is not available.');
    }
    if (context?.signal?.aborted) {
      return errorResult('GeoSpec request cancelled.');
    }

    const activeWorker = worker;
    const requestId = createRequestId();
    return new Promise<RunGeoSpecTestsRpcResult>((resolve) => {
      const abortRun = (reason: string): void => {
        const pending = pendingRuns.get(requestId);
        if (!pending || pending.abortTimeoutId !== undefined) {
          return;
        }
        globalThis.clearTimeout(pending.timeoutId);
        try {
          activeWorker.postMessage({
            type: 'abort',
            requestId: createRequestId(),
            sessionId: activeSessionId,
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
      };
      const abortListener = (): void => {
        abortRun('GeoSpec request cancelled.');
      };
      const timeoutId = globalThis.setTimeout(() => {
        abortRun(createTimeoutMessage(runnerTimeout));
      }, runnerTimeout);

      pendingRuns.set(requestId, {
        resolve,
        timeoutId,
        abortListener,
        ...(context?.signal ? { signal: context.signal } : {}),
      });
      try {
        activeWorker.postMessage({
          type: 'run',
          requestId,
          sessionId: activeSessionId,
          args,
          candidates: candidateSharingEnabled && !closed ? availableCandidates : [],
          candidateSharingEnabled: candidateSharingEnabled && !closed,
        } satisfies GeoSpecRunnerWorkerRequest);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'GeoSpec worker failed to start a test run.';
        hardResetRun(requestId, message);
        return;
      }
      context?.signal?.addEventListener('abort', abortListener, { once: true });
      if (context?.signal?.aborted) {
        abortListener();
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
