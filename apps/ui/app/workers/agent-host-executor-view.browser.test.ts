import { expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { CreateRuntimeAgentClientsInput } from '@taucad/agent-tools/runtime';
import type * as AgentRuntimeModule from '@taucad/agent-tools/runtime';
import type { RuntimeClient } from '@taucad/runtime/client';
import type * as RuntimeClientModule from '@taucad/runtime/client';
import { digestContent } from '@taucad/cache-core';
import type { FsLike } from '@taucad/runtime/filesystem';
import type * as RuntimeFileSystemModule from '@taucad/runtime/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import type { BrowserProjectHost } from '#workers/agent-host.impl.js';
import { livePlacementPort } from '#workers/test/agent-host-resident.fixture.js';
import type * as GeoSpecClientModule from '#workers/geospec-runner.client.js';

/**
 * What the agent-host worker hands the executors of project code (G0-2, W14).
 *
 * Its own file, not `agent-host.browser.test.ts`: the two observation mocks below
 * reach the realms this page's real `Worker` instances load, and the launcher
 * rows over there boot one. Nothing here starts a worker — `openBrowserProjectHost` builds
 * the kernel runtime and the GeoSpec client on the calling thread, which is
 * exactly the wiring under test.
 */

/* Observe what the worker hands the two executors of project code, without
 * changing it: the kernel runtime's `FsLike` and the GeoSpec runner's bridge
 * thunk. Both must be the agent's view, not the working copy. */
const executorSeams = vi.hoisted(() => ({
  clients: [] as RuntimeClient[],
  agentInputs: [] as CreateRuntimeAgentClientsInput[],
  kernelFileSystems: [] as FsLike[],
  geoSpecBridges: [] as Array<() => FileSystemBridgeConnection>,
}));

vi.mock('@taucad/runtime/client', async (importOriginal) => {
  const original = await importOriginal<typeof RuntimeClientModule>();
  return {
    ...original,
    createRuntimeClient: (...args: Parameters<typeof original.createRuntimeClient>) => {
      const client = original.createRuntimeClient(...args);
      executorSeams.clients.push(client);
      return client;
    },
  };
});

vi.mock('@taucad/agent-tools/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof AgentRuntimeModule>();
  return {
    ...original,
    createRuntimeAgentClients: (input: CreateRuntimeAgentClientsInput) => {
      executorSeams.agentInputs.push(input);
      return original.createRuntimeAgentClients(input);
    },
  };
});

vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof RuntimeFileSystemModule>();
  return {
    ...original,
    fromFsLike: (fsLike: FsLike) => {
      executorSeams.kernelFileSystems.push(fsLike);
      return original.fromFsLike(fsLike);
    },
  };
});

vi.mock('#workers/geospec-runner.client.js', async (importOriginal) => {
  const original = await importOriginal<typeof GeoSpecClientModule>();
  return {
    ...original,
    createGeoSpecWorkerRpcClient: (
      options: Parameters<(typeof GeoSpecClientModule)['createGeoSpecWorkerRpcClient']>[0],
    ) => {
      executorSeams.geoSpecBridges.push(options.openFileSystemBridge);
      return original.createGeoSpecWorkerRpcClient(options);
    },
  };
});

/*
 * The chat turn's kernel runtime and the GeoSpec runner both execute project
 * code the agent wrote, so each reads the agent's own view of the checkout
 * rather than the working copy. The control plane is absent from it, and
 * everything a render genuinely needs — the sources it stages and the bundler's
 * artifact cache — is still writable.
 */
it('should hand both executors of project code the agent view of the workspace', async () => {
  const workspace = new MemoryProvider();
  const { createFileSystemBridgePort, createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const projectId = `agent-host-executor-${crypto.randomUUID()}`;
  let host: BrowserProjectHost | undefined;
  executorSeams.clients.length = 0;
  executorSeams.agentInputs.length = 0;
  executorSeams.kernelFileSystems.length = 0;
  executorSeams.geoSpecBridges.length = 0;
  await workspace.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
  await workspace.writeFile('main.ts', 'export const main = 1;\n');

  try {
    host = await openBrowserProjectHost(
      {
        projectId,
        hostId: `host-${crypto.randomUUID()}`,
        fileSystemPort: createFileSystemBridgePort(workspace).port,
        projectRootPort: createFileSystemBridgePort(workspace).port,
        placementPort: livePlacementPort(workspace, projectId, createFileSystemBridgePort),
        projectStorage: { projectId, backend: 'memory', storageRootKey: `memory:${projectId}`, providerBasePath: '' },
        authority: { projectId, workspaceId: projectId },
        gatewayBaseUrl: location.origin,
        systemPrompt: 'Browser executor-view fixture.',
        systemPromptBlocks: [
          { type: 'text', text: 'Browser executor-view fixture.' },
          { type: 'text', text: 'Dynamic fixture.' },
        ],
        model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
        runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      },
      { tabId: `tab-${crypto.randomUUID()}`, visibility: { visible: () => true, subscribe: () => () => undefined } },
    );

    const kernelFileSystem = executorSeams.kernelFileSystems.at(-1);
    const openGeoSpecBridge = executorSeams.geoSpecBridges.at(-1);
    if (!kernelFileSystem || !openGeoSpecBridge) {
      throw new TypeError('Expected the worker to bind both executor filesystems.');
    }

    // The kernel runtime's filesystem.
    await expect(kernelFileSystem.promises.readFile('.git/HEAD', 'utf8')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    await expect(kernelFileSystem.promises.readFile('main.ts', 'utf8')).resolves.toBe('export const main = 1;\n');
    await kernelFileSystem.promises.mkdir('node_modules/.tau-bundler/artifacts', { recursive: true });
    await kernelFileSystem.promises.writeFile('node_modules/.tau-bundler/artifacts/x.mjs', 'export default 1;\n');
    await expect(workspace.readFile('node_modules/.tau-bundler/artifacts/x.mjs', 'utf8')).resolves.toBe(
      'export default 1;\n',
    );

    // The port the GeoSpec runner worker receives.
    const geoSpec = createFileSystemBridgeProxy(openGeoSpecBridge());
    try {
      await expect(geoSpec.readFile('.git/HEAD', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(geoSpec.exists('.git')).resolves.toBe(false);
      await expect(geoSpec.readFile('main.ts', 'utf8')).resolves.toBe('export const main = 1;\n');
    } finally {
      geoSpec.dispose();
    }

    // Observe the real client's admission request, rejecting before its lazy worker boots.
    // Actual admitted projection is covered by the runtime/host integration controls.
    const client = executorSeams.clients.at(-1);
    const resolvePublished = executorSeams.agentInputs.at(-1)?.openPublishedAssembly;
    if (!client || !resolvePublished) {
      throw new TypeError('Expected request-scoped agent runtime wiring.');
    }
    const admissionError = new Error('Admission rejected by the runtime control.');
    const open = vi.spyOn(client, 'openAssembly').mockRejectedValue(admissionError);
    const exported = vi.spyOn(client, 'exportPublished');
    const ordinaryOpen = vi.spyOn(client, 'open');
    try {
      const scene = (generation: number) =>
        new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, generation, parts: {}, occurrences: [] }));
      const bytes = scene(1);
      await workspace.writeFile('scene.json', bytes);
      await expect(resolvePublished({ targetFile: 'scene.json' })).rejects.toBe(admissionError);
      expect(open).toHaveBeenLastCalledWith({
        root: { path: 'scene.json', digest: await digestContent({ bytes }), byteLength: bytes.byteLength },
        signal: undefined,
      });
      const nextBytes = scene(2);
      await workspace.writeFile('scene.json', nextBytes);
      await expect(resolvePublished({ targetFile: 'scene.json' })).rejects.toBe(admissionError);
      expect(open).toHaveBeenLastCalledWith({
        root: {
          path: 'scene.json',
          digest: await digestContent({ bytes: nextBytes }),
          byteLength: nextBytes.byteLength,
        },
        signal: undefined,
      });
      expect(exported).not.toHaveBeenCalled();
      expect(ordinaryOpen).not.toHaveBeenCalled();
      await workspace.writeFile('authored.json', JSON.stringify({ schemaVersion: 1, parts: {}, occurrences: [] }));
      await expect(resolvePublished({ targetFile: 'authored.json' })).rejects.toThrow('committed pinned scene');
      await workspace.writeFile('ordinary.json', '{}');
      await expect(resolvePublished({ targetFile: 'ordinary.json' })).resolves.toBeUndefined();
      await workspace.writeFile('invalid.json', '{');
      await expect(resolvePublished({ targetFile: 'invalid.json' })).resolves.toBeUndefined();
      await expect(resolvePublished({ targetFile: '../scene.json' })).rejects.toThrow();
      const controller = new AbortController();
      controller.abort();
      await expect(resolvePublished({ targetFile: 'scene.json', signal: controller.signal })).rejects.toThrow();
      expect(open).toHaveBeenCalledTimes(2);
      expect(exported).not.toHaveBeenCalled();
      expect(ordinaryOpen).not.toHaveBeenCalled();
      await expect(resolvePublished({ targetFile: 'main.ts' })).resolves.toBeUndefined();
      expect(ordinaryOpen).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
      exported.mockRestore();
      ordinaryOpen.mockRestore();
    }
  } finally {
    await host?.close();
    workspace.dispose();
  }
});
