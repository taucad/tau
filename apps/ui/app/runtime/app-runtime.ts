/**
 * The app runtime's composition root (app state orchestration charter D5; MC-R4).
 *
 * {@link createAppRuntime} returns the root unstarted. The client entry creates one and holds it
 * (`app-runtime-holder.ts`); the server creates one per request and never starts it, so every reader renders the
 * initial snapshot on both sides and hydration matches. `AppRuntimeProvider` starts the client's after hydration.
 */
import { createActor } from 'xstate';
import type { Actor, ActorOptions, ActorRefFrom, AnyActorLogic, SnapshotFrom } from 'xstate';
import type { HomeStorageBackend } from '#filesystem/handle-store.js';
import type { Analytics } from '#hooks/use-analytics.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { appRuntimeMachine } from '#runtime/app-runtime.machine.js';
import type { AppRuntimeEnvironment } from '#runtime/app-runtime.machine.js';
import { createEnvironmentLogic } from '#runtime/environment.js';
import type { EnvironmentHost } from '#runtime/environment.js';
import { createFileManagerHost } from '#runtime/file-manager-host.js';
import type {
  FileManagerActor,
  FileManagerBuildOptions,
  FileManagerHostRef,
  FileManagerSpec,
} from '#runtime/file-manager-host.js';
import { awaitFileManager } from '#runtime/file-manager-host.wait.js';
import type { FileManagerReadiness, FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';
import { createLeaseTable } from '#runtime/leases.js';
import type { LeaseEntry, LeaseStore } from '#runtime/leases.js';
import { createSessionsRegistryLogic, sessionsRegistryInput } from '#services/sessions-store.js';

/** The app runtime root actor. @public */
export type AppRuntime = Actor<typeof appRuntimeMachine>;

/** What the runtime takes from its composition. Production passes none; development may pass `inspect`. @public */
export type AppRuntimeOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The page `environment` listens to, read when the runtime starts; the browser's by default. */
    environment?: () => EnvironmentHost | undefined;
    /**
     * The product analytics client the file manager's workspace telemetry captures through (D15). The client entry
     * passes the admitted one; the server and tests get the no-op client.
     */
    analytics?: Analytics;
    /** Read Home's storage engine selection; the handle store's by default. */
    loadHomeBackend?: () => Promise<HomeStorageBackend>;
    /**
     * Leave the file managers idle: Home is never read and `rootFiles` never connects. For a page that renders no file
     * manager, such as the remote-host harness, which runs its transport check without one.
     */
    idleFileManagers?: boolean;
  }>;

/** The Home read of an idle runtime: it never settles, so the host stays `resolving`. */
const neverReadHome = async (): Promise<HomeStorageBackend> => Promise.withResolvers<HomeStorageBackend>().promise;

/** The no-op analytics client of the server and of tests. @public */
export const noAnalytics: Analytics = { capture: () => undefined };

/**
 * What a mount reads from the runtime's file-manager host: its builder over the lease store, its wait on the runtime's
 * clock and the shared worker. Each is a closure of the composition, never machine context (D4).
 *
 * @public
 */
export type AppRuntimeFiles = Readonly<{
  /** The lease for one mount's file manager: in render, idempotent per key, unstarted until retained (D6). */
  leaseFileManager: (key: string, spec: FileManagerSpec) => LeaseEntry<FileManagerActor>;
  /** Wait for a file manager up to the ready bound, on the runtime's clock (I15). */
  awaitFileManager: (
    fileManager: FileManagerRef,
    readiness: FileManagerReadiness,
    reason: 'proxy-timeout' | 'services-timeout',
  ) => Promise<FileManagerSnapshot>;
  /** The shared worker `rootFiles` holds, once it has one. */
  sharedWorker: () => Worker | undefined;
}>;

/* Each runtime's file closures, by runtime; the composition writes one per runtime it creates. */
const runtimeFiles = new WeakMap<AppRuntime, AppRuntimeFiles>();

/**
 * Create the app runtime, unstarted (MC-R4).
 *
 * @param options - The clock, inspector and rejected-event hook for the whole tree, and the page to listen to.
 * @returns The root actor; its one start is `AppRuntimeProvider`'s.
 * @public
 */
export const createAppRuntime = ({
  environment,
  analytics = noAnalytics,
  loadHomeBackend,
  idleFileManagers = false,
  ...options
}: AppRuntimeOptions = {}): AppRuntime => {
  const readHome = idleFileManagers ? neverReadHome : loadHomeBackend;
  const host = createFileManagerHost({ analytics, ...(readHome === undefined ? {} : { loadHomeBackend: readHome }) });
  const table = createLeaseTable();
  const runtime = createActor(
    appRuntimeMachine.provide({
      actors: {
        environment: createEnvironmentLogic(environment),
        fileManagerHost: host.logic,
        leases: table.logic,
        /* S28: the registry admits and releases compute on the host's shared worker. */
        sessions: createSessionsRegistryLogic(host.sharedWorker),
      },
    }),
    {
      ...options,
      input: {
        sessions: sessionsRegistryInput(),
        rootFiles: host.rootFilesInput({ idle: idleFileManagers }),
      },
    },
  );
  const { fileManagerHost, leases } = runtime.getSnapshot().context;
  const store: LeaseStore = table.storeFor(leases);
  const buildOptions: FileManagerBuildOptions = options;
  runtimeFiles.set(runtime, {
    leaseFileManager: (key, spec) => store.get(key, () => host.build(fileManagerHost, spec, buildOptions)),
    awaitFileManager: async (fileManager, readiness, reason) =>
      awaitFileManager(fileManager, readiness, {
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        reason,
      }),
    sharedWorker: host.sharedWorker,
  });
  return runtime;
};

/**
 * The runtime's file closures: the lease builder, the ready wait and the shared worker.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its file closures.
 * @public
 */
export const selectRuntimeFiles = (runtime: AppRuntime): AppRuntimeFiles => {
  const files = runtimeFiles.get(runtime);
  if (files === undefined) {
    throw new Error('selectRuntimeFiles takes a runtime createAppRuntime made');
  }
  return files;
};

/** The file manager for `/`, which the root spawned with itself and never replaces. @public */
export const selectRootFiles = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): FileManagerRef =>
  snapshot.context.rootFiles;

/** The file-manager host, which the root spawned with itself and never replaces. @public */
export const selectFileManagerHost = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): FileManagerHostRef =>
  snapshot.context.fileManagerHost;

/**
 * The runtime's `rootFiles`, read once: the ref is fixed for the runtime's life.
 *
 * @param runtime - The app runtime.
 * @returns The file manager for `/`.
 * @public
 */
export const selectRuntimeRootFiles = (runtime: AppRuntime): FileManagerRef => selectRootFiles(runtime.getSnapshot());

/**
 * The runtime's file-manager host, read once: the ref is fixed for the runtime's life.
 *
 * @param runtime - The app runtime.
 * @returns The host.
 * @public
 */
export const selectRuntimeFileManagerHost = (runtime: AppRuntime): FileManagerHostRef =>
  selectFileManagerHost(runtime.getSnapshot());

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
