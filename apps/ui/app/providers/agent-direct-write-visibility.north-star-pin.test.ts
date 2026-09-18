/**
 * Red pin for the workspace-filesystem north star, wave W0.
 *
 * The assertion states the target behaviour, so it fails today. It is wrapped
 * in `it.fails` (execution-queue ruling P2) to keep the suite green while the
 * defect stands; the wave that fixes it removes `.fails`.
 *
 * Topology under test, as the browser app builds it (the harness calls the
 * production constructors, so it moves with the composition it pins):
 *
 * ```text
 * agent tool fs ── prepared bridge port ── bindInPlace wrapper ──
 *   createRootedBridgeFileSystem ── the agent's own rooted port ──
 *                                                    WorkspaceFileService
 *                                                                 │
 *   FileContentService ── WorkerChangeChannel ── the UI's unrooted port
 * ```
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { FileSystemClientFacade } from '#hooks/use-file-manager.js';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createFileSystemBridgeProxy, exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import { joinPath } from '@taucad/utils/path';
import {
  createPreparedWorkspaceFileSystems,
  createRootedBridgeFileSystem,
} from '#providers/chat-workspace-authority-provider.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const projectRoot = '/projects/north-star-w0-pin';

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

/** The file-manager worker, its single UI port, and the services that port feeds. */
const createBrowserHarness = async (): Promise<{
  readonly uiClient: FileSystemBridgeProxy;
  readonly content: FileContentService;
  readonly worker: { postMessage: (data: unknown) => void };
}> => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  // The project route the app configures, plus the Home root it hangs under.
  mountTable.mount('/', new MemoryProvider(), {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:north-star-w0-pin-home',
  });
  mountTable.mount(projectRoot, provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:north-star-w0-pin',
  });
  const eventBus = new ChangeEventBus();
  const fileService = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });

  // `exposeFileSystem` listens on the worker global; the message source is the
  // seam the Node and Electron authorities already use.
  const messageSource = new EventTarget();
  const exposed = exposeFileSystem(fileService, {
    changeEventBus: eventBus,
    messageSource,
    /* The production handler: a connection that names a consumer reads the
     * composed view, one that does not reads the checkout itself. */
    handlerForRoot: (root, context, consumer) => {
      const filesystem = fileService.createRootedFileSystem(root, context);
      return consumer === undefined ? filesystem : composeView({ filesystem }, { consumer, policy: tauPathPolicy });
    },
  });
  const worker = {
    postMessage: (data: unknown) => {
      messageSource.dispatchEvent(new MessageEvent('message', { data }));
    },
  };

  const connection = openFileSystemBridge(worker);
  const uiClient = createFileSystemBridgeProxy(connection);
  await uiClient.ready;

  const paths = new WorkspacePathResolver(projectRoot);
  const content = new FileContentService({
    // Text on the wire throughout: jsdom's `MessagePort` clones a `Uint8Array`
    // into its own realm, which the bridge's wire schemas reject. The pin is
    // about event visibility, not binary transport.
    proxy: mock<FileSystemClient>({
      readFile: (async (path: string, options?: unknown) => {
        const text = await uiClient.readFile(path, 'utf8');
        return options === 'utf8' ? text : encoder.encode(text);
      }) as FileSystemClient['readFile'],
      stat: async (path: string) => uiClient.stat(path),
    }),
    paths,
    channel: new WorkerChangeChannel({ transport: { listen: uiClient.listen }, paths }),
    refreshGuard: new RefreshGenerationGuard(),
  });

  disposers.push(() => {
    content.dispose();
    uiClient.dispose();
    connection.dispose();
    exposed.cleanup();
    fileService.dispose();
    provider.dispose();
    eventBus.dispose();
  });

  await uiClient.mkdir(projectRoot, { recursive: true });
  await uiClient.writeFile(joinPath(projectRoot, 'main.scad'), 'cube(1);');

  return { uiClient, content, worker };
};

/** The filesystem the agent host receives for a direct-mode (`local`) turn. */
const createAgentFileSystem = async (worker: {
  postMessage: (data: unknown) => void;
}): Promise<FileSystemBridgeProxy> => {
  /* The production constructor over the production binding: the project's own
   * rooted bridge connection, which is what carries the agent's writes. */
  const rooted = createRootedBridgeFileSystem({
    client: mock<FileSystemClientFacade>(),
    rootDirectory: projectRoot,
    backend: 'memory',
    openConnection: async () => {
      const proxy = createFileSystemBridgeProxy(openFileSystemBridge(worker, { root: projectRoot }));
      await proxy.ready;
      disposers.push(() => {
        proxy.dispose();
      });
      return proxy;
    },
  });
  /* W3d: there is no materialized workspace to bind. A turn writes the project's
   * live checkout, so the agent's filesystem *is* the project's rooted one — which
   * is exactly what this pin is about. One read opens the lazy connection, so the
   * bridge port below has the provider's capabilities to announce. */
  await rooted.exists('');
  const prepared = await createPreparedWorkspaceFileSystems(rooted);
  const connection = prepared.openFileSystemBridge();
  const agentClient = createFileSystemBridgeProxy(connection);
  await agentClient.ready;
  disposers.push(() => {
    agentClient.dispose();
    connection.dispose();
  });
  return agentClient;
};

describe('agent direct-mode writes and the UI content authority (north star W0)', () => {
  // oxlint-disable-next-line eslint/capitalized-comments -- the pin header is the exact wording the W0 brief specifies
  // north-star W0 pin 1: an agent direct-mode write is invisible to `FileContentService` because the agent's composed view relays through the UI's own bridge port, whose change events the bridge suppresses as self-originated; turns green in W2 (harness re-pointed at the landed composition, W0 review F1).
  it('should show an agent direct-mode write to the UI content authority without a reload', async () => {
    const { content, worker } = await createBrowserHarness();
    const agent = await createAgentFileSystem(worker);

    expect(decoder.decode(await content.resolveBytes('main.scad'))).toBe('cube(1);');

    await agent.writeFile('main.scad', 'cube(2);');

    await vi.waitFor(
      async () => {
        expect(decoder.decode(await content.resolveBytes('main.scad'))).toBe('cube(2);');
      },
      // The same write over a port of the agent's own converges in tens of
      // milliseconds; this budget is the standing cost of a pinned red test.
      { timeout: 500, interval: 20 },
    );
  });
});
