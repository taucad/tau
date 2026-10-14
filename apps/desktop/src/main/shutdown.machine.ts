import { createActor, createCallbackLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, EventObject } from 'xstate';
import type { StreamingMachine } from '#shared/machine-shutdown.js';

/** One process-lifetime identity; monotonically numbered attempts are never reused. */
export type ShutdownMachineInput = { readonly identity: string };
/** Serializable quit ownership; effects hold process handles outside the actor. */
export type ShutdownMachineContext = {
  readonly identity: string;
  readonly sequence: number;
  readonly purpose: 'quit' | 'restart';
  readonly attemptId: string;
  readonly machines: readonly StreamingMachine[] | undefined;
  readonly forceMachines: boolean;
  readonly error: string | undefined;
  readonly settlement: 'renderer' | 'utility';
  readonly retryable: boolean;
};
export type ShutdownResult =
  | 'clear'
  | 'review'
  | 'view'
  | 'cancel'
  | 'force'
  | 'confirmed'
  | 'settled'
  | 'failed'
  | 'retry'
  | 'recover';
/** Only the current invoked effect may complete its stage. */
export type ShutdownMachineEvent =
  | { readonly type: 'quit'; readonly purpose?: 'quit' | 'restart' }
  | {
      readonly type: 'done';
      readonly attemptId: string;
      readonly result: ShutdownResult;
      readonly machines?: readonly StreamingMachine[];
      readonly error?: string;
      readonly retryable?: boolean;
    };
export type ShutdownStage =
  | 'assessing'
  | 'reviewing'
  | 'confirming'
  | 'renderer'
  | 'utility'
  | 'settlementReview'
  | 'recovering'
  | 'recoveryReview'
  | 'cancelling'
  | 'viewing'
  | 'exiting';
export type ShutdownDriverInput = { readonly stage: ShutdownStage; readonly context: ShutdownMachineContext };
const shutdownDriver = createCallbackLogic<EventObject, ShutdownDriverInput>(() => {
  throw new Error('Shutdown requires desktop effects.');
});
export const shutdownActors = { shutdownDriver };
const stages: readonly ShutdownStage[] = [
  'assessing',
  'reviewing',
  'confirming',
  'renderer',
  'utility',
  'settlementReview',
  'recovering',
  'recoveryReview',
  'cancelling',
  'viewing',
  'exiting',
];
/** Repeated Cmd-Q cannot create a second fence, prompt, or teardown. */
export const shutdownIgnoredEvents: ReadonlyArray<readonly [string, string]> = [
  ['idle', 'done'],
  ...stages.map((stage): readonly [string, string] => [stage, 'quit']),
];
/** Effect bounds report unknown/failure, never infer machine stop or save completion. */
export const shutdownTimeouts = [
  { stage: 'assessing', owner: 'services broker', purpose: 'Unknown assessment on deadline' },
  { stage: 'renderer', owner: 'renderer settlement', purpose: 'Saving review on deadline' },
  { stage: 'utility', owner: 'services broker', purpose: 'Saving review on deadline' },
  { stage: 'recovering', owner: 'recovery driver', purpose: 'Retry recovery or explicitly exit' },
] as const;
const invoke = (stage: ShutdownStage) =>
  ({
    src: 'shutdownDriver',
    input: ({ context }: { context: ShutdownMachineContext }) => ({ stage, context }),
  }) as const;
/** One owner for assessment, explicit interruption consent, settlement and recovery. */
export const shutdownMachine = setup({
  schemas: {
    input: types<ShutdownMachineInput>(),
    context: types<ShutdownMachineContext>(),
    events: {
      quit: types<{ readonly purpose?: 'quit' | 'restart' }>(),
      done: types<Omit<Extract<ShutdownMachineEvent, { type: 'done' }>, 'type'>>(),
    },
  },
  actors: shutdownActors,
}).createMachine({
  id: 'shutdown',
  version: '1',
  initial: 'idle',
  context: ({ input }) => ({
    identity: input.identity,
    sequence: 0,
    purpose: 'quit',
    attemptId: '',
    machines: undefined,
    forceMachines: false,
    error: undefined,
    retryable: true,
    settlement: 'renderer',
  }),
  onError: ({ event }) => ({ target: '.recoveryReview', context: { error: String(event.error) } }),
  states: {
    idle: {
      on: {
        quit: ({ context, event }) => ({
          target: 'assessing',
          context: {
            sequence: context.sequence + 1,
            purpose: event.purpose ?? 'quit',
            attemptId: `${context.identity}:${String(context.sequence + 1)}`,
            machines: undefined,
            forceMachines: false,
            error: undefined,
            retryable: true,
            settlement: 'renderer',
          },
        }),
      },
    },
    assessing: {
      invoke: invoke('assessing'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? {
                target: event.result === 'clear' ? 'renderer' : 'reviewing',
                context: { machines: event.machines, error: event.error },
              }
            : {},
      },
    },
    reviewing: {
      invoke: invoke('reviewing'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? { target: event.result === 'view' ? 'viewing' : event.result === 'force' ? 'confirming' : 'cancelling' }
            : {},
      },
    },
    confirming: {
      invoke: invoke('confirming'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? event.result === 'confirmed'
              ? { target: context.settlement === 'utility' ? 'exiting' : 'renderer', context: { forceMachines: true } }
              : { target: context.settlement === 'utility' ? 'settlementReview' : 'reviewing' }
            : {},
      },
    },
    renderer: {
      invoke: invoke('renderer'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? event.result === 'settled'
              ? { target: 'utility', context: { settlement: 'utility' } }
              : { target: 'settlementReview', context: { error: event.error, retryable: true, settlement: 'renderer' } }
            : {},
      },
    },
    utility: {
      invoke: invoke('utility'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? {
                target: event.result === 'settled' ? 'exiting' : 'settlementReview',
                context: { error: event.error, retryable: event.retryable === true, settlement: 'utility' },
              }
            : {},
      },
    },
    settlementReview: {
      invoke: invoke('settlementReview'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? {
                target:
                  event.result === 'retry'
                    ? context.settlement
                    : event.result === 'force'
                      ? context.settlement === 'utility'
                        ? 'confirming'
                        : 'utility'
                      : 'recovering',
                context: event.result === 'force' ? { settlement: 'utility' } : {},
              }
            : {},
      },
    },
    recovering: {
      invoke: invoke('recovering'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? { target: event.result === 'settled' ? 'idle' : 'recoveryReview', context: { error: event.error } }
            : {},
      },
    },
    recoveryReview: {
      invoke: invoke('recoveryReview'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? { target: event.result === 'force' ? 'confirming' : 'recovering', context: { settlement: 'utility' } }
            : {},
      },
    },
    cancelling: {
      invoke: invoke('cancelling'),
      on: { done: ({ context, event }) => (event.attemptId === context.attemptId ? { target: 'idle' } : {}) },
    },
    viewing: {
      invoke: invoke('viewing'),
      on: { done: ({ context, event }) => (event.attemptId === context.attemptId ? { target: 'idle' } : {}) },
    },
    prepared: { type: 'final' },
    exiting: {
      invoke: invoke('exiting'),
      on: {
        done: ({ context, event }) =>
          event.attemptId === context.attemptId
            ? {
                target: event.result === 'settled' ? 'prepared' : 'recoveryReview',
                context: { error: event.error },
              }
            : {},
      },
    },
  },
});
/** Create an unstarted owner with replaceable named effects, clock and inspector. */
export const createShutdownActor = (
  input: ShutdownMachineInput,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> & {
    readonly actors?: typeof shutdownActors;
  } = {},
): Actor<typeof shutdownMachine> => {
  const { actors, ...rest } = options;
  return createActor(actors ? shutdownMachine.provide({ actors }) : shutdownMachine, { ...rest, input });
};
