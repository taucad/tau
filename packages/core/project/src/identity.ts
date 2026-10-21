import { createActor } from 'xstate';
import type { ActorOptions, Actor } from 'xstate';
import { projectIdentityMachine } from '#identity.machine.js';
import type { ProjectIdentityActors, ProjectIdentityInput, ProjectIdentityResult } from '#identity.machine.js';
import { projectIdentityResolverMachine } from '#identity-resolver.machine.js';
import type { ResolveProjectIdentityInput } from '#identity-resolver.machine.js';
import { projectManifestConversionMachine } from '#identity-conversion.machine.js';
import type { ProjectManifestConversionActors, ProjectManifestConversionInput } from '#identity-conversion.machine.js';

/* oxlint-disable no-barrel-files/no-barrel-files -- This explicit public subpath composes the identity lifecycle while keeping the root schema entry XState-free. */
export { convertLegacyProjectManifestBytes } from '#project-manifest.js';
export {
  projectIdentityPath,
  projectIdentitySchema,
  parseProjectIdentityBytes,
  serializeProjectIdentity,
} from '#identity-record.js';
export type { ProjectIdentityRecord } from '#identity-record.js';
export { projectIdentityMachine } from '#identity.machine.js';
export type {
  ProjectIdentityActors,
  ProjectIdentityInput,
  ProjectIdentityLocation,
  ProjectIdentityResult,
  InitializeProjectIdentityInput,
} from '#identity.machine.js';
export { projectIdentityResolverMachine } from '#identity-resolver.machine.js';
export type { ResolveProjectIdentityInput } from '#identity-resolver.machine.js';
export { projectManifestConversionMachine } from '#identity-conversion.machine.js';
export type {
  ProjectManifestConversionActors,
  ProjectManifestConversionInput,
  ProjectManifestConversionResult,
  ProjectManifestReplacementResult,
} from '#identity-conversion.machine.js';

/* oxlint-enable no-barrel-files/no-barrel-files */

/** Lifecycle instrumentation shared by every identity factory. @public */
export type ProjectIdentityActorOptions = Pick<
  ActorOptions<typeof projectIdentityMachine>,
  'clock' | 'inspect' | 'onRejectedEvent'
>;
/**
 * Construct an unstarted operation actor with host persistence injected.
 * @param options - Input, host actors and optional lifecycle instrumentation.
 * @returns The unstarted resolution actor.
 * @public
 */
export const createProjectIdentityActor = (
  options: ProjectIdentityActorOptions & Readonly<{ input: ProjectIdentityInput; actors: ProjectIdentityActors }>,
): Actor<typeof projectIdentityMachine> =>
  createActor(projectIdentityMachine.provide({ actors: options.actors }), {
    input: options.input,
    clock: options.clock,
    inspect: options.inspect,
    onRejectedEvent: options.onRejectedEvent,
  });
/**
 * Construct an unstarted conversion actor; hosts retain buffers in effect closures.
 * @param options - Preserved identity, host actors and lifecycle instrumentation.
 * @returns The unstarted conversion actor.
 * @public
 */
export const createProjectManifestConversionActor = (
  options: ProjectIdentityActorOptions &
    Readonly<{ input: ProjectManifestConversionInput; actors: ProjectManifestConversionActors }>,
): Actor<typeof projectManifestConversionMachine> =>
  createActor(projectManifestConversionMachine.provide({ actors: options.actors }), {
    input: options.input,
    clock: options.clock,
    inspect: options.inspect,
    onRejectedEvent: options.onRejectedEvent,
  });
/** Shared coordinator and promise adapter; callers own start/stop of the actor. @public */
export type ProjectIdentityResolver = Readonly<{
  actor: Actor<typeof projectIdentityResolverMachine>;
  resolve: (input: ResolveProjectIdentityInput) => Promise<ProjectIdentityResult>;
  invalidate: (input: Readonly<{ locationKey: string }>) => void;
}>;
/**
 * Create a bounded, initially unstarted coordinator for one storage authority.
 * @param options - Host actors, cache capacity and lifecycle instrumentation.
 * @returns The coordinator and its request and invalidation adapters.
 * @public
 */
export const createProjectIdentityResolver = (
  options: ProjectIdentityActorOptions & Readonly<{ actors: ProjectIdentityActors; capacity?: number }>,
): ProjectIdentityResolver => {
  const actor = createActor(
    projectIdentityResolverMachine.provide({
      actors: { resolution: projectIdentityMachine.provide({ actors: options.actors }) },
    }),
    {
      input: { capacity: options.capacity },
      clock: options.clock,
      inspect: options.inspect,
      onRejectedEvent: options.onRejectedEvent,
    },
  );
  let requestSequence = 0;
  return {
    actor,
    invalidate: (input) => {
      actor.send({ type: 'invalidate', ...input });
    },
    resolve: async (input) => {
      if (actor.getSnapshot().status === 'stopped') {
        return { status: 'failed', message: 'Project identity resolver is stopped.' };
      }
      requestSequence += 1;
      const requestId = String(requestSequence);
      return new Promise<ProjectIdentityResult>((resolve) => {
        const response = actor.on('resolved', (event) => {
          if (event.requestId !== requestId) {
            return;
          }
          response.unsubscribe();
          lifecycle.unsubscribe();
          resolve(event.result);
        });
        const lifecycle = actor.subscribe({
          complete: () => {
            response.unsubscribe();
            resolve({ status: 'failed', message: 'Project identity resolver stopped before resolution completed.' });
          },
          error: (error: unknown) => {
            response.unsubscribe();
            resolve({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
          },
        });
        actor.send({ type: 'resolve', requestId, input });
      });
    },
  };
};
