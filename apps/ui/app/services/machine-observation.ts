import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import type { MachineClient } from '@taucad/runtime/machine';
import { createMachineObservationActor } from '#machines/machine-observation.machine.js';
import type { MachineObservationMachineContext } from '#machines/machine-observation.machine.js';

const empty: MachineObservationMachineContext = {
  machineId: undefined,
  snapshot: undefined,
  providers: [],
  jobs: [],
  error: undefined,
  attempt: 0,
  generation: 0,
};
type Owner = { actor: ReturnType<typeof createMachineObservationActor>; readers: number };
const owners = new WeakMap<MachineClient, Map<string | undefined, Owner>>();

/** A read-only external-store handle. Subscribe owns resources; rendering never opens a channel. */
export const machineObservation = (
  client: MachineClient,
  machineId?: string,
  hostId?: string,
): {
  getSnapshot: () => MachineObservationMachineContext;
  refresh: () => void;
  subscribe: (notify: () => void) => () => void;
} => {
  const key = machineId === undefined ? undefined : JSON.stringify([hostId, machineId]);
  const directory = (): Map<string | undefined, Owner> => {
    let current = owners.get(client);
    if (current === undefined) {
      current = new Map();
      owners.set(client, current);
    }
    return current;
  };
  return {
    getSnapshot: (): MachineObservationMachineContext =>
      owners.get(client)?.get(key)?.actor.getSnapshot().context ?? empty,
    refresh: (): void => {
      owners.get(client)?.get(key)?.actor.send({ type: 'refresh' });
    },
    subscribe: (notify: () => void): (() => void) => {
      const registry = directory();
      let owner = registry.get(key);
      if (owner === undefined) {
        const machineObservationDriver = createCallbackLogic<
          EventObject,
          { machineId: string | undefined; generation: number }
        >(({ input, sendBack }) => {
          const abort = new AbortController();
          const { signal } = abort;
          const publish = (event: { [key: string]: unknown; type: string }): void => {
            if (!signal.aborted) {
              sendBack({ ...event, generation: input.generation });
            }
          };
          const observe = async (): Promise<void> => {
            try {
              if (input.machineId === undefined) {
                const [snapshot, providers] = await Promise.all([
                  client.list({ signal }),
                  client.listProviders({ signal }),
                ]);
                if (signal.aborted) {
                  return;
                }
                publish({ type: 'directory', snapshot, providers });
                for await (const frame of client.watch({ cursor: snapshot.cursor, signal })) {
                  publish({ type: 'frame', frame });
                }
              } else {
                const jobs = await client.listJobs({ machineId: input.machineId, signal });
                if (signal.aborted) {
                  return;
                }
                publish({ type: 'jobs', jobs, replace: true });
                for await (const job of client.watchJobs({ machineId: input.machineId, signal })) {
                  publish({ type: 'jobs', jobs: [job], replace: false });
                }
              }
              publish({ type: 'ended', error: 'Machine updates stopped. Reconnecting…' });
            } catch (error) {
              publish({ type: 'ended', error: error instanceof Error ? error.message : String(error) });
            }
          };
          // async-iife: observation belongs to this invoked actor; its abort fences every later result.
          void observe();
          return () => {
            abort.abort();
          };
        });
        owner = {
          actor: createMachineObservationActor(machineId === undefined ? {} : { machineId }, {
            actors: { machineObservationDriver },
          }),
          readers: 0,
        };
        registry.set(key, owner);
      }
      const held = owner;
      held.readers += 1;
      const subscription = held.actor.subscribe(notify);
      held.actor.start();
      return () => {
        subscription.unsubscribe();
        held.readers -= 1;
        if (held.readers === 0) {
          registry.delete(key);
          held.actor.stop();
          if (registry.size === 0) {
            owners.delete(client);
          }
        }
      };
    },
  };
};
