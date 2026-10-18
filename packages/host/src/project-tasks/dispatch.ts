import { createActor, createAsyncLogic } from 'xstate';
import type { ActorOptions, Actor } from 'xstate';
import { projectTaskDispatchMachine } from '#project-tasks/dispatch.machine.js';
import type { ProjectTaskDispatchIdentity } from '#project-tasks/dispatch.machine.js';

/** Attempt execution port supplied by the composition root. @internal */
export type ProjectTaskDispatchEffects = Readonly<{
  execute: (input: ProjectTaskDispatchIdentity, signal: AbortSignal) => Promise<void>;
  cancel: (attemptId: string) => void;
}>;
/** Concrete dispatch actor type. @internal */
export type ProjectTaskDispatchActor = Actor<typeof projectTaskDispatchMachine>;

/**
 * Construct an unstarted attempt owner with named existing-backend effects.
 *
 * @param options - Durable identity, execution effects and optional deterministic observation controls.
 * @returns An unstarted actor; the caller starts it once.
 * @internal
 */
export const createProjectTaskDispatch = (
  options: Readonly<{
    input: ProjectTaskDispatchIdentity;
    effects: ProjectTaskDispatchEffects;
    clock?: ActorOptions<typeof projectTaskDispatchMachine>['clock'];
    inspect?: ActorOptions<typeof projectTaskDispatchMachine>['inspect'];
    onRejectedEvent?: ActorOptions<typeof projectTaskDispatchMachine>['onRejectedEvent'];
  }>,
): ProjectTaskDispatchActor => {
  const logic = projectTaskDispatchMachine.provide({
    actors: {
      executeAttempt: createAsyncLogic<void, ProjectTaskDispatchIdentity>({
        run: async ({ input, signal }): Promise<void> => {
          await options.effects.execute(input, signal);
          signal.throwIfAborted();
        },
      }),
    },
    actions: {
      requestCancellation: (input) => {
        options.effects.cancel(input.attemptId);
      },
    },
  });
  return createActor(logic, {
    input: options.input,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.inspect ? { inspect: options.inspect } : {}),
    ...(options.onRejectedEvent ? { onRejectedEvent: options.onRejectedEvent } : {}),
  });
};
