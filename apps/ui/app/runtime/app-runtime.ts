/**
 * The app runtime's composition root (app state orchestration charter D5; MC-R4).
 *
 * {@link createAppRuntime} returns the root unstarted. The client entry creates one and holds it
 * (`app-runtime-holder.ts`); the server creates one per request and never starts it, so every reader renders the
 * initial snapshot on both sides and hydration matches. `AppRuntimeProvider` starts the client's after hydration.
 */
import { createActor } from 'xstate';
import type { Actor, ActorOptions, ActorRefFrom, AnyActorLogic, SnapshotFrom } from 'xstate';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { appRuntimeMachine } from '#runtime/app-runtime.machine.js';
import type { AppRuntimeEnvironment } from '#runtime/app-runtime.machine.js';
import { createEnvironmentLogic } from '#runtime/environment.js';
import type { EnvironmentHost } from '#runtime/environment.js';
import { sessionsRegistryInput, sessionsRegistryLogic } from '#services/sessions-store.js';

/** The app runtime root actor. @public */
export type AppRuntime = Actor<typeof appRuntimeMachine>;

/** What the runtime takes from its composition. Production passes none; development may pass `inspect`. @public */
export type AppRuntimeOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The page `environment` listens to, read when the runtime starts; the browser's by default. */
    environment?: () => EnvironmentHost | undefined;
  }>;

/**
 * Create the app runtime, unstarted (MC-R4).
 *
 * @param options - The clock, inspector and rejected-event hook for the whole tree, and the page to listen to.
 * @returns The root actor; its one start is `AppRuntimeProvider`'s.
 * @public
 */
export const createAppRuntime = ({ environment, ...options }: AppRuntimeOptions = {}): AppRuntime =>
  createActor(
    appRuntimeMachine.provide({
      actors: { environment: createEnvironmentLogic(environment), sessions: sessionsRegistryLogic },
    }),
    { ...options, input: { sessions: sessionsRegistryInput() } },
  );

/** The sessions registry, which the root spawned with itself and never replaces. @public */
export const selectSessionsRegistry = (
  snapshot: SnapshotFrom<typeof appRuntimeMachine>,
): ActorRefFrom<typeof sessionsMachine> => snapshot.context.sessions;

/**
 * The runtime's registry, read once: the ref is fixed for the runtime's life, so a reader needs no subscription.
 *
 * @param runtime - The app runtime.
 * @returns Its sessions registry.
 * @public
 */
export const selectRuntimeSessions = (runtime: AppRuntime): ActorRefFrom<typeof sessionsMachine> =>
  selectSessionsRegistry(runtime.getSnapshot());

/** The page as `environment` last reported it. @public */
export const selectAppEnvironment = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): AppRuntimeEnvironment =>
  snapshot.context.environment;

/** The runtime root's first fault, if any (D23). @public */
export const selectAppRuntimeFault = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): string | undefined =>
  snapshot.context.fault;
