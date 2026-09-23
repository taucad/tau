import { assign, emit, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { CheckedFileWriteResult } from '@taucad/types';
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

const loadParameterSet = fromPromise<ParameterSnapshot, ParameterSetLoadInput>(async () => {
  throw new Error('loadParameterSet actor not provided');
});
const commitParameterSet = fromPromise<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>(
  async () => {
    throw new Error('commitParameterSet actor not provided');
  },
);
const observeParameterSet = fromCallback<ParameterSetMachineEvent, ParameterSetTarget>(() => () => undefined);
const planParameterSet = fromPromise<
  ParameterChange,
  Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest }>
>(async ({ input }) => planParameterChange(input));
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

/** One native actor wraps pure planning, one checked commit, and bounded uncertain-write recovery. @public */
export const parameterSetMachine = setup({
  // oxlint-disable typescript/consistent-type-assertions -- XState phantom declarations bind actor types.
  types: {
    context: {} as ParameterSetMachineContext,
    input: {} as ParameterSetMachineInput,
    events: {} as ParameterSetMachineEvent,
    emitted: {} as ParameterSetEmission,
  },
  // oxlint-enable typescript/consistent-type-assertions
  actors: { loadParameterSet, commitParameterSet, observeParameterSet, planParameterSet },
  guards: {
    closing: ({ context }) => context.closing,
    uncertain: ({ context }) =>
      context.outcome?.status === 'indeterminate' && context.outcome.code === 'RECOVERY_FAILED',
    invalidClose: ({ event }) => event.type === 'close' && (event.invalidDrafts?.length ?? 0) > 0,
    pending: ({ context }) => context.pending.length > 0,
    sameResolution: ({ context, event }) =>
      event.type === 'resolve' && canonicalResolution(event.resolution) === canonicalResolution(context.resolution),
    refresh: ({ context }) => context.refresh !== undefined,
    reload: ({ context }) => context.refresh === 'manifest',
    active: ({ context }) => context.active !== undefined,
    validSubmission: ({ event }) => event.type === 'submit' && validRequestShape(event.request),
    sameDelivery: ({ context, event }) =>
      event.type === 'submit' &&
      [context.active, ...context.pending].some(
        (request) => request !== undefined && sameRequestDelivery(request, event.request),
      ),
    collision: ({ context, event }) =>
      event.type === 'submit' &&
      [context.active, ...context.pending].some((request) => request?.requestId === event.request.requestId),
    queueAvailable: ({ context, event }) =>
      event.type === 'submit' &&
      !context.closing &&
      validRequestShape(event.request) &&
      (context.pending.length < pendingLimit || displacedIndex(context.pending, event.request) !== -1),
    activeCancellation: ({ context, event }) =>
      event.type === 'cancel' && context.active?.requestId === event.requestId,
    confirmed: ({ context, event }) =>
      event.type === 'confirm' &&
      context.active?.requestId === event.requestId &&
      context.change?.confirmation?.planFingerprint === event.fingerprint,
  },
  actions: {
    accept: assign(({ event }) =>
      event.type === 'submit'
        ? { active: structuredClone(event.request), activeBase: undefined, attempts: 0, outcome: undefined }
        : {},
    ),
    queue: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'submit') {
        return;
      }
      const index = displacedIndex(context.pending, event.request);
      if (index === -1) {
        enqueue.assign({ pending: [...context.pending, structuredClone(event.request)] });
        return;
      }
      const displaced = context.pending[index]!;
      const carriedBase = context.carriedBases[displaced.requestId] ?? displaced.base ?? event.request.base;
      const carriedBases = { ...context.carriedBases };
      Reflect.deleteProperty(carriedBases, displaced.requestId);
      if (carriedBase !== undefined) {
        carriedBases[event.request.requestId] = carriedBase;
      }
      enqueue.emit(cancelledSettlement(displaced));
      enqueue.assign({
        pending: context.pending.with(index, structuredClone(event.request)),
        carriedBases,
      });
    }),
    dequeue: assign(({ context }) => {
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
    }),
    clear: assign(({ context }) =>
      context.outcome?.status === 'indeterminate' && context.outcome.code === 'RECOVERY_FAILED'
        ? {}
        : { active: undefined, activeBase: undefined, attempts: 0, change: undefined },
    ),
    /** Leave the uncertain lockout: the command already settled, so only the stale evidence goes. */
    clearUncertain: assign({
      active: undefined,
      activeBase: undefined,
      attempts: 0,
      change: undefined,
      outcome: undefined,
    }),
    retryConflict: assign(({ context }) => ({ attempts: context.attempts + 1, refresh: 'record' })),
    refresh: assign(({ context }) => ({ refresh: context.refresh ?? 'record' })),
    resolve: assign(({ context, event }) => ({
      refresh: 'manifest',
      resolution: event.type === 'resolve' ? event.resolution : context.resolution,
    })),
    closing: enqueueActions(({ context, enqueue }) => {
      for (const request of context.pending) {
        enqueue.emit(cancelledSettlement(request));
      }
      enqueue.assign({ closing: true, pending: [], carriedBases: {} });
    }),
    cancelPending: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'cancel') {
        return;
      }
      const index = context.pending.findIndex((request) => request.requestId === event.requestId);
      if (index !== -1) {
        enqueue.emit(cancelledSettlement(context.pending[index]!));
        const carriedBases = { ...context.carriedBases };
        Reflect.deleteProperty(carriedBases, context.pending[index]!.requestId);
        enqueue.assign({ pending: context.pending.toSpliced(index, 1), carriedBases });
      } else if (context.active?.requestId !== event.requestId) {
        enqueue.emit({
          type: 'command-rejected',
          outcome: {
            status: 'rejected',
            requestId: event.requestId,
            code: 'UNKNOWN_REQUEST',
            message: 'No matching parameter operation is pending.',
          },
        });
      }
    }),
    failPending: enqueueActions(({ context, enqueue }) => {
      for (const request of context.pending) {
        enqueue.emit({
          type: 'settled',
          request,
          outcome: rejected(request.requestId, 'LOAD_FAILED', 'Parameter authority could not be loaded.'),
        });
      }
      if (context.pending.length > 0) {
        enqueue.assign({ pending: [], carriedBases: {} });
      }
    }),
    cancelled: assign(({ context }) => ({
      outcome: { status: 'cancelled-before-apply', requestId: context.active!.requestId },
    })),
    emitOutcome: emit(({ context }) => ({
      type: 'settled',
      request: context.active!,
      outcome: context.outcome!,
      ...(context.current === undefined ? {} : { current: context.current.identity }),
    })),
    emitBusy: enqueueActions(({ event, enqueue }) => {
      if (event.type === 'submit') {
        enqueue.emit({
          type: 'settled',
          request: event.request,
          outcome: rejected(submittedId(event.request), 'BUSY', 'A parameter command is already pending.'),
        });
      }
    }),
    emitCollision: enqueueActions(({ event, enqueue }) => {
      if (event.type === 'submit') {
        enqueue.emit({
          type: 'settled',
          request: event.request,
          outcome: rejected(
            submittedId(event.request),
            'REQUEST_ID_COLLISION',
            'Request ID was reused with different content.',
          ),
        });
      }
    }),
    emitCloseBlocked: emit(({ event }) => ({
      type: 'close-blocked',
      invalidDrafts: event.type === 'close' ? (event.invalidDrafts ?? []) : [],
    })),
    emitInvalid: enqueueActions(({ event, enqueue }) => {
      if (event.type === 'submit') {
        enqueue.emit({
          type: 'settled',
          request: event.request,
          outcome: rejected(submittedId(event.request), 'INVALID_REQUEST', 'Invalid parameter command.'),
        });
      }
    }),
  },
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
      always: [{ guard: ({ context }) => validTarget(context.target), target: 'open' }, { target: 'invalidInput' }],
    },
    invalidInput: { type: 'final' },
    open: {
      invoke: { src: 'observeParameterSet', input: ({ context }) => context.target },
      initial: 'loading',
      on: {
        submit: [
          { guard: ({ event }) => !validRequestShape(event.request), actions: 'emitInvalid' },
          { guard: 'sameDelivery' },
          { guard: 'collision', actions: 'emitCollision' },
          { guard: 'queueAvailable', actions: 'queue' },
          { actions: 'emitBusy' },
        ],
        resolve: [{ guard: 'sameResolution', actions: 'refresh' }, { actions: 'resolve' }],
        'watch.changed': { actions: 'refresh' },
        'watch.error': {
          actions: assign(({ event }) => ({
            diagnostic: { code: 'WATCH_FAILED', message: event.message },
            refresh: 'manifest',
          })),
        },
        close: [{ guard: 'invalidClose', actions: 'emitCloseBlocked' }, { actions: 'closing' }],
        cancel: { actions: 'cancelPending' },
        confirm: {
          actions: emit(({ event }) => ({
            type: 'command-rejected',
            outcome: {
              status: 'rejected',
              requestId: event.requestId,
              code: 'STALE_PLAN',
              message: 'No matching confirmation is pending.',
            },
          })),
        },
      },
      states: {
        loading: {
          entry: assign({ refresh: undefined }),
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({ target: context.target, resolution: context.resolution }),
            onDone: {
              target: 'route',
              actions: [
                assign(({ event }) => ({ current: event.output, diagnostic: undefined })),
                emit(({ event }) => ({ type: 'loaded', current: event.output })),
              ],
            },
            onError: {
              target: 'disconnected',
              actions: ['failPending', assign(({ event }) => ({ diagnostic: errorDiagnostic(event.error) }))],
            },
          },
          on: {
            'watch.error': {
              target: 'disconnected',
              actions: assign(({ event }) => ({ diagnostic: { code: 'WATCH_FAILED', message: event.message } })),
            },
            resolve: [{ guard: 'sameResolution' }, { target: 'loading', reenter: true, actions: 'resolve' }],
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: '#parameter-set.closed', actions: 'closing' },
            ],
          },
        },
        refreshing: {
          entry: assign({ refresh: undefined }),
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({
              target: context.target,
              resolution: context.resolution,
              current: context.current,
            }),
            onDone: {
              target: 'route',
              actions: enqueueActions(({ context, event, enqueue }) => {
                const changed =
                  context.current === undefined ||
                  !sameRecordBytes(event.output.bytes, context.current.bytes) ||
                  event.output.identity.manifestRevision !== context.current.identity.manifestRevision;
                if (!changed) {
                  enqueue.assign({ diagnostic: undefined });
                  return;
                }
                enqueue.emit({ type: 'loaded', current: event.output });
                enqueue.assign({ current: event.output, diagnostic: undefined });
              }),
            },
            onError: {
              target: 'disconnected',
              actions: ['failPending', assign(({ event }) => ({ diagnostic: errorDiagnostic(event.error) }))],
            },
          },
          on: {
            'watch.error': {
              target: 'disconnected',
              actions: assign(({ event }) => ({ diagnostic: { code: 'WATCH_FAILED', message: event.message } })),
            },
            resolve: [{ guard: 'sameResolution' }, { target: 'loading', actions: 'resolve' }],
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: '#parameter-set.closed', actions: 'closing' },
            ],
          },
        },
        route: {
          always: [
            { guard: 'uncertain', target: 'uncertain' },
            { guard: 'closing', target: '#parameter-set.closed' },
            { guard: ({ context }) => context.diagnostic?.code === 'WATCH_FAILED', target: 'disconnected' },
            { guard: 'reload', target: 'loading' },
            { guard: 'refresh', target: 'refreshing' },
            // A command an authority change interrupted is re-planned against the fresh record,
            // never rejected: only `base` decides whether the field itself moved under it.
            { guard: 'active', target: 'planning' },
            { guard: 'pending', target: 'planning', actions: 'dequeue' },
            { target: 'ready' },
          ],
        },
        ready: {
          on: {
            submit: [{ guard: 'validSubmission', target: 'planning', actions: 'accept' }, { actions: 'emitInvalid' }],
            resolve: [
              { guard: 'sameResolution', target: 'refreshing' },
              { target: 'loading', actions: 'resolve' },
            ],
            'watch.changed': { target: 'refreshing' },
            'watch.error': {
              target: 'disconnected',
              actions: assign(({ event }) => ({ diagnostic: { code: 'WATCH_FAILED', message: event.message } })),
            },
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: '#parameter-set.closed', actions: 'closing' },
            ],
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
            onDone: [
              {
                guard: ({ event }) => event.output.status === 'rejected',
                target: 'settled',
                actions: assign(({ context, event }) => ({
                  outcome:
                    event.output.status === 'rejected'
                      ? rejected(context.active!.requestId, event.output.code, event.output.message)
                      : undefined,
                })),
              },
              {
                guard: ({ event }) => event.output.status === 'unchanged',
                target: 'settled',
                actions: assign(({ context }) => ({
                  outcome: {
                    status: 'committed',
                    requestId: context.active!.requestId,
                    revision: context.current!.identity,
                    write: 'durable-no-op',
                  },
                })),
              },
              {
                guard: ({ event }) => event.output.status === 'prepared' && event.output.confirmation !== undefined,
                target: 'confirmation',
                actions: assign(({ event }) => ({
                  change: event.output.status === 'prepared' ? event.output : undefined,
                })),
              },
              {
                target: 'applying',
                actions: assign(({ event }) => ({
                  change: event.output.status === 'prepared' ? event.output : undefined,
                })),
              },
            ],
            onError: {
              target: 'settled',
              actions: assign(({ context, event }) => ({
                outcome: rejected(context.active!.requestId, 'INVALID_OPERATION', errorMessage(event.error)),
              })),
            },
          },
          on: {
            cancel: [
              { guard: 'activeCancellation', target: 'settled', actions: 'cancelled' },
              { actions: 'cancelPending' },
            ],
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: 'settled', actions: ['closing', 'cancelled'] },
            ],
            // Re-read and plan the same command again; the write never started, so nothing is lost.
            'watch.changed': { target: 'refreshing' },
            resolve: [
              { guard: 'sameResolution' },
              {
                target: 'settled',
                actions: [
                  'resolve',
                  assign(({ context }) => ({
                    outcome: rejected(
                      context.active!.requestId,
                      'STALE_MANIFEST',
                      'Semantic context changed before commit.',
                    ),
                  })),
                ],
              },
            ],
            'watch.error': {
              target: 'settled',
              actions: [
                'refresh',
                assign(({ context, event }) => ({
                  diagnostic: { code: 'WATCH_FAILED', message: event.message },
                  outcome: rejected(
                    context.active!.requestId,
                    'DISCONNECTED',
                    'Authority observation failed before commit.',
                  ),
                })),
              ],
            },
          },
        },
        confirmation: {
          entry: emit(({ context }) => ({
            type: 'confirmation-required',
            requestId: context.active!.requestId,
            fingerprint: context.change!.confirmation!.planFingerprint,
            confirmation: context.change!.confirmation!,
          })),
          on: {
            confirm: {
              guard: 'confirmed',
              target: 'applying',
              actions: assign(({ context }) => ({
                change: { ...context.change!, confirmed: context.change!.confirmation!.planFingerprint },
              })),
            },
            cancel: [
              { guard: 'activeCancellation', target: 'settled', actions: 'cancelled' },
              { actions: 'cancelPending' },
            ],
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: 'settled', actions: ['closing', 'cancelled'] },
            ],
            // Re-plan against the fresh record; the caller is asked to confirm the new plan instead
            // of losing the command, and the stale plan fingerprint can no longer be confirmed.
            'watch.changed': { target: 'refreshing' },
            resolve: [
              { guard: 'sameResolution' },
              {
                target: 'settled',
                actions: [
                  'resolve',
                  assign(({ context }) => ({
                    outcome: rejected(
                      context.active!.requestId,
                      'STALE_MANIFEST',
                      'Semantic context changed before commit.',
                    ),
                  })),
                ],
              },
            ],
            'watch.error': {
              target: 'settled',
              actions: [
                'refresh',
                assign(({ context, event }) => ({
                  diagnostic: { code: 'WATCH_FAILED', message: event.message },
                  outcome: rejected(
                    context.active!.requestId,
                    'DISCONNECTED',
                    'Authority observation failed before commit.',
                  ),
                })),
              ],
            },
          },
        },
        applying: {
          invoke: {
            src: 'commitParameterSet',
            input: ({ context }) => context.change!,
            onDone: [
              {
                guard: ({ context, event }) => event.output.status === 'conflict' && context.attempts >= 2,
                target: 'settled',
                actions: assign(({ context }) => ({
                  outcome: rejected(
                    context.active!.requestId,
                    'RECORD_CONFLICT',
                    'The parameter record changed during three checked write attempts.',
                  ),
                })),
              },
              {
                guard: ({ event }) => event.output.status === 'conflict',
                target: 'route',
                actions: 'retryConflict',
              },
              {
                target: 'settled',
                actions: assign(({ context, event }) => ({
                  current: context.change!.proposed,
                  outcome: {
                    status: 'committed',
                    requestId: context.active!.requestId,
                    revision: context.change!.proposed.identity,
                    write: event.output.status === 'applied' ? 'applied' : 'authority-no-op',
                  },
                })),
              },
            ],
            onError: [
              {
                guard: ({ event }) => knownRefusal(event.error),
                target: 'settled',
                actions: assign(({ context, event }) => ({
                  outcome: {
                    status: 'known-not-applied-failure',
                    requestId: context.active!.requestId,
                    ...errorDiagnostic(event.error, 'APPLY_REFUSED'),
                  },
                })),
              },
              { target: 'recovering' },
            ],
          },
        },
        recovering: {
          invoke: {
            src: 'loadParameterSet',
            input: ({ context }) => ({ target: context.target, resolution: context.resolution }),
            onDone: {
              target: 'settled',
              actions: assign(({ context, event }) => ({
                current: event.output,
                refresh: undefined,
                outcome: recoveredOutcome(context, event.output),
              })),
            },
            onError: {
              target: 'settled',
              actions: assign(({ context, event }) => ({
                outcome: {
                  status: 'indeterminate',
                  requestId: context.active!.requestId,
                  code: 'RECOVERY_FAILED',
                  message: errorMessage(event.error),
                },
              })),
            },
          },
        },
        settled: { entry: ['emitOutcome', 'clear'], always: 'route' },
        uncertain: {
          entry: ['failPending', assign({ closing: false })],
          on: {
            // The command already settled as indeterminate; recovering means reloading the record
            // and accepting commands again, never settling that command a second time.
            resolve: { target: 'loading', actions: ['resolve', 'clearUncertain'] },
            'watch.changed': { target: 'loading', actions: 'clearUncertain' },
            close: {
              actions: assign({
                diagnostic: { code: 'WRITE_UNCERTAIN', message: 'The previous write outcome remains uncertain.' },
              }),
            },
            submit: {
              actions: emit(({ event }) => ({
                type: 'settled',
                request: event.request,
                outcome: rejected(
                  submittedId(event.request),
                  'WRITE_UNCERTAIN',
                  'Resolve the previous write outcome before submitting another command.',
                ),
              })),
            },
          },
        },
        disconnected: {
          entry: 'failPending',
          on: {
            resolve: { target: '#parameter-set.open', reenter: true, actions: 'resolve' },
            'watch.changed': { target: '#parameter-set.open', reenter: true },
            close: [
              { guard: 'invalidClose', actions: 'emitCloseBlocked' },
              { target: '#parameter-set.closed', actions: 'closing' },
            ],
            submit: {
              actions: emit(({ event }) => ({
                type: 'settled',
                request: event.request,
                outcome: rejected(event.request.requestId, 'DISCONNECTED', 'Reload parameters before submitting.'),
              })),
            },
          },
        },
      },
    },
    closed: { type: 'final', entry: ['failPending', emit({ type: 'closed' })] },
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
