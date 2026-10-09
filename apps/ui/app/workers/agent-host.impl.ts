/**
 * The resident worker's project host (W6 RH-S8): one per project the tab has open, built from the ports the page
 * provides. Every stream of the project is served by one launcher (`createAgentLauncher`), whose chats are led among
 * the origin's tabs by M2 inside the browser chat store; nothing here elects, forwards or tails.
 */

import { ResourceQueue } from '@taucad/filesystem';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { toRpcError } from '@taucad/chat/rpc';
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
import { followChat } from '@taucad/agent-host';
import type { ChatLedger, StorageDurabilityClass, ToolRegistry } from '@taucad/agent-host';
import { connectTurnPlacementChannel } from '@taucad/agent-host/channel-client';
import type { TurnPlacementChannel, TurnPlacementToolPort } from '@taucad/agent-host/channel-client';
import { createAgentLauncher, serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher, AgentLauncherOptions } from '@taucad/agent-host/launcher';
import { createBrowserChatStore } from '@taucad/agent-host/browser';
import type { BrowserChatStoreOptions } from '@taucad/agent-host/browser';
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
import { createPortRevisionsClient } from '#workers/agent-host-revisions.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
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
  visibility: NonNullable<BrowserChatStoreOptions['visibility']>;
  /** M1's timers; the worker leaves the defaults, and the browser tier shortens idle eviction (RH-A15). */
  delays?: AgentLauncherOptions['delays'];
}>;

/** One project host incarnation (RH-R4): its launcher serves every stream of the project. */
export type BrowserProjectHost = Readonly<{
  hostId: string;
  /** Read this host's current leadership actor without taking a lock. */
  stoppability: (chatId: string) => ReturnType<AgentLauncher['stoppability']>;
  /** Serve one stream; closing it only detaches (D17). */
  connect: (port: MessagePort) => void;
  /** Swap in fresh bridges, as after a file-manager restart; the launcher and its runs stay (RV1-F1). */
  rebridge: (ports: AgentHostProjectRebridge) => Promise<void>;
  /** Serve no stream, and settle once every run this host admitted has ended, or `signal` ends (T3). */
  drain: (signal: AbortSignal) => Promise<void>;
  /** Stop the launcher and every child, then dispose the bridges this host was given. */
  close: () => Promise<void>;
}>;

/**
 * T3: every run in `runIds` has ended; a paused run has too, since its pause survives a restart (RA-S7). A placed run
 * ends at its settlement row, which M1 appends after the terminal one (W8 TS-S6).
 */
const runsEnded =
  (runIds: ReadonlySet<string>) =>
  (ledger: ChatLedger): boolean =>
    [...runIds].every((runId) => {
      const entry = ledger.runs[runId];
      if (entry === undefined || entry.lifecycle === 'admitted' || entry.lifecycle === 'running') {
        return false;
      }
      return entry.lifecycle === 'paused' || entry.settlements.some((row) => row.attempt === entry.attempt);
    });

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
  readonly runtimeClient: AppRuntimeClient;
  readonly imageService: HeadlessImageService;
}) => {
  const { runtimeClient } = options;
  const runtime: RuntimeAgentClient = runtimeClient;
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
  const runtimeClient: AppRuntimeClient = createRuntimeClient<AnyRuntimeDefinition>(
    createDefaultKernelOptions({
      fileSystem: fromFsLike(createRuntimeFsLike(agentView)),
      runtimeConfig,
      compute,
    }),
  );
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
  const revisions = provide.revisionsPort === undefined ? undefined : createPortRevisionsClient(provide.revisionsPort);
  opened(() => revisions?.close());
  const geoSpecClient = createGeoSpecWorkerRpcClient({
    openFileSystemBridge: () => createFileSystemBridgePort(agentView),
    runtimeConfig,
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
  const parameterActorFor = async (targetFile: string): Promise<ParameterSetActor> => {
    const existing = parameterActors.get(targetFile);
    if (existing) {
      return existing;
    }
    const actor = createParameterSetActor({
      target: {
        authority: `browser:${provide.authority.workspaceId}:${provide.authority.projectId}`,
        root: provide.authority.projectId,
        entry: targetFile,
      },
      files: projectRoot,
      resolve: async ({ entry }, signal, resolution) => {
        const result = await runtimeClient.describe({
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
    parameterActors.set(targetFile, actor);
    return actor;
  };
  const parameters = createRuntimeParameterAgentClient({
    mapRuntimeError: (error) => toRpcError(error),
    parameterActorFor,
  });
  /* The registry over one filesystem: the project's own, or an attempt's checkout its placement granted (W8 G09). */
  const toolRegistryOver = (
    provider: FileSystemProvider,
    preferences: Pick<ProjectFileSystemBridge, 'readMachineSettings'>,
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
      workbench: createRuntimeWorkbenchClient(async () => runtimeClient),
      skillResolver,
      ...runtimeRpc,
      parameters,
      geospec: geoSpecClient,
      machines: runtimeClient.machines,
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
    });
  };
  const toolRegistry = toolRegistryOver(workspaceProvider, fileSystem);
  /* ponytail: an attempt's file tools read its checkout; the kernel, GeoSpec and parameter clients stay on the project
   * root until W8's candidate checkouts need them re-rooted. */
  const placedTools = (tools: TurnPlacementToolPort): ToolRegistry => {
    /* A tool port that never answers (D14) fails each invoke; an attempt that invokes nothing leaves no unhandled
     * rejection. */
    const opened = (async (): Promise<Readonly<{ registry: ToolRegistry } | { failure: unknown }>> => {
      try {
        const proxy = await createProjectFileSystemProxy(tools.port);
        return { registry: toolRegistryOver(createRelayedFileSystemProvider(proxy), proxy) };
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
  const turnPlacement: TurnPlacementChannel = connectTurnPlacementChannel({
    port: provide.placementPort,
    projectId: provide.authority.projectId,
    toolsFor: placedTools,
  });
  opened(() => {
    turnPlacement.close('project host failed to open');
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
  /* T3: set as a release drains. A new start is refused HOST_CLOSED; another tab that forwarded it keeps it for this
   * host's release or a successor (M2, C11). */
  let draining = false;
  const launcher: AgentLauncher = createAgentLauncher({
    admitting: () => !draining,
    chats: createBrowserChatStore({
      projectId: provide.authority.projectId,
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
      observeLog: async ({ path, signal, onChange, onError }) => {
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
      visibility: worker.visibility,
    }),
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
  });
  const channels = new Set<ReturnType<typeof serveAgentChannel>>();

  return {
    hostId: provide.hostId,
    stoppability: (chatId) => launcher.stoppability(chatId),
    connect: (port) => {
      const channel = serveAgentChannel(port, launcher, {
        build: agentHostWorkerBuild,
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
        next = await openProjectBridges(ports);
      } catch (error) {
        /* A failed rebridge keeps the bridges the host has, and closes every port it was sent (W6.r1 round 4). */
        closeProvidedPorts(ports);
        throw error;
      }
      const replaced = [fileSystemSlot.swap(next.fileSystem), projectRootSlot.swap(next.projectRoot)];
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
      /* Nothing new is admitted here: no stream is served, the registry routes no connect to a released host, and the
       * launcher refuses a new start, from any tab. */
      draining = true;
      for (const channel of channels) {
        channel.dispose('project host released');
      }
      channels.clear();
      /* Every run the launcher admitted, whichever tab sent it, re-read until a pass adds none: one admitted while the
       * last pass followed is followed too (W6.r1 round 4). */
      const ended = new Promise<undefined>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve(undefined);
        });
      });
      let followed = '';
      while (!signal.aborted) {
        /* Only answered admissions: a refused or failed one is gone before its answer settles (W6.r1 round 5). */
        // oxlint-disable-next-line no-await-in-loop -- each pass reads the runs the one before it could not see.
        const runs = await Promise.race([launcher.admittedRuns(), ended]);
        if (runs === undefined) {
          return;
        }
        const pass = JSON.stringify([...runs].map(([chatId, runIds]) => [chatId, [...runIds]]));
        if (pass === followed) {
          return;
        }
        followed = pass;
        // oxlint-disable-next-line no-await-in-loop -- each pass follows what the one before it could not see.
        await Promise.all(
          [...runs].map(async ([chatId, runIds]) => {
            // oxlint-disable-next-line no-empty-pattern -- only the follow's end matters.
            for await (const {} of followChat(launcher.read, chatId, {
              signal,
              until: runsEnded(runIds),
            })) {
              /* Each batch moves the ledger; `until` ends the follow once the runs have ended. */
            }
          }),
        );
      }
    },
    close: async () => {
      for (const channel of channels) {
        channel.dispose('project host closed');
      }
      channels.clear();
      const failures: unknown[] = [];
      await launcher.close().catch((error: unknown) => {
        failures.push(error);
      });
      failures.push(...(await closeParameterActors(parameterActors)));
      await geoSpecClient.close().catch((error: unknown) => {
        failures.push(error);
      });
      imageService.dispose();
      revisions?.close();
      turnPlacement.close('project host closed');
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
