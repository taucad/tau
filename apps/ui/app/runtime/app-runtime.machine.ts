import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EventObject } from 'xstate';

import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { sessionsMachine } from '#machines/sessions.machine.js';
import type { SessionsMachineInput } from '#machines/sessions.machine.js';
import type { EnvironmentEvent } from '#runtime/environment.js';

/**
 * The app runtime root (app state orchestration charter D5, D23).
 *
 * One composition root for the app's long-lived actors, created by the entry and started once after hydration by
 * `AppRuntimeProvider` (named boundary 2, D15). Its static children are one list, {@link appRuntimeChildren}; the
 * lanes that own the others attach them here (A1b, A2, A5b, A6b). The project runtime, the revision lifecycle and
 * the host connector are not children of this root: they are a session's lazy children, loaded by dynamic import,
 * and `import-boundary.node.test.ts` keeps them out of this module's graph.
 *
 * Context holds the environment's last reading, the registry's ref (which this root spawned and never replaces, so
 * a reader may take it once) and the first fault. Host objects live in the children's closures (D4).
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
 * The children this root attaches today. The rest are named slots: `choices` (A6b), `fileManagerHost`, `rootFiles`
 * and `leases` (A1b), `projectLibrary` and `chatSessions` (A2), and `focus` (A5b).
 *
 * @public
 */
export const appRuntimeAttachedChildren = ['environment', 'sessions'] as const satisfies readonly AppRuntimeChild[];

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
}>;

/** Serializable state owned by the runtime root, plus the registry's ref. @public */
export type AppRuntimeContext = Readonly<{
  environment: AppRuntimeEnvironment;
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

/** The driver default: no page, no listeners. The composition provides the browser's (MC-R8). */
const noEnvironment = createCallbackLogic<EventObject>(() => undefined);

const faultMessage = (error: unknown): string => (error instanceof Error ? error.message : 'app runtime fault');

/**
 * The app runtime root.
 *
 * @public
 */
export const appRuntimeMachine = setup({
  schemas: {
    context: types<AppRuntimeContext>(),
    events: eventSchemas<AppRuntimeEvent>(),
    input: types<AppRuntimeInput>(),
    emitted: eventSchemas<AppRuntimeEmitted>(),
  },
  actors: { environment: noEnvironment, sessions: sessionsMachine },
}).createMachine({
  id: 'appRuntime',
  /* A fault no transition modelled is recorded once and the root keeps answering: the first is kept (D23). */
  onError: ({ context, event }) =>
    context.fault === undefined ? { context: { fault: faultMessage(event.error) } } : {},
  context: ({ input, spawn, actors }) => ({
    environment: { visible: undefined, focused: undefined, constrained: undefined },
    sessions: spawn(actors.sessions, { id: 'sessions', input: input.sessions }),
    fault: undefined,
  }),
  invoke: { id: 'environment', src: 'environment' },
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
