import { assign, emit, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { ParameterResolutionOptions } from '#manifest.js';
import { planParameterChange } from '#planning.js';
import type { ParameterChange } from '#planning.js';
import { classifyParameterReceipt } from '#receipt.js';
import type { ParameterSnapshot } from '#snapshot.js';
import { sameRequestDelivery, validRequestShape, validTarget } from '#request.js';
import type { ParameterSetOutcome, ParameterSetRequest, ParameterSetTarget, ParameterSetPlanResult } from '#types.js';

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
    pending?: ParameterSetRequest;
    change?: Extract<ParameterChange, { status: 'prepared' }>;
    outcome?: ParameterSetOutcome;
    refresh?: 'record' | 'manifest';
    closing: boolean;
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
  | Readonly<{ type: 'settled'; outcome: ParameterSetOutcome; request?: ParameterSetRequest }>
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
    uncertain: ({ context }) => context.outcome?.status === 'indeterminate',
    invalidClose: ({ event }) => event.type === 'close' && (event.invalidDrafts?.length ?? 0) > 0,
    pending: ({ context }) => context.pending !== undefined,
    refresh: ({ context }) => context.refresh !== undefined,
    reload: ({ context }) => context.refresh === 'manifest',
    active: ({ context }) => context.active !== undefined,
    validSubmission: ({ event }) => event.type === 'submit' && validRequestShape(event.request),
    sameDelivery: ({ context, event }) =>
      event.type === 'submit' &&
      [context.active, context.pending].some(
        (request) => request !== undefined && sameRequestDelivery(request, event.request),
      ),
    collision: ({ context, event }) =>
      event.type === 'submit' &&
      [context.active, context.pending].some((request) => request?.requestId === event.request.requestId),
    queueAvailable: ({ context, event }) =>
      event.type === 'submit' &&
      !context.closing &&
      validRequestShape(event.request) &&
      (context.pending === undefined || context.pending.pressure === 'transient' || event.request.pressure === 'final'),
    activeCancellation: ({ context, event }) =>
      event.type === 'cancel' && context.active?.requestId === event.requestId,
    confirmed: ({ context, event }) =>
      event.type === 'confirm' &&
      context.active?.requestId === event.requestId &&
      context.change?.confirmation?.planFingerprint === event.fingerprint,
  },
  actions: {
    accept: assign(({ event }) =>
      event.type === 'submit' ? { active: structuredClone(event.request), outcome: undefined } : {},
    ),
    queue: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'submit') {
        return;
      }
      if (context.pending !== undefined) {
        enqueue.emit({
          type: 'settled',
          request: context.pending,
          outcome: { status: 'cancelled-before-apply', requestId: context.pending.requestId },
        });
      }
      enqueue.assign({ pending: structuredClone(event.request) });
    }),
    dequeue: assign(({ context }) => ({ active: context.pending, pending: undefined, outcome: undefined })),
    clear: assign(({ context }) =>
      context.outcome?.status === 'indeterminate' ? {} : { active: undefined, change: undefined },
    ),
    refresh: assign(({ context }) => ({ refresh: context.refresh ?? 'record' })),
    resolve: assign(({ context, event }) => ({
      refresh: 'manifest',
      resolution: event.type === 'resolve' ? event.resolution : context.resolution,
    })),
    closing: enqueueActions(({ context, enqueue }) => {
      if (context.pending !== undefined) {
        enqueue.emit({
          type: 'settled',
          request: context.pending,
          outcome: { status: 'cancelled-before-apply', requestId: context.pending.requestId },
        });
      }
      enqueue.assign({ closing: true, pending: undefined });
    }),
    cancelPending: enqueueActions(({ context, event, enqueue }) => {
      if (event.type === 'cancel' && context.pending?.requestId === event.requestId) {
        enqueue.emit({
          type: 'settled',
          request: context.pending,
          outcome: { status: 'cancelled-before-apply', requestId: event.requestId },
        });
        enqueue.assign({ pending: undefined });
      } else if (event.type === 'cancel' && context.active?.requestId !== event.requestId) {
        enqueue.emit({
          type: 'settled',
          outcome: rejected(event.requestId, 'UNKNOWN_REQUEST', 'No matching parameter operation is pending.'),
        });
      }
    }),
    failPending: enqueueActions(({ context, enqueue }) => {
      if (context.pending !== undefined) {
        enqueue.emit({
          type: 'settled',
          request: context.pending,
          outcome: rejected(context.pending.requestId, 'LOAD_FAILED', 'Parameter authority could not be loaded.'),
        });
        enqueue.assign({ pending: undefined });
      }
    }),
    cancelled: assign(({ context }) => ({
      outcome: { status: 'cancelled-before-apply', requestId: context.active!.requestId },
    })),
    emitOutcome: emit(({ context }) => ({ type: 'settled', request: context.active!, outcome: context.outcome! })),
    emitBusy: emit(({ event }) => ({
      type: 'settled',
      request: event.type === 'submit' ? event.request : undefined!,
      outcome: rejected(
        event.type === 'submit' ? submittedId(event.request) : 'unknown',
        'BUSY',
        'A parameter command is already pending.',
      ),
    })),
    emitCollision: emit(({ event }) => ({
      type: 'settled',
      request: event.type === 'submit' ? event.request : undefined!,
      outcome: rejected(
        event.type === 'submit' ? submittedId(event.request) : 'unknown',
        'REQUEST_ID_COLLISION',
        'Request ID was reused with different content.',
      ),
    })),
    emitCloseBlocked: emit(({ event }) => ({
      type: 'close-blocked',
      invalidDrafts: event.type === 'close' ? (event.invalidDrafts ?? []) : [],
    })),
    emitInvalid: emit(({ event }) => ({
      type: 'settled',
      request: event.type === 'submit' ? event.request : undefined!,
      outcome: rejected(
        event.type === 'submit' ? submittedId(event.request) : 'unknown',
        'INVALID_REQUEST',
        'Invalid parameter command.',
      ),
    })),
  },
}).createMachine({
  id: 'parameter-set',
  context: ({ input }) => ({ ...input, refresh: undefined, closing: false }),
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
        resolve: { actions: 'resolve' },
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
            type: 'settled',
            outcome: rejected(event.requestId, 'STALE_PLAN', 'No matching confirmation is pending.'),
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
            resolve: { target: 'loading', reenter: true, actions: 'resolve' },
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
            resolve: { target: 'loading', actions: 'resolve' },
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
            { guard: 'pending', target: 'planning', actions: 'dequeue' },
            { target: 'ready' },
          ],
        },
        ready: {
          on: {
            submit: [{ guard: 'validSubmission', target: 'planning', actions: 'accept' }, { actions: 'emitInvalid' }],
            resolve: { target: 'loading', actions: 'resolve' },
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
            input: ({ context }) => ({ current: context.current!, request: context.active! }),
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
            'watch.changed': {
              target: 'settled',
              actions: [
                'refresh',
                assign(({ context }) => ({
                  outcome: rejected(context.active!.requestId, 'STALE_MANIFEST', 'Authority changed during planning.'),
                })),
              ],
            },
            resolve: {
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
            'watch.changed': {
              target: 'settled',
              actions: [
                'refresh',
                assign(({ context }) => ({
                  outcome: rejected(
                    context.active!.requestId,
                    'STALE_MANIFEST',
                    'Authority changed before confirmation.',
                  ),
                })),
              ],
            },
            resolve: {
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
                guard: ({ event }) => event.output.status === 'conflict',
                target: 'settled',
                actions: [
                  'refresh',
                  assign(({ context }) => ({
                    outcome: rejected(
                      context.active!.requestId,
                      'STALE_MANIFEST',
                      'A checked write precondition changed.',
                    ),
                  })),
                ],
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
                outcome:
                  classifyParameterReceipt({ change: context.change!, current: event.output }) === 'committed'
                    ? {
                        status: 'committed',
                        requestId: context.active!.requestId,
                        revision: event.output.identity,
                        write: 'reconciled',
                      }
                    : {
                        status: 'indeterminate',
                        requestId: context.active!.requestId,
                        code: 'UNKNOWN_APPLICATION',
                        message: 'The available receipt cannot establish whether the write committed.',
                      },
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
            resolve: { target: 'recovering', actions: 'resolve' },
            'watch.changed': { target: 'recovering' },
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

/** Subscribe before sending one command; all sequencing and settlement belong to the actor. @public */
export const submitParameterRequest = async (
  actor: ActorRefFrom<typeof parameterSetMachine>,
  request: ParameterSetRequest,
): Promise<ParameterSetOutcome> => {
  if (actor.getSnapshot().status !== 'active') {
    return rejected(request.requestId, 'CLOSED', 'Parameter actor is closed.');
  }
  return new Promise((resolve, reject) => {
    const outcome = actor.on('settled', (event) => {
      if (event.request !== undefined && sameRequestDelivery(event.request, request)) {
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
