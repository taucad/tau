import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import { rpcClientErrorCode } from '@taucad/chat';
import {
  geoSpecDefaultMaxRunBudget,
  geoSpecDefaultRunBudget,
  geoSpecHostLimitProblem,
  resolveGeoSpecHostLimits,
  resolveGeoSpecRunBudget,
} from '@taucad/chat/constants';
import { createGeoSpecRunProgress, markGeoSpecRunTimeout } from '@taucad/agent-tools/geospec';
import type { GeoSpecRunProgress } from '@taucad/agent-tools/geospec';
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
  /** Private optional Git candidate route; errors never change authored GeoSpec results. */
  candidateSync?: Readonly<{
    fetch: () => Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>>;
    publish: (candidate: Uint8Array<ArrayBuffer>) => Promise<unknown>;
  }>;
  createWorker?: CreateGeoSpecWorker;
  /**
   * The host's run budget in milliseconds, raised per call to cover its
   * `testTimeout` and capped at `maxRunBudget`. A run that outlives it answers
   * `OPERATION_TIMEOUT` with the requirements it completed.
   */
  runnerTimeout?: number;
  /**
   * Host policy: the longest run budget and largest `testTimeout`, in
   * milliseconds. Defaults to {@link geoSpecDefaultMaxRunBudget}; a host
   * provisioned for longer verification raises it. A call above it is refused.
   */
  maxRunBudget?: number;
  /**
   * Host policy: the largest `workUnitLimit` a call, `loadModel` or `expectGeo`
   * may request. Defaults to GeoSpec's default authored maximum; a host
   * provisioned for larger claims raises it. A call above it is refused.
   */
  maxWorkUnitLimit?: number;
  /** Milliseconds to wait for worker initialization before failing in-flight runs. */
  initTimeout?: number;
  /** Milliseconds to wait after cooperative abort before hard-resetting the worker. */
  abortGrace?: number;
};

export type GeoSpecWorkerRpcClient = RpcGeoSpecClient & {
  close(): Promise<void>;
};

type PendingRun = {
  timeoutId?: ReturnType<typeof globalThis.setTimeout>;
  abortTimeoutId?: ReturnType<typeof globalThis.setTimeout>;
  signal?: AbortSignal;
  abortListener?: () => void;
  /** This call's run budget. Milliseconds. */
  runBudget: number;
  /** When the run was posted, then when the worker started it. `performance.now()` milliseconds. */
  budgetStartedAt: number;
  progress: GeoSpecRunProgress;
  /** The answer frozen when the budget expired; set only on budget expiry, never on cancellation. */
  expired?: Extract<RunGeoSpecTestsRpcResult, { success: true }>;
  resolve(result: RunGeoSpecTestsRpcResult): void;
};

/** Milliseconds to wait after cooperative abort before hard-resetting. */
const defaultAbortGrace = 5000;
/**
 * Milliseconds. Worker startup is a fetch plus module evaluation — measured in
 * hundreds of milliseconds — so a startup that has not finished by now is hung,
 * and waiting longer only buys a less useful error.
 */
const defaultInitTimeout = 10_000;
/**
 * The longest a started `runTests` call can take before resolving: a full
 * startup timeout, then the host's longest run budget, then the abort grace.
 * No outer RPC budget bounds a browser-placed tool call, so this is the bound.
 *
 * @param maxRunBudget - The host's longest run budget. Milliseconds.
 * @returns The bound. Milliseconds.
 * @public
 */
export const geoSpecClientWorstCaseTimeout = (maxRunBudget: number = geoSpecDefaultMaxRunBudget): number =>
  defaultInitTimeout + maxRunBudget + defaultAbortGrace;

const createRequestId = (): string => randomUuid();

const errorResult = (message: string): RunGeoSpecTestsRpcResult => ({
  success: false,
  errorCode: rpcClientErrorCode.unknown,
  message,
});

const createTimeoutMessage = (runBudget: number): string => `GeoSpec run exceeded its ${runBudget} ms run budget.`;

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

  const hostLimits = resolveGeoSpecHostLimits({
    ...(options.maxRunBudget === undefined ? {} : { maxRunBudget: options.maxRunBudget }),
    ...(options.maxWorkUnitLimit === undefined ? {} : { maxWorkUnitLimit: options.maxWorkUnitLimit }),
  });
  const hostRunBudget = Math.min(options.runnerTimeout ?? geoSpecDefaultRunBudget, hostLimits.maxRunBudget);
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

  /**
   * Answer a run whose budget expired. The worker's own late answer stays
   * authoritative and is only marked; without one, the frozen progress answer
   * reports what completed.
   */
  const resolveExpiredRun = (requestId: string, late?: RunGeoSpecTestsRpcResult): void => {
    const pending = pendingRuns.get(requestId);
    if (pending?.expired === undefined) {
      return;
    }
    const { expired } = pending;
    if (late?.success !== true) {
      resolveRun(requestId, expired);
      return;
    }
    const { success: _success, ...output } = late;
    resolveRun(requestId, {
      success: true,
      ...markGeoSpecRunTimeout(
        output,
        { budget: pending.runBudget, elapsed: expired.timeout?.elapsed ?? pending.runBudget },
        {
          ...(expired.timeout?.file === undefined ? {} : { file: expired.timeout.file }),
          ...(expired.timeout?.requirement === undefined ? {} : { requirement: expired.timeout.requirement }),
        },
      ),
    });
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
      if (pending.expired !== undefined) {
        resolveExpiredRun(requestId);
        continue;
      }
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

  function onProgressMessage(message: Extract<GeoSpecRunnerWorkerResponse, { type: 'progress' }>): void {
    const pending = pendingRuns.get(message.requestId);
    if (pending === undefined || pending.expired !== undefined) {
      return;
    }
    pending.progress.apply(message.event);
    if (message.event.type === 'run-start' && pending.abortTimeoutId === undefined) {
      // Waiting behind an earlier run is not this run's work: its budget starts now.
      armRunBudget(message.requestId, pending);
    }
  }

  function onResultMessage(message: Extract<GeoSpecRunnerWorkerResponse, { type: 'result' }>): void {
    const pending = pendingRuns.get(message.requestId);
    if (pending?.expired !== undefined) {
      resolveExpiredRun(message.requestId, message.result);
      return;
    }
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
  }

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

    if (message.type === 'progress') {
      onProgressMessage(message);
      return;
    }

    if (message.type === 'result') {
      onResultMessage(message);
      return;
    }

    if (message.requestId === initializeRequestId) {
      rejectInitialize?.(new Error(message.message));
      worker?.terminate();
      detachWorker();
      return;
    }

    if (pendingRuns.get(message.requestId)?.expired !== undefined) {
      resolveExpiredRun(message.requestId);
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
        fileSystemPort: fileSystemBridge.port,
        maxWorkUnitLimit: hostLimits.maxWorkUnitLimit,
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
    if (pendingRuns.get(requestId)?.expired === undefined) {
      resolveRun(requestId, errorResult(message));
    } else {
      resolveExpiredRun(requestId);
    }
    terminateWorker(
      `GeoSpec worker was reset after another run in this session stopped (${message}); this run never finished. Re-run it.`,
    );
  };

  /** Cooperative abort for one run: stop its budget timer, ask the worker, hard-reset after the grace. */
  const abortRunRequest = ({
    requestId,
    activeWorker,
    activeSessionId,
    reason,
  }: Readonly<{ requestId: string; activeWorker: Worker; activeSessionId: string; reason: string }>): void => {
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

  /** (Re)start a run's budget from now; on expiry freeze its progress answer and abort it. */
  function armRunBudget(requestId: string, pending: PendingRun): void {
    globalThis.clearTimeout(pending.timeoutId);
    pending.budgetStartedAt = performance.now();
    pending.timeoutId = globalThis.setTimeout(() => {
      const activeWorker = worker;
      const activeSessionId = sessionId;
      pending.expired = {
        success: true,
        ...pending.progress.timedOut({
          budget: pending.runBudget,
          elapsed: performance.now() - pending.budgetStartedAt,
        }),
      };
      if (activeWorker === undefined || activeSessionId === undefined) {
        resolveExpiredRun(requestId);
        return;
      }
      abortRunRequest({ requestId, activeWorker, activeSessionId, reason: createTimeoutMessage(pending.runBudget) });
    }, pending.runBudget);
  }

  const runTests: RpcGeoSpecClient['runTests'] = async (args, context) => {
    if (context?.signal?.aborted) {
      return errorResult('GeoSpec request cancelled.');
    }
    const overLimit = geoSpecHostLimitProblem(args, hostLimits);
    if (overLimit !== undefined) {
      return { success: false, errorCode: rpcClientErrorCode.validationError, message: overLimit };
    }
    let candidateSharingEnabled = false;
    if (
      !closed &&
      !candidateFetchLimitReached &&
      candidateFetchInFlight === undefined &&
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
      const abortListener = (): void => {
        abortRunRequest({ requestId, activeWorker, activeSessionId, reason: 'GeoSpec request cancelled.' });
      };
      const pending: PendingRun = {
        resolve,
        abortListener,
        runBudget: resolveGeoSpecRunBudget(hostRunBudget, args.testTimeout, hostLimits.maxRunBudget),
        budgetStartedAt: performance.now(),
        progress: createGeoSpecRunProgress(),
        ...(context?.signal ? { signal: context.signal } : {}),
      };
      pendingRuns.set(requestId, pending);
      armRunBudget(requestId, pending);
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
