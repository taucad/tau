import { setup, types } from 'xstate';
import type { AnyActorRef } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

/**
 * The patience of a project session's file check (app state orchestration charter I15, D25; plan § 4 A14; U13, U20).
 *
 * The session owns whether its first file check has settled (`availability`); this child owns only how long a check
 * has run. The session tells it each check that starts and each that settles, and it tells the session once a check
 * has outlasted `modelCheckPatienceMilliseconds`, an `after` on the session's clock. The "Preparing model" view reads
 * that `slow` from the session for its "Try again", where its own timer effect did before A14.
 *
 * `idle → checking → slow`, and back to `idle` when the check settles. Each check the session starts carries an id,
 * which the report echoes (MC-R18), so a report the session has moved past is dropped there. The session starts a check
 * for each new revision client, which has published nothing and counts its patience from zero, and for each later
 * check its client reports; a check that starts while one runs replaces it.
 */

/** How long a check of the model's files may run before the "Preparing model" view offers a way out. Milliseconds. */
export const modelCheckPatienceMilliseconds = 10_000;

/** Input accepted when creating a sessionFileCheckMachine actor. @public */
export type SessionFileCheckMachineInput = Readonly<{
  /** The session it reports to. */
  parentRef?: AnyActorRef;
  /** How long a check may run before it is slow. */
  patienceMilliseconds?: number;
}>;

/** State owned by sessionFileCheckMachine. @public */
export type SessionFileCheckMachineContext = Readonly<{
  parentRef: AnyActorRef | undefined;
  patienceMilliseconds: number;
  /** The id of the check that runs, or ran last. */
  check: number;
  /** The first effect fault no transition modelled; the machine keeps answering (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events accepted by sessionFileCheckMachine. @public */
export type SessionFileCheckMachineEvent =
  /** A check started; one that runs is replaced, and the patience counts from zero. */
  | { readonly type: 'checkStarted'; readonly check: number }
  /** The check settled. */
  | { readonly type: 'checkSettled' };

/** The machine's public alphabet, in the union's order. @public */
export const sessionFileCheckEventTypes = ['checkStarted', 'checkSettled'] as const satisfies ReadonlyArray<
  SessionFileCheckMachineEvent['type']
>;

/**
 * The (state, event) pairs this machine ignores (MC-R17): a settle when no check runs is a repeat.
 *
 * @public
 */
export const sessionFileCheckIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'checkSettled'],
];

/** What the child tells the session: check `check` has outlasted its patience. @public */
export type SessionFileCheckReport = Readonly<{ type: 'fileCheckSlow'; check: number }>;

/**
 * How long one check has run, for its session.
 *
 * @public
 */
export const sessionFileCheckMachine = setup({
  schemas: {
    context: types<SessionFileCheckMachineContext>(),
    events: eventSchemas<SessionFileCheckMachineEvent>(),
    input: types<SessionFileCheckMachineInput>(),
  },
  delays: {
    patience: ({ context }) => context.patienceMilliseconds,
  },
}).createMachine({
  id: 'session-file-check',
  version: '1',
  /* A fault no transition modelled is recorded and reported once, and the machine keeps answering (MC-R12, D23). */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(reportAppRuntimeFault, event.error);
    return { context: { fault: faultMessage(event.error, 'session file check fault') } };
  },
  context: ({ input }) => ({
    parentRef: input.parentRef,
    patienceMilliseconds: input.patienceMilliseconds ?? modelCheckPatienceMilliseconds,
    check: 0,
    fault: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: { checkStarted: { target: 'checking', context: ({ event }) => ({ check: event.check }) } },
    },
    checking: {
      on: {
        /* `reenter` re-arms the patience for the check that replaces this one. */
        checkStarted: { target: 'checking', reenter: true, context: ({ event }) => ({ check: event.check }) },
        checkSettled: { target: 'idle' },
      },
      after: {
        patience: ({ context }, enq) => {
          if (context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, {
              type: 'fileCheckSlow',
              check: context.check,
            } satisfies SessionFileCheckReport);
          }
          return { target: 'slow' };
        },
      },
    },
    slow: {
      on: {
        checkStarted: { target: 'checking', context: ({ event }) => ({ check: event.check }) },
        checkSettled: { target: 'idle' },
      },
    },
  },
});
