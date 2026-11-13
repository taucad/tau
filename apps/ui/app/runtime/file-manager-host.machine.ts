import { z } from 'zod';
import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { EventObject } from 'xstate';
import type { HomeStorageBackend } from '#filesystem/handle-store.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

/**
 * The file-manager host (app state orchestration charter D4, D6, D23; plan § 4 A1b; inventory rows S17 to S19, S37).
 *
 * One per app runtime. It resolves the Home storage backend once, as a state with a failure and a retry, and it
 * knows whether the shared file-manager worker is up. The worker itself is a host object, so it lives in the
 * closure of the `sharedWorker` callback child (D4); context holds only whether it is present. The host builds
 * file-manager actors through its composition (`file-manager-host.ts`) and owns none of them (D6).
 *
 * `rootFiles`, the file manager for `/`, arrives in input as a ref: the runtime spawns it beside the host. While
 * the backend resolves, every actor built for Home waits with `backendResolution: 'pending'`. On resolution the host
 * sends `rootFiles` its `resolveInitialBackend` and emits `homeBackendResolved`, which each other pending actor's
 * builder listens for. On failure the gate's "Couldn't open Home" notice reads `failed` and sends `retry`; nothing
 * ever selects a fallback engine.
 */

/** What the backend read reports: the engine, or why it could not be read (MC-R29). @public */
export type HomeBackendOutcome =
  | Readonly<{ status: 'resolved'; backend: HomeStorageBackend }>
  | Readonly<{ status: 'failed'; message: string }>;

/** Events the host accepts. @public */
export type FileManagerHostEvent =
  | { readonly type: 'retry' }
  | { readonly type: 'workerChanged'; readonly present: boolean };

/** Events the host emits. @public */
export type FileManagerHostEmitted = { readonly type: 'homeBackendResolved'; readonly backend: HomeStorageBackend };

/** The host's public alphabet, in the union's order. @public */
export const fileManagerHostEventTypes = ['retry', 'workerChanged'] as const satisfies ReadonlyArray<
  FileManagerHostEvent['type']
>;

/**
 * The (state, event) pairs the host leaves unanswered (MC-R17): `retry` outside `failed`, where nothing failed.
 *
 * @public
 */
export const fileManagerHostIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['resolving', 'retry'],
  ['resolved', 'retry'],
];

/** Input the runtime gives the host. @public */
export type FileManagerHostInput = Readonly<{
  /** The file manager for `/`, which the runtime spawned; the host sends it the resolved backend. */
  rootFiles: FileManagerRef;
}>;

type HostBase = {
  rootFiles: FileManagerRef;
  /** Whether `rootFiles` has a worker; the worker itself is in the `sharedWorker` child's closure (D4). */
  workerPresent: boolean;
  /** The first effect or child failure no transition modelled (D23). */
  fault: string | undefined;
};

/** The host's context in `resolving`. @public */
export type FileManagerHostContext = Readonly<HostBase>;

type ResolvedContext = HostBase & { backend: HomeStorageBackend };
type FailedContext = HostBase & { error: string };

const backendSchema = z.enum(['indexeddb', 'opfs', 'node']);

const hostEventSchemas = {
  retry: z.object({}),
  workerChanged: z.object({ present: z.boolean() }),
} satisfies Record<FileManagerHostEvent['type'], z.ZodType>;

const hostEmittedSchemas = {
  homeBackendResolved: z.object({ backend: backendSchema }),
} satisfies Record<FileManagerHostEmitted['type'], z.ZodType>;

/** The driver defaults (MC-R8): a backend read that never settles and no worker. The composition provides both. */
const unresolvedBackend = createAsyncLogic<HomeBackendOutcome>({
  run: async () => Promise.withResolvers<HomeBackendOutcome>().promise,
});
const noSharedWorker = createCallbackLogic<EventObject, { rootFiles: FileManagerRef }>(() => undefined);

/** Record and report a fault only if none is recorded yet (D23). */
const keepFirstFault = (
  { context, event }: { context: HostBase; event: { error: unknown } },
  enq: (effect: () => void) => void,
) => {
  if (context.fault !== undefined) {
    return {};
  }
  enq(() => {
    reportAppRuntimeFault(event.error);
  });
  return { context: { fault: faultMessage(event.error, 'file manager host fault') } };
};

/**
 * The file-manager host machine.
 *
 * @public
 */
export const fileManagerHostMachine = setup({
  schemas: {
    context: types<FileManagerHostContext>(),
    events: hostEventSchemas,
    input: types<FileManagerHostInput>(),
    emitted: hostEmittedSchemas,
  },
  states: {
    resolved: { schemas: { context: types<ResolvedContext>() } },
    failed: { schemas: { context: types<FailedContext>() } },
  },
  actors: { loadHomeBackend: unresolvedBackend, sharedWorker: noSharedWorker },
}).createMachine({
  id: 'fileManagerHost',
  version: '1',
  /* A fault no transition modelled is recorded and reported once, and the host keeps answering (MC-R12, D23). */
  onError: keepFirstFault,
  context: ({ input }) => ({ rootFiles: input.rootFiles, workerPresent: false, fault: undefined }),
  /* The worker watch lives for the host's life: `rootFiles` replaces its worker on a restart. */
  invoke: {
    id: 'sharedWorker',
    src: 'sharedWorker',
    input: ({ context }) => ({ rootFiles: context.rootFiles }),
    onError: keepFirstFault,
  },
  on: {
    workerChanged: ({ event }) => ({ context: { workerPresent: event.present } }),
  },
  initial: 'resolving',
  states: {
    resolving: {
      invoke: {
        id: 'loadHomeBackend',
        src: 'loadHomeBackend',
        onDone: ({ context, event }, enq) => {
          const outcome = event.output;
          switch (outcome.status) {
            case 'resolved': {
              enq.sendTo(context.rootFiles, { type: 'resolveInitialBackend', backend: outcome.backend });
              enq.emit({ type: 'homeBackendResolved', backend: outcome.backend });
              return { target: 'resolved', context: { ...context, backend: outcome.backend } };
            }
            case 'failed': {
              return { target: 'failed', context: { ...context, error: outcome.message } };
            }
          }
        },
        /* A defect, not a refusal: the read reports its own failures as `failed`. The notice still offers a retry. */
        onError: ({ context, event }, enq) => ({
          target: 'failed',
          context: {
            ...context,
            ...keepFirstFault({ context, event }, enq).context,
            error: faultMessage(event.error, "Couldn't read the Home storage selection"),
          },
        }),
      },
    },
    resolved: {},
    failed: {
      on: {
        retry: ({ context }) => ({
          target: 'resolving',
          context: { rootFiles: context.rootFiles, workerPresent: context.workerPresent, fault: context.fault },
        }),
      },
    },
  },
});
