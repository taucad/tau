/**
 * The lifecycle of one composer record (blueprint §"The machine:
 * `composer-record.machine`").
 *
 * One instance per record — the Home pre-project composer, a project chat, a
 * project's unread marker. Its actors are injected through
 * {@link composerRecordActors} from a `ComposerRecordStore`, so the machine
 * never sees a path or a filesystem client and runs the same way in a test, a
 * browser and a daemon.
 *
 * Two parallel regions, because loading and writing are independent: the
 * composer is interactive from the first frame (`lifecycle`) while its writes
 * coalesce, fail, retry and drain on their own (`writes`).
 */

import { matchesState, setup, types } from 'xstate';
import type { StateValue } from 'xstate';
import type {
  ComposerRecord,
  ComposerRecordPatch,
  ComposerRecordReadResult,
  ComposerRecordStore,
} from '#db/composer-record-store.js';
import { isComposerRecordInputError } from '#db/composer-record-store.js';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { getRetryDelay } from '#utils/backoff.utils.js';

/** How many times a retryable write failure is retried before the patch is declared stalled. */
const defaultRetryMaxAttempts = 5;

/** Input accepted when creating the composerRecordMachine actor. @public */
export type ComposerRecordMachineInput = {
  /** Retry budget for a failing write. Defaults to 5. */
  readonly retryMaxAttempts?: number;
};

/** Serializable state owned by composerRecordMachine. @public */
export type ComposerRecordMachineContext = {
  /**
   * The record as it was read at load, or `undefined` when it was absent or
   * unreadable. Hydration (D7) is the only consumer; the machine does not
   * re-read after a write, so this is deliberately not a live mirror of disk.
   */
  readonly record: ComposerRecord | undefined;
  /** Fields waiting for a write. Merged across patches, so nothing is dropped. */
  readonly pending: ComposerRecordPatch;
  /** The fields the current write is carrying; restored to `pending` if it fails. */
  readonly inFlight: ComposerRecordPatch;
  /** Consecutive retryable write failures. Reset by the next success. */
  readonly attempt: number;
  /** @see ComposerRecordMachineInput.retryMaxAttempts */
  readonly retryMaxAttempts: number;
};

/** Events accepted by composerRecordMachine. @public */
export type ComposerRecordMachineEvent =
  | { readonly type: 'patch'; readonly fields: ComposerRecordPatch }
  | { readonly type: 'flushNow' }
  | { readonly type: 'remove' }
  | { readonly type: 'recordRead'; readonly result: ComposerRecordReadResult };

/** Events composerRecordMachine emits to its subscribers. @public */
export type ComposerRecordMachineEmitted =
  | { readonly type: 'recordLoaded'; readonly record: ComposerRecord | 'absent' }
  | { readonly type: 'recordUnreadable'; readonly error: Error }
  | { readonly type: 'writeFailed'; readonly error: Error; readonly attempt: number }
  | { readonly type: 'writeStalled' }
  | { readonly type: 'writeRecovered' }
  | { readonly type: 'recordRemoved' };

const readRecordActor = fromSafeAsync<{ type: 'recordRead'; result: ComposerRecordReadResult }>(async () => {
  throw new Error('readRecordActor not provided');
});

const writePatchActor = fromSafeAsync<void, ComposerRecordPatch>(async () => {
  throw new Error('writePatchActor not provided');
});

// oxlint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- a throw-only body infers `Promise<never>` without it (XState policy, "Async Operations")
const removeRecordActor = fromSafeAsync<void>(async () => {
  throw new Error('removeRecordActor not provided');
});

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const hasFields = (patch: ComposerRecordPatch): boolean => Object.keys(patch).length > 0;

/**
 * Merge `newer` over `older` field by field.
 *
 * The two keyed fields merge one level deep, so a failed edit for one message
 * and a fresh edit for another both survive into the next write — a plain
 * spread would drop the older map wholesale.
 */
const mergePatch = (older: ComposerRecordPatch, newer: ComposerRecordPatch): ComposerRecordPatch => {
  const merged: ComposerRecordPatch = { ...older, ...newer };
  return {
    ...merged,
    ...(older.messageEdits === undefined || newer.messageEdits === undefined
      ? {}
      : { messageEdits: { ...older.messageEdits, ...newer.messageEdits } }),
    ...(older.unread === undefined || newer.unread === undefined
      ? {}
      : { unread: { ...older.unread, ...newer.unread } }),
  };
};

/**
 * The patch that remains once the fields the store can never accept are gone.
 *
 * `patch` rejects unrepairably only for the message fields it validates —
 * `draft` and `messageEdits` — and it validates them together, so neither can
 * be cleared alone. Everything else (tool choice, mode, unread, execution)
 * cannot fail validation and must not be held hostage by a draft that never
 * writes: retaining it would merge the same rejection into every later patch
 * and stall the record permanently behind one bad attachment.
 */
const withoutUnwritableFields = ({ draft, messageEdits, ...rest }: ComposerRecordPatch): ComposerRecordPatch => rest;

const retainedAfterDrop = (context: ComposerRecordMachineContext): ComposerRecordPatch =>
  mergePatch(withoutUnwritableFields(context.inFlight), context.pending);

/** The record still exists: nothing has asked for it to be removed. */
const isLive = (value: StateValue): boolean =>
  matchesState({ lifecycle: 'loading' }, value) || matchesState({ lifecycle: 'usable' }, value);

/** An unrepairable failure: the fields that can never be written are dropped, not retained. */
const dropUnwritable = (context: ComposerRecordMachineContext): Partial<ComposerRecordMachineContext> => ({
  pending: retainedAfterDrop(context),
  inFlight: {},
});

/**
 * Headless composer-record lifecycle with replaceable I/O actors.
 *
 * @public
 */
export const composerRecordMachine = setup({
  schemas: {
    context: types<ComposerRecordMachineContext>(),
    events: eventSchemas<ComposerRecordMachineEvent>(),
    input: types<ComposerRecordMachineInput>(),
    emitted: eventSchemas<ComposerRecordMachineEmitted>(),
  },
  actors: {
    readRecordActor,
    writePatchActor,
    removeRecordActor,
  },
  delays: {
    /**
     * The curve `chat-persistence.machine` already retries transport failures
     * on; see {@link getRetryDelay}. Computed at scheduling time off the
     * post-failure attempt counter, so each retry advances it.
     */
    retryDelay: ({ context }) => getRetryDelay(context.attempt),
  },
}).createMachine({
  id: 'composer-record',
  context: ({ input }) => ({
    record: undefined,
    pending: {},
    inFlight: {},
    attempt: 0,
    retryMaxAttempts: input.retryMaxAttempts ?? defaultRetryMaxAttempts,
  }),
  type: 'parallel',
  states: {
    lifecycle: {
      initial: 'loading',
      states: {
        loading: {
          invoke: {
            src: 'readRecordActor',
            // A read that fails is not a record that is absent, but it is still
            // a composer the user may type into right now (D7).
            onError: ({ event }, enq) => {
              enq.emit({ type: 'recordUnreadable', error: asError(event.error) });
              enq.emit({ type: 'recordLoaded', record: 'absent' });
              return { target: 'usable' };
            },
          },
          on: {
            /** Announce the outcome of the read, whatever it was; `loading` always ends here. */
            recordRead: ({ event }, enq) => {
              const { result } = event;
              if (result.status === 'invalid') {
                enq.emit({ type: 'recordUnreadable', error: result.error });
              }
              enq.emit({ type: 'recordLoaded', record: result.status === 'valid' ? result.record : 'absent' });
              return result.status === 'valid'
                ? { target: 'usable', context: { record: result.record } }
                : { target: 'usable' };
            },
            remove: { target: 'draining' },
          },
        },
        usable: {
          on: { remove: { target: 'draining' } },
        },
        /**
         * Removal waits only for a write that is already on the wire — an
         * unlink racing it would leave the record recreated. A retained or
         * retrying patch is abandoned on purpose: its record is going away,
         * and `writes` moves to `stopped` so nothing written later brings it back.
         */
        draining: {
          always: ({ value }) => (matchesState({ writes: 'persisting' }, value) ? undefined : { target: 'removing' }),
        },
        removing: {
          invoke: {
            src: 'removeRecordActor',
            onDone: { target: 'removed' },
            // Ponytail: a removal the filesystem refused is still a removal as
            // far as the caller is concerned — the chat or project it belonged
            // to is already gone, and there is nothing left to retry into.
            onError: { target: 'removed' },
          },
        },
        removed: {
          type: 'final',
          entry: (_, enq) => {
            enq.emit({ type: 'recordRemoved' });
          },
        },
      },
    },
    writes: {
      initial: 'idle',
      states: {
        idle: {
          always: ({ value }) => (isLive(value) ? undefined : { target: 'stopped' }),
          on: {
            /** An empty patch changes nothing; writing it would only create an absent file. */
            patch: ({ context, event }) =>
              hasFields(event.fields)
                ? { target: 'persisting', context: { pending: mergePatch(context.pending, event.fields) } }
                : undefined,
            flushNow: ({ context }) => (hasFields(context.pending) ? { target: 'persisting' } : undefined),
          },
        },
        persisting: {
          /** Hand `pending` to the write about to start, so later patches accumulate behind it. */
          entry: ({ context }) => ({ context: { inFlight: context.pending, pending: {} } }),
          invoke: {
            src: 'writePatchActor',
            /* A state's `invoke.input` is evaluated before its own `entry` patch,
             * so the write carries the fields `entry` is moving into `inFlight`. */
            input: ({ context }) => context.pending,
            /** A write landed: clear the in-flight fields and tell a failure subscriber it is over. */
            onDone: ({ context, value }, enq) => {
              if (context.attempt > 0) {
                enq.emit({ type: 'writeRecovered' });
              }
              const cleared = { inFlight: {}, attempt: 0 };
              // A drain lets this write land, then starts no other: the patches behind it die with the record.
              return hasFields(context.pending) && isLive(value)
                ? { target: 'persisting', reenter: true, context: cleared }
                : { target: 'idle', context: cleared };
            },
            onError: ({ context, event, value }, enq) => {
              const error = asError(event.error);
              if (isComposerRecordInputError(event.error)) {
                enq.emit({ type: 'writeFailed', error, attempt: context.attempt });
                return hasFields(retainedAfterDrop(context)) && isLive(value)
                  ? { target: 'persisting', reenter: true, context: dropUnwritable(context) }
                  : { target: 'idle', context: dropUnwritable(context) };
              }
              /** A retryable failure: the patch goes back to `pending` and costs one attempt. */
              const attempt = context.attempt + 1;
              enq.emit({ type: 'writeFailed', error, attempt });
              return {
                target: 'retrying',
                context: { pending: mergePatch(context.inFlight, context.pending), inFlight: {}, attempt },
              };
            },
          },
          on: {
            // Coalesced: this patch rides the next write, not this one.
            patch: { context: ({ context, event }) => ({ pending: mergePatch(context.pending, event.fields) }) },
          },
        },
        retrying: {
          // Removal does not wait out a retry (the record is going away), so the
          // timer must die here — a retry that fired after the unlink would
          // recreate the file.
          // A spent budget is known the moment the failure lands; the stall is announced then, not after a delay.
          always: ({ context, value }, enq) => {
            if (!isLive(value)) {
              return { target: 'stopped' };
            }
            if (context.attempt > context.retryMaxAttempts) {
              enq.emit({ type: 'writeStalled' });
              return { target: 'idle' };
            }
            return undefined;
          },
          after: { retryDelay: { target: 'persisting' } },
          on: {
            // A fresh edit is the user asking again; do not make them wait out the curve.
            patch: ({ context, event }) =>
              hasFields(event.fields)
                ? { target: 'persisting', context: { pending: mergePatch(context.pending, event.fields) } }
                : undefined,
            flushNow: { target: 'persisting' },
          },
        },
        /**
         * Terminal. Every resting state routes here once removal begins, and
         * `persisting` reaches it through `idle` after its drain. With no
         * handlers, a late `patch` or `flushNow` has nothing to start — and once
         * `lifecycle` is `removed` too, both regions are final and the actor
         * stops, so the deleted record cannot be written back.
         */
        stopped: {
          type: 'final',
        },
      },
    },
  },
});

/**
 * The `provide()` bundle binding a machine instance to one record's store.
 *
 * @param store - The store for the record this actor owns.
 * @returns The actor implementations, ready for `composerRecordMachine.provide()`.
 */
export function composerRecordActors(store: ComposerRecordStore): {
  actors: {
    readRecordActor: typeof readRecordActor;
    writePatchActor: typeof writePatchActor;
    removeRecordActor: typeof removeRecordActor;
  };
} {
  return {
    actors: {
      readRecordActor: fromSafeAsync(async () => ({ type: 'recordRead', result: await store.read() })),
      writePatchActor: fromSafeAsync(async ({ input }: { input: ComposerRecordPatch }) => {
        await store.patch(input);
      }),
      removeRecordActor: fromSafeAsync(async () => {
        await store.remove();
      }),
    },
  };
}
