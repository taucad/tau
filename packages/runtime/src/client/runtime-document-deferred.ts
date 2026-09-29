import { randomUuid } from '@taucad/utils/id';
import { OperationAbortedError } from '#framework/runtime-worker-client.js';
import type { RuntimeDocumentSessionClient } from '#client/runtime-document-session.js';
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

type OpenArgs = Omit<RuntimeDocumentProtocol['notifies']['open']['args'], 'documentId' | 'intent'>;
type ConnectedDocument = ReturnType<RuntimeDocumentSessionClient['open']>;
const consumeRejection = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* A local close is observed by public waiters. */
  }
};

const raceWithAbort = async <T>(promise: Promise<T>, close: Promise<never>, signal?: AbortSignal): Promise<T> => {
  if (signal?.aborted) {
    throw new OperationAbortedError();
  }
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(new OperationAbortedError());
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, close, aborted.promise]);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
};

/** Open a document synchronously while the shared transport connects lazily. @internal */
export function openDeferredDocument(
  args: OpenArgs,
  connect: () => Promise<RuntimeDocumentSessionClient>,
  signal?: AbortSignal,
): ConnectedDocument {
  const id = randomUuid();
  let closed = false;
  let connected: ConnectedDocument | undefined;
  const closedReads = Promise.withResolvers<never>();
  const closedUpdates = Promise.withResolvers<UpdateOutcome>();
  void consumeRejection(closedReads.promise);
  const prepare = async (): Promise<ConnectedDocument> => {
    const session = await connect();
    if (closed) {
      throw new OperationAbortedError();
    }
    connected = session.open({ ...args, documentId: id });
    return connected;
  };
  const ready = prepare();
  // An unopened handle can be closed without any consumer awaiting the connection.
  void consumeRejection(ready);
  const requireOpen = (): void => {
    if (closed) {
      throw new OperationAbortedError();
    }
  };
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    closedReads.reject(new OperationAbortedError());
    closedUpdates.resolve({ superseded: true });
    signal?.removeEventListener('abort', close);
    connected?.close();
  };
  if (signal?.aborted) {
    close();
  } else {
    signal?.addEventListener('abort', close, { once: true });
  }
  const on = <E extends 'described' | 'evaluated' | 'progress' | 'status'>(
    event: E,
    handler: (
      value: E extends 'described'
        ? Description
        : E extends 'evaluated'
          ? Evaluation
          : E extends 'status'
            ? DocumentStatus
            : { phase: string; detail?: Record<string, unknown> },
    ) => void,
    options?: { signal?: AbortSignal },
  ): (() => void) => {
    requireOpen();
    let unsubscribe: (() => void) | undefined;
    let removed = false;
    const attach = async (): Promise<void> => {
      try {
        const document = await ready;
        if (!removed && !closed) {
          // SAFETY: the event branch selects the same payload as the public overload.
          unsubscribe = (
            document.on as (
              name: string,
              callback: (value: unknown) => void,
              settings?: { signal?: AbortSignal },
            ) => () => void
          )(event, handler as (value: unknown) => void, options);
        }
      } catch {
        if (event === 'status' && !removed && !closed && !options?.signal?.aborted) {
          try {
            (handler as (value: DocumentStatus) => void)('error');
          } catch {
            /* Subscriber errors are isolated. */
          }
        }
      }
    };
    void attach();
    return () => {
      removed = true;
      unsubscribe?.();
    };
  };
  const view = (viewId?: string, initial: WideViewRequest = {}) => {
    requireOpen();
    let viewClosed = false;
    const closedViewReads = Promise.withResolvers<never>();
    const closedViewUpdates = Promise.withResolvers<ViewUpdateOutcome>();
    void consumeRejection(closedViewReads.promise);
    let attached: ReturnType<ConnectedDocument['view']> | undefined;
    let request = { ...initial };
    const prepareView = async (): Promise<ReturnType<ConnectedDocument['view']>> => {
      const document = await ready;
      if (viewClosed || closed) {
        throw new OperationAbortedError();
      }
      attached = document.view(viewId, request);
      return attached;
    };
    const readyView = prepareView();
    void consumeRejection(readyView);
    const requireView = (): void => {
      requireOpen();
      if (viewClosed) {
        throw new OperationAbortedError();
      }
    };
    const closeView = (): void => {
      if (viewClosed) {
        return;
      }
      viewClosed = true;
      closedViewReads.reject(new OperationAbortedError());
      closedViewUpdates.resolve({ superseded: true });
      attached?.close();
    };
    const onView = <E extends 'rendered' | 'status'>(
      event: E,
      handler: (value: E extends 'rendered' ? Rendering : ViewStatus) => void,
      options?: { signal?: AbortSignal },
    ): (() => void) => {
      requireView();
      let unsubscribe: (() => void) | undefined;
      let removed = false;
      const attach = async (): Promise<void> => {
        try {
          const active = await readyView;
          if (!removed && !viewClosed && !closed) {
            unsubscribe = (
              active.on as (
                name: string,
                callback: (value: unknown) => void,
                settings?: { signal?: AbortSignal },
              ) => () => void
            )(event, handler as (value: unknown) => void, options);
          }
        } catch {
          if (event === 'status' && !removed && !viewClosed && !closed && !options?.signal?.aborted) {
            try {
              (handler as (value: ViewStatus) => void)('error');
            } catch {
              /* Subscriber errors are isolated. */
            }
          }
        }
      };
      void attach();
      return () => {
        removed = true;
        unsubscribe?.();
      };
    };
    return {
      get view() {
        return viewId;
      },
      get request() {
        return request;
      },
      on: onView as ReturnType<ConnectedDocument['view']>['on'],
      async rendering(options?: { signal?: AbortSignal }): Promise<ViewUpdateOutcome> {
        requireView();
        const pull = async (): Promise<ViewUpdateOutcome> => {
          const active = await readyView;
          return active.rendering(options);
        };
        return raceWithAbort(pull(), Promise.race([closedReads.promise, closedViewReads.promise]), options?.signal);
      },
      async update(change: WideViewRequest): Promise<ViewUpdateOutcome> {
        requireView();
        request = { ...request, ...change };
        const apply = async (): Promise<ViewUpdateOutcome> => {
          const active = await readyView;
          return active.update(change);
        };
        const closedDocument = async (): Promise<ViewUpdateOutcome> => {
          await closedUpdates.promise;
          return { superseded: true };
        };
        return Promise.race([apply(), closedViewUpdates.promise, closedDocument()]);
      },
      close: closeView,
    };
  };
  return {
    id,
    async evaluation(options?: { signal?: AbortSignal }): Promise<UpdateOutcome> {
      requireOpen();
      const pull = async (): Promise<UpdateOutcome> => {
        const document = await ready;
        return document.evaluation(options);
      };
      return raceWithAbort(pull(), closedReads.promise, options?.signal);
    },
    async update(change: DocumentUpdate): Promise<UpdateOutcome> {
      requireOpen();
      const apply = async (): Promise<UpdateOutcome> => {
        const document = await ready;
        return document.update(change);
      };
      return Promise.race([apply(), closedUpdates.promise]);
    },
    view,
    async export(target: string, request?: WideExportRequest): Promise<ExportResult> {
      requireOpen();
      const runExport = async (): Promise<ExportResult> => {
        const document = await ready;
        return document.export(target, request);
      };
      return raceWithAbort(runExport(), closedReads.promise, request?.signal);
    },
    on: on as ConnectedDocument['on'],
    close,
  };
}
