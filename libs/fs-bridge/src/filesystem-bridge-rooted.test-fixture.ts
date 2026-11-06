/**
 * The rooted authority the conformance suite serves on every transport: a
 * workspace with one project root, and that root's view for a consumer,
 * composed the way every host composes it (charter D2) — the raw rooted
 * filesystem for the working copy, a masked view for any other consumer, plus
 * the read content operations served over it.
 */
import { Worker as NodeWorker } from 'node:worker_threads';
import { Topic } from '@taucad/events';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { WorkspaceMutationContext } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { RootedBridgeConsumer } from '#filesystem-bridge.js';
import type { FileSystemBridgeRuntimeService } from '#filesystem-bridge-protocol.js';
import type { GrepMatcherWorkerFactory } from '#filesystem-bridge-grep-matcher.js';
import type { ComputeEventSource, ComputeRestartedEvent } from '#filesystem-bridge-supervisor.js';

/**
 * A compute event source the test drives by hand: what an authority's
 * supervisor reports, without a compute worker to kill.
 *
 * @returns The source to hand the bridge, and the trigger.
 */
export const computeEventEmitter = (): {
  readonly source: ComputeEventSource;
  emit(failed: readonly number[]): void;
} => {
  const topic = new Topic<ComputeRestartedEvent>({ name: 'ComputeEventEmitter' });
  return {
    source: {
      subscribe(listener) {
        return topic.subscribe(listener);
      },
    },
    emit(failed) {
      topic.emit({ kind: 'compute-restarted', failed });
    },
  };
};

/**
 * A classic web-worker script made runnable on a `worker_threads` thread:
 * `self` is shimmed over the thread's port, as a Node host shims it.
 *
 * @param source - The web-worker script.
 * @returns The script a `worker_threads` worker evaluates.
 */
export const nodeWorkerScript = (source: string): string => `const { parentPort } = require("node:worker_threads");
globalThis.self = { postMessage: (message) => parentPort.postMessage(message) };
parentPort.on("message", (data) => self.onmessage({ data }));
${source}`;

/** A Node host's grep matcher worker: the bridge's script on a `worker_threads` thread. */
export const nodeGrepMatcherWorker: GrepMatcherWorkerFactory = (source, events) => {
  const worker = new NodeWorker(nodeWorkerScript(source), { eval: true });
  worker.on('message', events.onMessage);
  worker.on('error', events.onError);
  return {
    post(message) {
      worker.postMessage(message);
    },
    terminate() {
      void worker.terminate();
    },
  };
};

/** The project the suite's workspace holds. */
export const conformanceProjectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
/** That project's root on the authority. */
export const conformanceProjectRoot = `/projects/${conformanceProjectId}`;

const unique = (): string => Math.random().toString(36).slice(2);

/**
 * A workspace with one memory-backed project root, seeded with `files` (paths
 * relative to the root).
 *
 * @param files - The root's files.
 * @returns The authority service.
 */
export const seededWorkspace = async (
  files: Record<string, string | Uint8Array<ArrayBuffer>>,
): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const storageRootKey = `memory:conformance-root-${unique()}`;
  const rootProvider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey });
  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, { class: 'authored', backend: 'memory', storageRootKey });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  await service.configureProjectRoots({
    projects: [
      {
        projectId: conformanceProjectId,
        backend: 'memory',
        storageRootKey: `memory:conformance-project-${unique()}`,
        providerBasePath: conformanceProjectId,
      },
    ],
    roots: [],
  });
  await Promise.all(
    Object.entries(files).map(async ([path, content]) =>
      service.writeFile(`${conformanceProjectRoot}/${path}`, content),
    ),
  );
  return service;
};

/**
 * One root's handlers for one consumer, as a host composes them.
 *
 * @param connection - The authority service, the root the connection names,
 *   its mutation context and who it serves.
 * @returns The handlers the bridge serves.
 */
export const rootedHandlersFor = ({
  service,
  root,
  context,
  consumer,
}: {
  readonly service: WorkspaceFileService;
  readonly root: string;
  readonly context: WorkspaceMutationContext;
  readonly consumer: RootedBridgeConsumer;
}): FileSystemBridgeRuntimeService => {
  const filesystem = service.createRootedFileSystem(root, context);
  const view =
    consumer === 'working-copy' ? filesystem : composeView({ filesystem }, { consumer, policy: tauPathPolicy });
  return withReadContentOps(view, tauPathPolicy) as unknown as FileSystemBridgeRuntimeService;
};

/**
 * A seeded workspace and its project root's handlers for `consumer`.
 *
 * @param files - The root's files.
 * @param consumer - Who the connection serves.
 * @returns The service and the handlers.
 */
export const rootedWorkspaceHandlers = async (
  files: Record<string, string | Uint8Array<ArrayBuffer>>,
  consumer: RootedBridgeConsumer,
): Promise<{ service: WorkspaceFileService; handlers: FileSystemBridgeRuntimeService }> => {
  const service = await seededWorkspace(files);
  return {
    service,
    handlers: rootedHandlersFor({
      service,
      root: conformanceProjectRoot,
      context: { originClientId: 'conformance' },
      consumer,
    }),
  };
};
