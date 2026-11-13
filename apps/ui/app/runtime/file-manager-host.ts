/**
 * The file-manager host's composition (app state orchestration charter D4, D6; plan § 4 A1b; rows S17 to S19, S28,
 * S37).
 *
 * {@link createFileManagerHost} closes over what the host's machine must not hold: the shared worker, which the
 * `sharedWorker` child writes as `rootFiles` connects and replaces it (D4), and the workspace telemetry built from the
 * analytics port. It builds every file-manager actor with its root, its backend and the shared worker as input, in
 * place of a `setRoot` and a `resolveInitialBackend` after mount, and owns none of them (D6): `rootFiles` is the
 * runtime's child and the others are leases. An actor built for Home while the backend resolves waits as `pending`,
 * and its builder sends it the backend when the host emits `homeBackendResolved`.
 */
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor, ActorOptions, ActorRefFrom, AnyActorLogic, EventObject, InputFrom, SnapshotFrom } from 'xstate';
import type { FileSystemBackend } from '@taucad/types';
import { getHomeStorageBackend } from '#filesystem/handle-store.js';
import type { HomeStorageBackend } from '#filesystem/handle-store.js';
import type { Analytics } from '#hooks/use-analytics.js';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { fileManagerHostMachine } from '#runtime/file-manager-host.machine.js';
import type { HomeBackendOutcome } from '#runtime/file-manager-host.machine.js';
import { buildWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';

/** A file-manager actor the host built. @public */
export type FileManagerActor = Actor<typeof fileManagerMachine>;

/** The host's ref, as the runtime spawned it. @public */
export type FileManagerHostRef = ActorRefFrom<typeof fileManagerHostMachine>;

/** What a file-manager actor is built for. @public */
export type FileManagerSpec = Readonly<
  {
    rootDirectory: string;
    projectId?: string;
    shouldInitializeOnStart?: boolean;
  } & (
    | {
        /** Home's engine, which the host resolves once; the actor waits as `pending` until it does. */
        backend: 'home';
      }
    | { backend: FileSystemBackend }
  )
>;

/** What the host takes from the runtime's options. @public */
export type FileManagerHostPorts = Readonly<{
  /** The product analytics client the workspace telemetry captures through (D15). */
  analytics: Analytics;
  /** Read the Home engine selection; `getHomeStorageBackend` by default. */
  loadHomeBackend?: () => Promise<HomeStorageBackend>;
}>;

/** The tree options a built actor shares with the runtime. @public */
export type FileManagerBuildOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;

/** The host's composition. @public */
export type FileManagerHost = Readonly<{
  /** The machine with its backend read and worker watch provided: the runtime's `fileManagerHost` child. */
  logic: typeof fileManagerHostMachine;
  /** The input of `rootFiles`, which the runtime spawns from {@link fileManagerMachine}. */
  rootFilesInput: () => InputFrom<typeof fileManagerMachine>;
  /** The shared worker `rootFiles` holds, once it has one. */
  sharedWorker: () => Worker | undefined;
  /**
   * Build an unstarted file-manager actor for `spec`.
   *
   * @param host - The running host, read for the backend and listened to while it resolves.
   * @param spec - The root, the project and the backend.
   * @param options - The runtime's clock, inspector and rejected-event hook.
   * @returns The actor, and the release of its wait for the backend.
   */
  build: (
    host: FileManagerHostRef,
    spec: FileManagerSpec,
    options: FileManagerBuildOptions,
  ) => Readonly<{ actor: FileManagerActor; dispose: () => void }>;
}>;

/**
 * Compose a file-manager host.
 *
 * @param ports - The analytics client and the Home backend read.
 * @returns The host's logic, the `rootFiles` input, the shared worker and the builder.
 * @public
 */
export function createFileManagerHost({
  analytics,
  loadHomeBackend = getHomeStorageBackend,
}: FileManagerHostPorts): FileManagerHost {
  let sharedWorker: Worker | undefined;
  const telemetry = buildWorkspaceTelemetry(analytics);

  const loadBackend = createAsyncLogic<HomeBackendOutcome>({
    run: async () => {
      try {
        return { status: 'resolved', backend: await loadHomeBackend() };
      } catch (error) {
        /* Keep the page mounted and offer the retry; never select a fallback engine. */
        return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  const watchSharedWorker = createCallbackLogic<EventObject, { rootFiles: FileManagerRef }>(({ input, sendBack }) => {
    const observe = (snapshot: SnapshotFrom<typeof fileManagerMachine>): void => {
      const { worker } = snapshot.context;
      if (worker !== sharedWorker) {
        sharedWorker = worker;
        sendBack({ type: 'workerChanged', present: worker !== undefined });
      }
    };
    const subscription = input.rootFiles.subscribe(observe);
    observe(input.rootFiles.getSnapshot());
    return () => {
      subscription.unsubscribe();
      sharedWorker = undefined;
    };
  });

  const inputFor = (
    spec: FileManagerSpec,
    backend: FileSystemBackend | undefined,
    worker: Worker | undefined,
  ): InputFrom<typeof fileManagerMachine> => ({
    rootDirectory: spec.rootDirectory,
    shouldInitializeOnStart: spec.shouldInitializeOnStart ?? true,
    projectId: spec.projectId,
    sharedWorker: worker,
    onExternalPollTelemetry: telemetry.workspaceExternalPoll,
    onRootSkipped: telemetry.workspaceRootSkipped,
    ...(backend === undefined ? { backendResolution: 'pending' } : { initialBackend: backend }),
  });

  return {
    logic: fileManagerHostMachine.provide({
      actors: { loadHomeBackend: loadBackend, sharedWorker: watchSharedWorker },
    }),
    rootFilesInput: () => inputFor({ rootDirectory: '/', backend: 'home' }, undefined, undefined),
    sharedWorker: () => sharedWorker,
    build: (host, spec, options) => {
      const resolved = spec.backend === 'home' ? selectHomeBackend(host.getSnapshot()) : spec.backend;
      const actor = createActor(fileManagerMachine, { ...options, input: inputFor(spec, resolved, sharedWorker) });
      if (resolved !== undefined) {
        return { actor, dispose: () => undefined };
      }
      /* Built while Home resolves: the host's emit is this actor's `resolveInitialBackend` (row S17). */
      const subscription = host.on('homeBackendResolved', ({ backend }) => {
        subscription.unsubscribe();
        actor.send({ type: 'resolveInitialBackend', backend });
      });
      return {
        actor,
        dispose: () => {
          subscription.unsubscribe();
        },
      };
    },
  };
}

/** The host's snapshot. @public */
export type FileManagerHostSnapshot = SnapshotFrom<typeof fileManagerHostMachine>;

/**
 * Home's engine, once the host resolved it.
 *
 * @param snapshot - The host's snapshot.
 * @returns The engine, or `undefined` while it resolves or after it failed.
 * @public
 */
export const selectHomeBackend = (snapshot: FileManagerHostSnapshot): HomeStorageBackend | undefined =>
  snapshot.matches('resolved') ? snapshot.context.backend : undefined;

/**
 * Why Home's engine could not be read, when it could not.
 *
 * @param snapshot - The host's snapshot.
 * @returns The failure's message, or `undefined` unless the host is in `failed`.
 * @public
 */
export const selectHomeBackendFailure = (snapshot: FileManagerHostSnapshot): string | undefined =>
  snapshot.matches('failed') ? snapshot.context.error : undefined;

/**
 * Whether the shared file-manager worker is up.
 *
 * @param snapshot - The host's snapshot.
 * @returns Whether `rootFiles` holds a worker.
 * @public
 */
export const selectSharedWorkerPresent = (snapshot: FileManagerHostSnapshot): boolean => snapshot.context.workerPresent;

/**
 * The host's first fault, if any (D23).
 *
 * @param snapshot - The host's snapshot.
 * @returns The fault's message.
 * @public
 */
export const selectFileManagerHostFault = (snapshot: FileManagerHostSnapshot): string | undefined =>
  snapshot.context.fault;
