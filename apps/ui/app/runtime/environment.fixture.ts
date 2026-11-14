/**
 * A stand-in for the DOM objects `environment` listens to, for runtime tests. It records which listeners are in, so a
 * test can show that a runtime created and not started has none, and that stopping it removes them all.
 *
 * Also `environment` composed outside the runtime root, over the browser's page: the one sequencer of the unload (D26)
 * for suites that mount registrations without an app runtime. With `registry`, that host also spawns a registry and
 * hands it to `environment`, so the desktop quit hold and the memory release reach it.
 */
import { createActor, setup, types } from 'xstate';
import type { ActorOptions, ActorRefFrom, AnyActorLogic } from 'xstate';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { browserEnvironmentHost, createEnvironmentLogic, createUnloadSequencer } from '#runtime/environment.js';
import type { EnvironmentDesktopQuit, EnvironmentHost, UnloadSequencer } from '#runtime/environment.js';
import { sessionsRegistryInput, sessionsRegistryLogic } from '#services/sessions-store.js';

/** The fake host and its controls. */
export type FakeEnvironmentHost = EnvironmentHost &
  Readonly<{
    /** The listeners in now, as `<target>:<type>`. */
    listeners: () => string[];
    /** Every listener ever added, as `<target>:<type>`. */
    everAdded: () => string[];
    setVisibility: (state: DocumentVisibilityState) => void;
    focus: () => void;
    blur: () => void;
    setCoarsePointer: (coarse: boolean) => void;
  }>;

type FakeEnvironmentOptions = Readonly<{
  visibilityState?: DocumentVisibilityState;
  focused?: boolean;
  coarse?: boolean;
}>;

/**
 * Build a fake host.
 *
 * @param options - The page's starting visibility, focus and pointer class.
 * @returns The host and its controls.
 */
export const createFakeEnvironmentHost = (options: FakeEnvironmentOptions = {}): FakeEnvironmentHost => {
  const active = new Map<string, number>();
  const added: string[] = [];
  const recorded = <T extends EventTarget>(name: string, target: T): T => {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, listenerOptions) => {
      const key = `${name}:${type}`;
      added.push(key);
      active.set(key, (active.get(key) ?? 0) + 1);
      add(type, listener, listenerOptions);
    };
    target.removeEventListener = (type, listener, listenerOptions) => {
      const key = `${name}:${type}`;
      const count = (active.get(key) ?? 0) - 1;
      if (count > 0) {
        active.set(key, count);
      } else {
        active.delete(key);
      }
      remove(type, listener, listenerOptions);
    };
    return target;
  };
  const state = {
    visibilityState: options.visibilityState ?? 'visible',
    focused: options.focused ?? true,
    coarse: options.coarse ?? false,
  };
  /* Getters, not `Object.assign`, which would copy each reading once. */
  const document = recorded(
    'document',
    Object.defineProperties(new EventTarget() as EventTarget & EnvironmentHost['document'], {
      visibilityState: { get: () => state.visibilityState },
      hasFocus: { value: () => state.focused },
    }),
  );
  const window = recorded('window', new EventTarget());
  const coarsePointer = recorded(
    'coarsePointer',
    Object.defineProperties(new EventTarget() as EventTarget & { readonly matches: boolean }, {
      matches: { get: () => state.coarse },
    }),
  );
  return {
    document,
    window,
    coarsePointer,
    isMemoryConstrained: () => state.coarse,
    listeners: () => [...active.keys()],
    everAdded: () => [...added],
    setVisibility: (next) => {
      state.visibilityState = next;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    focus: () => {
      state.focused = true;
      window.dispatchEvent(new Event('focus'));
    },
    blur: () => {
      state.focused = false;
      window.dispatchEvent(new Event('blur'));
    },
    setCoarsePointer: (coarse) => {
      state.coarse = coarse;
      coarsePointer.dispatchEvent(new Event('change'));
    },
  };
};

/** A started `environment`, its sequencer, the registry it found, and the host's stop. */
export type EnvironmentHostFixture = Readonly<{
  sequencer: UnloadSequencer;
  registry: ActorRefFrom<typeof sessionsMachine> | undefined;
  stop: () => void;
}>;

/**
 * Start `environment` over a sequencer.
 *
 * @param options - The sequencer (a fresh one by default), the desktop quit seam, whether to spawn a registry, the
 * page (the browser's by default) and the host's clock.
 * @returns The fixture.
 */
export const startEnvironmentHost = ({
  sequencer = createUnloadSequencer(),
  desktopQuit,
  registry = false,
  readHost = browserEnvironmentHost,
  clock,
}: Readonly<{
  sequencer?: UnloadSequencer;
  desktopQuit?: EnvironmentDesktopQuit;
  registry?: boolean;
  readHost?: () => EnvironmentHost | undefined;
}> &
  Pick<ActorOptions<AnyActorLogic>, 'clock'> = {}): EnvironmentHostFixture => {
  const hostMachine = setup({
    schemas: {
      context: types<{ registry: ActorRefFrom<typeof sessionsMachine> | undefined }>(),
    },
    actors: {
      environment: createEnvironmentLogic(readHost, {
        sequencer,
        ...(desktopQuit === undefined ? {} : { desktopQuit }),
      }),
      sessions: sessionsRegistryLogic,
    },
  }).createMachine({
    /* The registry first, as the root spawns it: `environment` takes it as input. */
    context: ({ spawn, actors }) => ({
      registry: registry ? spawn(actors.sessions, { id: 'sessions', input: sessionsRegistryInput() }) : undefined,
    }),
    invoke: { id: 'environment', src: 'environment', input: ({ context }) => ({ registry: context.registry }) },
  });
  const host = createActor(hostMachine, clock === undefined ? {} : { clock }).start();
  return {
    sequencer,
    registry: host.getSnapshot().context.registry,
    stop: () => {
      host.stop();
    },
  };
};
