import { createCallbackLogic, createAsyncLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject } from 'xstate';
import type { CheckedFileWriteResult } from '@taucad/types';
import { eventSchemas } from '#machine-schemas.js';
import type { ParameterResolutionOptions } from '#manifest.js';
import { planParameterChange } from '#planning.js';
import type { ParameterChange } from '#planning.js';
import { sameRecordBytes } from '#record.js';
import type { ParameterSnapshot } from '#snapshot.js';
import { sameRequestDelivery, validRequestShape, validTarget } from '#request.js';
import type {
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetRequestBase,
  ParameterSetTarget,
  ParameterSetPlanResult,
} from '#types.js';

/** Input for the one actor that sequences edits to a parameter target. @public */
export type ParameterSetMachineInput = Readonly<{
  target: ParameterSetTarget;
  resolution?: ParameterResolutionOptions;
}>;
/** Effects receive an immutable target and explicit semantic resolution options. @public */
export type ParameterSetLoadInput = ParameterSetMachineInput & Readonly<{ current?: ParameterSnapshot }>;
/** Serializable parameter workflow state; no promise map or hidden evidence cache. @public */
export type ParameterSetMachineContext = ParameterSetMachineInput &
  Readonly<{
    current?: ParameterSnapshot;
    active?: ParameterSetRequest;
    activeBase?: ParameterSetRequestBase;
    /** Bounded FIFO; a final displaces any queued edit for its field, a transient only a transient. */
    pending: readonly ParameterSetRequest[];
    carriedBases: Readonly<Record<string, ParameterSetRequestBase>>;
    change?: Extract<ParameterChange, { status: 'prepared' }>;
    outcome?: ParameterSetOutcome;
    refresh?: 'record' | 'manifest';
    closing: boolean;
    attempts: number;
    diagnostic?: Readonly<{ code: string; message: string }>;
  }>;
/** Commands and authority notifications for one fixed target. @public */
export type ParameterSetMachineEvent =
  | Readonly<{ type: 'submit'; request: ParameterSetRequest }>
  | Readonly<{ type: 'resolve'; resolution?: ParameterResolutionOptions }>
  | Readonly<{ type: 'watch.changed' }>
  | Readonly<{ type: 'watch.error'; message: string }>
  | Readonly<{ type: 'confirm'; requestId: string; fingerprint: string }>
  | Readonly<{ type: 'cancel'; requestId: string }>
  | Readonly<{ type: 'close'; invalidDrafts?: readonly string[] }>;
/** Native command results remain observable even across immediate state transitions. @public */
export type ParameterSetEmission =
  | Readonly<{
      type: 'settled';
      outcome: ParameterSetOutcome;
      request: ParameterSetRequest;
      /** Authority identity when the command settled, so a rejected editor can adopt it. */
      current?: ParameterSetRequest['expected'];
    }>
  /** A confirm or cancel that names no command this actor holds; never a settlement of a submitted request. */
  | Readonly<{ type: 'command-rejected'; outcome: Extract<ParameterSetOutcome, { status: 'rejected' }> }>
  | Readonly<{ type: 'loaded'; current: ParameterSnapshot }>
  | Readonly<{
      type: 'confirmation-required';
      requestId: string;
      fingerprint: string;
      confirmation: Extract<ParameterSetPlanResult, { status: 'confirmation-required' }>;
    }>
  | Readonly<{ type: 'closed' }>
  | Readonly<{ type: 'close-blocked'; invalidDrafts: readonly string[] }>;

const loadParameterSet = createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
  run: async () => {
    throw new Error('loadParameterSet actor not provided');
  },
});
const commitParameterSet = createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
  run: async () => {
    throw new Error('commitParameterSet actor not provided');
  },
});
const observeParameterSet = createCallbackLogic<ParameterSetMachineEvent, ParameterSetTarget>(() => () => undefined);
const planParameterSet = createAsyncLogic<
  ParameterChange,
  Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest }>
>({ run: async ({ input }) => planParameterChange(input) });
type ParameterSetActorMap = Readonly<{
  loadParameterSet: typeof loadParameterSet;
  commitParameterSet: typeof commitParameterSet;
  observeParameterSet: typeof observeParameterSet;
  planParameterSet: typeof planParameterSet;
}>;
const rejected = (requestId: string, code: string, message: string): ParameterSetOutcome => ({
  status: 'rejected',
  requestId,
  code,
  message,
});
const submittedId = (request: unknown): string =>
  typeof request === 'object' && request !== null && 'requestId' in request && typeof request.requestId === 'string'
    ? request.requestId
    : 'unknown';
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';
const errorDiagnostic = (
  error: unknown,
  fallback = 'RESOLUTION_FAILED',
): Readonly<{ code: string; message: string }> => ({
  code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : fallback,
  message: errorMessage(error),
});
// Pending commands beyond this bound are refused `BUSY` with the editor's draft intact. Newer
// commands for the same field displace older queued ones, so a burst never needs a deep queue.
const pendingLimit = 8;
// Commands for the same field (or the same group operation) displace each other while queued.
const pressureKey = (request: ParameterSetRequest): string => {
  const { operation } = request;
  switch (operation.kind) {
    case 'native-value':
    case 'unit-value': {
      return JSON.stringify(['value', operation.group, operation.pointer]);
    }
    default: {
      return JSON.stringify([operation.kind, operation.group]);
    }
  }
};
/**
 * Index of the queued command a new one replaces, or -1 to append. A queued command has not been
 * planned or written. A final supersedes any queued value edit for its field; a transient only
 * supersedes another transient, so a drag sample never drops a queued release.
 */
const displacedIndex = (pending: readonly ParameterSetRequest[], request: ParameterSetRequest): number => {
  const index = pending.findLastIndex((item) => pressureKey(item) === pressureKey(request));
  if (index === -1) {
    return -1;
  }
  const valueEdit = request.operation.kind === 'native-value' || request.operation.kind === 'unit-value';
  if (valueEdit && request.pressure === 'final') {
    return index;
  }
  return pending[index]!.pressure === 'transient' ? index : -1;
};
const canonicalResolution = (resolution: ParameterResolutionOptions | undefined): string => {
  const { mode, ...rest } = resolution ?? {};
  return JSON.stringify(
    Object.entries(mode === 'declared-only' ? { ...rest, mode } : rest).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
};
const cancelledSettlement = (request: ParameterSetRequest): ParameterSetEmission => ({
  type: 'settled',
  request,
  outcome: { status: 'cancelled-before-apply', requestId: request.requestId },
});
/**
 * Settle an uncertain checked write by reading the record back. Equal to the bytes we meant to
 * write, the intended state holds; still equal to the bytes we planned from, the write never
 * landed; anything else is a foreign write over an unknown outcome.
 */
const recoveredOutcome = (
  context: ParameterSetMachineContext,
  reloaded: ParameterSnapshot,
): Extract<ParameterSetOutcome, { status: 'committed' | 'known-not-applied-failure' | 'indeterminate' }> => {
  const { requestId } = context.active!;
  const change = context.change!;
  if (sameRecordBytes(reloaded.bytes, change.write.data)) {
    return { status: 'committed', requestId, revision: reloaded.identity, write: 'reconciled' };
  }
  if (sameRecordBytes(reloaded.bytes, change.write.preconditions[0]?.expected ?? null)) {
    return {
      status: 'known-not-applied-failure',
      requestId,
      code: 'WRITE_FAILED',
      message: 'The parameter record still holds the bytes this change was planned from.',
    };
  }
  return {
    status: 'indeterminate',
    requestId,
    code: 'UNKNOWN_APPLICATION',
    message: 'The parameter record holds bytes this actor did not write; the write outcome is unknown.',
  };
};

const knownRefusal = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'applicationState' in error &&
  error.applicationState === 'known-not-applied';

type ParameterSetEnqueue = EnqueueObject<ParameterSetMachineEvent, ParameterSetEmission>;
type ParameterSetPatch = Partial<ParameterSetMachineContext>;
type Submit = Extract<ParameterSetMachineEvent, { type: 'submit' }>;
type Close = Extract<ParameterSetMachineEvent, { type: 'close' }>;
type Resolve = Extract<ParameterSetMachineEvent, { type: 'resolve' }>;
type Cancel = Extract<ParameterSetMachineEvent, { type: 'cancel' }>;

const isUncertain = (context: ParameterSetMachineContext): boolean =>
  context.outcome?.status === 'indeterminate' && context.outcome.code === 'RECOVERY_FAILED';
const isInvalidClose = (event: Close): boolean => (event.invalidDrafts?.length ?? 0) > 0;
const isSameResolution = (context: ParameterSetMachineContext, event: Resolve): boolean =>
  canonicalResolution(event.resolution) === canonicalResolution(context.resolution);
const isSameDelivery = (context: ParameterSetMachineContext, request: ParameterSetRequest): boolean =>
  [context.active, ...context.pending].some((queued) => queued !== undefined && sameRequestDelivery(queued, request));
const isCollision = (context: ParameterSetMachineContext, request: ParameterSetRequest): boolean =>
  [context.active, ...context.pending].some((queued) => queued?.requestId === request.requestId);
const isQueueAvailable = (context: ParameterSetMachineContext, request: ParameterSetRequest): boolean =>
  !context.closing &&
  validRequestShape(request) &&
  (context.pending.length < pendingLimit || displacedIndex(context.pending, request) !== -1);
const isConfirmed = (
  context: ParameterSetMachineContext,
  event: Extract<ParameterSetMachineEvent, { type: 'confirm' }>,
) =>
  context.active?.requestId === event.requestId && context.change?.confirmation?.planFingerprint === event.fingerprint;

const accept = (request: ParameterSetRequest): ParameterSetPatch => ({
  active: structuredClone(request),
  activeBase: undefined,
  attempts: 0,
  outcome: undefined,
});

const queue = (
  context: ParameterSetMachineContext,
  request: ParameterSetRequest,
  enq: ParameterSetEnqueue,
): ParameterSetPatch => {
  const index = displacedIndex(context.pending, request);
  if (index === -1) {
    return { pending: [...context.pending, structuredClone(request)] };
  }
  const displaced = context.pending[index]!;
  const carriedBase = context.carriedBases[displaced.requestId] ?? displaced.base ?? request.base;
  const carriedBases = { ...context.carriedBases };
  Reflect.deleteProperty(carriedBases, displaced.requestId);
  if (carriedBase !== undefined) {
    carriedBases[request.requestId] = carriedBase;
  }
  enq.emit(cancelledSettlement(displaced));
  return { pending: context.pending.with(index, structuredClone(request)), carriedBases };
};

const dequeue = (context: ParameterSetMachineContext): ParameterSetPatch => {
  const active = context.pending[0];
  const carriedBases = { ...context.carriedBases };
  const activeBase = active === undefined ? undefined : carriedBases[active.requestId];
  if (active !== undefined) {
    Reflect.deleteProperty(carriedBases, active.requestId);
  }
  return {
    active,
    activeBase,
    pending: context.pending.slice(1),
    carriedBases,
    attempts: 0,
    outcome: undefined,
  };
};

const clear = (context: ParameterSetMachineContext): ParameterSetPatch =>
  isUncertain(context) ? {} : { active: undefined, activeBase: undefined, attempts: 0, change: undefined };

/** Leave the uncertain lockout: the command already settled, so only the stale evidence goes. */
const clearUncertain = {
  active: undefined,
  activeBase: undefined,
  attempts: 0,
  change: undefined,
  outcome: undefined,
} satisfies ParameterSetPatch;

const refresh = (context: ParameterSetMachineContext): ParameterSetPatch => ({ refresh: context.refresh ?? 'record' });

const resolve = (event: Resolve): ParameterSetPatch => ({ refresh: 'manifest', resolution: event.resolution });

const closing = (context: ParameterSetMachineContext, enq: ParameterSetEnqueue): ParameterSetPatch => {
  for (const request of context.pending) {
    enq.emit(cancelledSettlement(request));
  }
  return { closing: true, pending: [], carriedBases: {} };
};

const cancelPending = (
  context: ParameterSetMachineContext,
  event: Cancel,
  enq: ParameterSetEnqueue,
): ParameterSetPatch => {
  const index = context.pending.findIndex((request) => request.requestId === event.requestId);
  if (index !== -1) {
    enq.emit(cancelledSettlement(context.pending[index]!));
    const carriedBases = { ...context.carriedBases };
    Reflect.deleteProperty(carriedBases, context.pending[index]!.requestId);
    return { pending: context.pending.toSpliced(index, 1), carriedBases };
  }
  if (context.active?.requestId !== event.requestId) {
    enq.emit({
      type: 'command-rejected',
      outcome: {
        status: 'rejected',
        requestId: event.requestId,
        code: 'UNKNOWN_REQUEST',
        message: 'No matching parameter operation is pending.',
      },
    });
  }
  return {};
};

const failPending = (context: ParameterSetMachineContext, enq: ParameterSetEnqueue): ParameterSetPatch => {
  for (const request of context.pending) {
    enq.emit({
      type: 'settled',
      request,
      outcome: rejected(request.requestId, 'LOAD_FAILED', 'Parameter authority could not be loaded.'),
    });
  }
  return context.pending.length > 0 ? { pending: [], carriedBases: {} } : {};
};

const cancelled = (context: ParameterSetMachineContext): ParameterSetPatch => ({
  outcome: { status: 'cancelled-before-apply', requestId: context.active!.requestId },
});

const emitOutcome = (context: ParameterSetMachineContext, enq: ParameterSetEnqueue): void => {
  enq.emit({
    type: 'settled',
    request: context.active!,
    outcome: context.outcome!,
    ...(context.current === undefined ? {} : { current: context.current.identity }),
  });
};

const refuseSubmission = (enq: ParameterSetEnqueue, event: Submit, code: string, message: string): void => {
  enq.emit({ type: 'settled', request: event.request, outcome: rejected(submittedId(event.request), code, message) });
};

const refuseInvalid = (enq: ParameterSetEnqueue, event: Submit): void =>
  refuseSubmission(enq, event, 'INVALID_REQUEST', 'Invalid parameter command.');

const blockClose = (enq: ParameterSetEnqueue, event: Close): void => {
  enq.emit({ type: 'close-blocked', invalidDrafts: event.invalidDrafts ?? [] });
};

/* A close with invalid drafts is refused where it stands; any other close drains the queue and leaves for `target`. */
const closeTo =
  (target: string) =>
  ({ context, event }: Readonly<{ context: ParameterSetMachineContext; event: Close }>, enq: ParameterSetEnqueue) => {
    if (isInvalidClose(event)) {
      blockClose(enq, event);
      return {};
    }
    return { target, context: closing(context, enq) };
  };

const watchFailed = (message: string) => ({ code: 'WATCH_FAILED', message });

/* A command not yet written, overtaken by a new semantic context. */
const staleManifest = (context: ParameterSetMachineContext): ParameterSetPatch => ({
  outcome: rejected(context.active!.requestId, 'STALE_MANIFEST', 'Semantic context changed before commit.'),
});

/* A command not yet written, overtaken by a failed observation. */
const disconnectedBeforeCommit = (context: ParameterSetMachineContext, message: string): ParameterSetPatch => ({
  diagnostic: watchFailed(message),
  outcome: rejected(context.active!.requestId, 'DISCONNECTED', 'Authority observation failed before commit.'),
});

/* The verbs `planning` and `confirmation` share: nothing has been written yet. */
const unwrittenCommandHandlers = {
  cancel: (
    { context, event }: Readonly<{ context: ParameterSetMachineContext; event: Cancel }>,
    enq: ParameterSetEnqueue,
  ) =>
    context.active?.requestId === event.requestId
      ? { target: 'settled', context: cancelled(context) }
      : { context: cancelPending(context, event, enq) },
  close: (
    { context, event }: Readonly<{ context: ParameterSetMachineContext; event: Close }>,
    enq: ParameterSetEnqueue,
  ) => {
    if (isInvalidClose(event)) {
      blockClose(enq, event);
      return {};
    }
    const drained = closing(context, enq);
    return { target: 'settled', context: { ...drained, ...cancelled({ ...context, ...drained }) } };
  },
  resolve: ({ context, event }: Readonly<{ context: ParameterSetMachineContext; event: Resolve }>) => {
    if (isSameResolution(context, event)) {
      return {};
    }
    const resolved = { ...context, ...resolve(event) };
    return { target: 'settled', context: { ...resolve(event), ...staleManifest(resolved) } };
  },
  'watch.error': ({
    context,
    event,
  }: Readonly<{
    context: ParameterSetMachineContext;
    event: Extract<ParameterSetMachineEvent, { type: 'watch.error' }>;
  }>) => ({
    target: 'settled',
    context: { ...refresh(context), ...disconnectedBeforeCommit(context, event.message) },
  }),
};

/** One native actor wraps pure planning, one checked commit, and bounded uncertain-write recovery. @public */
export const parameterSetMachine = setup({
  schemas: {
    context: types<ParameterSetMachineContext>(),
    input: types<ParameterSetMachineInput>(),
    events: eventSchemas<ParameterSetMachineEvent>(),
    emitted: eventSchemas<ParameterSetEmission>(),
  },
  actors: { loadParameterSet, commitParameterSet, observeParameterSet, planParameterSet },
}).createMachine({
  id: 'parameter-set',
  context: ({ input }) => ({
    ...input,
    pending: [],
    carriedBases: {},
    refresh: undefined,
    closing: false,
    attempts: 0,
  }),
  initial: 'validating',
  states: {
    validating: {
      always: ({ context }) => (validTarget(context.target) ? { target: 'open' } : { target: 'invalidInput' }),
    },
    invalidInput: { type: 'final' },
    open: {
      invoke: { src: 'observeParameterSet', input: ({ context }) => context.target },
      initial: 'loading',
      on: {
        submit: ({ context, event }, enq) => {
          if (!validRequestShape(event.request)) {
            refuseInvalid(enq, event);
            return {};
          }
          if (isSameDelivery(context, event.request)) {
            return {};
          }
          if (isCollision(context, event.request)) {
            refuseSubmission(enq, event, 'REQUEST_ID_COLLISION', 'Request ID was reused with different content.');
            return {};
          }
          if (isQueueAvailable(context, event.request)) {
            return { context: queue(context, event.request, enq) };
          }
          refuseSubmission(enq, event, 'BUSY', 'A parameter command is already pending.');
          return {};
        },
        resolve: ({ context, event }) =>
          isSameResolution(context, event) ? { context: refresh(context) } : { context: resolve(event) },
        'watch.changed': { context: ({ context }) => refresh(context) },
        'watch.error': {
          context: ({ event }) => ({ diagnostic: watchFailed(event.message), refresh: 'manifest' }),
        },
        close: ({ context, event }, enq) => {
          if (isInvalidClose(event)) {
            blockClose(enq, event);
            return {};
          }
          return { context: closing(context, enq) };
        },
        cancel: ({ context, event }, enq) => ({ context: cancelPending(context, event, enq) }),
        confirm: ({ event }, enq) => {
          enq.emit({
            type: 'command-rejected',
            outcome: {
              status: 'rejected',
              requestId: event.requestId,
              code: 'STALE_PLAN',
              message: 'No matching confirmation is pending.',
            },
          });
          return {};
        },
      },
      states: {
        loading: {
          entry: () => ({ context: { refresh: undefined } }),
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({ target: context.target, resolution: context.resolution }),
            onDone: ({ event }, enq) => {
              enq.emit({ type: 'loaded', current: event.output });
              return { target: 'route', context: { current: event.output, diagnostic: undefined } };
            },
            onError: ({ context, event }, enq) => ({
              target: 'disconnected',
              context: { ...failPending(context, enq), diagnostic: errorDiagnostic(event.error) },
            }),
          },
          on: {
            'watch.error': {
              target: 'disconnected',
              context: ({ event }) => ({ diagnostic: watchFailed(event.message) }),
            },
            resolve: ({ context, event }) =>
              isSameResolution(context, event) ? {} : { target: 'loading', reenter: true, context: resolve(event) },
            close: closeTo('#parameter-set.closed'),
          },
        },
        refreshing: {
          entry: () => ({ context: { refresh: undefined } }),
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({
              target: context.target,
              resolution: context.resolution,
              current: context.current,
            }),
            onDone: ({ context, event }, enq) => {
              const changed =
                context.current === undefined ||
                !sameRecordBytes(event.output.bytes, context.current.bytes) ||
                event.output.identity.manifestRevision !== context.current.identity.manifestRevision;
              if (!changed) {
                return { target: 'route', context: { diagnostic: undefined } };
              }
              enq.emit({ type: 'loaded', current: event.output });
              return { target: 'route', context: { current: event.output, diagnostic: undefined } };
            },
            onError: ({ context, event }, enq) => ({
              target: 'disconnected',
              context: { ...failPending(context, enq), diagnostic: errorDiagnostic(event.error) },
            }),
          },
          on: {
            'watch.error': {
              target: 'disconnected',
              context: ({ event }) => ({ diagnostic: watchFailed(event.message) }),
            },
            resolve: ({ context, event }) =>
              isSameResolution(context, event) ? {} : { target: 'loading', context: resolve(event) },
            close: closeTo('#parameter-set.closed'),
          },
        },
        route: {
          always: ({ context }) => {
            if (isUncertain(context)) {
              return { target: 'uncertain' };
            }
            if (context.closing) {
              return { target: '#parameter-set.closed' };
            }
            if (context.diagnostic?.code === 'WATCH_FAILED') {
              return { target: 'disconnected' };
            }
            if (context.refresh === 'manifest') {
              return { target: 'loading' };
            }
            if (context.refresh !== undefined) {
              return { target: 'refreshing' };
            }
            // A command an authority change interrupted is re-planned against the fresh record,
            // never rejected: only `base` decides whether the field itself moved under it.
            if (context.active !== undefined) {
              return { target: 'planning' };
            }
            if (context.pending.length > 0) {
              return { target: 'planning', context: dequeue(context) };
            }
            return { target: 'ready' };
          },
        },
        ready: {
          on: {
            submit: ({ event }, enq) => {
              if (validRequestShape(event.request)) {
                return { target: 'planning', context: accept(event.request) };
              }
              refuseInvalid(enq, event);
              return {};
            },
            resolve: ({ context, event }) =>
              isSameResolution(context, event)
                ? { target: 'refreshing' }
                : { target: 'loading', context: resolve(event) },
            'watch.changed': { target: 'refreshing' },
            'watch.error': {
              target: 'disconnected',
              context: ({ event }) => ({ diagnostic: watchFailed(event.message) }),
            },
            close: closeTo('#parameter-set.closed'),
          },
        },
        planning: {
          invoke: {
            src: 'planParameterSet',
            input: ({ context }) => ({
              current: context.current!,
              request:
                context.activeBase === undefined ? context.active! : { ...context.active!, base: context.activeBase },
            }),
            onDone: ({ context, event }) => {
              const plan = event.output;
              switch (plan.status) {
                case 'rejected': {
                  return {
                    target: 'settled',
                    context: { outcome: rejected(context.active!.requestId, plan.code, plan.message) },
                  };
                }
                case 'unchanged': {
                  return {
                    target: 'settled',
                    context: {
                      outcome: {
                        status: 'committed',
                        requestId: context.active!.requestId,
                        revision: context.current!.identity,
                        write: 'durable-no-op',
                      },
                    },
                  };
                }
                default: {
                  return {
                    target: plan.confirmation === undefined ? 'applying' : 'confirmation',
                    context: { change: plan },
                  };
                }
              }
            },
            onError: {
              target: 'settled',
              context: ({ context, event }) => ({
                outcome: rejected(context.active!.requestId, 'INVALID_OPERATION', errorMessage(event.error)),
              }),
            },
          },
          on: {
            ...unwrittenCommandHandlers,
            // Re-read and plan the same command again; the write never started, so nothing is lost.
            'watch.changed': { target: 'refreshing' },
          },
        },
        confirmation: {
          entry: ({ context }, enq) => {
            enq.emit({
              type: 'confirmation-required',
              requestId: context.active!.requestId,
              fingerprint: context.change!.confirmation!.planFingerprint,
              confirmation: context.change!.confirmation!,
            });
          },
          on: {
            confirm: ({ context, event }) =>
              isConfirmed(context, event)
                ? {
                    target: 'applying',
                    context: {
                      change: { ...context.change!, confirmed: context.change!.confirmation!.planFingerprint },
                    },
                  }
                : undefined,
            ...unwrittenCommandHandlers,
            // Re-plan against the fresh record; the caller is asked to confirm the new plan instead
            // of losing the command, and the stale plan fingerprint can no longer be confirmed.
            'watch.changed': { target: 'refreshing' },
          },
        },
        applying: {
          invoke: {
            src: 'commitParameterSet',
            input: ({ context }) => context.change!,
            onDone: ({ context, event }) => {
              if (event.output.status === 'conflict') {
                return context.attempts >= 2
                  ? {
                      target: 'settled',
                      context: {
                        outcome: rejected(
                          context.active!.requestId,
                          'RECORD_CONFLICT',
                          'The parameter record changed during three checked write attempts.',
                        ),
                      },
                    }
                  : { target: 'route', context: { attempts: context.attempts + 1, refresh: 'record' } };
              }
              return {
                target: 'settled',
                context: {
                  current: context.change!.proposed,
                  outcome: {
                    status: 'committed',
                    requestId: context.active!.requestId,
                    revision: context.change!.proposed.identity,
                    write: event.output.status === 'applied' ? 'applied' : 'authority-no-op',
                  },
                },
              };
            },
            onError: ({ context, event }) =>
              knownRefusal(event.error)
                ? {
                    target: 'settled',
                    context: {
                      outcome: {
                        status: 'known-not-applied-failure',
                        requestId: context.active!.requestId,
                        ...errorDiagnostic(event.error, 'APPLY_REFUSED'),
                      },
                    },
                  }
                : { target: 'recovering' },
          },
        },
        recovering: {
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({ target: context.target, resolution: context.resolution }),
            onDone: {
              target: 'settled',
              context: ({ context, event }) => ({
                current: event.output,
                refresh: undefined,
                outcome: recoveredOutcome(context, event.output),
              }),
            },
            onError: {
              target: 'settled',
              context: ({ context, event }) => ({
                outcome: {
                  status: 'indeterminate',
                  requestId: context.active!.requestId,
                  code: 'RECOVERY_FAILED',
                  message: errorMessage(event.error),
                },
              }),
            },
          },
        },
        settled: {
          entry: ({ context }, enq) => {
            emitOutcome(context, enq);
            return { context: clear(context) };
          },
          always: { target: 'route' },
        },
        uncertain: {
          entry: ({ context }, enq) => ({ context: { ...failPending(context, enq), closing: false } }),
          on: {
            // The command already settled as indeterminate; recovering means reloading the record
            // and accepting commands again, never settling that command a second time.
            resolve: { target: 'loading', context: ({ event }) => ({ ...resolve(event), ...clearUncertain }) },
            'watch.changed': { target: 'loading', context: clearUncertain },
            close: {
              context: {
                diagnostic: { code: 'WRITE_UNCERTAIN', message: 'The previous write outcome remains uncertain.' },
              },
            },
            submit: ({ event }, enq) => {
              refuseSubmission(
                enq,
                event,
                'WRITE_UNCERTAIN',
                'Resolve the previous write outcome before submitting another command.',
              );
              return {};
            },
          },
        },
        disconnected: {
          entry: ({ context }, enq) => ({ context: failPending(context, enq) }),
          on: {
            resolve: { target: '#parameter-set.open', reenter: true, context: ({ event }) => resolve(event) },
            'watch.changed': { target: '#parameter-set.open', reenter: true },
            close: closeTo('#parameter-set.closed'),
            submit: ({ event }, enq) => {
              enq.emit({
                type: 'settled',
                request: event.request,
                outcome: rejected(event.request.requestId, 'DISCONNECTED', 'Reload parameters before submitting.'),
              });
              return {};
            },
          },
        },
      },
    },
    closed: {
      type: 'final',
      entry: ({ context }, enq) => {
        const drained = failPending(context, enq);
        enq.emit({ type: 'closed' });
        return { context: drained };
      },
    },
  },
});

/**
 * Subscribe before sending one command; all sequencing and settlement belong to the actor.
 * @param actor - The parameter-set actor that owns the target.
 * @param request - The command to submit.
 * @returns The command's settlement; rejects if the actor stops before settling it.
 * @public
 */
export const submitParameterRequest = async (
  actor: ActorRefFrom<typeof parameterSetMachine>,
  request: ParameterSetRequest,
): Promise<ParameterSetOutcome> => {
  if (actor.getSnapshot().status !== 'active') {
    return rejected(request.requestId, 'CLOSED', 'Parameter actor is closed.');
  }
  return new Promise((resolve, reject) => {
    const outcome = actor.on('settled', (event) => {
      if (sameRequestDelivery(event.request, request)) {
        outcome.unsubscribe();
        lifecycle.unsubscribe();
        resolve(event.outcome);
      }
    });
    const lifecycle = actor.subscribe({
      complete: () => {
        outcome.unsubscribe();
        reject(new Error('Parameter actor closed without settling its command.'));
      },
      error: (error) => {
        outcome.unsubscribe();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    });
    actor.send({ type: 'submit', request });
  });
};

/**
 * The actor set a host provides for `parameterSetMachine`.
 *
 * XState v6's `provide` infers the map from its argument, so an inline actor gets its input and
 * output types from this annotation rather than from the machine.
 *
 * @public
 */
export type ParameterSetActors = {
  [K in keyof ParameterSetActorMap]: ParameterSetActorMap[K];
};
