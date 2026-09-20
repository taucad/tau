import { expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { FsLike } from '@taucad/runtime/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { handleAgentHostWorkerRequest } from '#workers/agent-host.impl.js';

/**
 * What the agent-host worker hands the executors of project code (G0-2, W14).
 *
 * Its own file, not `agent-host.browser.test.ts`: the two observation mocks below
 * reach the realms this page's real `Worker` instances load, and the launcher
 * rows over there boot one. Nothing here starts a worker — `initialize` builds
 * the kernel runtime and the GeoSpec client on the calling thread, which is
 * exactly the wiring under test.
 */

/* Observe what the worker hands the two executors of project code, without
 * changing it: the kernel runtime's `FsLike` and the GeoSpec runner's bridge
 * thunk. Both must be the agent's view, not the working copy. */
const executorSeams = vi.hoisted(() => ({
  kernelFileSystems: [] as FsLike[],
  geoSpecBridges: [] as Array<() => FileSystemBridgeConnection>,
}));

vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  type RuntimeFileSystemModule = typeof import('@taucad/runtime/filesystem');
  const original = await importOriginal<RuntimeFileSystemModule>();
  return {
    ...original,
    fromFsLike: (fsLike: FsLike) => {
      executorSeams.kernelFileSystems.push(fsLike);
      return original.fromFsLike(fsLike);
    },
  };
});

vi.mock('#workers/geospec-runner.client.js', async (importOriginal) => {
  type GeoSpecClientModule = typeof import('#workers/geospec-runner.client.js');
  const original = await importOriginal<GeoSpecClientModule>();
  return {
    ...original,
    createGeoSpecWorkerRpcClient: (options: Parameters<GeoSpecClientModule['createGeoSpecWorkerRpcClient']>[0]) => {
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
  const sessionId = `session-${crypto.randomUUID()}`;
  executorSeams.kernelFileSystems.length = 0;
  executorSeams.geoSpecBridges.length = 0;
  await workspace.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
  await workspace.writeFile('main.ts', 'export const main = 1;\n');

  try {
    await handleAgentHostWorkerRequest(
      {
        type: 'initialize',
        fileSystemPort: createFileSystemBridgePort(workspace).port,
        projectRootPort: createFileSystemBridgePort(workspace).port,
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
      sessionId,
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
  } finally {
    await handleAgentHostWorkerRequest({ type: 'close' }, sessionId);
    workspace.dispose();
  }
});
