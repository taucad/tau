import { recordChannelDiagnostic } from '#db/channel-diagnostics.js';
/**
 * The resident worker's project host (W6 RH-S8): one per project the tab has open, built from the ports the page
 * provides. Every stream of the project is served by one launcher (`createAgentLauncher`), whose chats are led among
 * the origin's tabs by M2 inside the browser chat store; nothing here elects, forwards or tails.
 */

import { ResourceQueue, bufferToStream } from '@taucad/filesystem';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { toRpcError } from '@taucad/chat/rpc';
import { geoSpecDefaultRunBudget } from '@taucad/chat/constants';
import {
  createChatToolRegistry,
  createProviderRpcFileSystem,
  createRuntimeWorkbenchClient,
} from '@taucad/agent-tools/registry';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeAgentClients, createRuntimeParameterAgentClient } from '@taucad/agent-tools/runtime';
import type { RuntimeAgentClient } from '@taucad/agent-tools/runtime';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { createParameterSetActor } from '@taucad/parameters/set-machine';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';
import { Actor, waitFor } from 'xstate';
import { fromFsLike } from '@taucad/runtime/filesystem';
import { connectComputeStoreChannel } from '@taucad/runtime/host';
import type { FsLike } from '@taucad/runtime/filesystem';
import type { FileStat } from '@taucad/types';
import { randomUuid } from '@taucad/utils/id';
import { assertRootedPath } from '@taucad/utils/path';
import type { StorageDurabilityClass, ToolRegistry } from '@taucad/agent-host';
import { connectTurnPlacementChannel } from '@taucad/agent-host/channel-client';
import type { TurnPlacementChannel, TurnPlacementToolContext } from '@taucad/agent-host/channel-client';
import { serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher, AgentLauncherOptions } from '@taucad/agent-host/launcher';
import { browserProjectTasks } from '@taucad/agent-host/browser';
import type { BrowserChatStoreOptions } from '@taucad/agent-host/browser';
import { createProjectTaskHost } from '@taucad/host/project-tasks';
import { createConfiguredGatewayModelTransport } from '#cloud/gateway-model-transport.js';
import { createDefaultKernelOptions } from '#constants/kernel-worker.constants.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { SkillResolver } from '#lib/skill-resolver.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import type { HeadlessImageJob, HeadlessImageService } from '#services/headless-image.service.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { agentHostWorkerBuild } from '#workers/agent-host.contract.js';
import type { AgentHostProjectProvide, AgentHostProjectRebridge } from '#workers/agent-host.contract.js';
import { closeProvidedPorts, createDisposers } from '#workers/agent-host-projects.js';
import { createResidentPlacement } from '#workers/agent-host-placement.js';
import { createPortRevisionsClient } from '#workers/agent-host-revisions.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import { createIdleRuntimeClient } from '#workers/idle-runtime-client.js';
import type { IdleRuntimeClient } from '#workers/idle-runtime-client.js';
import { systemSkillsOverlay } from '#workers/system-skills-overlay.js';

type ProjectFileSystemBridge = Pick<
  FileSystemBridgeProxy,
  | 'readMachineSettings'
  | 'readFile'
  | 'writeFile'
  | 'writeFileChecked'
  | 'deleteFileChecked'
  | 'appendFile'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'mkdir'
  | 'unlink'
  | 'rmdir'
  | 'rename'
  | 'exists'
  | 'watchReady'
  | 'hello'
  | 'dispose'
>;

/** What the worker as a whole gives each project host. */
export type ResidentWorkerContext = Readonly<{
  /** This tab's id among the origin's tabs (RH-R5). */
  tabId: string;
  requestRebridge?: (projectId: string, hostId: string) => void;
  visibility: NonNullable<BrowserChatStoreOptions['visibility']>;
  /** M1's timers; the worker leaves the defaults, and the browser tier shortens idle eviction (RH-A15). */
  delays?: AgentLauncherOptions['delays'];
}>;

/** One project host incarnation (RH-R4): its launcher serves every stream of the project. */
export type BrowserProjectHost = Readonly<{
  hostId: string;
  needsRebridge: () => boolean;
  /** Read this host's current leadership actor without taking a lock. */
  stoppability: (chatId: string) => ReturnType<AgentLauncher['stoppability']>;
  /** Serve one stream; closing it only detaches (D17). */
  connect: (port: MessagePort) => void;
  /** Swap in fresh bridges, as after a file-manager restart; the launcher and its runs stay (RV1-F1). */
  rebridge: (ports: AgentHostProjectRebridge) => Promise<void>;
  /** Serve no stream, and settle once every run this host admitted has ended, or `signal` ends (T3). */
  drain: (signal: AbortSignal) => Promise<void>;
  /** Release checkout-scoped executors after a task's placement lease retires. */
  releaseCandidate: (checkoutId: string) => Promise<void>;
  /** Allocate a child checkout from its immutable admitted source. */
  createCandidate: (
    name: string,
    sourceRevisionId: string,
    requestId: string,
  ) => Promise<Readonly<{ branch: string; checkoutId: string; checkoutRoot: string }>>;
  /** Stop the launcher and every child, then dispose the bridges this host was given. */
  close: () => Promise<void>;
}>;

/** How often the worker's agent channel sends `lk`, so the page's liveness bound can tell slow from dead (T9 E3). */
const keepaliveInterval = 1000;

/** OPFS sync access handles exist in workers and never on the main thread. */
const supportsOpfsSyncAccess = async (): Promise<boolean> => {
  const probeName = `.tau-agent-host-sync-probe-${randomUuid()}`;
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return false;
  }
  try {
    const fileHandle = (await root.getFileHandle(probeName, {
      create: true,
    })) as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<{ close: () => void }>;
    };
    try {
      if (typeof fileHandle.createSyncAccessHandle !== 'function') {
        return false;
      }
      const syncHandle = await fileHandle.createSyncAccessHandle();
      syncHandle.close();
      return true;
    } finally {
      await root.removeEntry(probeName);
    }
  } catch {
    return false;
  }
};

/**
 * The bridge reports the durability class of the context that *owns* the
 * provider, but this worker is the process that writes `events.jsonl`. Only
 * OPFS is context-dependent — a main-thread OPFS provider honestly probes
 * `stream-append` while this worker can hold an exclusive sync handle — so it
 * is the one class re-probed here. Every other backend is taken as reported:
 * a webaccess project must never be re-routed onto OPFS (charter PH22(b)).
 */
const resolveWorkerDurability = async (
  backend: string,
  reported: StorageDurabilityClass,
): Promise<StorageDurabilityClass> =>
  backend === 'opfs' && (await supportsOpfsSyncAccess()) ? 'exclusive-append' : reported;

/**
 * How long a bridge may take to answer its hello (D14): a provide or rebridge runs in its project's order, so one that
 * never answers would hold every later call for that project. Milliseconds.
 */
const bridgeReadyBound = 15_000;

/** How long a parameter actor may take to finish its last write when the host closes (D15). Milliseconds. */
const parameterCloseBound = 10_000;
/**
 * Milliseconds the agent's runtime may sit with no tool call or open document
 * before its worker is terminated; the next tool call starts a fresh one. A
 * turn's tool calls land well inside it, so only the gaps between turns pay a
 * restart.
 */
const agentRuntimeIdleTimeout = 120_000;

const createProjectFileSystemProxy = async (port: MessagePort): Promise<ProjectFileSystemBridge> => {
  const { createTransferredFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const proxy = createTransferredFileSystemBridgeProxy(port);
  let readyExpiry: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      proxy.ready,
      new Promise<never>((_resolve, reject) => {
        const unanswered = Object.assign(new Error('The project filesystem bridge did not answer.'), {
          code: 'PEER_UNRESPONSIVE',
        });
        readyExpiry = setTimeout(reject, bridgeReadyBound, unanswered);
      }),
    ]);
  } catch (error) {
    /* Its port goes with it: a caller that fails here never holds the proxy. */
    proxy.dispose();
    throw error;
  } finally {
    clearTimeout(readyExpiry);
  }
  return proxy;
};

/** Both bridges of a provide or rebridge; the project root must be writable and declare its durability. */
const openProjectBridges = async (ports: Pick<AgentHostProjectProvide, 'fileSystemPort' | 'projectRootPort'>) => {
  const [fileSystemOpened, projectRootOpened] = await Promise.allSettled([
    createProjectFileSystemProxy(ports.fileSystemPort),
    createProjectFileSystemProxy(ports.projectRootPort),
  ]);
  /* One bridge that failed to open closes the other, which would otherwise outlive the failed provide. */
  if (fileSystemOpened.status === 'rejected' || projectRootOpened.status === 'rejected') {
    for (const settled of [fileSystemOpened, projectRootOpened]) {
      if (settled.status === 'fulfilled') {
        settled.value.dispose();
      }
    }
    const reason: unknown = [fileSystemOpened, projectRootOpened].find(
      (settled): settled is PromiseRejectedResult => settled.status === 'rejected',
    )?.reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
  const fileSystem = fileSystemOpened.value;
  const projectRoot = projectRootOpened.value;
  const root = projectRoot.hello.payload;
  const durability = root.state === 'ready' && root.capabilities.writable ? root.capabilities.durability : undefined;
  if (!durability) {
    fileSystem.dispose();
    projectRoot.dispose();
    throw Object.assign(new Error('The project filesystem bridge is not writable or did not declare durability.'), {
      code: 'STORAGE_NOT_WRITABLE',
    });
  }
  return { fileSystem, projectRoot, durability };
};

/**
 * One object whose far end `swap` replaces in place (RV1-F1): holders keep `view`, and each call reaches the current
 * target, read at call time.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- a Proxy target is any object; these are bridge proxies.
const swappable = <Target extends object>(
  initial: Target,
): Readonly<{ view: Target; swap: (next: Target) => Target }> => {
  let current = initial;
  const view = new Proxy(initial, {
    get: (_target, key) => {
      const value: unknown = Reflect.get(current, key);
      return typeof value === 'function'
        ? (...args: unknown[]): unknown =>
            Reflect.apply(Reflect.get(current, key) as (...parameters: unknown[]) => unknown, current, args)
        : value;
    },
  });
  return {
    view,
    swap: (next) => {
      const previous = current;
      current = next;
      return previous;
    },
  };
};

/**
 * The workspace bridge as a `FileSystemProvider`: the one rooted provider this
 * worker hands to the GeoSpec bridge port and to the shared tool filesystem.
 *
 * @param proxy - The worker's end of the workspace filesystem bridge.
 * @returns The provider every tool call and the GeoSpec bridge read through.
 * @internal
 */
export const createRelayedFileSystemProvider = (proxy: ProjectFileSystemBridge): FileSystemProvider => {
  const { payload } = proxy.hello;
  if (payload.state !== 'ready') {
    throw Object.assign(new Error(`Workspace filesystem bridge is ${payload.state}.`), {
      code: 'FILESYSTEM_BRIDGE_UNAVAILABLE',
    });
  }

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? proxy.readFile(path, encoding) : proxy.readFile(path);
  }

  return {
    id: 'agent-host-workspace-relay',
    capabilities: payload.capabilities,
    readFile,
    writeFile: proxy.writeFile.bind(proxy),
    /* The agent's conditional write compares and writes in one step only where
     * the provider can; without this the browser leg fell back to a separate
     * read and write, and a person's edit between them was overwritten (W0.18).
     * A bridge served over a bare provider has no such method and its server
     * answers `Unknown method`, which ran nothing: that is
     * `CHECKED_WRITE_UNSUPPORTED`, the refusal the tool falls back on.
     * ponytail: matched on the rpc server's message, which carries no code; the
     * bridge hello advertising checked writes would remove the match. */
    writeFileChecked: async (input) => {
      try {
        return await proxy.writeFileChecked(input);
      } catch (error) {
        if (error instanceof Error && error.message === 'Unknown method: writeFileChecked') {
          throw Object.assign(new Error('This workspace bridge cannot compare and write in one step.'), {
            code: 'CHECKED_WRITE_UNSUPPORTED',
            applicationState: 'known-not-applied',
          });
        }
        throw error;
      }
    },
    appendFile: proxy.appendFile.bind(proxy),
    readdir: proxy.readdir.bind(proxy),
    stat: proxy.stat.bind(proxy),
    mkdir: proxy.mkdir.bind(proxy),
    unlink: proxy.unlink.bind(proxy),
    rmdir: async (path) => proxy.rmdir(path),
    rename: proxy.rename.bind(proxy),
    exists: proxy.exists.bind(proxy),
    lstat: proxy.lstat.bind(proxy),
    dispose: () => undefined,
  };
};

const requireStoragePathSegment = (value: string, label: string): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};

/**
 * The runtime's filesystem, adapted from the view the executor reads.
 *
 * The kernel runs project code the agent wrote, so its source is the agent's
 * composed view and not the bridge proxy (W14) — these members are all it needs,
 * and a view has no `hello` or `watchReady` to give it.
 */
type RuntimeFsSource = Pick<
  ComposedView,
  'readFile' | 'writeFile' | 'mkdir' | 'readdir' | 'unlink' | 'rmdir' | 'rename' | 'stat' | 'lstat'
>;

const createRuntimeFsLike = (proxy: RuntimeFsSource): FsLike => {
  const nativeStat = (stat: FileStat) => ({
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    isDirectory: () => stat.type === 'dir',
  });
  return {
    promises: {
      readFile: proxy.readFile.bind(proxy),
      writeFile: proxy.writeFile.bind(proxy),
      mkdir: proxy.mkdir.bind(proxy),
      readdir: proxy.readdir.bind(proxy),
      unlink: proxy.unlink.bind(proxy),
      rmdir: proxy.rmdir.bind(proxy),
      rename: proxy.rename.bind(proxy),
      stat: async (path) => nativeStat(await proxy.stat(path)),
      lstat: async (path) => nativeStat(await proxy.lstat(path)),
    },
  };
};

const createRuntimeRpcClients = (options: {
  readonly runtimeClient: RuntimeAgentClient;
  readonly imageService: HeadlessImageService;
}) => {
  const { runtimeClient: runtime } = options;
  return createRuntimeAgentClients({
    runtime,
    exportImage: async (job) => {
      if (job.sourceFormat === 'svg') {
        return options.imageService.export(job);
      }
      if (job.exportOptions.mode === 'single') {
        const { camera } = job.exportOptions;
        const exportOptions: Extract<HeadlessImageJob, { sourceFormat: 'glb'; format: 'webp' }>['exportOptions'] = {
          ...job.exportOptions,
          mode: 'single',
          camera: {
            framing: 'bounds',
            direction: [camera.direction[0], camera.direction[1], camera.direction[2]],
            up: [camera.up[0], camera.up[1], camera.up[2]],
            margin: camera.margin,
            projection: { kind: 'perspective', verticalFieldOfView: camera.projection.verticalFieldOfView },
          },
        };
        return options.imageService.export({ ...job, exportOptions });
      }
      const exportOptions: Extract<HeadlessImageJob, { sourceFormat: 'glb'; format: 'webp' }>['exportOptions'] = {
        ...job.exportOptions,
        mode: 'batch',
        views: job.exportOptions.views.map((view) => ({
          id: view.id,
          label: view.label,
          camera: {
            framing: 'bounds',
            direction: [view.camera.direction[0], view.camera.direction[1], view.camera.direction[2]],
            up: [view.camera.up[0], view.camera.up[1], view.camera.up[2]],
            margin: view.camera.margin,
            projection: { kind: 'orthographic' },
          },
        })),
      };
      return options.imageService.export({ ...job, exportOptions });
    },
    mapRuntimeError: (error) => toRpcError(error),
  });
};

/** The project's own OPFS directory, when its log takes the exclusive sync handle (RH-S7's OPFS leg). */
const opfsProjectDirectory = async (providerBasePath: string): Promise<FileSystemDirectoryHandle> => {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(requireStoragePathSegment(providerBasePath, 'providerBasePath'), {
      create: false,
    });
  } catch (error) {
    throw Object.assign(new Error('Project event storage is not writable.'), {
      code: 'STORAGE_NOT_WRITABLE',
      cause: error,
    });
  }
};

/* `ParameterSetActor` hides the runtime's `stop`; the actor `createActor` made has it. */
const stopParameterActor = (actor: ParameterSetActor): void => {
  if (actor instanceof Actor) {
    actor.stop();
  }
};

/**
 * Close every parameter actor, reporting one whose last write is still uncertain or did not settle within the bound
 * (D15). Either is stopped, not left running after its host; a stopped actor was closed and reported already, so a
 * retried close passes it (W6.r2 M1).
 *
 * @param actors - The host's parameter actors, by target file.
 * @returns What each close that failed threw.
 * @internal
 */
export const closeParameterActors = async (actors: ReadonlyMap<string, ParameterSetActor>): Promise<unknown[]> => {
  const results = await Promise.allSettled(
    [...actors.entries()].map(async ([targetFile, actor]) => {
      if (actor.getSnapshot().status === 'stopped') {
        return;
      }
      actor.send({ type: 'close' });
      const state = await waitFor(
        actor,
        (snapshot) => snapshot.status === 'done' || snapshot.matches({ open: 'uncertain' }),
        { timeout: parameterCloseBound },
      ).catch((error: unknown) => {
        stopParameterActor(actor);
        throw error;
      });
      if (state.status !== 'done') {
        stopParameterActor(actor);
        throw new Error(`Parameter write for ${targetFile} remains uncertain.`);
      }
    }),
  );
  return results.flatMap((result) => (result.status === 'rejected' ? [result.reason as unknown] : []));
};

/**
 * Open one project host from the ports and defaults the page provided (RH-S8, RH-S12). A failure part way closes
 * what it opened so far, newest first, and every port the provide transferred (W6.r1 round 3).
 *
 * @param provide - The project's bridges, storage, authority and defaults.
 * @param worker - The tab's identity and visibility.
 * @returns The host; its launcher is built before this resolves.
 */
export const openBrowserProjectHost = async (
  provide: AgentHostProjectProvide,
  worker: ResidentWorkerContext,
): Promise<BrowserProjectHost> => {
  const opened = createDisposers((closeError) => {
    console.error('[agent-host worker] a failed project host could not close a resource', closeError);
  });
  try {
    return await composeProjectHost(provide, worker, opened.push);
  } catch (error) {
    await opened.disposeAll();
    closeProvidedPorts(provide);
    throw error;
  }
};

const composeProjectHost = async (
  provide: AgentHostProjectProvide,
  worker: ResidentWorkerContext,
  opened: (dispose: () => unknown) => void,
): Promise<BrowserProjectHost> => {
  if (!provide.authority.projectId || !provide.authority.workspaceId) {
    throw Object.assign(new Error('Project and workspace authority are required.'), { code: 'AUTHORITY_INVALID' });
  }
  const runtimeConfig = uiRuntimeConfigSchema.parse(provide.runtimeConfig);
  if ((provide.computeMode === 'durable') !== Boolean(provide.computeStorePort)) {
    throw Object.assign(new Error('Durable compute mode and its private store port must be supplied together.'), {
      code: 'COMPUTE_AUTHORITY_INVALID',
    });
  }
  const computeConnection = provide.computeStorePort ? connectComputeStoreChannel(provide.computeStorePort) : undefined;
  opened(() => computeConnection?.dispose());
  const compute = computeConnection
    ? ({ mode: 'durable', store: computeConnection.store } as const)
    : provide.computeMode === 'off'
      ? ({ mode: 'off' } as const)
      : ({ mode: 'memory' } as const);
  const bridges = await openProjectBridges(provide);
  /* Every holder below keeps these views, so a rebridge reaches all of them (RV1-F1). */
  const fileSystemSlot = swappable(bridges.fileSystem);
  const projectRootSlot = swappable(bridges.projectRoot);
  const fileSystem = fileSystemSlot.view;
  const projectRoot = projectRootSlot.view;
  opened(() => {
    fileSystem.dispose();
    projectRoot.dispose();
  });
  const storageBackend = provide.projectStorage.backend;
  const durability = await resolveWorkerDurability(storageBackend, bridges.durability);
  const fileSystemMutations = new ResourceQueue();
  const skillResolver = createSkillResolver({
    readFile: async (path) => {
      const content = await fileSystem.readFile(assertRootedPath(path));
      return new Uint8Array(content);
    },
    listDirectory: async (path) => {
      const root = assertRootedPath(path);
      const names = await fileSystem.readdir(root);
      return Promise.all(
        names.map(async (name) => {
          const value = await fileSystem.stat(assertRootedPath(root ? `${root}/${name}` : name));
          return { name, isFolder: value.type === 'dir' };
        }),
      );
    },
  });
  /* One function composes every view on every host (charter D1): the bundles,
   * the registry mask and provenance are all inside it, so this worker only
   * adapts the RPC shape over it. The agent view is what the *executors* of
   * project code read too — the kernel runtime below and the GeoSpec runner's
   * port — because the code they run is code the agent wrote (CI1, W14). */
  const workspaceProvider = createRelayedFileSystemProvider(fileSystem);
  const workbenchRootProvider = createRelayedFileSystemProvider(projectRoot);
  const workbenchRootView = composeView(
    { filesystem: workbenchRootProvider },
    { consumer: 'user', policy: tauPathPolicy },
  );
  const agentView = composeView(
    { filesystem: workspaceProvider },
    { consumer: 'agent', policy: tauPathPolicy, overlays: [systemSkillsOverlay()] },
  );
  /* One runtime client per project host, shared by every turn and chat of the project (RH-A6). */
  // Agent tools select offered IDs at runtime; this host deliberately constructs the public dynamic client.
  const createAgentRuntime = (): AppRuntimeClient =>
    createRuntimeClient<AnyRuntimeDefinition>(
      createDefaultKernelOptions({
        fileSystem: fromFsLike(createRuntimeFsLike(agentView)),
        runtimeConfig,
        compute,
      }),
    );
  /* A machine connection is a stateful session, so a machines-enabled host keeps its runtime resident. Otherwise
   * the runtime, a second full copy of the editor's kernels, lives only while agent tools use it (B-07). */
  const residentRuntime = provide.machinesEnabled === true ? createAgentRuntime() : undefined;
  const runtimeClient: IdleRuntimeClient | AppRuntimeClient =
    residentRuntime ?? createIdleRuntimeClient({ create: createAgentRuntime, idleTimeout: agentRuntimeIdleTimeout });
  opened(() => {
    runtimeClient.terminate();
  });
  // Lazy: the headless-image graph eagerly resolves the resvg wasm URL at
  // module load, which only the full app build serves.
  const headlessImageModule = await import('#services/headless-image.service.js');
  const imageService = new headlessImageModule.HeadlessImageService();
  opened(() => {
    imageService.dispose();
  });
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const revisionsSlot =
    provide.revisionsPort === undefined ? undefined : swappable(createPortRevisionsClient(provide.revisionsPort));
  const revisions = revisionsSlot?.view;
  opened(() => revisions?.close());
  const taskRevisionsSlot =
    provide.taskRevisionsPort === undefined
      ? undefined
      : swappable(createPortRevisionsClient(provide.taskRevisionsPort));
  const taskRevisions = taskRevisionsSlot?.view;
  opened(() => taskRevisions?.close());
  const geoSpecClient = createGeoSpecWorkerRpcClient({
    openFileSystemBridge: () => createFileSystemBridgePort(agentView),
    runtimeConfig,
    // No outer RPC budget bounds a browser-placed test_model call; this host budget is the bound.
    runnerTimeout: geoSpecDefaultRunBudget,
    ...(revisions === undefined
      ? {}
      : {
          candidateSync: {
            fetch: async () => revisions.fetchGeoSpecCandidates(),
            publish: async (candidate: Uint8Array<ArrayBuffer>) => revisions.publishGeoSpecCandidate(candidate),
          },
        }),
  });
  opened(async () => geoSpecClient.close());
  const runtimeRpc = createRuntimeRpcClients({ runtimeClient, imageService });
  /* RH-S12: the one parameter-actor factory, over this project's root bridge. */
  const parameterActors = new Map<string, ParameterSetActor>();
  const parameterActorFor =
    ({
      actors,
      files,
      runtime,
      authority,
    }: {
      actors: Map<string, ParameterSetActor>;
      files: ProjectFileSystemBridge;
      runtime: Pick<AppRuntimeClient, 'describe'>;
      authority: string;
    }) =>
    async (targetFile: string): Promise<ParameterSetActor> => {
      const existing = actors.get(targetFile);
      if (existing) {
        return existing;
      }
      const actor = createParameterSetActor({
        target: { authority, root: provide.authority.projectId, entry: targetFile },
        files,
        resolve: async ({ entry }, signal, resolution) => {
          const result = await runtime.describe({
            source: { path: entry },
            ...(resolution === undefined ? {} : { resolution }),
            signal,
          });
          if (!result.success) {
            throw Object.assign(
              new Error(result.issues.map(({ message }) => message).join('; ') || 'Parameter resolution failed.'),
              { code: result.issues[0]?.code ?? 'PARAMETER_RESOLUTION_FAILED' },
            );
          }
          return result.parameters;
        },
      });
      actors.set(targetFile, actor);
      return actor;
    };
  const parameters = createRuntimeParameterAgentClient({
    mapRuntimeError: (error) => toRpcError(error),
    parameterActorFor: parameterActorFor({
      actors: parameterActors,
      files: projectRoot,
      runtime: runtimeClient,
      authority: `browser:${provide.authority.workspaceId}:${provide.authority.projectId}`,
    }),
  });
  const baseServices = { runtimeClient, runtimeRpc, parameters, geoSpecClient };
  /* The registry over one filesystem: the project's own, or an attempt's checkout its placement granted (W8 G09). */
  const toolRegistryOver = (
    provider: FileSystemProvider,
    preferences: Pick<ProjectFileSystemBridge, 'readMachineSettings'>,
    services: typeof baseServices = baseServices,
  ): ToolRegistry => {
    const view = composeView(
      { filesystem: provider },
      { consumer: 'agent', policy: tauPathPolicy, overlays: [systemSkillsOverlay()] },
    );
    const record = composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy });
    return createChatToolRegistry({
      fileSystemFor: (signal) =>
        createProviderRpcFileSystem({ provider: view, mutations: fileSystemMutations, signal }),
      recordFileSystemFor: (signal) =>
        createProviderRpcFileSystem({ provider: record, mutations: fileSystemMutations, signal }),
      workbenchFileSystemFor: (signal) =>
        createProviderRpcFileSystem({ provider: workbenchRootView, mutations: fileSystemMutations, signal }),
      workbench: createRuntimeWorkbenchClient(async () => services.runtimeClient),
      skillResolver,
      ...services.runtimeRpc,
      parameters: services.parameters,
      geospec: services.geoSpecClient,
      ...(residentRuntime === undefined ? {} : { machines: residentRuntime.machines }),
      machineSettings: preferences,
      print: {
        /* The `tau.json` id every print request from this project's agent names (blueprint D5). An attempt reads
         * its artifact from the checkout its placement granted. */
        projectId: provide.authority.projectId,
        readArtifact: async ({ path, signal }) => {
          signal.throwIfAborted();
          const bytes = await record.readFile(assertRootedPath(path));
          signal.throwIfAborted();
          return bytes;
        },
      },
      revisions,
      testingEnabled: provide.testingEnabled ?? false,
      // X43: under the locked profile the page's own install_packages makes no registry request.
      acquisition: runtimeConfig.acquisition,
    });
  };
  const toolRegistry = toolRegistryOver(workspaceProvider, fileSystem);
  type PlacedServices = Readonly<{
    checkoutId: string;
    root: string;
    services: typeof baseServices;
    close: () => Promise<void>;
  }>;
  const placedServices = new Map<string, Promise<PlacedServices>>();
  const attemptKey = ({ key }: TurnPlacementToolContext): string => `${key.runId}/${String(key.attempt)}`;
  const placedServicesFor = async (
    context: TurnPlacementToolContext,
    proxy: ProjectFileSystemBridge,
    provider: FileSystemProvider,
  ): Promise<PlacedServices> => {
    const id = attemptKey(context);
    const existing = placedServices.get(id);
    if (existing !== undefined) {
      return existing.then((resource) => {
        if (resource.checkoutId !== context.checkoutId || resource.root !== context.root) {
          throw Object.assign(new Error('A placed task attempt changed checkout authority.'), {
            code: 'PLACEMENT_MISMATCH',
          });
        }
        return resource;
      });
    }
    const created = (async (): Promise<PlacedServices> => {
      const view = composeView(
        { filesystem: provider },
        { consumer: 'agent', policy: tauPathPolicy, overlays: [systemSkillsOverlay()] },
      );
      const candidateRuntime: AppRuntimeClient = createRuntimeClient<AnyRuntimeDefinition>(
        createDefaultKernelOptions({
          fileSystem: fromFsLike(createRuntimeFsLike(view)),
          runtimeConfig,
          compute,
        }),
      );
      const candidateGeoSpec = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: () => createFileSystemBridgePort(view),
        runtimeConfig,
        runnerTimeout: geoSpecDefaultRunBudget,
      });
      const actors = new Map<string, ParameterSetActor>();
      const candidateParameters = createRuntimeParameterAgentClient({
        mapRuntimeError: (error) => toRpcError(error),
        parameterActorFor: parameterActorFor({
          actors,
          files: proxy,
          runtime: candidateRuntime,
          authority: `browser:${provide.authority.workspaceId}:${provide.authority.projectId}:${context.checkoutId}`,
        }),
      });
      return {
        checkoutId: context.checkoutId,
        root: context.root,
        services: {
          runtimeClient: candidateRuntime,
          runtimeRpc: createRuntimeRpcClients({ runtimeClient: candidateRuntime, imageService }),
          parameters: candidateParameters,
          geoSpecClient: candidateGeoSpec,
        },
        close: async () => {
          const failures = await closeParameterActors(actors);
          await candidateGeoSpec.close().catch((error: unknown) => failures.push(error));
          candidateRuntime.terminate();
          if (failures.length > 0) {
            throw new AggregateError(failures, `Candidate ${context.checkoutId} did not close cleanly.`);
          }
        },
      };
    })();
    placedServices.set(id, created);
    return created;
  };
  const releaseCandidate = async (checkoutId: string): Promise<void> => {
    const entries = [...placedServices];
    const failures: unknown[] = [];
    for (const [id, pending] of entries) {
      // oxlint-disable-next-line no-await-in-loop -- release each checkout's own resources in admission order.
      const resource = await pending;
      if (resource.checkoutId !== checkoutId) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- each close waits for its accepted writes to finish.
        await resource.close();
        placedServices.delete(id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `Candidate ${checkoutId} did not close cleanly.`);
    }
  };
  const placedTools = (tools: TurnPlacementToolContext): ToolRegistry => {
    /* A tool port that never answers (D14) fails each invoke; an attempt that invokes nothing leaves no unhandled
     * rejection. */
    const opened = (async (): Promise<Readonly<{ registry: ToolRegistry } | { failure: unknown }>> => {
      try {
        const proxy = await createProjectFileSystemProxy(tools.port);
        const provider = createRelayedFileSystemProvider(proxy);
        const placed = tools.mode === 'direct' ? undefined : await placedServicesFor(tools, proxy, provider);
        const services = placed?.services ?? baseServices;
        return { registry: toolRegistryOver(provider, proxy, services) };
      } catch (error) {
        return { failure: error };
      }
    })();
    return {
      list: () => toolRegistry.list(),
      invoke: async (invocation) => {
        const placed = await opened;
        if ('failure' in placed) {
          throw placed.failure;
        }
        return placed.registry.invoke(invocation);
      },
    };
  };
  /* W8 TS-S5: the placement session the page brokered into the file-manager worker for this project. */
  const placementConnection = (port: MessagePort): TurnPlacementChannel =>
    connectTurnPlacementChannel({
      port,
      projectId: provide.authority.projectId,
      toolsFor: placedTools,
    });
  const diagnose = (event: Parameters<typeof recordChannelDiagnostic>[0]['event']): void => {
    recordChannelDiagnostic({
      event,
      tabId: worker.tabId,
      hostId: provide.hostId,
      projectId: provide.projectId,
      visible: worker.visibility.visible(),
    });
  };
  diagnose('host.opened');
  const placement = createResidentPlacement(
    placementConnection(provide.placementPort),
    () => {
      worker.requestRebridge?.(provide.projectId, provide.hostId);
    },
    (event) => {
      recordChannelDiagnostic({
        ...event,
        tabId: worker.tabId,
        hostId: provide.hostId,
        projectId: provide.projectId,
        visible: worker.visibility.visible(),
      });
    },
  );
  const turnPlacement = placement.port;
  opened(() => {
    placement.close();
  });
  let cachedSkillFingerprint = '';
  let cachedSkills: Awaited<ReturnType<SkillResolver['getPromptSkillListing']>> = [];
  const opfs =
    storageBackend === 'opfs' && durability === 'exclusive-append'
      ? await opfsProjectDirectory(provide.projectStorage.providerBasePath)
      : undefined;
  const gatewayOptions = {
    baseUrl: provide.gatewayBaseUrl,
    /* The project every receipt from this worker attributes to: the id `GET /v1/projects` lists. */
    projectId: provide.authority.projectId,
    model: provide.model,
    /* The funded (cloud) build checks an attempt's account against it (W11 GI-Q6); self-host ignores it. */
    principal: () => provide.principal,
  };
  function readProjectFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readProjectFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readProjectFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? projectRoot.readFile(path, encoding) : projectRoot.readFile(path);
  }
  const projectTasks = await createProjectTaskHost({
    projectId: provide.authority.projectId,
    platform: browserProjectTasks({
      /* Per incarnation: a released host drains beside its successor in this worker, and M2 never hears its own
       * sender, so each needs its own to hear the other's heartbeats (T3). */
      tabId: `${worker.tabId}/${provide.hostId}`,
      build: agentHostWorkerBuild,
      log:
        opfs === undefined
          ? {
              kind: 'provider',
              fileSystem: {
                exists: async (path) => projectRoot.exists(path),
                readFile: async (path) => projectRoot.readFile(path),
                writeFile: async (path, bytes) => projectRoot.writeFile(path, bytes),
                appendFile: async (path, bytes) => projectRoot.appendFile(path, bytes),
                unlink: async (path) => projectRoot.unlink(path),
                // The durable rooted bridge owns canonical metadata; log allocation only needs size.
                stat: async (path, options) => projectRoot.stat(path, options),
              },
              durability,
            }
          : { kind: 'opfs', directory: opfs },
      ...(bridges.projectRoot.hello.payload.watchable
        ? {
            observeLog: async ({
              path,
              signal,
              onChange,
              onError,
            }: {
              path: string;
              signal: AbortSignal;
              onChange: () => void;
              onError: (error: unknown) => void;
            }) => {
              let released = false;
              const subscription = projectRoot.watchReady({ paths: [path] }, onChange);
              const release = (): void => {
                if (!released) {
                  released = true;
                  signal.removeEventListener('abort', release);
                  subscription.unsubscribe();
                }
              };
              signal.addEventListener('abort', release, { once: true });
              // async-iife: bootstrap
              // The observation owns its closure monitor until release; stale callbacks are fenced.
              void (async () => {
                try {
                  await subscription.closed;
                  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Release may run while the observation closure is awaited.
                  if (!released && !signal.aborted) {
                    onError(new Error(`Chat log observation closed for ${path}.`));
                  }
                } catch (error) {
                  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Release may run while the observation closure is awaited.
                  if (!released && !signal.aborted) {
                    onError(error);
                  }
                }
              })();
              try {
                await subscription.ready;
                signal.throwIfAborted();
                return release;
              } catch (error) {
                release();
                throw error;
              }
            },
          }
        : {}),
      visibility: worker.visibility,
    }),
    filesystem: {
      exists: async (path) => projectRoot.exists(path),
      readFile: readProjectFile,
      readFileStream: (path, options) =>
        new ReadableStream<Uint8Array<ArrayBuffer>>({
          async start(controller) {
            try {
              options?.signal?.throwIfAborted();
              const reader = bufferToStream(await projectRoot.readFile(path), options).getReader();
              for (;;) {
                // oxlint-disable-next-line no-await-in-loop -- chunks are emitted in file order.
                const item = await reader.read();
                if (item.done) {
                  break;
                }
                controller.enqueue(item.value);
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        }),
      writeFileChecked: async (input) => projectRoot.writeFileChecked(input),
    },
    createCandidate: async ({ requestId, name, from, signal }) => {
      signal.throwIfAborted();
      if (taskRevisions === undefined) {
        throw Object.assign(new Error('Task candidate revisions are unavailable.'), { code: 'TASK_UNAVAILABLE' });
      }
      const candidate = await taskRevisions.createCandidate(name, from, requestId);
      return { checkoutId: candidate.checkoutId, checkoutRoot: candidate.checkoutRoot };
    },
    onCandidateReleased: async (_runId, checkoutId) => releaseCandidate(checkoutId),
    launcher: {
      modelTransport: createConfiguredGatewayModelTransport(gatewayOptions),
      /* The page's session cookie funds a browser turn; there is no pairing to lose. The page names its account. */
      credential: () => ({ mode: 'session', principal: provide.principal }),
      systemPrompt: provide.systemPrompt,
      systemPromptBlocks: provide.systemPromptBlocks,
      model: provide.model,
      toolRegistry,
      ...(worker.delays === undefined ? {} : { delays: worker.delays }),
      turnPlacement,
      clientContext: async () => {
        const discovered = await skillResolver.getPromptSkillListing();
        const fingerprint = JSON.stringify(
          discovered.map((skill) => [skill.name, skill.description, skill.fingerprint ?? '']),
        );
        if (fingerprint !== cachedSkillFingerprint) {
          cachedSkillFingerprint = fingerprint;
          cachedSkills = discovered;
        }
        return {
          skills: cachedSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            ...(skill.fingerprint ? { fingerprint: skill.fingerprint } : {}),
          })),
        };
      },
    },
  });
  opened(async () => projectTasks.close());
  const channels = new Set<ReturnType<typeof serveAgentChannel>>();

  return {
    hostId: provide.hostId,
    needsRebridge: placement.needsRecovery,
    stoppability: (chatId) => projectTasks.stoppability(chatId),
    createCandidate: async (name, sourceRevisionId, requestId) => {
      if (taskRevisions === undefined) {
        throw Object.assign(new Error('Task candidate revisions are unavailable.'), { code: 'TASK_UNAVAILABLE' });
      }
      return taskRevisions.createCandidate(name, sourceRevisionId, requestId);
    },
    connect: (port) => {
      const channel = serveAgentChannel(port, projectTasks.source, {
        build: agentHostWorkerBuild,
        projectTasks: projectTasks.projectTasks,
        keepaliveInterval,
        sessionKey: `agent-host:${provide.hostId}`,
      });
      channels.add(channel);
      channel.onClose(() => {
        channels.delete(channel);
      });
    },
    rebridge: async (ports) => {
      let next: Awaited<ReturnType<typeof openProjectBridges>>;
      try {
        if (revisionsSlot !== undefined && ports.revisionsPort === undefined) {
          throw Object.assign(new Error('The replacement revision reader is not available.'), {
            code: 'REVISIONS_UNAVAILABLE',
          });
        }
        if (taskRevisionsSlot !== undefined && ports.taskRevisionsPort === undefined) {
          throw Object.assign(new Error('The replacement task revision authority is not available.'), {
            code: 'REVISIONS_UNAVAILABLE',
          });
        }
        next = await openProjectBridges(ports);
      } catch (error) {
        /* A failed rebridge keeps the bridges the host has, and closes every port it was sent (W6.r1 round 4). */
        closeProvidedPorts(ports);
        // Opening the new placement may already have fenced the prior session at the root.
        if (ports.placementPort !== undefined) {
          placement.invalidate();
        }
        throw error;
      }
      const replaced = [fileSystemSlot.swap(next.fileSystem), projectRootSlot.swap(next.projectRoot)];
      if (ports.revisionsPort !== undefined && revisionsSlot !== undefined) {
        revisionsSlot.swap(createPortRevisionsClient(ports.revisionsPort)).close();
      } else {
        ports.revisionsPort?.close();
      }
      if (ports.taskRevisionsPort !== undefined && taskRevisionsSlot !== undefined) {
        taskRevisionsSlot.swap(createPortRevisionsClient(ports.taskRevisionsPort)).close();
      } else {
        ports.taskRevisionsPort?.close();
      }
      if (ports.placementPort !== undefined) {
        placement.replace(placementConnection(ports.placementPort));
      }
      if (ports.computeStorePort !== undefined && computeConnection !== undefined) {
        computeConnection.rebind(ports.computeStorePort);
      } else {
        ports.computeStorePort?.close();
      }
      /* A parameter actor watches the root it opened on; each reopens on the new one when next asked for. */
      for (const actor of parameterActors.values()) {
        actor.send({ type: 'close' });
      }
      parameterActors.clear();
      for (const proxy of replaced) {
        proxy.dispose();
      }
    },
    drain: async (signal) => {
      diagnose('host.released');
      for (const channel of channels) {
        channel.dispose('project host released');
      }
      channels.clear();
      await projectTasks.drain({ signal });
    },
    releaseCandidate,
    close: async () => {
      diagnose('host.closed');
      for (const channel of channels) {
        channel.dispose('project host closed');
      }
      channels.clear();
      const failures: unknown[] = [];
      /* A failed task close retains its leases. Its candidate executors and placement bridge must remain valid for
       * a later release retry, even after this incarnation stopped serving new channels. */
      await projectTasks.close();
      failures.push(...(await closeParameterActors(parameterActors)));
      for (const [id, pending] of placedServices) {
        placedServices.delete(id);
        // oxlint-disable-next-line no-await-in-loop -- close waits for each placed executor to settle before releasing bridges.
        await pending.then(async (resource) => resource.close()).catch((error: unknown) => failures.push(error));
      }
      await geoSpecClient.close().catch((error: unknown) => {
        failures.push(error);
      });
      imageService.dispose();
      revisions?.close();
      taskRevisions?.close();
      placement.close();
      runtimeClient.terminate();
      computeConnection?.dispose();
      fileSystem.dispose();
      projectRoot.dispose();
      if (failures.length > 0) {
        throw new AggregateError(failures, 'The project host could not release every resource.');
      }
    },
  };
};
