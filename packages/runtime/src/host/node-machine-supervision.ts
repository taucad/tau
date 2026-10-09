/**
 * Reconnect supervision: each bound machine is kept connected until it is removed, refused for good or the host
 * closes. A live session is waited out, a lost one is retried on a backoff, and a good connect starts the backoff over.
 * A machine whose provider opens by resetting the controller is never reconnected by itself while its last report
 * showed a run, and one whose identity or certificate changed is never retried; each stays stale with the host's own
 * alert naming what a person does, until a good connect or a new binding clears it. A machine with a claimed identity
 * that stays unreachable is still retried, and after four failed attempts is listed with how to bind it at its new
 * port or address.
 *
 * Accepted: when the host starts, every binding is connected once without the resets-controller check, since the
 * store does not keep the last run. Starting Tau is the person's reconnect, as the `tau.reconnect-required` remedy
 * says; a controller that resets on opening loses a run streamed by a Tau that crashed (its planner buffer drains in
 * seconds, so there is little left to lose).
 *
 * @module
 */

import type { NodeMachineHostContext } from '#host/node-machine-context.js';
import type { MachineBindingRecord } from '#host/node-machine-store.js';
import type { MachineAlert } from '#machines/machine-observation.js';

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

/** Listed on a machine whose controller may still be running when reconnecting would reset it. */
const reconnectRequiredAlert: MachineAlert = {
  code: 'tau.reconnect-required',
  severity: 'serious',
  message: 'Tau did not reconnect: opening the connection resets the controller, and a run may still be going.',
  blocks: 'everything',
  remedies: [{ type: 'person', instruction: 'When the machine is idle, restart Tau or bind the machine again.' }],
};

/** Listed on a machine whose address now answers as another machine, or with another certificate. */
const rebindRequiredAlert: MachineAlert = {
  code: 'tau.rebind-required',
  severity: 'serious',
  message: 'Something else answers at this machine’s address, so Tau stopped connecting to it.',
  blocks: 'everything',
  remedies: [{ type: 'person', instruction: 'Find the machine where it is now and bind it again to confirm it.' }],
};

/** Listed on a machine with a claimed identity that has not answered at its bound port or address for a while. */
const unreachableAlert: MachineAlert = {
  code: 'tau.unreachable',
  severity: 'warning',
  message: 'Tau cannot reach this machine where it was bound. It keeps trying.',
  blocks: 'everything',
  remedies: [
    {
      type: 'person',
      instruction: 'If the machine moved to another port or address, find it there and bind it again.',
    },
  ],
};

/** Failed attempts after which a claimed machine is listed as unreachable. */
const unreachableAfter = 4;

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
   * refused for good or this host does not serve its provider. A machine whose provider is unavailable here gets no
   * attempt: it is listed with the host's reason and remedy.
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
  const {
    connectedSessions,
    definitionOf,
    directory,
    effectQueue,
    machines,
    providerSources,
    report,
    sessionLost,
    supervisors,
  } = context;
  // Show (or, with none, clear) the host's own alert on a machine; a directory that is closing is reported, not thrown.
  const listAlerts = async (machineId: string, alerts: readonly MachineAlert[]): Promise<void> => {
    try {
      await directory.update({ machineId, alerts });
    } catch (error) {
      report(error);
    }
  };
  // Whether reconnecting would reset a controller that may still be running: the provider opens by resetting, and
  // the machine's last report showed a run that had not ended.
  const reconnectResetsRun = async (record: MachineBindingRecord): Promise<boolean> => {
    if (providerSources.get(record.providerId)?.manifest.connection.opening !== 'resets-controller') {
      return false;
    }
    const listed = await directory.snapshot();
    const run = listed.entries.find((entry) => entry.machineId === record.id)?.snapshot.run;
    return run !== undefined && !['completed', 'cancelled', 'failed'].includes(run.state);
  };
  // Connect a bound machine, check that the same printer answers, and swap the session into the directory on the
  // machine's queue, so the session never changes under an in-flight transfer, start or action. `lost` settles once
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
          observations: providerSources.get(record.providerId)?.manifest.observations ?? [],
          qualifications: providerSources.get(record.providerId)?.manifest.qualifications ?? [],
          session,
          onLost() {
            sessionLost.emit(record.id);
            lost.resolve();
          },
        });
        connectedSessions.set(record.id, session);
      });
      // A good connect is what any earlier person remedy asked for.
      await listAlerts(record.id, []);
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
        if (isAborted()) {
          return;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- decided once per loss, before any attempt.
        if (await reconnectResetsRun(record)) {
          // Opening would reset a controller that may still be cutting: left stale for a person.
          report(new Error('MACHINE_RECONNECT_NEEDS_PERSON'));
          return listAlerts(record.id, [reconnectRequiredAlert]);
        }
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
          return listAlerts(record.id, [rebindRequiredAlert]);
        }
        // A claimed identity is pinned to its endpoint, so a machine that moved never answers there again; the
        // person is told once, and the loop keeps trying in case it comes back.
        if (
          attempts === unreachableAfter &&
          providerSources.get(record.providerId)?.manifest.connection.identity === 'claimed'
        ) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- listed once, between attempts.
          await listAlerts(record.id, [unreachableAlert]);
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
        // A machine this host cannot reach (its provider is unavailable here) is listed with why, never retried.
        if (machine.operations.status !== 'open' || context.unavailableProviders.has(machine.record.providerId)) {
          continue;
        }
        let live: Promise<void> | undefined;
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- recovered machines connect in id order.
          ({ lost: live } = await connectBinding(machine.record, new AbortController().signal));
        } catch (error) {
          report(error);
          if (needsRebind(error)) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- recovered machines connect in id order.
            await listAlerts(machine.record.id, [rebindRequiredAlert]);
            continue;
          }
          if (!providerSources.has(machine.record.providerId)) {
            continue;
          }
        }
        supervise(machine.record, live);
      }
    },
  };
};
