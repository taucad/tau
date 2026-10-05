import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge, createFileSystemBridgePort } from '@taucad/runtime/filesystem';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { sha256String } from '@taucad/utils/hash';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { validateAdmittedAssemblyGlb } from '@taucad/geometry-core';

import { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';

// The prepared Python and .NET payloads are build outputs; kernel composition does not read them.
vi.mock('#tau/build123d-resources.js', () => ({ build123dKernelOptions: () => ({}) }));
vi.mock('#tau/picogk-resources.js', () => ({ picogkKernelOptions: () => ({}) }));

const resolveDesktopRuntime = async () =>
  resolveRuntimeDefinition(createDesktopRuntime(), {
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  });

let resourceRoot: string;
beforeEach(async () => {
  resourceRoot = await mkdtemp(join(tmpdir(), 'tau-replicad-recipe-'));
  // Recipe controls only: these placeholders are never loaded as a native engine.
  await writeFile(join(resourceRoot, 'replicad_single.wasm'), 'recipe-only-wasm');
  await writeFile(join(resourceRoot, 'replicad_single.mjs'), 'recipe-only-glue');
  vi.stubEnv('TAU_REPLICAD_RESOURCE_ROOT', resourceRoot);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(resourceRoot, { recursive: true, force: true });
});

describe('desktop runtime kernels', () => {
  it('selects the trusted fixed engine pair through the existing custom override', async () => {
    const { kernels } = await resolveDesktopRuntime();
    expect(kernels.find((kernel) => kernel.id === 'replicad')?.options).toMatchObject({
      wasm: {
        wasmUrl: pathToFileURL(join(resourceRoot, 'replicad_single.wasm')).href,
        wasmBindingsUrl: pathToFileURL(join(resourceRoot, 'replicad_single.mjs')).href,
      },
    });
  });

  it('loads the delivered app mjs with its supplied wasm URL and preserves the custom descriptor after source-free reopen', async () => {
    const deliveredRoot = fileURLToPath(
      new URL('../../../ui/public/assets/engines/replicad/density-single-v1/', import.meta.url),
    );
    vi.stubEnv('TAU_REPLICAD_RESOURCE_ROOT', deliveredRoot);
    const orderedAssets = await Promise.all(
      ['replicad_single.wasm', 'replicad_single.mjs'].map(
        async (name) =>
          `sha256:${createHash('sha256')
            .update(await readFile(join(deliveredRoot, name)))
            .digest('hex')}`,
      ),
    );
    expect(orderedAssets).toEqual([
      'sha256:9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9',
      'sha256:cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27',
    ]);
    const projectRoot = await mkdtemp(join(resourceRoot, 'project-'));
    const authorityRoot = join(resourceRoot, 'authority');
    await mkdir(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => projectRoot,
    });
    const { port1, port2 } = new MessageChannel();
    const stopHost = serveNodeFsProvider(port2, {
      authority,
      policy: tauPathPolicy,
      allowRoot: (root) => root === projectRoot,
    });
    const providerRegistry = new ProviderRegistry({ createNodeFsPort: async () => port1 });
    const scope = { backend: 'node', path: projectRoot } as const;
    const provider = await providerRegistry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      class: 'authored',
      backend: 'node',
      storageRootKey: providerRegistry.resolveStorageRootKey(scope),
    });
    const service = new WorkspaceFileService({
      providerRegistry,
      mountTable,
      eventBus: new ChangeEventBus(),
      resourceQueue: new ResourceQueue(),
    });
    const rooted = service.createRootedFileSystem('/');
    const runtimeFileSystem = fromFileSystemBridge(() => createFileSystemBridgePort(rooted));
    const makeClient = (withPublicationWriter = false) =>
      createRuntimeClient({
        config: { tauApiUrl: 'http://localhost:4000', tauWebSocketUrl: 'ws://localhost:4001' },
        transport: inProcessTransport({
          runtime: createDesktopRuntime(),
          fileSystem: runtimeFileSystem,
          ...(withPublicationWriter ? { publicationFileSystem: runtimeFileSystem } : {}),
          admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
            await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
          },
        }),
      });
    let producer: ReturnType<typeof makeClient> | undefined;
    let consumer: ReturnType<typeof makeClient> | undefined;
    try {
      await rooted.writeFile(
        'part.ts',
        `import { makeBox } from 'replicad'; export default function main() {
        return { shapes: [{ shape: makeBox([0,0,0],[20,20,31.2]), density: 1.55, name: 'Part' }] };
      }`,
      );
      await rooted.writeFile(
        'assembly.json',
        JSON.stringify({
          schemaVersion: 1,
          parts: { part: { source: { path: 'part.ts' } } },
          occurrences: [{ id: 'part', part: 'part', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
        }),
      );
      producer = makeClient(true);
      const published = await producer.publishAssembly({
        authoredPath: 'assembly.json',
        publicationPath: `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}/scene.json`,
      });
      if (published.status !== 'published') {
        const current = published.status === 'commit-unknown' ? await published.readCurrent() : undefined;
        const issues = published.status === 'invalid' ? published.issues : undefined;
        throw new Error(
          `Delivered desktop publication failed: ${published.status}; issues: ${JSON.stringify(issues)}; root observation: ${JSON.stringify(current)}`,
        );
      }
      const persistedRoot = await readFile(join(projectRoot, published.root.path));
      expect(persistedRoot.byteLength).toBe(published.root.byteLength);
      expect(`sha256:${createHash('sha256').update(persistedRoot).digest('hex')}`).toBe(published.root.digest);
      const exact = published.admitted.publication.parts['part']!.variants['default']!.exact!;
      expect(exact.codecVersion).toBe('2');
      expect(JSON.parse(exact.providerVersion)).toMatchObject({
        kernelVersion: '1.4.2',
        wasmVariant: 'custom',
        assets: orderedAssets,
      });
      await rooted.unlink('part.ts');
      await rooted.unlink('assembly.json');
      await expect(readFile(join(projectRoot, 'part.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(projectRoot, 'assembly.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      await producer.shutdown();
      producer = undefined;
      consumer = makeClient();
      const admitted = await consumer.openAssembly({ root: published.root });
      expect(admitted.admitted.publication).toEqual(published.admitted.publication);
      const exported = await consumer.exportPublished({ format: 'step', publishedAssembly: { root: published.root } });
      expect(exported.success).toBe(true);
      if (!exported.success) {
        throw new Error(JSON.stringify(exported.issues));
      }
      expect(new TextDecoder().decode(exported.files[0].bytes)).toContain('ISO-10303-21');
      const reopened = await consumer.openAssembly({ root: published.root });
      expect(reopened.admitted.publication.parts['part']!.variants['default']!.exact?.providerVersion).toBe(
        exact.providerVersion,
      );
    } finally {
      try {
        await producer?.shutdown();
      } finally {
        try {
          await consumer?.shutdown();
        } finally {
          service.dispose();
          try {
            await stopHost();
          } finally {
            port1.close();
            port2.close();
          }
        }
      }
    }
  }, 120_000);

  it.each(['replicad_single.wasm', 'replicad_single.mjs'])(
    'denies a missing built %s without falling back to the package default',
    async (name) => {
      await rm(join(resourceRoot, name));
      await expect(resolveDesktopRuntime()).rejects.toThrow(/engine pair is missing/u);
    },
  );

  it.each([undefined, 'relative/renderer-choice'])('denies an unminted resource root %s', async (root) => {
    vi.stubEnv('TAU_REPLICAD_RESOURCE_ROOT', root);
    await expect(resolveDesktopRuntime()).rejects.toThrow(/absolute Replicad resource root/u);
  });

  it('should compose PicoVoxel after Manifold with its default wasm option', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const ids = kernels.map((kernel) => kernel.id);

    expect(ids.indexOf('picovoxel')).toBe(ids.indexOf('manifold') + 1);
    // Default 'auto': Node utility processes have shared WebAssembly memory, so the fast lane runs multi-threaded.
    expect(kernels.find((kernel) => kernel.id === 'picovoxel')).not.toHaveProperty('options.wasm');
  });

  it('should route a picovoxel-importing TypeScript file to PicoVoxel and C# to native PicoGK', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const picovoxelKernel = kernels.find((kernel) => kernel.id === 'picovoxel')!;
    const { detectImport } = picovoxelKernel;
    expect(detectImport).toBeDefined();
    const importMatcher = new RegExp(detectImport!.source, detectImport!.flags);

    expect(picovoxelKernel.extensions).toEqual(['ts', 'js']);
    expect(importMatcher.test("import type { Pico } from 'picovoxel';")).toBe(true);
    expect(importMatcher.test("import { makeBox } from 'replicad';")).toBe(false);
    // Native PicoGK is composed on Apple Silicon only and claims C# alone.
    const picogkKernel = kernels.find((kernel) => kernel.id === 'picogk');
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(picogkKernel?.extensions).toEqual(['cs']);
    } else {
      expect(picogkKernel).toBeUndefined();
    }
  });
});
