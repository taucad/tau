import { expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { FsLike } from '@taucad/runtime/filesystem';
import type * as RuntimeFileSystemModule from '@taucad/runtime/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import type { BrowserProjectHost } from '#workers/agent-host.impl.js';
import { livePlacementPort } from '#workers/test/agent-host-resident.fixture.js';
import type * as GeoSpecClientModule from '#workers/geospec-runner.client.js';
import type * as RegistryModule from '@taucad/agent-tools/registry';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { systemSkillBundles } from '@taucad/skills/resources';

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
 * thunk. Both must be the agent's view, not the working copy. The agent's tool
 * registry is observed the same way, for the view its file tools read. */
const executorSeams = vi.hoisted(() => ({
  kernelFileSystems: [] as FsLike[],
  geoSpecBridges: [] as Array<() => FileSystemBridgeConnection>,
  toolRegistries: [] as Array<Parameters<(typeof RegistryModule)['createChatToolRegistry']>[0]>,
  toolViews: [] as ComposedView[],
}));

vi.mock('@taucad/agent-tools/registry', async (importOriginal) => {
  const original = await importOriginal<typeof RegistryModule>();
  return {
    ...original,
    createChatToolRegistry: (options: Parameters<(typeof RegistryModule)['createChatToolRegistry']>[0]) => {
      executorSeams.toolRegistries.push(options);
      return original.createChatToolRegistry(options);
    },
    createProviderRpcFileSystem: (options: Parameters<(typeof RegistryModule)['createProviderRpcFileSystem']>[0]) => {
      executorSeams.toolViews.push(options.provider);
      return original.createProviderRpcFileSystem(options);
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

/** Open a project host over `workspace` the way the page does, both bridges served from the one provider. */
const openHost = async (workspace: MemoryProvider): Promise<BrowserProjectHost> => {
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const projectId = `agent-host-executor-${crypto.randomUUID()}`;
  return openBrowserProjectHost(
    {
      projectId,
      // A machines-enabled host keeps the kernel runtime resident; other hosts construct it on first tool use.
      machinesEnabled: true,
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
};

const resetSeams = (): void => {
  executorSeams.kernelFileSystems.length = 0;
  executorSeams.geoSpecBridges.length = 0;
  executorSeams.toolRegistries.length = 0;
  executorSeams.toolViews.length = 0;
};

/*
 * The chat turn's kernel runtime and the GeoSpec runner both execute project
 * code the agent wrote, so each reads the agent's own view of the checkout
 * rather than the working copy. The control plane is absent from it, and
 * everything a render genuinely needs — the sources it stages and the bundler's
 * artifact cache — is still writable.
 */
it('should hand both executors of project code the agent view of the workspace', async () => {
  const workspace = new MemoryProvider();
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  let host: BrowserProjectHost | undefined;
  resetSeams();
  await workspace.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
  await workspace.writeFile('main.ts', 'export const main = 1;\n');

  try {
    host = await openHost(workspace);

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
    await host?.close();
    workspace.dispose();
  }
});

/*
 * Invariant I1: the system skills overlay is the agent's *tools'* view of the
 * checkout, never an executor's. A kernel or GeoSpec run over a project with no
 * `.agents` of its own sees no `.agents` at all, as on every other host, while
 * the agent's file tools still list and read the bundled skills.
 */
it('should hide the system skills from both executors while the tool view still serves them', async () => {
  const workspace = new MemoryProvider();
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const [bundle] = systemSkillBundles;
  if (bundle === undefined) {
    throw new TypeError('Expected at least one system skill bundle.');
  }
  let host: BrowserProjectHost | undefined;
  resetSeams();
  await workspace.writeFile('main.ts', 'export const main = 1;\n');

  try {
    host = await openHost(workspace);

    const kernelFileSystem = executorSeams.kernelFileSystems.at(-1);
    const openGeoSpecBridge = executorSeams.geoSpecBridges.at(-1);
    const registry = executorSeams.toolRegistries.at(-1);
    if (!kernelFileSystem || !openGeoSpecBridge || !registry) {
      throw new TypeError('Expected the worker to bind both executor filesystems and the tool registry.');
    }

    // The kernel runtime's filesystem.
    await expect(kernelFileSystem.promises.readdir('')).resolves.not.toContain('.agents');
    await expect(kernelFileSystem.promises.stat('.agents/skills')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      kernelFileSystem.promises.readFile(`.agents/skills/${bundle.slug}/SKILL.md`, 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    // The port the GeoSpec runner worker receives.
    const geoSpec = createFileSystemBridgeProxy(openGeoSpecBridge());
    try {
      await expect(geoSpec.exists('.agents/skills')).resolves.toBe(false);
      await expect(geoSpec.readdir('')).resolves.not.toContain('.agents');
    } finally {
      geoSpec.dispose();
    }

    // The agent's file tools read through the view that still composes the bundles.
    registry.fileSystemFor(new AbortController().signal);
    const toolView = executorSeams.toolViews.at(-1);
    if (!toolView) {
      throw new TypeError('Expected the tool registry to build its filesystem over a composed view.');
    }
    await expect(toolView.exists('.agents/skills')).resolves.toBe(true);
    await expect(toolView.readdir('.agents/skills')).resolves.toContain(bundle.slug);
    await expect(toolView.readFile(`.agents/skills/${bundle.slug}/SKILL.md`, 'utf8')).resolves.toBe(bundle.body);
  } finally {
    await host?.close();
    workspace.dispose();
  }
});
