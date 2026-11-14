/**
 * Focus composed beside a registry a test built, outside the runtime root: the same ports and the same policy, spawned
 * by a host machine with the registry and focus as the ports' input. For suites that mount the route over their own registry.
 * And a slice of the root (registry, focus and `environment` in one system) for suites that need what `environment`
 * does with both.
 */
import { createActor, setup, types } from 'xstate';
import type { ActorOptions, ActorRefFrom, AnyActorLogic, AnyActorRef } from 'xstate';
import { createFocusMachine } from '#machines/focus.machine.js';
import type { FocusMachine } from '#machines/focus.machine.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { appFocusPolicy, createFocusComposition } from '#runtime/app-runtime-focus.js';
import { browserEnvironmentHost, createEnvironmentLogic, createUnloadSequencer } from '#runtime/environment.js';
import type { EnvironmentHost, UnloadSequencer } from '#runtime/environment.js';
import { createSessionsRegistryLogic, sessionsRegistryInput } from '#services/sessions-store.js';
import type { FocusCompositionOptions, FocusHandle } from '#runtime/app-runtime-focus.js';

/** A started focus host and its stop. */
export type FocusHostFixture = FocusHandle & Readonly<{ stop: () => void }>;

/**
 * Start focus and its five ports over a registry.
 *
 * @param options - The registry, the library and module sources, and the host's clock and inspection.
 * @returns The focus handle and the host's stop.
 */
export const startFocusHost = ({
  sessions,
  clock,
  inspect,
  ...sources
}: FocusCompositionOptions &
  Readonly<{ sessions: ActorRefFrom<typeof sessionsMachine> }> &
  Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect'>): FocusHostFixture => {
  const composition = createFocusComposition(sources);
  const hostMachine = setup({
    schemas: { context: types<{ focus: ActorRefFrom<FocusMachine> }>() },
    actors: {
      focus: createFocusMachine(appFocusPolicy),
      focusLibrary: composition.logics.library,
      focusRegistry: composition.logics.registry,
      focusFlush: composition.logics.flush,
      focusModule: composition.logics.module,
      focusRoute: composition.logics.route,
    },
  }).createMachine({
    /* As the root does: the ports read focus late, through a holder filled once focus is spawned. */
    context: ({ spawn, actors }) => {
      const holder: { current: AnyActorRef | undefined } = { current: undefined };
      const ports = { sessions, focus: () => holder.current };
      const focus = spawn(actors.focus, {
        id: 'focus',
        input: {
          epoch: composition.epoch(),
          ports: {
            library: spawn(actors.focusLibrary, { id: 'focusLibrary', input: ports }),
            registry: spawn(actors.focusRegistry, { id: 'focusRegistry', input: ports }),
            flush: spawn(actors.focusFlush, { id: 'focusFlush', input: ports }),
            module: spawn(actors.focusModule, { id: 'focusModule', input: ports }),
            route: spawn(actors.focusRoute, { id: 'focusRoute', input: ports }),
          },
        },
      });
      holder.current = focus;
      return { focus };
    },
  });
  const host = createActor(hostMachine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
  }).start();
  return {
    focus: host.getSnapshot().context.focus,
    bindings: composition.bindings,
    stop: () => {
      host.stop();
    },
  };
};

/** A registry, focus and `environment` in one system, as the runtime root composes them. */
export type RuntimeSliceFixture = FocusHostFixture &
  Readonly<{
    /** The registry the host spawned and handed to `environment` and the ports. */
    sessions: ActorRefFrom<typeof sessionsMachine>;
    /** The unload registrations `environment` sequences. */
    sequencer: UnloadSequencer;
  }>;

/**
 * Start the runtime's registry, focus with its five ports and `environment` in one actor system, for suites that need
 * what `environment` does with the registry and focus (the memory release, the quit hold) without the whole runtime.
 *
 * @param options - The registry's shared worker, the library and module sources, the page `environment` reads, and
 * the host's clock and inspection.
 * @returns The handle, the registry, the sequencer and the host's stop.
 */
export const startRuntimeSlice = ({
  sharedWorker = () => undefined,
  readHost = browserEnvironmentHost,
  sequencer = createUnloadSequencer(),
  clock,
  inspect,
  ...sources
}: FocusCompositionOptions &
  Readonly<{
    sharedWorker?: () => Worker | undefined;
    readHost?: () => EnvironmentHost | undefined;
    sequencer?: UnloadSequencer;
  }> &
  Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect'>): RuntimeSliceFixture => {
  const composition = createFocusComposition(sources);
  const hostMachine = setup({
    schemas: {
      context: types<{ sessions: ActorRefFrom<typeof sessionsMachine>; focus: ActorRefFrom<FocusMachine> }>(),
    },
    actors: {
      sessions: createSessionsRegistryLogic({ sharedWorker }),
      environment: createEnvironmentLogic(readHost, { sequencer }),
      focus: createFocusMachine(appFocusPolicy),
      focusLibrary: composition.logics.library,
      focusRegistry: composition.logics.registry,
      focusFlush: composition.logics.flush,
      focusModule: composition.logics.module,
      focusRoute: composition.logics.route,
    },
  }).createMachine({
    /* The registry, then the ports and focus, then `environment`: the root's order. */
    context: ({ spawn, actors }) => {
      const sessions = spawn(actors.sessions, { id: 'sessions', input: sessionsRegistryInput() });
      const holder: { current: AnyActorRef | undefined } = { current: undefined };
      const ports = { sessions, focus: () => holder.current };
      const focus = spawn(actors.focus, {
        id: 'focus',
        input: {
          epoch: composition.epoch(),
          ports: {
            library: spawn(actors.focusLibrary, { id: 'focusLibrary', input: ports }),
            registry: spawn(actors.focusRegistry, { id: 'focusRegistry', input: ports }),
            flush: spawn(actors.focusFlush, { id: 'focusFlush', input: ports }),
            module: spawn(actors.focusModule, { id: 'focusModule', input: ports }),
            route: spawn(actors.focusRoute, { id: 'focusRoute', input: ports }),
          },
        },
      });
      holder.current = focus;
      return { sessions, focus };
    },
    invoke: {
      id: 'environment',
      src: 'environment',
      input: ({ context }) => ({ registry: context.sessions, focus: context.focus }),
    },
  });
  const host = createActor(hostMachine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
  }).start();
  const { sessions, focus } = host.getSnapshot().context;
  return {
    sessions,
    focus,
    sequencer,
    bindings: composition.bindings,
    stop: () => {
      host.stop();
    },
  };
};
