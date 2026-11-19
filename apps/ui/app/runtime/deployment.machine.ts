import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, EventObject } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';

/**
 * `deployment`: the owner of the page's display mode in an adaptive build (adaptive app deployment mode charter D2 to
 * D5, I2, I9, I15; the transition table under "The display mode").
 *
 * It starts from this install's record of the last explicit answer for the page's API origin (`recalling`), asks the
 * API's `GET /v1/deployment` once per page load (`asking`), and then again at the answer's `maxAge` while the page is
 * visible (`fresh`, `due`), or with a capped backoff after a failure, on `online`, on window focus and on the person's
 * Retry (`backoff`, then `stalled` when the backoff ends on a hidden page). Each ask has a deadline on the runtime's clock; leaving `asking` stops the ask, which aborts the
 * request. Every change of the mode is told to the parent as `deploymentChanged`; nothing awaits it (I1).
 *
 * The machine is pure (MC-R6): reading and asking are named actors and writing the record is a named effect, all
 * provided by the composition (`deployment.ts`), which also classifies an answer, so the contract stays there. Time
 * arrives in the actors' outputs. The record is a durable fact cached in context; its rehydration source is the
 * composition's `localStorage` entry for this origin, read in `recalling` (MC-R5).
 *
 * Safe mode (D10): `idle` reads no record and asks nothing.
 */

/** How long one ask may run before it counts as failed (I15: `pending` lasts at most this). Milliseconds. @public */
export const deploymentAskDeadlineMilliseconds = 5000;

/** The first retry after a failed ask, doubled per further failure up to the cap. Milliseconds. @public */
export const deploymentBackoffBaseMilliseconds = 2000;

/** The longest wait between retries of a failing route. Milliseconds. @public */
export const deploymentBackoffCapMilliseconds = 300_000;

/** How long a funded record is believed against a `404` (D5). Milliseconds. @public */
export const deploymentFundedRecordTrustMilliseconds = 14 * 24 * 60 * 60 * 1000;

/** A record dated further ahead of the clock than this is expired (D5). Milliseconds. @public */
export const deploymentRecordFutureToleranceMilliseconds = 24 * 60 * 60 * 1000;

/** This install's record of the last explicit answer for one origin (D4, I9): the public answer and a time. @public */
export type DeploymentRecord =
  | Readonly<{ state: 'funded'; environment: string; confirmedAt: number }>
  | Readonly<{ state: 'unfunded'; confirmedAt: number }>;

/** What one ask produced, classified by the composition, with the time it settled (epoch milliseconds). @public */
export type DeploymentAskOutcome = Readonly<{ at: number }> &
  (
    | Readonly<{
        kind: 'funded';
        environment: string;
        revalidateMilliseconds: number;
      }>
    | Readonly<{ kind: 'unfunded'; revalidateMilliseconds: number }>
    | Readonly<{ kind: 'unsupported'; revalidateMilliseconds: number }>
    | Readonly<{ kind: 'misconfigured'; revalidateMilliseconds: number }>
    | Readonly<{ kind: 'absent'; revalidateMilliseconds: number }>
    | Readonly<{
        kind: 'failed';
        reason: 'status' | 'malformed' | 'network' | 'timeout';
      }>
  );

/** Input accepted when creating a deployment actor. @public */
export type DeploymentMachineInput = Readonly<{
  /** The runtime root, told each change of the mode. */
  parentRef?: AnyActorRef;
  /** Whether the page is visible now; revalidation waits for a visible page. */
  visible?: boolean;
  /** This page load runs in safe mode: read nothing, ask nothing (D10). */
  safeMode?: boolean;
}>;

/** The machine's context. @public */
export type DeploymentMachineContext = Readonly<{
  parentRef: AnyActorRef | undefined;
  mode: DeploymentModeSnapshot;
  /** The record as this page last read or wrote it. */
  record: DeploymentRecord | undefined;
  visible: boolean;
  /** Failed asks in a row, for the backoff. */
  failures: number;
  /** When the next revalidation is due after a successful ask. Milliseconds. */
  revalidateMilliseconds: number;
  /** The first effect or child fault no transition modelled (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events accepted by the deployment machine. @public */
export type DeploymentMachineEvent =
  /** The page became visible or hidden, as the runtime's `environment` reports it. */
  | Readonly<{ type: 'visibilityChanged'; visible: boolean }>
  /** The window regained focus. */
  | Readonly<{ type: 'windowFocused' }>
  /** The browser reported the network back. */
  | Readonly<{ type: 'online' }>
  /** The person asked to check again. */
  | Readonly<{ type: 'retry' }>;

/** The machine's public alphabet, in the union's order. @public */
export const deploymentEventTypes = [
  'visibilityChanged',
  'windowFocused',
  'online',
  'retry',
] as const satisfies ReadonlyArray<DeploymentMachineEvent['type']>;

/**
 * The (state, event) pairs the machine ignores (MC-R17): safe mode answers nothing; an ask in flight already answers
 * a focus, `online` or Retry; a fresh answer needs no focus or `online` ask.
 *
 * @public
 */
export const deploymentIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'visibilityChanged'],
  ['idle', 'windowFocused'],
  ['idle', 'online'],
  ['idle', 'retry'],
  ['recalling', 'windowFocused'],
  ['recalling', 'online'],
  ['recalling', 'retry'],
  ['asking', 'windowFocused'],
  ['asking', 'online'],
  ['asking', 'retry'],
  ['fresh', 'windowFocused'],
  ['fresh', 'online'],
  ['due', 'windowFocused'],
  ['due', 'online'],
];

/** What the machine tells its parent on each change of the mode. @public */
export type DeploymentChangedReport = Readonly<{
  type: 'deploymentChanged';
  mode: DeploymentModeSnapshot;
}>;

/** Arguments of the effects the composition provides. @public */
export type DeploymentEffectArgs = Readonly<{
  writeRecord: Readonly<{ record: DeploymentRecord }>;
  /** The confirmation time of the record that expired: a newer one another tab wrote stays. */
  dropRecord: Readonly<{ confirmedAt: number }>;
}>;

const notProvided = (name: string): never => {
  throw new Error(`deployment: the ${name} effect was not provided; createDeploymentOwner provides every effect.`);
};

/** The driver defaults (MC-R8): a read and an ask that throw, and no connectivity listener. */
const unprovidedRecall = createAsyncLogic<DeploymentRecord | undefined>({
  run: async () => notProvided('recall'),
});
const unprovidedAsk = createAsyncLogic<DeploymentAskOutcome>({
  run: async () => notProvided('ask'),
});
const noConnectivity = createCallbackLogic<EventObject>(() => undefined);

/** The mode a record gives before any ask (the table's `start` rows). @public */
export const modeOfRecord = (record: DeploymentRecord | undefined): DeploymentModeSnapshot => {
  if (record === undefined) {
    return { state: 'unknown', problem: 'pending' };
  }
  return record.state === 'funded'
    ? { state: 'funded', basis: 'remembered', environment: record.environment }
    : { state: 'unfunded', basis: 'remembered' };
};

/**
 * Whether a funded record still outweighs a `404` at `at` (D5): confirmed within 14 days, and not dated more than a
 * day ahead of the clock.
 *
 * @public
 */
export const isFundedRecordTrusted = (record: DeploymentRecord | undefined, at: number): boolean =>
  record?.state === 'funded' &&
  at - record.confirmedAt <= deploymentFundedRecordTrustMilliseconds &&
  record.confirmedAt - at <= deploymentRecordFutureToleranceMilliseconds;

/** A failed ask (D5): the state is kept, `confirmed` becomes `remembered`, and `unknown` becomes `unreachable`. */
const afterFailure = (mode: DeploymentModeSnapshot): DeploymentModeSnapshot => {
  switch (mode.state) {
    case 'funded': {
      return mode.basis === 'confirmed' ? { ...mode, basis: 'remembered' } : mode;
    }
    case 'unfunded': {
      return mode.basis === 'confirmed' ? { state: 'unfunded', basis: 'remembered' } : mode;
    }
    case 'unknown': {
      return { state: 'unknown', problem: 'unreachable' };
    }
  }
};

/** What one ask's outcome does to the mode and the record. @public */
export type DeploymentFold = Readonly<{
  mode: DeploymentModeSnapshot;
  record: DeploymentRecord | undefined;
  /** The record effect: write the new record, drop the stored one, or nothing. */
  effect: 'write' | 'drop' | 'none';
  /** Whether the ask counts as answered (revalidate later) or failed (back off). */
  next: 'fresh' | 'backoff';
}>;

/**
 * Fold one ask's outcome into the mode and the record: the charter's transition table, as a pure function.
 *
 * @param mode - The mode before the outcome.
 * @param record - The record before the outcome.
 * @param outcome - The classified outcome.
 * @returns The new mode and record, the record effect and the next wait.
 * @public
 */
export const foldAskOutcome = (
  mode: DeploymentModeSnapshot,
  record: DeploymentRecord | undefined,
  outcome: DeploymentAskOutcome,
): DeploymentFold => {
  switch (outcome.kind) {
    case 'funded': {
      const written: DeploymentRecord = {
        state: 'funded',
        environment: outcome.environment,
        confirmedAt: outcome.at,
      };
      return {
        mode: {
          state: 'funded',
          basis: 'confirmed',
          environment: outcome.environment,
        },
        record: written,
        effect: 'write',
        next: 'fresh',
      };
    }
    case 'unfunded': {
      return {
        mode: { state: 'unfunded', basis: 'confirmed' },
        record: { state: 'unfunded', confirmedAt: outcome.at },
        effect: 'write',
        next: 'fresh',
      };
    }
    case 'unsupported':
    case 'misconfigured': {
      /* Never unfunded (D7): the record stays, so a later valid answer or a 404 past its trust decides. */
      return {
        mode: { state: 'unknown', problem: outcome.kind },
        record,
        effect: 'none',
        next: 'fresh',
      };
    }
    case 'absent': {
      if (isFundedRecordTrusted(record, outcome.at)) {
        /* D5: a 404 does not demote a funded origin confirmed within 14 days; it counts as a failed ask. */
        return {
          mode: afterFailure(mode),
          record,
          effect: 'none',
          next: 'backoff',
        };
      }
      if (record?.state === 'funded') {
        /* Past its trust, or dated ahead of the clock: the record is dropped and the origin reads as absent. */
        return {
          mode: { state: 'unfunded', basis: 'absent' },
          record: undefined,
          effect: 'drop',
          next: 'fresh',
        };
      }
      /* An unfunded origin stays as it is; an unknown one reads as an API that predates the route. Not recorded. */
      return {
        mode: mode.state === 'unfunded' ? mode : { state: 'unfunded', basis: 'absent' },
        record,
        effect: 'none',
        next: 'fresh',
      };
    }
    case 'failed': {
      return {
        mode: afterFailure(mode),
        record,
        effect: 'none',
        next: 'backoff',
      };
    }
  }
};

/**
 * The wait before the next retry after `failures` failed asks in a row: doubling from the base, capped.
 *
 * @public
 */
export const deploymentBackoffMilliseconds = (failures: number): number =>
  Math.min(deploymentBackoffBaseMilliseconds * 2 ** Math.max(0, failures - 1), deploymentBackoffCapMilliseconds);

const sameMode = (left: DeploymentModeSnapshot, right: DeploymentModeSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Tell the parent the mode, when it changed. */
const tellParent = (
  context: DeploymentMachineContext,
  mode: DeploymentModeSnapshot,
  enq: { sendTo: (ref: AnyActorRef, event: DeploymentChangedReport) => void },
): void => {
  if (context.parentRef !== undefined && !sameMode(context.mode, mode)) {
    enq.sendTo(context.parentRef, { type: 'deploymentChanged', mode });
  }
};

const faultMessage = (error: unknown): string => (error instanceof Error ? error.message : 'deployment fault');

/**
 * The display mode's owner.
 *
 * @public
 */
export const deploymentMachine = setup({
  schemas: {
    context: types<DeploymentMachineContext>(),
    events: eventSchemas<DeploymentMachineEvent>(),
    input: types<DeploymentMachineInput>(),
  },
  actors: {
    recall: unprovidedRecall,
    ask: unprovidedAsk,
    connectivity: noConnectivity,
  },
  actions: {
    writeRecord: (_args: DeploymentEffectArgs['writeRecord']): void => notProvided('writeRecord'),
    dropRecord: (_args: DeploymentEffectArgs['dropRecord']): void => notProvided('dropRecord'),
  },
  delays: {
    askDeadline: deploymentAskDeadlineMilliseconds,
    revalidate: ({ context }) => context.revalidateMilliseconds,
    backoff: ({ context }) => deploymentBackoffMilliseconds(context.failures),
  },
}).createMachine({
  id: 'deployment',
  version: '1',
  /* A fault no transition modelled is recorded once and the machine keeps answering (MC-R12, D23). The mode it holds
   * stays what it was: a fault is never evidence (I2). */
  onError: ({ context, event }) =>
    context.fault === undefined ? { context: { fault: faultMessage(event.error) } } : {},
  context: ({ input }) => ({
    parentRef: input.parentRef,
    mode: {
      state: 'unknown',
      problem: input.safeMode === true ? 'safe-mode' : 'pending',
    },
    record: undefined,
    visible: input.visible ?? true,
    failures: 0,
    revalidateMilliseconds: 0,
    fault: undefined,
  }),
  initial: 'starting',
  states: {
    /* Transient: safe mode goes idle, every other start reads the record. */
    starting: {
      always: ({ context }) =>
        context.mode.state === 'unknown' && context.mode.problem === 'safe-mode'
          ? { target: 'idle' }
          : { target: 'recalling' },
    },
    /* D10: safe mode. The parent is told once, at start, that this page load runs with Cloud off. */
    idle: {
      entry: ({ context }, enq) => {
        if (context.parentRef !== undefined) {
          enq.sendTo(context.parentRef, {
            type: 'deploymentChanged',
            mode: context.mode,
          } satisfies DeploymentChangedReport);
        }
      },
    },
    recalling: {
      invoke: {
        id: 'recall',
        src: 'recall',
        onDone: ({ context, event }, enq) => {
          const mode = modeOfRecord(event.output);
          tellParent(context, mode, enq);
          return { target: 'asking', context: { mode, record: event.output } };
        },
        /* BA1: the composition's read never throws; a defect reads as no record. */
        onError: ({ context, event }) => ({
          target: 'asking',
          context: context.fault === undefined ? { fault: faultMessage(event.error) } : {},
        }),
      },
      on: {
        visibilityChanged: ({ event }) => ({
          context: { visible: event.visible },
        }),
      },
    },
    asking: {
      invoke: {
        id: 'ask',
        src: 'ask',
        onDone: ({ context, event, actions }, enq) => {
          const fold = foldAskOutcome(context.mode, context.record, event.output);
          tellParent(context, fold.mode, enq);
          if (fold.effect === 'write' && fold.record !== undefined) {
            enq(actions.writeRecord, { record: fold.record });
          } else if (fold.effect === 'drop' && context.record !== undefined) {
            enq(actions.dropRecord, { confirmedAt: context.record.confirmedAt });
          }
          return fold.next === 'fresh'
            ? {
                target: 'fresh',
                context: {
                  mode: fold.mode,
                  record: fold.record,
                  failures: 0,
                  revalidateMilliseconds: event.output.kind === 'failed' ? 0 : event.output.revalidateMilliseconds,
                },
              }
            : {
                target: 'backoff',
                context: {
                  mode: fold.mode,
                  record: fold.record,
                  failures: context.failures + 1,
                },
              };
        },
        /* The composition's ask never throws; a defect is a failed ask. */
        onError: ({ context, event }, enq) => {
          const mode = afterFailure(context.mode);
          tellParent(context, mode, enq);
          return {
            target: 'backoff',
            context: {
              mode,
              failures: context.failures + 1,
              ...(context.fault === undefined ? { fault: faultMessage(event.error) } : {}),
            },
          };
        },
      },
      after: {
        /* I15: the ask's deadline. Leaving `asking` stops the ask, which aborts its request. */
        askDeadline: ({ context }, enq) => {
          const mode = afterFailure(context.mode);
          tellParent(context, mode, enq);
          return {
            target: 'backoff',
            context: { mode, failures: context.failures + 1 },
          };
        },
      },
      on: {
        visibilityChanged: ({ event }) => ({
          context: { visible: event.visible },
        }),
      },
    },
    /* Answered: ask again at the answer's `maxAge`, or once the page is visible again. */
    fresh: {
      after: {
        revalidate: ({ context }) => (context.visible ? { target: 'asking' } : { target: 'due' }),
      },
      on: {
        visibilityChanged: ({ event }) => ({
          context: { visible: event.visible },
        }),
        retry: { target: 'asking' },
      },
    },
    due: {
      on: {
        visibilityChanged: ({ event }) =>
          event.visible ? { target: 'asking', context: { visible: true } } : { context: { visible: false } },
        retry: { target: 'asking' },
      },
    },
    /* Failed, with the backoff spent while the page was hidden: ask once it is visible, and still at once on
     * `online`, on focus and on the person's Retry, so a failed ask is never left waiting for visibility alone. */
    stalled: {
      on: {
        visibilityChanged: ({ event }) =>
          event.visible ? { target: 'asking', context: { visible: true } } : { context: { visible: false } },
        windowFocused: { target: 'asking' },
        online: { target: 'asking' },
        retry: { target: 'asking' },
      },
    },
    /* Failed: retry after the backoff while visible, and at once on `online`, on focus and on the person's Retry. */
    backoff: {
      after: {
        backoff: ({ context }) => (context.visible ? { target: 'asking' } : { target: 'stalled' }),
      },
      on: {
        visibilityChanged: ({ event }) => ({
          context: { visible: event.visible },
        }),
        windowFocused: { target: 'asking' },
        online: { target: 'asking' },
        retry: { target: 'asking' },
      },
    },
  },
  /* `online` arrives from the composition's listener for the actor's life. */
  invoke: {
    id: 'connectivity',
    src: 'connectivity',
    /* Without the listener the backoff and focus still retry; the fault is recorded once. */
    onError: ({ context, event }) =>
      context.fault === undefined ? { context: { fault: faultMessage(event.error) } } : {},
  },
});
