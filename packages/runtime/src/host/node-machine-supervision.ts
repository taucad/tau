/**
 * Reconnect supervision: each bound machine is kept connected until it is removed, refused for good or the host
 * closes. A live session is waited out, a lost one is retried on a backoff, and a good connect starts the backoff over.
 *
 * @module
 */

import type { NodeMachineHostContext } from '#host/node-machine-context.js';
import type { MachineBindingRecord } from '#host/node-machine-store.js';

/**
 * How long a binding without a live session waits before its next reconnect attempt: 2 s, 5 s, 10 s, 30 s, then
 * every 60 s.
 *
 * @param attempts - Attempts since the last good connect.
 * @returns Milliseconds.
 */
const reconnectDelay = (attempts: number): number => [2000, 5000, 10_000, 30_000][attempts] ?? 60_000;

/**
 * Whether a connect refusal needs a new binding rather than a retry: another printer answers at the bound address
 * (`*_IDENTITY_CHANGED`), or its certificate no longer matches the pinned one (`*_CERTIFICATE_CHANGED`,
 * `*_PIN_MISMATCH`).
 *
 * @param error - What the connect attempt threw.
 * @returns Whether retrying is pointless until the machine is bound again.
 */
const needsRebind = (error: unknown): boolean =>
  error instanceof Error && /_(?:IDENTITY_CHANGED|CERTIFICATE_CHANGED|PIN_MISMATCH)$/u.test(error.message);

/**
 * Settle after the delay, or as soon as `stopped` settles.
 *
 * @param retryDelay - Milliseconds.
 * @param stopped - Settles when the wait is no longer wanted.
 */
const pause = async (retryDelay: number, stopped: Promise<void>): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, retryDelay);
      }),
      stopped,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/** What reconnect supervision serves. @internal */
export type NodeMachineSupervision = Readonly<{
  /**
   * Supervise a bound machine in the background, replacing any loop an earlier binding of the same id ran.
   * `live` settles when the machine's current session stops being live; without one, the first attempt follows the
   * backoff.
   */
  supervise(record: MachineBindingRecord, live: Promise<void> | undefined): void;
  /**
   * Give every recovered machine with a readable log one attempt now, in id order, then supervision unless it was
   * refused for good or this host does not serve its provider.
   */
  resume(): Promise<void>;
}>;

/**
 * Supervise the host's bound machines over its shared state.
 * @internal
 * @param context - The host's shared state.
 * @returns Reconnect supervision.
 */
export const createNodeMachineSupervision = (context: NodeMachineHostContext): NodeMachineSupervision => {
  const { connectedSessions, definitionOf, directory, effectQueue, machines, providerSources, report, supervisors } =
    context;
  // Connect a bound machine, check that the same printer answers, and swap the session into the directory on the
  // machine's queue, so the session never changes under an in-flight upload, start or control. `lost` settles once
  // the new session stops being live.
  const connectBinding = async (
    record: MachineBindingRecord,
    signal: AbortSignal,
  ): Promise<Readonly<{ lost: Promise<void> }>> => {
    const { runtime } = context;
    if (!runtime) {
      throw new Error('MACHINE_OPERATION_UNAVAILABLE');
    }
    const definition = await definitionOf(record.providerId);
    const session = await definition.connect(
      { candidate: record.candidate, configuration: record.configuration, connection: record.connection, signal },
      runtime.connection(),
    );
    const lost = Promise.withResolvers<void>();
    try {
      const descriptor = await session.getDescriptor({ signal });
      if (descriptor.id !== record.physicalId) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
      }
      await effectQueue.queueFor(`machine:${record.id}`, async () => {
        signal.throwIfAborted();
        await directory.attach({
          machineId: record.id,
          name: record.name,
          providerId: record.providerId,
          session,
          onLost() {
            lost.resolve();
          },
        });
        connectedSessions.set(record.id, session);
      });
    } catch (error) {
      await session.close().catch(() => undefined);
      throw error;
    }
    return { lost: lost.promise };
  };
  // Keep one bound machine connected until it is removed, refused for good or the host closes. A live session is
  // waited out; attempts then follow the backoff, and a good connect starts it over. An attempt only replaces the
  // session, so an effect whose outcome was lost with the old one stays `unknown` until it is reconciled.
  const keepConnected = async (
    record: MachineBindingRecord,
    signal: AbortSignal,
    live: Promise<void> | undefined,
  ): Promise<void> => {
    const stopped = new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    // A call, not a property read, so the loop re-checks after each await.
    const isAborted = (): boolean => signal.aborted;
    let lost = live;
    let attempts = 0;
    while (!isAborted()) {
      if (lost) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a live session is waited out before any attempt.
        await Promise.race([lost, stopped]);
        // ponytail: a session lost right after connecting starts the backoff over, so a flapping printer is retried
        // every 2 s; hold the reset until a session has stayed up if that shows up on real hosts.
        attempts = 0;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- attempts are spaced by the backoff.
      await pause(reconnectDelay(attempts), stopped);
      attempts += 1;
      if (isAborted()) {
        return;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one attempt at a time.
        ({ lost } = await connectBinding(record, signal));
      } catch (error) {
        lost = undefined;
        if (isAborted()) {
          return;
        }
        report(error);
        if (needsRebind(error)) {
          return;
        }
      }
    }
  };
  const supervise = (record: MachineBindingRecord, live: Promise<void> | undefined): void => {
    if (context.isClosed()) {
      return;
    }
    supervisors.get(record.id)?.stop.abort();
    const stop = new AbortController();
    supervisors.set(record.id, { stop, done: keepConnected(record, stop.signal, live) });
  };
  return {
    supervise,
    async resume() {
      if (!context.runtime) {
        return;
      }
      for (const machine of machines.values()) {
        if (machine.operations.status !== 'open') {
          continue;
        }
        let live: Promise<void> | undefined;
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- recovered machines connect in id order.
          ({ lost: live } = await connectBinding(machine.record, new AbortController().signal));
        } catch (error) {
          report(error);
          if (needsRebind(error) || !providerSources.has(machine.record.providerId)) {
            continue;
          }
        }
        supervise(machine.record, live);
      }
    },
  };
};
