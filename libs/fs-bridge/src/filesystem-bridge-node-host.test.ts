/**
 * X8 — the filesystem-bridge authority hosted outside a browser worker.
 *
 * This project runs vitest with `environment: 'node'`, so `self` and `Worker`
 * are genuinely absent here. `MessagePort`, `MessageChannel`, `MessageEvent`
 * and `EventTarget` *are* Node globals (v15+) and are used as such — "no
 * browser globals" is not the criterion and would be unmeetable. What the
 * suite does pin is that the library never imports `node:worker_threads`
 * and never touches the worker global once a message source is injected.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { ExposeFileSystemHandle, FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { createTransferredFileSystemBridgeProxy, exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const projectRoot = `/projects/${projectId}`;

type Workspace = {
  readonly service: WorkspaceFileService;
  readonly bus: ChangeEventBus;
};

const createWorkspace = async (): Promise<Workspace> => {
  const providerRegistry = new ProviderRegistry();
  const rootStorageRootKey = `memory:node-host-root-${Math.random().toString(36).slice(2)}`;
  const rootProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });
  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: rootStorageRootKey });
  const bus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: bus,
    mountTable,
  });
  await service.configureProjectRoots({
    projects: [
      {
        projectId,
        backend: 'memory',
        storageRootKey: `memory:node-host-project-${Math.random().toString(36).slice(2)}`,
        providerBasePath: projectId,
      },
    ],
    roots: [],
  });
  return { service, bus };
};

type NodeHost = {
  readonly exposed: ExposeFileSystemHandle;
  readonly connect: (root?: string) => { proxy: FileSystemBridgeProxy; dispose: () => void };
  readonly dispose: () => void;
};

/**
 * Stand the authority up on one end of a Node `worker_threads` channel and
 * post connect envelopes into the other end — the same handshake a browser
 * worker performs, with the worker boundary replaced by a port pair.
 */
const hostOnNode = ({ service, bus }: Workspace): NodeHost => {
  const boundary = new MessageChannel();
  const exposed = exposeFileSystem(service, {
    changeEventBus: bus,
    handlerForRoot: (root, context) => service.createRootedFileSystem(root, context),
    messageSource: boundary.port2,
  });
  return {
    exposed,
    connect(root?: string) {
      const connection = openFileSystemBridge(boundary.port1, root === undefined ? undefined : { root });
      const proxy = createTransferredFileSystemBridgeProxy(connection.port);
      return {
        proxy,
        dispose() {
          proxy.dispose();
        },
      };
    },
    dispose() {
      exposed.cleanup();
      boundary.port1.close();
      boundary.port2.close();
      service.dispose();
    },
  };
};

describe('filesystem bridge authority on a Node host (X8)', () => {
  it('completes connect, hello, a scoped-root request and disposal with an injected message source', async () => {
    expect('self' in globalThis).toBe(false);
    expect('Worker' in globalThis).toBe(false);

    const workspace = await createWorkspace();
    await workspace.service.writeFile(`${projectRoot}/main.ts`, 'export default 1;\n');
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot);

    try {
      await client.proxy.ready;
      expect(client.proxy.hello.payload).toMatchObject({ v: 1, state: 'ready' });
      await expect(client.proxy.readFile('main.ts', 'utf8')).resolves.toBe('export default 1;\n');

      await client.proxy.writeFile('written.ts', 'export default 2;\n');
      await expect(workspace.service.readFile(`${projectRoot}/written.ts`, 'utf8')).resolves.toBe(
        'export default 2;\n',
      );
      expect(host.exposed.activePorts.size).toBe(1);

      client.dispose();
      // The proxy's `get` trap throws before the call, so nothing is left pending.
      expect(() => {
        void client.proxy.readFile('main.ts', 'utf8');
      }).toThrow(/disposed/u);
    } finally {
      host.dispose();
    }
  });

  it('keeps a scoped port inside its root on the Node host', async () => {
    const workspace = await createWorkspace();
    await workspace.service.writeFile('/outside.ts', 'secret');
    await workspace.service.writeFile(`${projectRoot}/inside.ts`, 'visible');
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot);

    try {
      await client.proxy.ready;
      await expect(client.proxy.readFile('inside.ts', 'utf8')).resolves.toBe('visible');
      // The scoped handler resolves `/` to the project root, so the authority's
      // own `/outside.ts` is simply not addressable from this port.
      await expect(client.proxy.readFile('outside.ts', 'utf8')).rejects.toThrow();
      await expect(client.proxy.readFile('../outside.ts', 'utf8')).rejects.toThrow();
    } finally {
      client.dispose();
      host.dispose();
    }
  });

  it('never imports node:worker_threads anywhere in the library', () => {
    const sources = readdirSync(import.meta.dirname, { recursive: true, encoding: 'utf8' }).filter(
      (entry) => entry.endsWith('.ts') && !entry.includes('.test'),
    );
    expect(sources.length).toBeGreaterThan(0);

    const importers = sources.filter((entry) =>
      /(?:from|import|require)\s*\(?\s*['"]node:worker_threads['"]/u.test(
        readFileSync(path.join(import.meta.dirname, entry), 'utf8'),
      ),
    );

    expect(importers).toEqual([]);
  });
});
