/**
 * The rooted authority the conformance suite serves on every transport: a
 * workspace with one project root, and that root's view for a consumer,
 * composed the way every host composes it (charter D2) — the raw rooted
 * filesystem for the working copy, a masked view for any other consumer, plus
 * the read content operations served over it.
 */
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { WorkspaceMutationContext } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { RootedBridgeConsumer } from '#filesystem-bridge.js';
import type { FileSystemBridgeRuntimeService } from '#filesystem-bridge-protocol.js';

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
