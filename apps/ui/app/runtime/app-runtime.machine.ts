import { z } from 'zod';
import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EventObject, InputFrom } from 'xstate';

import { fileManagerMachine } from '#machines/file-manager.machine.js';
import { sessionsMachine } from '#machines/sessions.machine.js';
import type { SessionsMachineInput } from '#machines/sessions.machine.js';
import { reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import type { EnvironmentEvent } from '#runtime/environment.js';
import { fileManagerHostMachine } from '#runtime/file-manager-host.machine.js';
import { leasesMachine } from '#runtime/leases.machine.js';

/**
 * The app runtime root (app state orchestration charter D5, D23).
 *
 * One composition root for the app's long-lived actors, created by the entry and started once after hydration by
 * `AppRuntimeProvider` (named boundary 2, D15). Its static children are one list, {@link appRuntimeChildren}; the
 * lanes that own the others attach them here (A5b, A6b). The project runtime, the revision lifecycle and
 * the host connector are not children of this root: they are a session's lazy children, loaded by dynamic import,
 * and `import-boundary.node.test.ts` keeps them out of this module's graph.
 *
 * Context holds the environment's last reading, the refs of the children this root spawned and never replaces (so a
 * reader may take each once) and the first fault, which it reports once (D23). Host objects live in the children's
 * closures (D4). `rootFiles` keeps the worker in its own context: accepted debt of `file-manager.machine` (D4).
 */

/**
 * Every static child of the runtime, in the charter's order (D5). One list for the charter, its diagram and every
 * lane.
 *
 * @public
 */
export const appRuntimeChildren = [
  'environment',
  'choices',
  'fileManagerHost',
  'rootFiles',
  'leases',
  'projectLibrary',
  'chatSessions',
  'sessions',
  'focus',
] as const;

/** One static child's name. @public */
export type AppRuntimeChild = (typeof appRuntimeChildren)[number];

/**
 * The children this root attaches today. The rest are named slots: `choices` (A6b) and `focus` (A5b).
 *
 * @public
 */
export const appRuntimeAttachedChildren = [
  'environment',
  'fileManagerHost',
  'rootFiles',
  'leases',
  'projectLibrary',
  'chatSessions',
  'sessions',
] as const satisfies readonly AppRuntimeChild[];

/** The page as `environment` last reported it; `undefined` until the runtime starts. @public */
export type AppRuntimeEnvironment = Readonly<{
  visible: boolean | undefined;
  focused: boolean | undefined;
  constrained: boolean | undefined;
}>;

/** Input accepted when creating the runtime root. @public */
export type AppRuntimeInput = Readonly<{
  /** The registry's input, read once by the composition (budget for this host). */
  sessions: SessionsMachineInput;
  /** The input of `rootFiles`, the file manager for `/`, which the host's composition builds. */
  rootFiles: InputFrom<typeof fileManagerMachine>;
}>;

/** Serializable state owned by the runtime root, plus the registry's ref. @public */
export type AppRuntimeContext = Readonly<{
  environment: AppRuntimeEnvironment;
  /** The file manager for `/`, which the library and the chat store read in render: spawned with the root. */
  rootFiles: ActorRefFrom<typeof fileManagerMachine>;
  /** The file-manager host: Home's backend and the shared worker. Spawned with the root and never replaced. */
  fileManagerHost: ActorRefFrom<typeof fileManagerHostMachine>;
  /** The lease store's clock. Spawned with the root and never replaced. */
  leases: ActorRefFrom<typeof leasesMachine>;
  /** The sessions registry: spawned with the root and never replaced. */
  sessions: ActorRefFrom<typeof sessionsMachine>;
  /** The first effect or child failure no transition modelled; later ones are usually its consequences (D23). */
  fault: string | undefined;
}>;

/** Events accepted by the runtime root: what `environment` reports. @public */
export type AppRuntimeEvent = EnvironmentEvent;

/** Events the runtime root emits: each environment change, as it was reported. @public */
export type AppRuntimeEmitted = EnvironmentEvent;

/**
 * The runtime root's public alphabet, in the union's order. Its totality test samples each one.
 *
 * @public
 */
export const appRuntimeEventTypes = [
  'visibilityChanged',
  'focusChanged',
  'memoryClassChanged',
] as const satisfies ReadonlyArray<AppRuntimeEvent['type']>;

/**
 * The (state, event) pairs the runtime root ignores (MC-R17): none, since every event is answered at the root.
 *
 * @public
 */
export const appRuntimeIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

const environmentEventSchemas = {
  visibilityChanged: z.object({ visible: z.boolean() }),
  focusChanged: z.object({ focused: z.boolean() }),
  memoryClassChanged: z.object({ constrained: z.boolean() }),
} satisfies Record<AppRuntimeEvent['type'], z.ZodType>;

/** The driver default: no page, no listeners. The composition provides the browser's (MC-R8). */
const noEnvironment = createCallbackLogic<EventObject>(() => undefined);

/**
 * The driver default of `projectLibrary` and `chatSessions`: nothing to start. The composition provides the library's
 * callback, which starts and stops the `ProjectLibrary` with the root (D4, D9). The `ChatSessionStore` has no start or
 * stop of its own: the composition builds it with the root and its child marks its slot.
 */
const noService = createCallbackLogic<EventObject>(() => undefined);

const faultMessage = (error: unknown): string => (error instanceof Error ? error.message : 'app runtime fault');

/**
 * Record a fault only if none is recorded yet, and report it once through the one hook: the first is kept, later ones
 * are its consequences (D23).
 */
const keepFirstFault = (
  { context, event }: { context: AppRuntimeContext; event: { error: unknown } },
  enq: (effect: () => void) => void,
) => {
  if (context.fault !== undefined) {
    return {};
  }
  enq(() => {
    reportAppRuntimeFault(event.error);
  });
  return { context: { fault: faultMessage(event.error) } };
};

/**
 * The app runtime root.
 *
 * @public
 */
export const appRuntimeMachine = setup({
  schemas: {
    context: types<AppRuntimeContext>(),
    /* Runtime schemas (MC-R30): what `environment` reports, and the same payloads emitted. */
    events: environmentEventSchemas,
    input: types<AppRuntimeInput>(),
    emitted: environmentEventSchemas,
  },
  actors: {
    environment: noEnvironment,
    projectLibrary: noService,
    chatSessions: noService,
    rootFiles: fileManagerMachine,
    fileManagerHost: fileManagerHostMachine,
    leases: leasesMachine,
    sessions: sessionsMachine,
  },
}).createMachine({
  id: 'appRuntime',
  /* A fault no transition modelled is recorded once and the root keeps answering: the first is kept (D23). */
  onError: keepFirstFault,
  context: ({ input, spawn, actors }) => {
    /* `rootFiles` first: the host takes its ref. None of the three is ever replaced, so a reader may take each once. */
    const rootFiles = spawn(actors.rootFiles, { id: 'rootFiles', input: input.rootFiles });
    return {
      environment: { visible: undefined, focused: undefined, constrained: undefined },
      rootFiles,
      fileManagerHost: spawn(actors.fileManagerHost, { id: 'fileManagerHost', input: { rootFiles } }),
      leases: spawn(actors.leases, { id: 'leases' }),
      sessions: spawn(actors.sessions, { id: 'sessions', input: input.sessions }),
      fault: undefined,
    };
  },
  /* Each invoke's own `onError` (MC-R12) records through the same first-fault rule. */
  invoke: [
    { id: 'environment', src: 'environment', onError: keepFirstFault },
    /* A2: the library and the chat store, held in their callbacks' closures (D4, D9); the library starts with the root. */
    { id: 'projectLibrary', src: 'projectLibrary', onError: keepFirstFault },
    { id: 'chatSessions', src: 'chatSessions', onError: keepFirstFault },
  ],
  on: {
    visibilityChanged: ({ context, event }, enq) => {
      enq.emit({ type: 'visibilityChanged', visible: event.visible });
      return { context: { environment: { ...context.environment, visible: event.visible } } };
    },
    focusChanged: ({ context, event }, enq) => {
      enq.emit({ type: 'focusChanged', focused: event.focused });
      return { context: { environment: { ...context.environment, focused: event.focused } } };
    },
    memoryClassChanged: ({ context, event }, enq) => {
      enq.emit({ type: 'memoryClassChanged', constrained: event.constrained });
      return { context: { environment: { ...context.environment, constrained: event.constrained } } };
    },
  },
});
