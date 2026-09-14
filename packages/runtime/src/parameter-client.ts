import { createActor, fromCallback, fromPromise } from 'xstate';
import type { JSONValue } from '@taucad/types';
import type { GetParametersResult } from '#types/runtime.types.js';
import type { RuntimeSource } from '#client/runtime-client-core.js';
import { admitParameterManifest, ParameterAdmissionError } from '#parameter/manifest.js';
import type { ParameterDiagnostic, ParameterManifest, ParameterResolutionOptions } from '#parameter/manifest.js';
import { parameterSetMachine } from '#parameter-set.machine.js';
import type {
  ParameterSetApplyInput,
  ParameterSetApplyResult,
  ParameterSetAuthoritySnapshot,
  ParameterSetFlushInput,
  ParameterSetIdentity,
  ParameterSetMachineEvent,
  ParameterSetObserveInput,
  ParameterSetOutcome,
  ParameterSetPlanInput,
  ParameterSetPlanResult,
  ParameterSetReconcileInput,
  ParameterSetRequest,
  ParameterSetResolveInput,
  ParameterSetTarget,
} from '#parameter-set.machine.js';

/** Request for one runtime manifest and its current authority snapshot. @public */
export type ParameterResolveRequest = Readonly<{
  source: RuntimeSource;
  resolution?: ParameterResolutionOptions;
  signal?: AbortSignal;
}>;

/** Admitted runtime manifest paired with the authority state used for edits. @public */
export type ParameterResolveOutcome =
  | Readonly<{
      success: true;
      manifest: ParameterManifest;
      current: ParameterSetAuthoritySnapshot;
    }>
  | Readonly<{ success: false; diagnostics: readonly ParameterDiagnostic[] }>;

/** Result of draining or forcibly disposing one parameter client. @public */
export type ParameterCloseOutcome =
  | Readonly<{ status: 'settled'; identity?: ParameterSetIdentity }>
  | Readonly<{
      status: 'failed';
      code: string;
      message: string;
      identity?: ParameterSetIdentity;
    }>
  | Readonly<{ status: 'forced'; identity?: ParameterSetIdentity }>;

/** Headless facade over the shared parameter-set owner. @public */
export type ParameterClient = Readonly<{
  resolve(input: ParameterResolveRequest): Promise<ParameterResolveOutcome>;
  submit(request: ParameterSetRequest): Promise<ParameterSetOutcome>;
  confirm(input: Readonly<{ requestId: string; planFingerprint: string }>): Promise<ParameterSetOutcome>;
  cancel(input: Readonly<{ requestId: string }>): Promise<ParameterSetOutcome>;
  close(input: Readonly<{ requestId: string; invalidDrafts?: readonly string[] }>): Promise<ParameterCloseOutcome>;
}>;

type ParameterClientEffects = Readonly<{
  resolveManifest(input: ParameterResolveRequest): Promise<GetParametersResult>;
  resolveParameterSet(input: ParameterSetResolveInput, signal: AbortSignal): Promise<ParameterSetAuthoritySnapshot>;
  planParameterOperation(input: ParameterSetPlanInput, signal: AbortSignal): Promise<ParameterSetPlanResult>;
  applyParameterOperation(input: ParameterSetApplyInput, signal: AbortSignal): Promise<ParameterSetApplyResult>;
  readParameterSet(input: ParameterSetReconcileInput, signal: AbortSignal): Promise<ParameterSetAuthoritySnapshot>;
  observeParameterSet(input: ParameterSetObserveInput, emit: (event: ParameterSetMachineEvent) => void): () => void;
  flushParameterSet(input: ParameterSetFlushInput, signal: AbortSignal): Promise<void>;
}>;

type PendingRequest = {
  readonly request: ParameterSetRequest;
  readonly promises: Array<ReturnType<typeof Promise.withResolvers<ParameterSetOutcome>>>;
};

const sameJsonValue = (left: JSONValue, right: JSONValue): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJsonValue(item, right[index]!))
    );
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key]!, right[key]!))
  );
};

const sameRequestDelivery = (left: ParameterSetRequest, right: ParameterSetRequest): boolean =>
  sameJsonValue(left as unknown as JSONValue, right as unknown as JSONValue);

const inactiveOutcome = (requestId: string): ParameterSetOutcome => ({
  status: 'rejected',
  requestId,
  code: 'REQUEST_NOT_ACTIVE',
  message: 'The parameter request is not active.',
});

const collisionOutcome = (requestId: string): ParameterSetOutcome => ({
  status: 'rejected',
  requestId,
  code: 'REQUEST_ID_COLLISION',
  message: 'The request ID is already in use by a different parameter operation.',
});

const diagnosticsFromFailure = (
  result: Extract<GetParametersResult, { success: false }>,
): readonly ParameterDiagnostic[] =>
  result.issues.flatMap((issue) => {
    if (!Array.isArray(issue.details)) {
      return [];
    }
    return issue.details.filter(
      (detail): detail is ParameterDiagnostic =>
        typeof detail === 'object' && detail !== null && typeof Reflect.get(detail, 'code') === 'string',
    );
  });

/**
 * Create one headless parameter client using the accepted parameter-set machine and injected authority effects.
 *
 * @param options - Authority target, initial correlation identity, runtime resolver, and the six machine effects.
 * @returns A started client whose operations settle with the machine's public outcomes.
 * @public
 */
export function createParameterClient(
  options: Readonly<{ target: ParameterSetTarget; initialRequestId: string }> & ParameterClientEffects,
): ParameterClient {
  const machine = parameterSetMachine.provide({
    actors: {
      resolveParameterSet: fromPromise(async ({ input, signal }) => options.resolveParameterSet(input, signal)),
      planParameterOperation: fromPromise(async ({ input, signal }) => options.planParameterOperation(input, signal)),
      applyParameterOperation: fromPromise(async ({ input, signal }) => options.applyParameterOperation(input, signal)),
      readParameterSet: fromPromise(async ({ input, signal }) => options.readParameterSet(input, signal)),
      observeParameterSet: fromCallback(({ input, sendBack }) => options.observeParameterSet(input, sendBack)),
      flushParameterSet: fromPromise(async ({ input, signal }) => options.flushParameterSet(input, signal)),
    },
  });
  const actor = createActor(machine, {
    input: {
      target: options.target,
      initialRequestId: options.initialRequestId,
    },
  });
  const pending = new Map<string, PendingRequest>();
  let closePromise: Promise<ParameterCloseOutcome> | undefined;
  let accepting = true;
  let resolutionGeneration = 0;
  let activeResolution:
    | {
        readonly controller: AbortController;
        promise?: Promise<ParameterResolveOutcome>;
      }
    | undefined;

  const abortError = (signal: AbortSignal, message: string): Error =>
    signal.reason instanceof Error ? signal.reason : new DOMException(message, 'AbortError');

  const waitFor = async <Value>(read: () => Value | undefined, signal?: AbortSignal): Promise<Value> => {
    signal?.throwIfAborted();
    const immediate = read();
    if (immediate !== undefined) {
      return immediate;
    }
    return new Promise<Value>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        subscription.unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        settle();
      };
      const onAbort = () => {
        finish(() => {
          reject(
            signal === undefined
              ? new DOMException('Parameter resolution aborted.', 'AbortError')
              : abortError(signal, 'Parameter resolution aborted.'),
          );
        });
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const subscription = actor.subscribe(() => {
        try {
          const value = read();
          if (value === undefined) {
            return;
          }
          finish(() => {
            resolve(value);
          });
        } catch (error) {
          finish(() => {
            reject(
              error instanceof Error
                ? error
                : new Error('Parameter client observation failed', {
                    cause: error,
                  }),
            );
          });
        }
      });
      if (signal?.aborted) {
        onAbort();
      }
    });
  };

  const raceWithSignal = async <Value>(promise: Promise<Value>, signal: AbortSignal): Promise<Value> => {
    signal.throwIfAborted();
    let rejectAbort: (reason: Error) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      rejectAbort(abortError(signal, 'Parameter resolution aborted.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([promise, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };

  actor.subscribe((snapshot) => {
    const { outcome } = snapshot.context;
    if (outcome === undefined) {
      return;
    }
    const item = pending.get(outcome.requestId);
    if (item === undefined) {
      return;
    }
    pending.delete(outcome.requestId);
    for (const promise of item.promises) {
      promise.resolve(outcome);
    }
  });
  actor.start();

  const awaitActiveOutcome = async (
    requestId: string,
    event: ParameterSetMachineEvent,
  ): Promise<ParameterSetOutcome> => {
    const item = pending.get(requestId);
    if (item === undefined) {
      return inactiveOutcome(requestId);
    }
    const promise = Promise.withResolvers<ParameterSetOutcome>();
    item.promises.push(promise);
    actor.send(event);
    return promise.promise;
  };

  return {
    async resolve(input): Promise<ParameterResolveOutcome> {
      input.signal?.throwIfAborted();
      if (!accepting) {
        throw new DOMException('The parameter client is closing.', 'AbortError');
      }
      activeResolution?.controller.abort(
        new DOMException('Parameter resolution was superseded by a newer request.', 'AbortError'),
      );
      const controller = new AbortController();
      const operation: NonNullable<typeof activeResolution> = { controller };
      const abortFromCaller = () => {
        controller.abort(
          input.signal === undefined ? undefined : abortError(input.signal, 'Parameter resolution aborted.'),
        );
      };
      input.signal?.addEventListener('abort', abortFromCaller, { once: true });
      activeResolution = operation;
      const promise = (async (): Promise<ParameterResolveOutcome> => {
        try {
          controller.signal.throwIfAborted();
          const requestId = `${options.initialRequestId}:${++resolutionGeneration}`;
          const before = actor.getSnapshot();
          actor.send(
            before.matches('disconnected') || before.matches('disconnecting')
              ? { type: 'watch.retry', requestId }
              : { type: 'resolve', requestId },
          );
          const current = await waitFor(() => {
            const snapshot = actor.getSnapshot();
            if (
              snapshot.context.current !== undefined &&
              snapshot.context.resolutionRequestId === requestId &&
              snapshot.matches('operational') &&
              !snapshot.matches({ operational: 'resolving' })
            ) {
              return snapshot.context.current;
            }
            if (snapshot.context.diagnostic !== undefined || snapshot.status === 'done') {
              throw new Error(snapshot.context.diagnostic?.message ?? 'Parameter authority resolution failed.');
            }
            return undefined;
          }, controller.signal);
          controller.signal.throwIfAborted();
          const result = await raceWithSignal(
            options.resolveManifest({ ...input, signal: controller.signal }),
            controller.signal,
          );
          controller.signal.throwIfAborted();
          if (!result.success) {
            const diagnostics = diagnosticsFromFailure(result);
            if (diagnostics.length === 0) {
              throw new Error(result.issues.map(({ message }) => message).join('; ') || 'Parameter resolution failed.');
            }
            return { success: false, diagnostics };
          }
          try {
            const manifest = await raceWithSignal(admitParameterManifest(result.data), controller.signal);
            controller.signal.throwIfAborted();
            return { success: true, manifest, current };
          } catch (error) {
            if (error instanceof ParameterAdmissionError) {
              return { success: false, diagnostics: error.diagnostics };
            }
            throw error;
          }
        } finally {
          input.signal?.removeEventListener('abort', abortFromCaller);
          if (activeResolution === operation) {
            activeResolution = undefined;
          }
        }
      })();
      operation.promise = promise;
      return promise;
    },

    async submit(request): Promise<ParameterSetOutcome> {
      if (!accepting) {
        return {
          status: 'rejected',
          requestId: request.requestId,
          code: 'OWNER_CLOSING',
          message: 'The parameter authority owner is closing and cannot admit new work.',
        };
      }
      const existing = pending.get(request.requestId);
      if (existing !== undefined) {
        if (!sameRequestDelivery(existing.request, request)) {
          return collisionOutcome(request.requestId);
        }
        const duplicate = Promise.withResolvers<ParameterSetOutcome>();
        existing.promises.push(duplicate);
        actor.send({ type: 'submit', request });
        return duplicate.promise;
      }
      const promise = Promise.withResolvers<ParameterSetOutcome>();
      pending.set(request.requestId, {
        request: structuredClone(request),
        promises: [promise],
      });
      actor.send({ type: 'submit', request });
      return promise.promise;
    },

    async confirm(input): Promise<ParameterSetOutcome> {
      return awaitActiveOutcome(input.requestId, { type: 'confirm', ...input });
    },

    async cancel(input): Promise<ParameterSetOutcome> {
      return awaitActiveOutcome(input.requestId, {
        type: 'cancel',
        requestId: input.requestId,
      });
    },

    async close(input): Promise<ParameterCloseOutcome> {
      if (closePromise !== undefined) {
        return closePromise;
      }
      accepting = false;
      const resolution = activeResolution;
      resolution?.controller.abort(new DOMException('The parameter client is closing.', 'AbortError'));
      const closed = waitFor(() => {
        const snapshot = actor.getSnapshot();
        const identity = snapshot.context.current?.identity;
        if (snapshot.matches('closed')) {
          return {
            status: 'settled',
            ...(identity === undefined ? {} : { identity }),
          } as const;
        }
        if (snapshot.matches('closeFailed')) {
          const { diagnostic } = snapshot.context;
          return {
            status: 'failed',
            code: diagnostic?.code ?? 'FLUSH_FAILED',
            message: diagnostic?.message ?? 'Parameter close failed.',
            ...(identity === undefined ? {} : { identity }),
          } as const;
        }
        if (snapshot.status === 'done') {
          return {
            status: 'forced',
            ...(identity === undefined ? {} : { identity }),
          } as const;
        }
        return undefined;
      });
      if (actor.getSnapshot().status !== 'done') {
        actor.send({
          type: 'close',
          requestId: input.requestId,
          invalidDrafts: input.invalidDrafts,
        });
      }
      closePromise = (async () => {
        await resolution?.promise?.catch(() => undefined);
        return closed;
      })();
      return closePromise;
    },
  };
}
