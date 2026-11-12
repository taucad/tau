/**
 * The composition root of `recordSync` (graphics event-driven state charter D6): it binds the machine of one record
 * kind to the two ports of one record file, and gives its public events a typed, promise-returning command surface.
 *
 * The machine holds every fact about the record. What lives here is only what a machine may not hold: the port
 * functions, and the resolvers of the commands that are waiting for their answer.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, Subscription } from 'xstate';
import type {
  CheckedWriteInput,
  CheckedWriteOutcome,
  RecordReadOutcome,
  RecordSyncContext,
  RecordSyncEmitted,
  RecordSyncMachine,
} from '#workbench-records/record-sync.machine.js';
import type { RecordBytes } from '#workbench-records/record-sync-policy.js';

/** The two effects of a record file. Both answer with a typed outcome; a rejection is a defect in the port. */
export type RecordSyncPorts = Readonly<{
  /** Read the file's bytes. */
  read: () => Promise<RecordReadOutcome>;
  /** Write `data` only while the file's bytes are `expected`. */
  write: (input: CheckedWriteInput) => Promise<CheckedWriteOutcome>;
}>;

/** The commands of one `recordSync` actor. Each resolves when the machine answers it; none rejects. */
export type RecordSyncCommands<T> = Readonly<{
  /** Read the file; `forced` publishes even when the bytes are the ones already shown. Resolves `true` once a record has been read. */
  read: (forced?: boolean) => Promise<boolean>;
  /** The person's *Try again* after reads stopped. */
  retryRead: () => Promise<boolean>;
  /** The source changed: the read in flight must not publish. */
  invalidate: () => void;
  /** The person's change. Resolves `true` when the file holds it. */
  edit: (next: T) => Promise<boolean>;
  /** Write `seed` while the file is absent. `requestId` is the id the write port is asked with. */
  ensure: (seed: T, requestId?: string) => Promise<boolean>;
  /** Replace a refused record whose exact bytes the person reviewed. */
  reset: (next: T, reviewed: RecordBytes | null) => Promise<boolean>;
  /**
   * Replace the record shown with `next`, in one checked write on the exact bytes the person reviewed. Answered
   * `false` when anything is owed, when the file no longer holds `reviewed`, and after a conflict or a failed write,
   * which it does not retry. `requestId` is the id the write port is asked with.
   */
  restore: (next: T, reviewed: RecordBytes | null, requestId?: string) => Promise<boolean>;
  /** Write everything owed now. Resolves `true` once nothing is owed. */
  flush: () => Promise<boolean>;
  /** Stop: no new write starts and every waiting command is answered `false`. */
  close: () => void;
  /** A request id no other command of this actor carries. */
  nextRequestId: () => string;
}>;

/**
 * One `recordSync` actor with the typed surface of its record kind. The machine is built over erased record and patch
 * types (see `RecordSyncMachine`), so the record-typed reads go through `context` and `on`.
 */
export type RecordSync<T, P> = Readonly<{
  /** The actor: start it, stop it, inspect its state value. */
  actor: Actor<RecordSyncMachine<T, P>>;
  commands: RecordSyncCommands<T>;
  /** The actor's current context. */
  context: () => RecordSyncContext<T, P>;
  /** Listen to one kind of emitted event, or to all of them with `'*'`. */
  on: <Type extends RecordSyncEmitted<T, P>['type'] | '*'>(
    type: Type,
    listener: (
      event: Type extends '*' ? RecordSyncEmitted<T, P> : Extract<RecordSyncEmitted<T, P>, { type: Type }>,
    ) => void,
  ) => Subscription;
}>;

/**
 * An unstarted `recordSync` actor for one record file, with its commands.
 *
 * @param input - The record kind's machine (`createRecordSyncMachine`, built once per kind), the file's ports, and
 *   the actor options tests inject (MC-R4).
 * @returns The actor and its commands. Start the actor before sending a command.
 */
export function createRecordSync<T, P>(
  input: Readonly<{
    machine: RecordSyncMachine<T, P>;
    ports: RecordSyncPorts;
    /** Milliseconds an edit waits for a later one; 0 writes at once. */
    editDebounce?: number;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): RecordSync<T, P> {
  const { ports, editDebounce, clock, inspect, onRejectedEvent } = input;
  const machine = input.machine.provide({
    actors: {
      readRecord: createAsyncLogic({ run: async () => ports.read() }),
      checkedWrite: createAsyncLogic({
        run: async ({ input: write }: { input: CheckedWriteInput }) => ports.write(write),
      }),
    },
  });
  // An explicit `undefined` would replace xstate's own default, so only what was given is passed on.
  const actor = createActor(machine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
    input: { editDebounce },
  });
  const waiting = new Map<string, (ok: boolean) => void>();
  let requests = 0;
  const nextRequestId = (): string => `r${++requests}`;
  actor.on('answered', ({ requestIds, ok }) => {
    for (const requestId of requestIds) {
      const resolve = waiting.get(requestId);
      waiting.delete(requestId);
      resolve?.(ok);
    }
  });
  const settleAll = (): void => {
    for (const resolve of waiting.values()) {
      resolve(false);
    }
    waiting.clear();
  };
  // Every region is final once the store is closed and its last write has answered: nothing answers after that.
  // MC-R12: a fault discards the step that raised it, which can leave a region waiting on an effect that already
  // finished. So a fault answers every waiting request `false`, and the store answers `false` to every request after.
  let faults = 0;
  actor.subscribe({
    next: (snapshot) => {
      if (snapshot.context.faults !== faults) {
        ({ faults } = snapshot.context);
        settleAll();
      }
    },
    complete: settleAll,
    error: settleAll,
  });
  const stopped = (): boolean => actor.getSnapshot().status !== 'active';
  const faulted = (): boolean => actor.getSnapshot().context.faults > 0;
  const fenced = (): boolean => stopped() || faulted() || actor.getSnapshot().context.closeFenced;
  /** Send a request and wait for its answer; a closed actor answers `false` without a send. */
  const request = async (
    send: (requestId: string) => void,
    requestId = nextRequestId(),
    refused = fenced,
  ): Promise<boolean> => {
    if (refused()) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      waiting.set(requestId, resolve);
      send(requestId);
    });
  };
  return {
    actor,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the machine holds only what this record kind's policy and commands gave it.
    context: () => actor.getSnapshot().context as RecordSyncContext<T, P>,
    on: (type, listener) =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- as above: the emitted records are this kind's.
      actor.on(type, listener as (event: unknown) => void),
    commands: {
      read: async (forced = false) =>
        request((requestId) => {
          actor.send({ type: 'read', requestId, forced });
        }),
      retryRead: async () =>
        request((requestId) => {
          actor.send({ type: 'retryRead', requestId });
        }),
      invalidate: () => {
        if (!fenced()) {
          actor.send({ type: 'invalidate' });
        }
      },
      edit: async (next) =>
        request((requestId) => {
          actor.send({ type: 'edit', requestId, next });
        }),
      ensure: async (seed, requestId) =>
        request((id) => {
          actor.send({ type: 'ensure', requestId: id, seed });
        }, requestId),
      reset: async (next, reviewed) =>
        request((requestId) => {
          actor.send({ type: 'reset', requestId, next, reviewed });
        }),
      restore: async (next, reviewed, requestId) =>
        request((id) => {
          actor.send({ type: 'restore', requestId: id, next, reviewed });
        }, requestId),
      // A closed store whose last write is still on the wire answers the flush when that write does.
      flush: async () =>
        faulted()
          ? false
          : stopped()
            ? actor.getSnapshot().context.deferred === undefined
            : request(
                (requestId) => {
                  actor.send({ type: 'flush', requestId });
                },
                undefined,
                stopped,
              ),
      close: () => {
        if (!stopped() && !actor.getSnapshot().context.closeFenced) {
          actor.send({ type: 'close' });
        }
      },
      nextRequestId,
    },
  };
}
