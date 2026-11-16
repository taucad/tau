/**
 * The lease store (app state orchestration charter D6; plan § 4 A1b; B3).
 *
 * A host without a session leases its actor here instead of owning it. {@link LeaseStore.get} may be called in
 * render: it is idempotent per key and starts nothing, so the first client render and the server render read the
 * actor's initial snapshot, as `useActorRef` gave them. The mount retains the entry once it commits, and the first
 * retain starts the actor. A release, or an entry that is never retained, starts the key's grace on the runtime's
 * clock (`leases.machine.ts`); a retain inside the grace keeps the lease, so a StrictMode remount keeps it. When the
 * grace ends the entry is dropped: its actor is stopped and every disposer attached to it runs. On the server the
 * runtime is never started, so no entry is ever started or dropped, and every entry dies with the request's runtime.
 *
 * The entries are host objects, so they live in the closure of the machine's `table` child (D4); the machine holds
 * only the retain counts. Stopping the runtime stops every entry.
 */
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, AnyActor } from 'xstate';
import { leasesMachine } from '#runtime/leases.machine.js';
import type { LeaseTableCommand } from '#runtime/leases.machine.js';

/** What a builder returns: the unstarted actor, and what to release with it. @public */
export type LeaseBuild<Leased extends AnyActor> = Readonly<{
  actor: Leased;
  /** Released when the entry is dropped, after the actor stops. */
  dispose?: () => void;
}>;

/** One leased actor. @public */
export type LeaseEntry<Leased extends AnyActor> = Readonly<{
  key: string;
  /** Unstarted until the first retain. */
  actor: Leased;
  /**
   * Retain the entry for a committed mount; the first retain starts the actor. Call it from the commit phase.
   *
   * @returns The release, which starts the grace once no retain is left. Calling it twice releases once.
   */
  retain: () => () => void;
  /** Run `dispose` when the entry is dropped. Attaching the same function twice runs it once. */
  attach: (dispose: () => void) => void;
  /** Whether the entry was dropped: its actor is stopped, and the store builds a fresh entry for its key. */
  isDropped: () => boolean;
  /**
   * Aborted when the entry is dropped. A wait on the actor listens to it: an actor stopped before it started tells
   * its subscribers nothing.
   */
  dropped: AbortSignal;
}>;

/** The store a mount leases from. @public */
export type LeaseStore = Readonly<{
  /**
   * The live entry for `key`, built by `build` if there is none. Safe in render: it starts nothing.
   *
   * @param key - The entry's identity; one mount's key is its own.
   * @param build - Builds the unstarted actor, once per live key.
   * @returns The entry.
   */
  get: <Leased extends AnyActor>(key: string, build: () => LeaseBuild<Leased>) => LeaseEntry<Leased>;
}>;

type EntryState = {
  readonly actor: AnyActor;
  readonly disposers: Set<() => void>;
  readonly drop: AbortController;
  started: boolean;
  dropped: boolean;
};

type TableEntry = Readonly<{ entry: LeaseEntry<AnyActor>; state: EntryState }>;

/** The leases ref the store sends its counts to. @public */
export type LeasesRef = ActorRefFrom<typeof leasesMachine>;

/**
 * The lease table: the machine's logic with its `table` child provided, and the store over a running machine.
 *
 * @returns The logic the runtime spawns as `leases`, and the store for that child's ref.
 * @public
 */
export function createLeaseTable(): Readonly<{
  logic: typeof leasesMachine;
  storeFor: (leases: LeasesRef) => LeaseStore;
}> {
  const entries = new Map<string, TableEntry>();

  const drop = (key: string): void => {
    const held = entries.get(key);
    if (held === undefined) {
      return;
    }
    entries.delete(key);
    const { state } = held;
    state.dropped = true;
    state.actor.stop();
    state.drop.abort();
    for (const dispose of state.disposers) {
      /* One failing disposer must not keep the rest from releasing what they hold. */
      try {
        dispose();
      } catch (error) {
        console.error(`[leases] a disposer of '${key}' failed`, error);
      }
    }
    state.disposers.clear();
  };

  const table = createCallbackLogic<LeaseTableCommand>(({ receive }) => {
    receive((command) => {
      drop(command.key);
    });
    return () => {
      /* The runtime stopped: nothing outlives it. */
      for (const key of entries.keys()) {
        drop(key);
      }
    };
  });

  const storeFor = (leases: LeasesRef): LeaseStore => ({
    get: <Leased extends AnyActor>(key: string, build: () => LeaseBuild<Leased>): LeaseEntry<Leased> => {
      const live = entries.get(key);
      if (live !== undefined) {
        return live.entry as LeaseEntry<Leased>;
      }
      const built = build();
      const held: EntryState = {
        actor: built.actor,
        disposers: new Set(),
        drop: new AbortController(),
        started: false,
        dropped: false,
      };
      if (built.dispose !== undefined) {
        held.disposers.add(built.dispose);
      }
      const entry: LeaseEntry<Leased> = {
        key,
        actor: built.actor,
        retain: () => {
          if (held.dropped) {
            /* A render that committed after its unretained entry's grace: the entry is gone and is never restarted
             * (MC-R24). The mount sees `isDropped` and renders again, which leases a fresh one. */
            console.error(`[leases] '${key}' was retained after it was dropped`);
            return () => undefined;
          }
          if (!held.started) {
            held.started = true;
            built.actor.start();
          }
          leases.send({ type: 'retained', key });
          let released = false;
          return () => {
            if (!released) {
              released = true;
              leases.send({ type: 'released', key });
            }
          };
        },
        isDropped: () => held.dropped,
        dropped: held.drop.signal,
        attach: (dispose) => {
          if (held.dropped) {
            dispose();
            return;
          }
          held.disposers.add(dispose);
        },
      };
      entries.set(key, { entry, state: held });
      /* Queued until the runtime starts, so a server render's entries never start a grace. */
      leases.send({ type: 'created', key });
      return entry;
    },
  });

  return { logic: leasesMachine.provide({ actors: { table } }), storeFor };
}
