import { z } from 'zod';
import { createCallbackLogic, setup, types } from 'xstate';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

/**
 * The lease store's clock (app state orchestration charter D6, I15; plan § 4 A1b; B3).
 *
 * A mount is a lease, never a lifetime. The store (`leases.ts`) creates an entry's actor in render and starts it on
 * the first retain; this machine owns only time. It counts each key's retains and, when a key has none, starts that
 * key's grace as a delayed raise on the runtime's clock: a release starts it, and so does an entry that is created
 * and never retained. A retain inside the grace cancels it, so a StrictMode remount keeps the lease. When a grace
 * ends with the key still unretained, the machine tells the `table` child, which holds the entries in its closure
 * (D4), to drop it: the actor is stopped and what the mount attached to the entry is released.
 */

/**
 * How long an unretained lease lives (milliseconds): long enough for a remount and for a render that commits late,
 * short enough that a library card's file manager is gone soon after the card.
 *
 * @public
 */
export const leaseGraceMilliseconds = 5000;

/** Events the store sends. @public */
export type LeasesEvent =
  | { readonly type: 'created'; readonly key: string }
  | { readonly type: 'retained'; readonly key: string }
  | { readonly type: 'released'; readonly key: string };

/** The store's public alphabet. @public */
export const leasesEventTypes = ['created', 'retained', 'released'] as const satisfies ReadonlyArray<
  LeasesEvent['type']
>;

/** What the machine tells its `table` child. @public */
export type LeaseTableCommand = { readonly type: 'drop'; readonly key: string };

/**
 * The pairs the machine leaves unanswered (MC-R17): none. A retain or release of an unknown key is answered with no
 * change, and a stale grace with nothing.
 *
 * @public
 */
export const leasesIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/** The machine's context: retains per live key, and the first fault. @public */
export type LeasesContext = Readonly<{
  retains: Readonly<Record<string, number>>;
  fault: string | undefined;
}>;

const keyed = z.object({ key: z.string() });

/** One grace timer per key, so a retain cancels only its own. */
const graceId = (key: string): string => `grace:${key}`;

/** The driver default: no table, so a drop has nothing to stop (MC-R8). The store provides its own. */
const noTable = createCallbackLogic<LeaseTableCommand>(() => undefined);

/**
 * The lease store's clock.
 *
 * @public
 */
export const leasesMachine = setup({
  schemas: {
    context: types<LeasesContext>(),
    events: { created: keyed, retained: keyed, released: keyed } satisfies Record<LeasesEvent['type'], z.ZodType>,
    internalEvents: { graceEnded: keyed },
  },
  actors: { table: noTable },
}).createMachine({
  id: 'leases',
  version: '1',
  /* A fault no transition modelled is recorded and reported once, and the store keeps answering (MC-R12, D23). */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(() => {
      reportAppRuntimeFault(event.error);
    });
    return { context: { fault: faultMessage(event.error, 'lease store fault') } };
  },
  context: { retains: {}, fault: undefined },
  invoke: {
    id: 'table',
    src: 'table',
    onError: ({ context, event }, enq) => {
      if (context.fault !== undefined) {
        return {};
      }
      enq(() => {
        reportAppRuntimeFault(event.error);
      });
      return { context: { fault: faultMessage(event.error, 'lease table fault') } };
    },
  },
  on: {
    /* A new entry nobody has retained yet: it is dropped after the grace unless a mount retains it first. */
    created: ({ context, event }, enq) => {
      if (context.retains[event.key] !== undefined) {
        return {}; // The store creates an entry once per live key; a repeat changes nothing.
      }
      enq.raise({ type: 'graceEnded', key: event.key }, { id: graceId(event.key), delay: leaseGraceMilliseconds });
      return { context: { retains: { ...context.retains, [event.key]: 0 } } };
    },
    retained: ({ context, event }, enq) => {
      const retains = context.retains[event.key];
      if (retains === undefined) {
        return {}; // Dropped already: the store refuses a retain of a dropped entry before it sends one.
      }
      enq.cancel(graceId(event.key));
      return { context: { retains: { ...context.retains, [event.key]: retains + 1 } } };
    },
    released: ({ context, event }, enq) => {
      const retains = context.retains[event.key];
      if (retains === undefined || retains === 0) {
        return {}; // Every release follows its retain; an unmatched one changes nothing.
      }
      if (retains === 1) {
        enq.raise({ type: 'graceEnded', key: event.key }, { id: graceId(event.key), delay: leaseGraceMilliseconds });
      }
      return { context: { retains: { ...context.retains, [event.key]: retains - 1 } } };
    },
    graceEnded: ({ context, event, children }, enq) => {
      if (context.retains[event.key] !== 0) {
        return {}; // Retained again inside the grace, whose cancel this delivery raced: the lease stays.
      }
      const { [event.key]: _dropped, ...retains } = context.retains;
      const { table } = children;
      if (table !== undefined) {
        enq.sendTo(table, { type: 'drop', key: event.key });
      }
      return { context: { retains } };
    },
  },
});

/** The table child's logic type, for the store's provision. @public */
export type LeaseTableLogic = typeof noTable;
