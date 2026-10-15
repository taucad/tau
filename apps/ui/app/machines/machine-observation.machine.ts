import { createActor, createCallbackLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, EventObject } from 'xstate';
import type {
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineJob,
  MachineProvider,
} from '@taucad/runtime/machine';
import { projectMachineDirectoryFrame } from '#machines/machine-directory-projection.js';
import { eventSchemas } from '#lib/xstate.lib.js';

/** The projection to observe; the host client is injected outside serializable state. */
export type MachineObservationMachineInput = { readonly machineId?: string };
/** Facts projected from the host, never command or physical-run authority. */
export type MachineObservationMachineContext = {
  readonly machineId: string | undefined;
  readonly snapshot: MachineDirectorySnapshot | undefined;
  readonly providers: readonly MachineProvider[];
  readonly jobs: readonly MachineJob[];
  readonly error: string | undefined;
  readonly attempt: number;
  readonly generation: number;
};
/** Only the current invoked observer may supply facts. */
export type MachineObservationMachineEvent =
  | { readonly type: 'refresh' }
  | {
      readonly type: 'directory';
      readonly generation: number;
      readonly snapshot: MachineDirectorySnapshot;
      readonly providers: readonly MachineProvider[];
    }
  | { readonly type: 'frame'; readonly generation: number; readonly frame: MachineDirectoryFrame }
  | {
      readonly type: 'jobs';
      readonly generation: number;
      readonly jobs: readonly MachineJob[];
      readonly replace: boolean;
    }
  | { readonly type: 'ended'; readonly generation: number; readonly error: string };

/** Late observer results have no authority while disconnected. */
export const machineObservationIgnoredEvents: ReadonlyArray<readonly [string, string]> = [
  ['reconnecting', 'directory'],
  ['reconnecting', 'frame'],
  ['reconnecting', 'jobs'],
  ['reconnecting', 'ended'],
  ['failed', 'directory'],
  ['failed', 'frame'],
  ['failed', 'jobs'],
  ['failed', 'ended'],
];
/** Backoff requests a fresh observation; elapsed time never confirms a machine effect. */
export const machineObservationTimeouts = [
  {
    state: 'reconnecting',
    delay: 'retryDelay',
    maximum: 30_000,
    purpose: 'Retry observation, without replaying commands',
  },
] as const;
const machineObservationDriver = createCallbackLogic<
  EventObject,
  { machineId: string | undefined; generation: number }
>(() => {
  throw new Error('Machine observation requires a host observation driver.');
});
/** Named effect substitution used by the application and the headless harness. */
export const machineObservationActors = { machineObservationDriver };

const stale = (snapshot: MachineDirectorySnapshot | undefined): MachineDirectorySnapshot | undefined =>
  snapshot === undefined
    ? undefined
    : {
        ...snapshot,
        entries: snapshot.entries.map((entry) =>
          entry.freshness === 'stale' ? entry : { ...entry, freshness: 'stale' },
        ),
      };
/** Preserve newer journal facts and unaffected object identities. */
export const projectJobs = (current: readonly MachineJob[], incoming: readonly MachineJob[]): readonly MachineJob[] => {
  const records = new Map(current.map((job) => [job.jobId, job]));
  for (const job of incoming) {
    const previous = records.get(job.jobId);
    if (previous === undefined || Date.parse(previous.updatedAt) <= Date.parse(job.updatedAt)) {
      records.set(job.jobId, job);
    }
  }
  return [...records.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.jobId.localeCompare(b.jobId),
  );
};
/** Shared observation lifecycle, independent of every project and physical command. */
export const machineObservationMachine = setup({
  schemas: {
    input: types<MachineObservationMachineInput>(),
    context: types<MachineObservationMachineContext>(),
    events: eventSchemas<MachineObservationMachineEvent>(),
  },
  actors: machineObservationActors,
  delays: {
    retryDelay: ({ context }) =>
      Math.min(500 * 2 ** Math.min(context.attempt - 1, 6), machineObservationTimeouts[0].maximum),
  },
}).createMachine({
  id: 'machine-observation',
  version: '1',
  initial: 'watching',
  context: ({ input }) => ({
    machineId: input.machineId,
    snapshot: undefined,
    providers: [],
    jobs: [],
    error: undefined,
    attempt: 0,
    generation: 0,
  }),
  onError: ({ context, event }) => ({
    target: '.failed',
    context: { snapshot: stale(context.snapshot), error: String(event.error) },
  }),
  on: {
    refresh: ({ context }) => ({
      target: '.watching',
      reenter: true,
      context: { generation: context.generation + 1, snapshot: stale(context.snapshot), error: undefined, attempt: 0 },
    }),
  },
  states: {
    watching: {
      invoke: {
        src: 'machineObservationDriver',
        input: ({ context }) => ({ machineId: context.machineId, generation: context.generation }),
      },
      on: {
        directory: ({ context, event }) =>
          event.generation === context.generation
            ? { context: { snapshot: event.snapshot, providers: event.providers, error: undefined } }
            : {},
        frame: ({ context, event }) =>
          event.generation === context.generation && context.snapshot
            ? {
                context: {
                  snapshot: projectMachineDirectoryFrame(context.snapshot, event.frame),
                  error: undefined,
                  attempt: 0,
                },
              }
            : {},
        jobs: ({ context, event }) =>
          event.generation === context.generation
            ? {
                context: {
                  jobs: projectJobs(event.replace ? [] : context.jobs, event.jobs),
                  error: undefined,
                  ...(event.replace ? {} : { attempt: 0 }),
                },
              }
            : {},
        ended: ({ context, event }) =>
          event.generation === context.generation
            ? {
                target: 'reconnecting',
                context: {
                  snapshot: stale(context.snapshot),
                  error: event.error,
                  attempt: context.attempt + 1,
                  generation: context.generation + 1,
                },
              }
            : {},
      },
    },
    reconnecting: { after: { retryDelay: { target: 'watching' } } },
    failed: {},
  },
});
/** Create an unstarted actor; clocks, inspection and named effects are injectable. */
export const createMachineObservationActor = (
  input: MachineObservationMachineInput,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> & {
    readonly actors?: typeof machineObservationActors;
  } = {},
): Actor<typeof machineObservationMachine> => {
  const { actors, ...actorOptions } = options;
  return createActor(actors ? machineObservationMachine.provide({ actors }) : machineObservationMachine, {
    ...actorOptions,
    input,
  });
};
