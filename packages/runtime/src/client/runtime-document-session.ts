import { Topic } from '@taucad/events';
import { OperationAbortedError, OperationTimeoutError } from '#framework/runtime-worker-client.js';
import { RuntimeTerminatedError } from '#client/runtime-terminated-error.js';
import { randomUuid } from '@taucad/utils/id';
import type { Channel } from '@taucad/rpc';
import type {
  Description,
  DocumentStatus,
  DocumentUpdate,
  Evaluation,
  ExportResult,
  Rendering,
  UpdateOutcome,
  ViewStatus,
  ViewUpdateOutcome,
  WideExportRequest,
  WideViewRequest,
} from '#client/runtime-document.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { materialiseDocumentExport, materialiseRendering } from '#transport/_internal/document-materialiser.js';
import type { BinaryContentDelivery } from '#types/runtime-protocol.types.js';
import { abortReason } from '#types/runtime-protocol.types.js';

type OpenArgs = RuntimeDocumentProtocol['notifies']['open']['args'];
type UpdateArgs = RuntimeDocumentProtocol['notifies']['update']['args'];
type DocumentEvents = {
  described: Description;
  evaluated: Evaluation;
  progress: { phase: string; detail?: Record<string, unknown> };
  status: DocumentStatus;
};
type ViewEvents = { rendered: Rendering; status: ViewStatus };
type Waiter<T> = ReturnType<typeof Promise.withResolvers<T>>;
const consumeRejection = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* A later public waiter may already be closed. */
  }
};

const waitWithAbort = async <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw new OperationAbortedError();
  }
  const waiter = Promise.withResolvers<T>();
  const onAbort = (): void => {
    waiter.reject(new OperationAbortedError());
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, waiter.promise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Connected document wire orchestrator. The owner closes it when the transport closes. @internal */
export class RuntimeDocumentSessionClient {
  readonly #channel: Channel<RuntimeDocumentProtocol>;
  readonly #resolveBinary: (content: BinaryContentDelivery) => Promise<Uint8Array<ArrayBuffer>>;
  readonly #timeoutMs: () => number;
  readonly #onTimeout: (operationId: string) => void;
  readonly #onTerminal: (operationId: string) => void;
  readonly #documents = new Map<string, ReturnType<RuntimeDocumentSessionClient['open']>>();
  readonly #terminators = new Map<string, (error: RuntimeTerminatedError) => void>();
  readonly #disposers: Array<() => void> = [];

  public constructor(
    channel: Channel<RuntimeDocumentProtocol>,
    resolveBinary: (content: BinaryContentDelivery) => Promise<Uint8Array<ArrayBuffer>>,
    settings: {
      /** Milliseconds. */
      operationTimeout?: () => number;
      onTimeout?: (operationId: string) => void;
      onTerminal?: (operationId: string) => void;
    } = {},
  ) {
    this.#channel = channel;
    this.#resolveBinary = resolveBinary;
    this.#timeoutMs = settings.operationTimeout ?? (() => 0);
    this.#onTimeout = settings.onTimeout ?? (() => undefined);
    this.#onTerminal = settings.onTerminal ?? (() => undefined);
    this.#disposers.push(
      channel.onClose(() => {
        this.terminate(new RuntimeTerminatedError());
      }),
    );
  }

  /** Open one document and begin its initial evaluation.
   * @param args - Validated document open command without its initial intent.
   * @returns A document handle with its own subscriptions and export pin.
   */
  public open(args: Omit<OpenArgs, 'intent'>): {
    readonly id: string;
    readonly evaluation: (options?: { signal?: AbortSignal }) => Promise<UpdateOutcome>;
    readonly update: (update: DocumentUpdate) => Promise<UpdateOutcome>;
    readonly view: (
      id?: string,
      request?: WideViewRequest,
    ) => {
      readonly view: string | undefined;
      readonly request: WideViewRequest;
      readonly rendering: (options?: { signal?: AbortSignal }) => Promise<ViewUpdateOutcome>;
      readonly update: (request: WideViewRequest) => Promise<ViewUpdateOutcome>;
      readonly on: <E extends keyof ViewEvents>(
        event: E,
        handler: (value: ViewEvents[E]) => void,
        options?: { signal?: AbortSignal },
      ) => () => void;
      readonly close: () => void;
    };
    readonly export: (target: string, request?: WideExportRequest) => Promise<ExportResult>;
    readonly on: <E extends keyof DocumentEvents>(
      event: E,
      handler: (value: DocumentEvents[E]) => void,
      options?: { signal?: AbortSignal },
    ) => () => void;
    readonly close: () => void;
  } {
    const { documentId } = args;
    const channel = this.#channel;
    const documents = this.#documents;
    const terminators = this.#terminators;
    const onTerminal = this.#onTerminal;
    const armDeadline = (settings: {
      operationId: () => string | undefined;
      fallbackRecoveryId: string;
      isFresh: () => boolean;
      callback: () => void;
    }): (() => void) => {
      const { operationId, fallbackRecoveryId, isFresh, callback } = settings;
      const milliseconds = this.#timeoutMs();
      if (milliseconds === 0) {
        return () => undefined;
      }
      const timer = setTimeout(() => {
        if (!isFresh()) {
          return;
        }
        callback();
        const currentOperationId = operationId();
        if (currentOperationId) {
          try {
            channel.notify('abort', { operationId: currentOperationId, reason: abortReason.timeout });
          } catch {
            // The transport may have closed while the deadline fired.
          }
        }
        this.#onTimeout(currentOperationId ?? fallbackRecoveryId);
      }, milliseconds);
      return () => {
        clearTimeout(timer);
      };
    };
    const topics = {
      described: new Topic<Description>(),
      evaluated: new Topic<Evaluation>(),
      progress: new Topic<DocumentEvents['progress']>(),
      status: new Topic<DocumentStatus>(),
    };
    const views = new Map<string, { close: () => void; terminate: (error: RuntimeTerminatedError) => void }>();
    const disposers: Array<() => void> = [];
    let closed = false;
    let intent = 0;
    let evaluationId: string | undefined;
    let latestCurrent: Evaluation | undefined;
    let latestDescription: Description | undefined;
    let operationError: Error | undefined;
    let pendingSettled = false;
    let status: DocumentStatus = 'evaluating';
    let pending = Promise.withResolvers<UpdateOutcome>();
    let hasUpdateWaiter = false;
    let evaluationOperationId: string | undefined;
    let timedOutEvaluationId: string | undefined;
    let timedOutUnknownIntent = false;
    let evaluationPhase = 'evaluate';
    let clearEvaluationDeadline: (() => void) | undefined;
    const reads = new Set<Waiter<UpdateOutcome>>();
    const exportsInFlight = new Map<string, Waiter<never>>();
    const settleReads = (outcome: UpdateOutcome): void => {
      for (const read of reads) {
        read.resolve(outcome);
      }
      reads.clear();
    };
    const setStatus = (next: DocumentStatus): void => {
      status = next;
      topics.status.emit(next);
    };
    const isCurrent = (candidateIntent: number, candidateEvaluationId: string): boolean =>
      !closed && candidateIntent === intent && candidateEvaluationId === evaluationId;
    const on = <E extends keyof DocumentEvents>(
      event: E,
      handler: (value: DocumentEvents[E]) => void,
      options?: { signal?: AbortSignal },
    ): (() => void) => {
      // SAFETY: event selects the matching Topic leaf; each leaf emits DocumentEvents[event].
      const topic = topics[event] as Topic<DocumentEvents[E]>;
      const unsubscribe = topic.subscribe(handler, options);
      let subscribed = true;
      const replay = (value: DocumentEvents[E], stillCurrent: () => boolean): void => {
        queueMicrotask(() => {
          if (subscribed && !closed && !options?.signal?.aborted && stillCurrent()) {
            try {
              handler(value);
            } catch {
              // Replay is independent of live event fan-out and other listeners.
            }
          }
        });
      };
      if (event === 'status') {
        const captured = status;
        replay(captured as DocumentEvents[E], () => status === captured);
      }
      if (event === 'evaluated' && latestCurrent) {
        const captured = latestCurrent;
        replay(captured as DocumentEvents[E], () => latestCurrent === captured);
      }
      if (event === 'described' && latestDescription) {
        const captured = latestDescription;
        replay(captured as DocumentEvents[E], () => latestDescription === captured);
      }
      return () => {
        subscribed = false;
        unsubscribe();
      };
    };
    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      clearEvaluationDeadline?.();
      documents.delete(documentId);
      terminators.delete(documentId);
      pending.resolve({ superseded: true });
      for (const read of reads) {
        read.reject(new OperationAbortedError());
      }
      reads.clear();
      for (const [operationId, waiter] of exportsInFlight) {
        waiter.reject(new OperationAbortedError());
        try {
          channel.notify('abort', { operationId, reason: 0 });
        } catch {
          // Teardown may already have closed the channel.
        }
      }
      exportsInFlight.clear();
      for (const view of views.values()) {
        view.close();
      }
      for (const dispose of disposers) {
        dispose();
      }
      try {
        channel.notify('close', { documentId });
      } catch {
        // The channel may already be closed during transport teardown.
      }
      setStatus('closed');
      for (const topic of Object.values(topics)) {
        topic.dispose();
      }
    };
    const terminate = (error: RuntimeTerminatedError): void => {
      if (closed) {
        return;
      }
      closed = true;
      operationError = error;
      clearEvaluationDeadline?.();
      documents.delete(documentId);
      terminators.delete(documentId);
      if (!hasUpdateWaiter) {
        void consumeRejection(pending.promise);
      }
      pending.reject(error);
      pendingSettled = true;
      for (const read of reads) {
        read.reject(error);
      }
      reads.clear();
      for (const waiter of exportsInFlight.values()) {
        waiter.reject(error);
      }
      exportsInFlight.clear();
      for (const view of views.values()) {
        view.terminate(error);
      }
      for (const dispose of disposers) {
        dispose();
      }
      setStatus('error');
      for (const topic of Object.values(topics)) {
        topic.dispose();
      }
    };
    disposers.push(
      channel.onNotify('described', (value) => {
        if (value.documentId === documentId && value.intent === intent && !closed) {
          latestDescription = value;
          topics.described.emit(value);
        }
      }),
      channel.onNotify('evaluating', (value) => {
        if (value.documentId !== documentId || value.intent !== intent || closed) {
          return;
        }
        if (timedOutEvaluationId === value.evaluationId) {
          return;
        }
        if (timedOutUnknownIntent) {
          timedOutUnknownIntent = false;
          timedOutEvaluationId = value.evaluationId;
          evaluationId = value.evaluationId;
          evaluationOperationId = `evaluate:${documentId}:${value.evaluationId}`;
          channel.notify('abort', { operationId: evaluationOperationId, reason: abortReason.timeout });
          return;
        }
        const newEvaluation = pendingSettled || (evaluationId !== undefined && evaluationId !== value.evaluationId);
        if (newEvaluation) {
          clearEvaluationDeadline?.();
          pending.resolve({ superseded: true });
          settleReads({ superseded: true });
          pending = Promise.withResolvers<UpdateOutcome>();
          hasUpdateWaiter = false;
          pendingSettled = false;
        }
        evaluationId = value.evaluationId;
        evaluationOperationId = `evaluate:${documentId}:${value.evaluationId}`;
        timedOutEvaluationId = undefined;
        evaluationPhase = 'evaluate';
        operationError = undefined;
        setStatus('evaluating');
        if (newEvaluation && !hasUpdateWaiter) {
          const admittedIntent = intent;
          const admittedEvaluationId = value.evaluationId;
          clearEvaluationDeadline = armDeadline({
            operationId: () => evaluationOperationId,
            fallbackRecoveryId: `pending:${documentId}:${admittedIntent}:${admittedEvaluationId}`,
            isFresh: () =>
              !closed && intent === admittedIntent && evaluationId === admittedEvaluationId && !timedOutEvaluationId,
            callback: () => {
              timedOutEvaluationId = admittedEvaluationId;
              operationError = new OperationTimeoutError(evaluationPhase, 'Document evaluation timed out.');
              pending.resolve({ superseded: true });
              for (const read of reads) {
                read.reject(operationError);
              }
              reads.clear();
              pendingSettled = true;
              setStatus('error');
            },
          });
        }
      }),
      channel.onNotify('evaluated', (value) => {
        if (value.documentId === documentId) {
          onTerminal(`evaluate:${documentId}:${value.id}`);
        }
        if (value.documentId !== documentId || value.intent !== intent || closed) {
          return;
        }
        if ((evaluationId !== undefined && value.id !== evaluationId) || timedOutEvaluationId === value.id) {
          return;
        }
        evaluationId = value.id;
        clearEvaluationDeadline?.();
        latestCurrent = value;
        operationError = undefined;
        pending.resolve({ superseded: false, evaluation: value });
        hasUpdateWaiter = false;
        settleReads({ superseded: false, evaluation: value });
        pendingSettled = true;
        topics.evaluated.emit(value);
        setStatus(value.success ? 'ready' : 'error');
      }),
      channel.onNotify('progress', (value) => {
        if (
          isCurrent(value.intent, value.evaluationId) &&
          value.documentId === documentId &&
          value.operationId === `evaluate:${documentId}:${value.evaluationId}` &&
          !value.requestId
        ) {
          evaluationOperationId = value.operationId;
          if (value.phase !== 'queued') {
            evaluationPhase = value.phase;
          }
          topics.progress.emit({ phase: value.phase, ...(value.detail ? { detail: value.detail } : {}) });
        }
      }),
      channel.onNotify('errorEvent', (value) => {
        if (value.scope === 'operation' && value.documentId === documentId) {
          onTerminal(value.operationId);
        }
        if (
          value.scope === 'operation' &&
          value.documentId === documentId &&
          value.intent === intent &&
          !value.subscriptionId &&
          !value.requestId &&
          value.evaluationId === evaluationId &&
          value.operationId === evaluationOperationId &&
          !pendingSettled
        ) {
          operationError =
            value.code === 'OPERATION_TIMEOUT'
              ? new OperationTimeoutError(value.phase, value.message)
              : new OperationAbortedError(value.phase, value.message);
          clearEvaluationDeadline?.();
          if (hasUpdateWaiter) {
            pending.reject(operationError);
          } else {
            pending.resolve({ superseded: true });
          }
          for (const read of reads) {
            read.reject(
              value.code === 'OPERATION_TIMEOUT'
                ? new OperationTimeoutError(value.phase, value.message)
                : new OperationAbortedError(value.phase, value.message),
            );
          }
          reads.clear();
          pendingSettled = true;
          hasUpdateWaiter = false;
          setStatus('error');
        }
      }),
    );
    const evaluation = async (options?: { signal?: AbortSignal }): Promise<UpdateOutcome> => {
      if (closed) {
        throw operationError ?? new OperationAbortedError();
      }
      if (operationError && status === 'error') {
        throw operationError;
      }
      if (latestCurrent && status !== 'evaluating') {
        return { superseded: false, evaluation: latestCurrent };
      }
      const read = Promise.withResolvers<UpdateOutcome>();
      reads.add(read);
      try {
        return await waitWithAbort(read.promise, options?.signal);
      } finally {
        reads.delete(read);
      }
    };
    const update = async (change: DocumentUpdate): Promise<UpdateOutcome> => {
      if (closed) {
        throw operationError ?? new OperationAbortedError();
      }
      // JS consumers can bypass the discriminated TypeScript update contract.
      const wireChange: { transient?: boolean; stage?: unknown } = change;
      if (wireChange.transient === true && wireChange.stage !== undefined) {
        throw new TypeError('A transient document update cannot stage files.');
      }
      pending.resolve({ superseded: true });
      clearEvaluationDeadline?.();
      settleReads({ superseded: true });
      pending = Promise.withResolvers<UpdateOutcome>();
      hasUpdateWaiter = true;
      pendingSettled = false;
      intent += 1;
      evaluationId = undefined;
      evaluationOperationId = undefined;
      timedOutEvaluationId = undefined;
      timedOutUnknownIntent = false;
      operationError = undefined;
      setStatus('evaluating');
      const encodedStage =
        change.stage &&
        Object.fromEntries(
          Object.entries(change.stage).map(([path, bytes]) => [
            path,
            typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes),
          ]),
        );
      const command: UpdateArgs = {
        documentId,
        intent,
        ...(change.parameters ? { parameters: change.parameters } : {}),
        ...(change.evaluateOptions ? { evaluateOptions: change.evaluateOptions } : {}),
        ...(change.transient === undefined ? {} : { transient: change.transient }),
        ...(encodedStage ? { stage: encodedStage } : {}),
      };
      channel.notify('update', command);
      const dispatchedIntent = intent;
      clearEvaluationDeadline = armDeadline({
        operationId: () => evaluationOperationId,
        fallbackRecoveryId: `pending:${documentId}:${dispatchedIntent}`,
        isFresh: () => !closed && intent === dispatchedIntent && !pendingSettled,
        callback: () => {
          if (closed || pendingSettled) {
            return;
          }
          timedOutEvaluationId = evaluationId;
          timedOutUnknownIntent = evaluationId === undefined;
          operationError = new OperationTimeoutError(evaluationPhase, 'Document evaluation timed out.');
          pending.reject(operationError);
          for (const read of reads) {
            read.reject(operationError);
          }
          reads.clear();
          pendingSettled = true;
          hasUpdateWaiter = false;
          setStatus('error');
        },
      });
      return pending.promise;
    };
    const view = (id?: string, initial: WideViewRequest = {}) => {
      if (closed) {
        throw new OperationAbortedError();
      }
      const subscriptionId = randomUuid();
      let requestId = randomUuid();
      let request = { ...initial };
      let viewClosed = false;
      let viewStatus: ViewStatus = 'rendering';
      let viewEvaluationId = evaluationId;
      let rendered: Rendering | undefined;
      let viewOperationError: Error | undefined;
      let viewOperationId: string | undefined;
      let viewPhase = 'render';
      let timedOutViewToken: string | undefined;
      let timedOutViewRequestId: string | undefined;
      let viewPending = Promise.withResolvers<ViewUpdateOutcome>();
      let hasViewUpdateWaiter = false;
      let clearViewDeadline: (() => void) | undefined;
      const viewReads = new Set<Waiter<ViewUpdateOutcome>>();
      const settleViewReads = (outcome: ViewUpdateOutcome): void => {
        for (const read of viewReads) {
          read.resolve(outcome);
        }
        viewReads.clear();
      };
      const viewTopics = { rendered: new Topic<Rendering>(), status: new Topic<ViewStatus>() };
      const viewDisposers: Array<() => void> = [];
      const setViewStatus = (next: ViewStatus): void => {
        viewStatus = next;
        viewTopics.status.emit(next);
      };
      const startViewDeadline = (dispatchedRequestId: string, dispatchedEvaluationId?: string): void => {
        clearViewDeadline = armDeadline({
          operationId: () => viewOperationId,
          fallbackRecoveryId: `pending-view:${subscriptionId}:${dispatchedEvaluationId ?? ''}:${dispatchedRequestId}`,
          isFresh: () =>
            !viewClosed &&
            requestId === dispatchedRequestId &&
            viewStatus === 'rendering' &&
            (dispatchedEvaluationId === undefined || viewEvaluationId === dispatchedEvaluationId),
          callback: () => {
            timedOutViewRequestId = dispatchedRequestId;
            if (dispatchedEvaluationId) {
              timedOutViewToken = `${dispatchedEvaluationId}:${dispatchedRequestId}`;
            }
            viewOperationError = new OperationTimeoutError(viewPhase, 'View rendering timed out.');
            if (hasViewUpdateWaiter) {
              viewPending.reject(viewOperationError);
            } else {
              viewPending.resolve({ superseded: true });
            }
            for (const read of viewReads) {
              read.reject(viewOperationError);
            }
            viewReads.clear();
            hasViewUpdateWaiter = false;
            setViewStatus('error');
          },
        });
      };
      const closeView = (): void => {
        if (viewClosed) {
          return;
        }
        viewClosed = true;
        clearViewDeadline?.();
        views.delete(subscriptionId);
        viewPending.resolve({ superseded: true });
        for (const read of viewReads) {
          read.reject(new OperationAbortedError());
        }
        viewReads.clear();
        for (const dispose of viewDisposers) {
          dispose();
        }
        try {
          channel.notify('closeView', { subscriptionId });
        } catch {
          // The channel may already be closed during transport teardown.
        }
        setViewStatus('closed');
        viewTopics.rendered.dispose();
        viewTopics.status.dispose();
      };
      const terminateView = (error: RuntimeTerminatedError): void => {
        if (viewClosed) {
          return;
        }
        viewClosed = true;
        viewOperationError = error;
        clearViewDeadline?.();
        views.delete(subscriptionId);
        if (!hasViewUpdateWaiter) {
          void consumeRejection(viewPending.promise);
        }
        viewPending.reject(error);
        for (const read of viewReads) {
          read.reject(error);
        }
        viewReads.clear();
        for (const dispose of viewDisposers) {
          dispose();
        }
        setViewStatus('error');
        viewTopics.rendered.dispose();
        viewTopics.status.dispose();
      };
      const receiveRendered = async (wire: RuntimeDocumentProtocol['notifies']['rendered']['args']): Promise<void> => {
        if (wire.subscriptionId === subscriptionId) {
          onTerminal(`render:${subscriptionId}:${wire.evaluationId}:${wire.requestId}`);
        }
        if (wire.subscriptionId !== subscriptionId || viewClosed) {
          return;
        }
        const admitted = (): boolean =>
          isCurrent(wire.intent, wire.evaluationId) &&
          wire.requestId === requestId &&
          !viewClosed &&
          timedOutViewToken !== `${wire.evaluationId}:${wire.requestId}` &&
          timedOutViewRequestId !== wire.requestId;
        try {
          const result = await materialiseRendering(wire, this.#resolveBinary, admitted);
          if (!result) {
            return;
          }
          rendered = result;
          clearViewDeadline?.();
          viewOperationError = undefined;
          viewPending.resolve({ superseded: false, rendering: result });
          hasViewUpdateWaiter = false;
          settleViewReads({ superseded: false, rendering: result });
          viewTopics.rendered.emit(result);
          setViewStatus(result.success ? 'ready' : 'error');
        } catch (error) {
          if (!admitted()) {
            return;
          }
          viewOperationError = error instanceof Error ? error : new Error(String(error));
          clearViewDeadline?.();
          if (hasViewUpdateWaiter) {
            viewPending.reject(error);
          } else {
            viewPending.resolve({ superseded: true });
          }
          for (const read of viewReads) {
            read.reject(error);
          }
          viewReads.clear();
          hasViewUpdateWaiter = false;
          setViewStatus('error');
        }
      };
      viewDisposers.push(
        channel.onNotify('evaluating', (value) => {
          if (value.documentId !== documentId || value.intent !== intent || viewClosed) {
            return;
          }
          if (timedOutViewRequestId === requestId && viewEvaluationId === undefined) {
            viewEvaluationId = value.evaluationId;
            timedOutViewToken = `${value.evaluationId}:${requestId}`;
            return;
          }
          if (timedOutViewToken === `${value.evaluationId}:${requestId}`) {
            return;
          }
          const newViewEvaluation = viewEvaluationId !== undefined && viewEvaluationId !== value.evaluationId;
          if (viewEvaluationId && viewEvaluationId !== value.evaluationId) {
            viewPending.resolve({ superseded: true });
            settleViewReads({ superseded: true });
            viewPending = Promise.withResolvers<ViewUpdateOutcome>();
            hasViewUpdateWaiter = false;
          }
          viewEvaluationId = value.evaluationId;
          viewOperationId = undefined;
          if (newViewEvaluation) {
            clearViewDeadline?.();
            timedOutViewToken = undefined;
            timedOutViewRequestId = undefined;
            startViewDeadline(requestId, value.evaluationId);
          }
          rendered = undefined;
          viewOperationError = undefined;
          setViewStatus('rendering');
        }),
        channel.onNotify('errorEvent', (value) => {
          if (
            value.scope !== 'operation' ||
            value.documentId !== documentId ||
            value.subscriptionId !== subscriptionId ||
            value.requestId !== requestId ||
            value.intent !== intent ||
            value.evaluationId !== viewEvaluationId ||
            value.operationId !== viewOperationId ||
            viewClosed
          ) {
            return;
          }
          viewOperationError =
            value.code === 'OPERATION_TIMEOUT'
              ? new OperationTimeoutError(value.phase, value.message)
              : new OperationAbortedError(value.phase, value.message);
          clearViewDeadline?.();
          if (hasViewUpdateWaiter) {
            viewPending.reject(viewOperationError);
          } else {
            viewPending.resolve({ superseded: true });
          }
          for (const read of viewReads) {
            read.reject(viewOperationError);
          }
          viewReads.clear();
          setViewStatus('error');
          hasViewUpdateWaiter = false;
        }),
        channel.onNotify('rendering', (value) => {
          if (
            value.subscriptionId === subscriptionId &&
            value.requestId === requestId &&
            isCurrent(value.intent, value.evaluationId) &&
            timedOutViewToken !== `${value.evaluationId}:${value.requestId}` &&
            timedOutViewRequestId !== value.requestId
          ) {
            viewOperationId = `render:${subscriptionId}:${value.evaluationId}:${requestId}`;
            viewPhase = 'render';
            setViewStatus('rendering');
          }
        }),
        channel.onNotify('progress', (value) => {
          if (
            value.documentId === documentId &&
            value.operationId.startsWith(`render:${subscriptionId}:`) &&
            value.requestId === requestId &&
            value.evaluationId === viewEvaluationId
          ) {
            viewOperationId = value.operationId;
            if (value.phase !== 'queued') {
              viewPhase = value.phase;
            }
          }
        }),
        channel.onNotify('rendered', receiveRendered),
      );
      const onView = <E extends keyof ViewEvents>(
        event: E,
        handler: (value: ViewEvents[E]) => void,
        options?: { signal?: AbortSignal },
      ): (() => void) => {
        // SAFETY: event selects the matching Topic leaf; each leaf emits ViewEvents[event].
        const topic = viewTopics[event] as Topic<ViewEvents[E]>;
        const unsubscribe = topic.subscribe(handler, options);
        let subscribed = true;
        if (event === 'status') {
          const captured = viewStatus;
          queueMicrotask(() => {
            if (subscribed && !viewClosed && !options?.signal?.aborted && viewStatus === captured) {
              try {
                (handler as (value: ViewStatus) => void)(captured);
              } catch {
                /* Listener errors stay local. */
              }
            }
          });
        }
        if (event === 'rendered' && rendered) {
          const captured = rendered;
          queueMicrotask(() => {
            if (subscribed && !viewClosed && !options?.signal?.aborted && rendered === captured) {
              try {
                (handler as (value: Rendering) => void)(captured);
              } catch {
                /* Listener errors stay local. */
              }
            }
          });
        }
        return () => {
          subscribed = false;
          unsubscribe();
        };
      };
      const read = async (options?: { signal?: AbortSignal }): Promise<ViewUpdateOutcome> => {
        if (viewClosed) {
          throw viewOperationError ?? new OperationAbortedError();
        }
        if (viewOperationError && viewStatus === 'error') {
          throw viewOperationError;
        }
        if (rendered && viewStatus !== 'rendering') {
          return { superseded: false, rendering: rendered };
        }
        const read = Promise.withResolvers<ViewUpdateOutcome>();
        viewReads.add(read);
        try {
          return await waitWithAbort(read.promise, options?.signal);
        } finally {
          viewReads.delete(read);
        }
      };
      const updateView = async (change: WideViewRequest): Promise<ViewUpdateOutcome> => {
        if (viewClosed) {
          throw viewOperationError ?? new OperationAbortedError();
        }
        viewPending.resolve({ superseded: true });
        clearViewDeadline?.();
        settleViewReads({ superseded: true });
        viewPending = Promise.withResolvers<ViewUpdateOutcome>();
        hasViewUpdateWaiter = true;
        requestId = randomUuid();
        viewOperationId = undefined;
        timedOutViewToken = undefined;
        timedOutViewRequestId = undefined;
        request = { ...request, ...change };
        rendered = undefined;
        viewOperationError = undefined;
        setViewStatus('rendering');
        channel.notify('updateView', { subscriptionId, requestId, ...change });
        const dispatchedRequestId = requestId;
        startViewDeadline(dispatchedRequestId, viewEvaluationId);
        return viewPending.promise;
      };
      channel.notify('openView', { documentId, subscriptionId, requestId, ...(id ? { view: id } : {}), ...initial });
      const initialRequestId = requestId;
      startViewDeadline(initialRequestId, viewEvaluationId);
      const handle = {
        get view() {
          return id;
        },
        get request() {
          return request;
        },
        rendering: read,
        update: updateView,
        on: onView,
        close: closeView,
      };
      views.set(subscriptionId, { close: closeView, terminate: terminateView });
      return handle;
    };
    const exportDocument = async (target: string, request: WideExportRequest = {}): Promise<ExportResult> => {
      if (closed) {
        throw operationError ?? new OperationAbortedError();
      }
      const operationId = randomUuid();
      const closedExport = Promise.withResolvers<never>();
      const timedExport = Promise.withResolvers<never>();
      exportsInFlight.set(operationId, closedExport);
      let exportPhase = 'write';
      const disposeProgress = channel.onNotify('progress', (value) => {
        if (value.operationId === operationId) {
          exportPhase = value.phase === 'writing' ? 'write' : value.phase;
        }
      });
      const clearExportDeadline = armDeadline({
        operationId: () => operationId,
        fallbackRecoveryId: `pending-export:${operationId}`,
        isFresh: () => !closed && exportsInFlight.has(operationId),
        callback: () => {
          timedExport.reject(new OperationTimeoutError(exportPhase, 'Document export timed out.'));
        },
      });
      const onAbort = (): void => {
        channel.notify('abort', { operationId, reason: 0 });
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (request.signal?.aborted) {
          throw new OperationAbortedError();
        }
        const work = async (): Promise<ExportResult> => {
          const wire = await channel.call(
            'export',
            {
              documentId,
              operationId,
              target,
              ...(request.options ? { options: request.options } : {}),
              ...(request.content ? { content: request.content } : {}),
            },
            request.signal,
          );
          const result = await materialiseDocumentExport(
            wire,
            this.#resolveBinary,
            () => !closed && !request.signal?.aborted,
          );
          if (!result) {
            throw new OperationAbortedError();
          }
          return result;
        };
        const running = (async (): Promise<ExportResult> => {
          try {
            return await work();
          } finally {
            onTerminal(operationId);
          }
        })();
        return await Promise.race([running, closedExport.promise, timedExport.promise]);
      } finally {
        clearExportDeadline();
        disposeProgress();
        exportsInFlight.delete(operationId);
        request.signal?.removeEventListener('abort', onAbort);
      }
    };
    const handle = { id: documentId, evaluation, update, view, export: exportDocument, on, close };
    documents.set(documentId, handle);
    terminators.set(documentId, terminate);
    channel.notify('open', { ...args, intent });
    clearEvaluationDeadline = armDeadline({
      operationId: () => evaluationOperationId,
      fallbackRecoveryId: `pending:${documentId}:${intent}`,
      isFresh: () => !closed && !pendingSettled,
      callback: () => {
        if (closed || pendingSettled) {
          return;
        }
        timedOutEvaluationId = evaluationId;
        timedOutUnknownIntent = evaluationId === undefined;
        operationError = new OperationTimeoutError(evaluationPhase, 'Document evaluation timed out.');
        pending.resolve({ superseded: true });
        for (const read of reads) {
          read.reject(operationError);
        }
        reads.clear();
        pendingSettled = true;
        setStatus('error');
      },
    });
    return handle;
  }

  /** Close every document and release wire listeners. */
  public close(): void {
    for (const document of this.#documents.values()) {
      document.close();
    }
    for (const dispose of this.#disposers) {
      dispose();
    }
    this.#disposers.length = 0;
  }

  /** Fail every pending operation when the transport is lost.
   * @param error - The transport termination reason.
   */
  public terminate(error: RuntimeTerminatedError): void {
    for (const terminate of this.#terminators.values()) {
      terminate(error);
    }
    for (const dispose of this.#disposers) {
      dispose();
    }
    this.#disposers.length = 0;
  }
}
