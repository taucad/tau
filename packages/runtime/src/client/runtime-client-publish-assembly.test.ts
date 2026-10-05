// @vitest-environment node
// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB-backed authority fixture.
import 'fake-indexeddb/auto';
import { runInNewContext } from 'node:vm';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { digestContent } from '@taucad/cache-core';
import { sha256String } from '@taucad/utils/hash';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { selectPublishedExportRoute } from '#client/published-export-routes.js';
import type { PublishedAssembly, PublishedPartExact } from '#types/runtime-assembly.types.js';
import type { ExportRoute } from '#types/runtime.types.js';
import {
  createRuntimeClient,
  OperationAbortedError,
  OperationTimeoutError,
  RuntimeTerminatedError,
} from '#client/runtime-client.js';
import type { RuntimeTransportCloseResult } from '#transport/runtime-transport.types.js';
import { emptyGlb, testGlb } from '#framework/published-part-test-fixture.js';
import { fromFileSystemBridge } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';
import { defineKernel } from '#plugins/kernel-plugin-entry.js';
import { defineRuntime } from '#worker/runtime-definition.js';
// oxlint-disable-next-line no-restricted-imports -- Runtime-private test fixture is outside the package build graph.
import { createParameterDeclaration } from '../../test/support/kernel-worker.fixture.js';

let sequence = 0;
const disposers: Array<() => void> = [];
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const assembly = (part: unknown, id = 'first') =>
  JSON.stringify({
    schemaVersion: 1,
    parts: { screw: part },
    occurrences: [{ id, part: 'screw', transform: identity }],
  });

const makeRuntime = (
  produce = vi.fn(async () => ({
    geometry: { format: 'gltf', content: emptyGlb() } as const,
    nativeHandle: {},
  })),
) => {
  const kernel = defineKernel({
    id: 'assembly-test',
    name: 'Assembly test',
    version: '1.0.0',
    extensions: ['shape'],
    views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve() {
      return { resolved: [], unresolved: [] };
    },
    async describe() {
      const result = createParameterDeclaration();
      return result.success ? { ...result, data: { parameters: result.data } } : result;
    },
    async evaluate() {
      const produced = await produce();
      return { handle: produced, views: ['model'] };
    },
    async render({ handle }) {
      return { content: handle.geometry.content };
    },
  });
  return { runtime: defineRuntime({ kernels: [kernel()] }), produce };
};

const project = async () => {
  const registry = new ProviderRegistry({ databasePrefix: `published-client-${sequence++}` });
  const scope: { backend: 'indexeddb' } = { backend: 'indexeddb' };
  const provider = await registry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, {
    class: 'authored',
    backend: 'indexeddb',
    storageRootKey: registry.resolveStorageRootKey(scope),
  });
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  const rooted = service.createRootedFileSystem('/');
  disposers.push(() => {
    service.dispose();
  });
  return {
    rooted,
    fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(rooted)),
  };
};

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

describe('RuntimeClient.publishAssembly', () => {
  it('selects used admitted variants and declared identities for flat and nested exact exports', async () => {
    const asset = {
      path: 'part.glb',
      digest: await digestContent({ bytes: emptyGlb() }),
      byteLength: emptyGlb().byteLength,
    };
    const exact: PublishedPartExact = {
      asset,
      kernelId: 'native',
      provider: 'provider',
      providerVersion: 'version',
      codec: 'codec',
      codecVersion: '1',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const publication: PublishedAssembly = {
      schemaVersion: 1,
      parts: {
        part: {
          schemaVersion: 1,
          variants: {
            selected: { source: { entry: 'part.ts', files: { 'part.ts': asset.digest } }, glb: asset, exact },
            unused: {
              source: { entry: 'part.ts', files: { 'part.ts': asset.digest } },
              glb: asset,
              exact: { ...exact, providerVersion: 'other' },
            },
          },
        },
      },
      occurrences: [{ id: 'part', part: 'part', variant: 'selected', transform: identity }],
    };
    const native: ExportRoute = {
      kernelId: 'native',
      sourceFormat: 'step',
      targetFormat: 'step',
      fidelity: 'brep',
      exportId: 'solid',
      exportOptions: { schema: {}, defaults: {} },
    };
    const mesh: ExportRoute = {
      kernelId: 'display',
      sourceFormat: 'glb',
      targetFormat: 'glb',
      fidelity: 'mesh',
      exportId: 'ordinaryDisplay',
      exportOptions: { schema: {}, defaults: { stale: true } },
    };
    const select = (root: PublishedAssembly, format: 'step' | 'glb', routes: ExportRoute[]) =>
      selectPublishedExportRoute({ publication: root, format, capabilities: { routes } });
    expect(select(publication, 'step', [native])?.exportId).toBe('solid');
    expect(select(publication, 'step', [{ ...native, exportId: undefined }])).toBeUndefined();
    expect(select(publication, 'step', [{ ...native, kernelId: 'unrelated' }])).toBeUndefined();
    expect(select(publication, 'glb', [mesh])).toMatchObject({ exportId: 'glb', exportOptions: { defaults: {} } });
    expect(
      select(
        { ...publication, occurrences: [{ id: 'group', transform: identity, children: publication.occurrences }] },
        'step',
        [native],
      )?.exportId,
    ).toBe('solid');
    expect(
      select(
        { ...publication, occurrences: [{ id: 'missing', part: 'part', variant: 'missing', transform: identity }] },
        'glb',
        [mesh],
      ),
    ).toBeUndefined();
    expect(
      select(
        {
          ...publication,
          occurrences: [
            ...publication.occurrences,
            { id: 'other', part: 'part', variant: 'unused', transform: identity },
          ],
        },
        'step',
        [native],
      ),
    ).toBeUndefined();
    const mixed: PublishedAssembly = {
      ...publication,
      parts: {
        ...publication.parts,
        displayOnly: {
          schemaVersion: 1,
          variants: { default: { source: { entry: 'part.ts', files: { 'part.ts': asset.digest } }, glb: asset } },
        },
      },
      occurrences: [
        ...publication.occurrences,
        { id: 'display-only', part: 'displayOnly', variant: 'default', transform: identity },
      ],
    };
    expect(select(mixed, 'step', [native])).toBeUndefined();
    expect(
      select({ ...mixed, occurrences: [{ id: 'group', transform: identity, children: mixed.occurrences }] }, 'step', [
        native,
      ]),
    ).toBeUndefined();
    expect(select(mixed, 'glb', [mesh])?.exportId).toBe('glb');
  });
  it.each(['read', 'export'] as const)(
    'denies a late source-free %s result after its published document closes',
    async (operation) => {
      const { rooted, fileSystem } = await project();
      const { runtime, produce } = makeRuntime();
      await rooted.writeFile('parts/screw.shape', new TextEncoder().encode('cube'));
      await rooted.writeFile(
        'assembly.json',
        new TextEncoder().encode(assembly({ source: { path: 'parts/screw.shape' } })),
      );
      const client = createRuntimeClient({
        transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
      });
      const publication = await client.publishAssembly({
        authoredPath: 'assembly.json',
        publicationPath: 'scene.json',
      });
      if (publication.status !== 'published') {
        throw new Error('Expected a published root.');
      }
      const { document } = publication;
      expect(document.projection).toBe('assembly');
      const { glb } = document.admitted.publication.parts['screw']!.variants['default']!;
      await rooted.unlink('assembly.json');
      await rooted.unlink('parts/screw.shape');
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const originalRead = rooted.readFile.bind(rooted);
      const read = vi.spyOn(rooted, 'readFile').mockImplementation(async (...args) => {
        const bytes = await originalRead(...args);
        if (args[0] === glb.path) {
          entered.resolve();
          await release.promise;
        }
        return bytes;
      });
      try {
        const pending =
          operation === 'read'
            ? document.admitted.readAsset(glb.digest)
            : document.exportPublished({ publishedAssembly: { root: publication.root }, format: 'glb' });
        const rejected = expect(pending).rejects.toThrow();
        await entered.promise;
        document.close();
        release.resolve();
        await rejected;
        await expect(document.admitted.readAsset(glb.digest)).rejects.toThrow();
        await expect(
          document.exportPublished({ publishedAssembly: { root: publication.root }, format: 'glb' }),
        ).rejects.toThrow();
        expect(produce).toHaveBeenCalledOnce();
      } finally {
        release.resolve();
        read.mockRestore();
        client.terminate();
      }
    },
  );
  it('publishes through trusted display admission, then reuses its pin in another client with no producer work', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    const admitAssemblyDisplay = vi.fn(
      async ({
        records,
        readAsset,
      }: Parameters<NonNullable<Parameters<typeof inProcessTransport>[0]['admitAssemblyDisplay']>>[0]) => {
        const asset = records['screw']!.variants['default']!.glb;
        expect(await readAsset('screw', asset)).toEqual(emptyGlb());
      },
    );
    await rooted.writeFile('parts/screw.shape', new TextEncoder().encode('cube'));
    await rooted.writeFile('first.json', new TextEncoder().encode(assembly({ source: { path: 'parts/screw.shape' } })));
    const firstClient = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }),
    });
    const first = await firstClient.publishAssembly({ authoredPath: 'first.json', publicationPath: 'scene.json' });
    expect(first.status).toBe('published');
    if (first.status !== 'published') {
      throw new Error('Expected first publication.');
    }
    expect(first.root.path).toBe('scene.json');
    expect(JSON.parse(new TextDecoder().decode(await rooted.readFile('scene.json'))).generation).toBe(1);
    expect(produce).toHaveBeenCalledOnce();
    expect(
      await first.admitted.readAsset(first.admitted.publication.parts['screw']!.variants['default']!.glb.digest),
    ).toEqual(emptyGlb());
    firstClient.terminate();

    await rooted.writeFile(
      'second.json',
      new TextEncoder().encode(assembly({ publishedPart: first.partRecords['screw'] }, 'second')),
    );
    const secondClient = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }),
    });
    const second = await secondClient.publishAssembly({ authoredPath: 'second.json', publicationPath: 'scene.json' });
    expect(second).toMatchObject({ status: 'published', generation: 2 });
    expect(produce).toHaveBeenCalledOnce();
    expect(admitAssemblyDisplay).toHaveBeenCalledTimes(2);
    secondClient.terminate();
  });

  it('cold-opens a pinned root and reads one asset after authored source deletion', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    await rooted.writeFile('parts/screw.shape', new TextEncoder().encode('cube'));
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { path: 'parts/screw.shape' } })),
    );
    const publisher = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const published = await publisher.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(published.status).toBe('published');
    if (published.status !== 'published') {
      throw new Error('Expected a published root.');
    }
    publisher.terminate();
    await rooted.unlink('assembly.json');
    await rooted.unlink('parts/screw.shape');

    const consumer = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const opened = await consumer.openAssembly({ root: published.root });
    expect(opened.admitted.publication).toEqual(published.admitted.publication);
    const { glb } = opened.admitted.publication.parts['screw']!.variants['default']!;
    expect(await opened.admitted.readAsset(glb.digest)).toEqual(emptyGlb());
    expect(produce).toHaveBeenCalledOnce();
    await expect(opened.admitted.readAsset(published.root.digest)).rejects.toThrow(
      /outside the admitted assembly closure/u,
    );
    await rooted.writeFile(glb.path, new Uint8Array([0, 1, 2]));
    await expect(opened.admitted.readAsset(glb.digest)).rejects.toThrow(/pinned digest|pinned byte length/u);
    consumer.terminate();
    await expect(opened.admitted.readAsset(glb.digest)).rejects.toThrow();
  });

  it('should open a portable display closure in an independent empty project without source or compute caches', async () => {
    const original = await project();
    const { runtime, produce } = makeRuntime();
    await original.rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'screw.shape': 'cube' } } })),
    );
    const publisher = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem: original.fileSystem,
        admitAssemblyDisplay: async () => undefined,
      }),
    });
    const published = await publisher.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    publisher.terminate();
    if (published.status !== 'published') {
      throw new Error('Expected a portable published root.');
    }
    const portable = await project();
    const record = published.partRecords['screw']!;
    const { glb } = published.admitted.publication.parts['screw']!.variants['default']!;
    const pointer = JSON.parse(await original.rooted.readFile(published.root.path, 'utf8')) as {
      manifest: { path: string };
    };
    const manifest = JSON.parse(await original.rooted.readFile(pointer.manifest.path, 'utf8')) as {
      chunks: Array<{ path: string }>;
    };
    for (const path of new Set([
      published.root.path,
      pointer.manifest.path,
      ...manifest.chunks.map(({ path }) => path),
      record.path,
      glb.path,
    ])) {
      // oxlint-disable-next-line no-await-in-loop -- Copy each actual pinned closure file before portable admission.
      await portable.rooted.writeFile(path, await original.rooted.readFile(path));
    }
    const consumer = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem: portable.fileSystem,
        admitAssemblyDisplay: async () => undefined,
      }),
    });
    try {
      expect(await portable.rooted.exists('screw.shape')).toBe(false);
      expect(await portable.rooted.exists('.tau/cache')).toBe(false);
      const reopened = await consumer.openAssembly({ root: published.root });
      expect(reopened.admitted.publication).toEqual(published.admitted.publication);
      expect(await reopened.admitted.readAsset(glb.digest)).toEqual(emptyGlb());
      expect(produce).toHaveBeenCalledOnce();
      await portable.rooted.unlink(glb.path);
      await expect(consumer.openAssembly({ root: published.root })).rejects.toThrow();
    } finally {
      consumer.terminate();
    }
  });

  it('should reject an empty pinned root like the publication boundary', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    const content = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        generation: 1,
        parts: {},
        occurrences: [],
      }),
    );
    const contentDigest = await digestContent({ bytes: content });
    const chunk = {
      path: `roots/sha256/${contentDigest.slice(7)}.chunk`,
      digest: contentDigest,
      byteLength: content.byteLength,
    };
    await rooted.mkdir('roots/sha256', { recursive: true });
    await rooted.writeFile(chunk.path, content);
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        content: { digest: contentDigest, byteLength: content.byteLength },
        chunks: [chunk],
      }),
    );
    const manifestDigest = await digestContent({ bytes: manifestBytes });
    const manifest = {
      path: `roots/sha256/${manifestDigest.slice(7)}.json`,
      digest: manifestDigest,
      byteLength: manifestBytes.byteLength,
    };
    await rooted.writeFile(manifest.path, manifestBytes);
    const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 2, generation: 1, manifest }));
    await rooted.writeFile('scene.json', bytes);
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    try {
      await rooted.writeFile(
        'assembly.json',
        new TextEncoder().encode(
          JSON.stringify({
            schemaVersion: 1,
            parts: {},
            occurrences: [],
          }),
        ),
      );
      const empty = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'empty.json' });
      expect(empty.status).toBe('commit-unknown');
      expect(await rooted.exists('empty.json')).toBe(false);
      await expect(
        client.openAssembly({
          root: {
            path: 'scene.json',
            digest: await digestContent({ bytes }),
            byteLength: bytes.byteLength,
          },
        }),
      ).rejects.toThrow('A published root requires at least one pinned part.');
      expect(produce).not.toHaveBeenCalled();
    } finally {
      client.terminate();
    }
  });

  it.each(['abort', 'dispose'])('should reject an in-flight cold admission after %s', async (action) => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'screw.shape': 'cube' } } })),
    );
    const publisher = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const published = await publisher.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    publisher.terminate();
    if (published.status !== 'published') {
      throw new Error('Expected a published root.');
    }
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const consumer = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => {
          entered.resolve();
          await release.promise;
        },
      }),
    });
    const controller = new AbortController();
    try {
      const opening = consumer.openAssembly({ root: published.root, signal: controller.signal });
      const rejected = expect(opening).rejects.toThrow();
      await entered.promise;
      if (action === 'abort') {
        controller.abort(new Error('Stopped cold admission.'));
      } else {
        consumer.terminate();
      }
      release.resolve();
      await rejected;
      expect(produce).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      consumer.terminate();
    }
  });

  it('rejects a root pin after its mutable path advances, without evaluating source', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'screw.shape': 'cube' } } })),
    );
    const publisher = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const published = await publisher.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(published.status).toBe('published');
    if (published.status !== 'published') {
      throw new Error('Expected a published root.');
    }
    publisher.terminate();
    const oldBytes = new TextDecoder().decode(await rooted.readFile('scene.json'));
    const newBytes = oldBytes.replace('"generation":1', '"generation":2');
    expect(newBytes).not.toBe(oldBytes);
    await rooted.writeFile('scene.json', new TextEncoder().encode(newBytes));
    const consumer = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const cancellation = new AbortController();
    cancellation.abort(new Error('cancel opening'));
    await expect(consumer.openAssembly({ root: published.root, signal: cancellation.signal })).rejects.toThrow(
      'cancel opening',
    );
    await expect(consumer.openAssembly({ root: published.root })).rejects.toThrow(/pinned digest and length/u);
    expect(produce).toHaveBeenCalledOnce();
    consumer.terminate();
  });

  it('leaves publication uncertain without a host display gate, before producer work or root mutation', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });
    const outcome = await client.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published/scene.json',
    });
    expect(outcome.status).toBe('commit-unknown');
    if (outcome.status !== 'commit-unknown') {
      throw new Error('Expected ambiguous receipt.');
    }
    expect(await outcome.readCurrent()).toEqual({ status: 'absent' });
    expect(produce).not.toHaveBeenCalled();
    expect(await rooted.exists('published/scene.json')).toBe(false);
    client.terminate();
  });

  it('rejects an inline source alias of the root before staging or producer work', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => undefined,
      }),
    });
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'screw.shape': 'good' } } })),
    );
    const first = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(first.status).toBe('published');
    const previous = await rooted.readFile('scene.json');
    produce.mockClear();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(
        assembly({
          source: { files: { 'scene.json': 'clobber root' } },
        }),
      ),
    );
    const outcome = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(outcome).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
    expect(await rooted.readFile('scene.json')).toEqual(previous);
    expect(produce).not.toHaveBeenCalled();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'assembly.json': 'clobber author' } } })),
    );
    const authored = await rooted.readFile('assembly.json');
    const alias = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(alias).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
    expect(await rooted.readFile('assembly.json')).toEqual(authored);
    expect(produce).not.toHaveBeenCalled();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: {
            first: { source: { files: { 'first.shape': 'would stage first' } } },
            second: {
              source: { files: { 'second.shape': 'base' } },
              variants: {
                later: { source: { files: { 'scene.json': 'clobber root from later variant' } } },
              },
            },
          },
          occurrences: [{ id: 'one', part: 'first', transform: identity }],
        }),
      ),
    );
    const later = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(later).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
    expect(await rooted.exists('first.shape')).toBe(false);
    expect(await rooted.readFile('scene.json')).toEqual(previous);
    expect(produce).not.toHaveBeenCalled();
    const samePath = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'assembly.json' });
    expect(samePath).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
    expect(produce).not.toHaveBeenCalled();
    client.terminate();
  });

  it('returns invalid for rejected display and keeps the last coherent root', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const good = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const first = await good.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published/scene.json',
    });
    expect(first.status).toBe('published');
    const original = await rooted.readFile('published/scene.json');
    good.terminate();

    const bad = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => {
          throw new Error('corrupt GLB node');
        },
      }),
    });
    const result = await bad.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published/scene.json',
    });
    expect(result).toMatchObject({
      status: 'invalid',
      issues: [{ code: 'SCENE_DISPLAY_INVALID', message: 'corrupt GLB node' }],
    });
    expect(await rooted.readFile('published/scene.json')).toEqual(original);
    bad.terminate();
  });

  it('pins separate geometry and source revisions when inline recipes reuse one entry path', async () => {
    const { rooted, fileSystem } = await project();
    const seen: string[] = [];
    const kernel = defineKernel({
      id: 'inline-recipe-test',
      name: 'Inline recipes',
      version: '1.0.0',
      extensions: ['shape'],
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve() {
        return { resolved: [], unresolved: [] };
      },
      async describe() {
        const result = createParameterDeclaration();
        return result.success ? { ...result, data: { parameters: result.data } } : result;
      },
      async evaluate({ entryPath }, kernelRuntime) {
        const source = new TextDecoder().decode(await kernelRuntime.filesystem.readFile(entryPath));
        seen.push(source);
        return {
          handle: {
            content: testGlb({
              asset: { version: '2.0' },
              scenes: [{ nodes: [] }],
              scene: 0,
              extras: { source },
            }),
          },
          views: ['model'],
        };
      },
      async render({ handle }) {
        return { content: handle.content };
      },
    });
    const runtime = defineRuntime({ kernels: [kernel()] });
    const source = (text: string) => ({ files: { 'same.shape': text } });
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: {
            left: { source: source('left') },
            right: { source: source('right'), variants: { red: { source: source('red') } } },
          },
          occurrences: [
            { id: 'left', part: 'left', transform: identity },
            { id: 'right', part: 'right', variant: 'red', transform: identity },
          ],
        }),
      ),
    );
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async ({ records, readAsset }) => {
          await Promise.all(
            Object.entries(records).flatMap(([part, record]) =>
              Object.values(record.variants).map(async ({ glb }) => readAsset(part, glb)),
            ),
          );
        },
      }),
    });
    const result = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(result.status).toBe('published');
    if (result.status !== 'published') {
      throw new Error('Expected published inline recipes.');
    }
    expect(seen).toEqual(['left', 'right', 'red']);
    const records = result.admitted.publication.parts;
    const assets = [
      records['left']!.variants['default']!,
      records['right']!.variants['default']!,
      records['right']!.variants['red']!,
    ];
    expect(new Set(assets.map(({ source: revision }) => revision.files['same.shape'])).size).toBe(3);
    expect(new Set(assets.map(({ glb }) => glb.digest)).size).toBe(3);
    for (const [index, { glb }] of assets.entries()) {
      // eslint-disable-next-line no-await-in-loop -- Inspect each returned client-local asset in authored order.
      const bytes = await result.admitted.readAsset(glb.digest);
      expect(new TextDecoder().decode(bytes).includes(seen[index]!)).toBe(true);
    }
    expect(new TextDecoder().decode(await rooted.readFile('same.shape'))).toBe('red');
    client.terminate();
  });

  it('fences concurrent clients through the shared filesystem and observes the winning root', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const arrived = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let count = 0;
    const admitAssemblyDisplay = async (): Promise<void> => {
      if (++count === 2) {
        arrived.resolve();
      }
      await release.promise;
    };
    const events: unknown[] = [];
    const stop = rooted.watch({ paths: ['published/scene.json'] }, (event) => events.push(event));
    const clients = [0, 1].map(() =>
      createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }) }),
    );
    const pending = clients.map(async (client) =>
      client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'published/scene.json' }),
    );
    await arrived.promise;
    release.resolve();
    const results = await Promise.all(pending);
    expect(results.map((result) => result.status).sort()).toEqual(['published', 'superseded']);
    expect(JSON.parse(new TextDecoder().decode(await rooted.readFile('published/scene.json'))).generation).toBe(1);
    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });
    stop();
    for (const client of clients) {
      client.terminate();
    }
  });

  it('retains the previous root when aborted before commit and permits a rooted re-read', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => {
          ready.resolve();
          await release.promise;
        },
      }),
    });
    disposers.push(() => {
      client.terminate();
    });
    const controller = new AbortController();
    const pending = client.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published/scene.json',
      signal: controller.signal,
    });
    await ready.promise;
    controller.abort();
    release.resolve();
    const result = await pending;
    expect(result.status).toBe('commit-unknown');
    if (result.status !== 'commit-unknown') {
      throw new Error('Expected ambiguous receipt.');
    }
    expect(await result.readCurrent()).toEqual({ status: 'absent' });
    expect(await rooted.exists('published/scene.json')).toBe(false);
    expect(result).toHaveProperty('failure', { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED' });
    client.terminate();
  });

  it('reports an ambiguous receipt and re-reads an already committed root after cancellation', async () => {
    const { rooted } = await project();
    const { runtime } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const committed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const fileSystem = fromFileSystemBridge(() =>
      createFileSystemBridgePort({
        ...rooted,
        async writeFileChecked(input) {
          const result = await rooted.writeFileChecked(input);
          if (input.path === 'published/scene.json') {
            committed.resolve();
            await release.promise;
          }
          return result;
        },
      }),
    );
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => undefined,
      }),
    });
    disposers.push(() => {
      client.terminate();
    });
    const controller = new AbortController();
    const pending = client.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published/scene.json',
      signal: controller.signal,
    });
    await committed.promise;
    controller.abort();
    release.resolve();
    const result = await pending;
    expect(result.status).toBe('commit-unknown');
    if (result.status !== 'commit-unknown') {
      throw new Error('Expected ambiguous receipt.');
    }
    await expect(result.readCurrent()).resolves.toMatchObject({ status: 'present', generation: 1 });
    expect(JSON.parse(new TextDecoder().decode(await rooted.readFile('published/scene.json'))).generation).toBe(1);
    expect(result).toHaveProperty('failure', { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED' });
    client.terminate();
  });

  it('reports a lost non-abort receipt after the filesystem commits', async () => {
    const { rooted } = await project();
    const { runtime } = makeRuntime();
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { files: { 'parts/screw.shape': 'cube' } } })),
    );
    const fileSystem = fromFileSystemBridge(() =>
      createFileSystemBridgePort({
        ...rooted,
        async writeFileChecked(input) {
          const result = await rooted.writeFileChecked(input);
          if (input.path === 'scene.json') {
            throw new Error('receipt lost after checked write');
          }
          return result;
        },
      }),
    );
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem,
        admitAssemblyDisplay: async () => undefined,
      }),
    });
    disposers.push(() => {
      client.terminate();
    });
    const result = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(result.status).toBe('commit-unknown');
    if (result.status !== 'commit-unknown') {
      throw new Error('Expected ambiguous receipt.');
    }
    expect(await result.readCurrent()).toMatchObject({ status: 'present', generation: 1 });
    expect(result).toHaveProperty('failure', { name: null, code: null });
    client.terminate();
  });

  it('should keep pre-dispatch cancellation unchanged without a failure observation', async () => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
    });
    const controller = new AbortController();
    controller.abort(new Error('private cancellation reason'));
    try {
      expect(
        await client.publishAssembly({
          authoredPath: 'assembly.json',
          publicationPath: 'scene.json',
          signal: controller.signal,
        }),
      ).toEqual({ status: 'cancelled' });
      expect(await rooted.exists('scene.json')).toBe(false);
      expect(produce).not.toHaveBeenCalled();
    } finally {
      await client.shutdown();
    }
  });

  it('should retain a closed termination observation after Topic disposal and recover storage through a fresh client', async () => {
    const { rooted, fileSystem: freshFileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    await rooted.writeFile('parts/screw.shape', new TextEncoder().encode('cube'));
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { path: 'parts/screw.shape' } })),
    );
    const committed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const replyFinished = Promise.withResolvers<void>();
    const heldReply = { value: false };
    const fileSystem = fromFileSystemBridge(() =>
      createFileSystemBridgePort({
        ...rooted,
        async writeFileChecked(input) {
          const result = await rooted.writeFileChecked(input);
          if (input.path === 'scene.json') {
            heldReply.value = true;
            committed.resolve();
            try {
              await release.promise;
            } finally {
              replyFinished.resolve();
            }
          }
          return result;
        },
      }),
    );
    const base = inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined });
    const owned = base.materialize();
    const lost = Promise.withResolvers<RuntimeTransportCloseResult>();
    const client = createRuntimeClient({
      transport: { ...base, materialize: () => ({ ...owned, closed: lost.promise }) },
    });
    const subscription = new AbortController();
    const removeSubscriptionListener = vi.spyOn(subscription.signal, 'removeEventListener');
    const onError = vi.fn();
    client.on('error', onError, { signal: subscription.signal });
    try {
      const pending = client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
      await committed.promise;
      const bytes = await rooted.readFile('scene.json');
      expect(JSON.parse(new TextDecoder().decode(bytes)).generation).toBe(1);
      lost.resolve({
        cause: 'host-exit',
        phase: 'session',
        exitCode: 7,
        released: false,
        stderrTail: 'private host detail',
      });
      const result = await pending;
      expect(client.lifecycleState).toBe('terminated');
      // The real error Topic removed its signal listener before the operation settled.
      expect(removeSubscriptionListener).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(onError).not.toHaveBeenCalled();
      expect(result.status).toBe('commit-unknown');
      if (result.status !== 'commit-unknown') {
        throw new Error('Expected ambiguous terminated receipt.');
      }
      expect(result.failure).toEqual({ name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED' });
      expect(Object.keys(result.failure).sort()).toEqual(['code', 'name']);
      await expect(result.readCurrent()).rejects.toMatchObject({
        name: 'RuntimeTerminatedError',
        code: 'RUNTIME_TERMINATED',
        message: 'The runtime host exited unexpectedly (exit code 7).',
      });
      expect(await rooted.readFile('scene.json')).toEqual(bytes);
      const root = { path: 'scene.json', digest: await digestContent({ bytes }), byteLength: bytes.byteLength };
      release.resolve();
      await replyFinished.promise;
      await owned.close();
      await rooted.unlink('assembly.json');
      await rooted.unlink('parts/screw.shape');
      const fresh = createRuntimeClient({
        transport: inProcessTransport({
          runtime,
          fileSystem: freshFileSystem,
          admitAssemblyDisplay: async () => undefined,
        }),
      });
      try {
        const document = await fresh.openAssembly({ root });
        const asset = document.admitted.publication.parts['screw']!.variants['default']!.glb;
        expect(await document.admitted.readAsset(asset.digest)).toEqual(emptyGlb());
        expect(produce).toHaveBeenCalledOnce();
        expect(await rooted.readFile('scene.json')).toEqual(bytes);
        document.close();
      } finally {
        await fresh.shutdown();
      }
    } finally {
      release.resolve();
      if (heldReply.value) {
        await replyFinished.promise;
      }
      removeSubscriptionListener.mockRestore();
      client.terminate();
      await owned.close();
    }
  });

  it('should retain an actual Node worker deadline observation after a checked root commit', async () => {
    const { rooted, fileSystem: freshFileSystem } = await project();
    const publicationPath = `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}/scene.json`;
    await rooted.writeFile('parts/screw.shape', new TextEncoder().encode('cube'));
    await rooted.writeFile(
      'assembly.json',
      new TextEncoder().encode(assembly({ source: { path: 'parts/screw.shape' } })),
    );
    const committed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const replyFinished = Promise.withResolvers<void>();
    const heldReply = { value: false };
    const publicationFileSystem = fromFileSystemBridge(() =>
      createFileSystemBridgePort({
        ...rooted,
        async writeFileChecked(input) {
          const result = await rooted.writeFileChecked(input);
          if (input.path === publicationPath) {
            heldReply.value = true;
            committed.resolve();
            try {
              await release.promise;
            } finally {
              replyFinished.resolve();
            }
          }
          return result;
        },
      }),
    );
    const workers: NodeWorker[] = [];
    class TsxWorker extends NodeWorker {
      public constructor(url: string | URL) {
        super(url, { execArgv: ['--import', 'tsx'] });
        workers.push(this);
      }
    }
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('../../test/support/publication-timeout.worker.fixture.ts', import.meta.url),
        workerCtor: TsxWorker,
        fileSystem: freshFileSystem,
        publicationFileSystem,
      }),
    });
    try {
      await client.connect();
      expect(workers[0]?.threadId).toBeGreaterThan(0);
      client.setOperationTimeout(2000);
      const pending = client.publishAssembly({ authoredPath: 'assembly.json', publicationPath });
      await Promise.race([
        committed.promise,
        pending.then((early) => {
          throw new Error(`Publication settled before checked commit: ${early.status}`);
        }),
      ]);
      const bytes = await rooted.readFile(publicationPath);
      expect(JSON.parse(new TextDecoder().decode(bytes)).generation).toBe(1);
      const result = await pending;
      expect(result.status).toBe('commit-unknown');
      if (result.status !== 'commit-unknown') {
        throw new Error('Expected ambiguous timed-out receipt.');
      }
      expect(result.failure).toEqual({ name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT' });
      expect(Object.keys(result.failure).sort()).toEqual(['code', 'name']);
      await vi.waitFor(
        () => {
          expect(client.lifecycleState).toBe('terminated');
        },
        { timeout: 5000 },
      );
      expect(workers[0]?.threadId).toBe(-1);
      await expect(result.readCurrent()).rejects.toMatchObject({
        name: 'RuntimeTerminatedError',
        code: 'RUNTIME_TERMINATED',
      });
      expect(await rooted.readFile(publicationPath)).toEqual(bytes);
      const root = { path: publicationPath, digest: await digestContent({ bytes }), byteLength: bytes.byteLength };
      release.resolve();
      await replyFinished.promise;
      await rooted.unlink('assembly.json');
      await rooted.unlink('parts/screw.shape');
      const fresh = createRuntimeClient({
        transport: inProcessTransport({
          runtime: makeRuntime().runtime,
          fileSystem: freshFileSystem,
          admitAssemblyDisplay: async () => undefined,
        }),
      });
      try {
        const document = await fresh.openAssembly({ root });
        const asset = document.admitted.publication.parts['screw']!.variants['default']!.glb;
        expect(await document.admitted.readAsset(asset.digest)).toEqual(emptyGlb());
        expect(await rooted.readFile(publicationPath)).toEqual(bytes);
        document.close();
      } finally {
        await fresh.shutdown();
      }
    } finally {
      release.resolve();
      if (heldReply.value) {
        await replyFinished.promise;
      }
      client.terminate();
    }
  }, 15_000);

  it.each([
    {
      label: 'actual abort class',
      error: () => new OperationAbortedError('publish', 'private abort detail'),
      failure: { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED' },
    },
    {
      label: 'actual timeout class',
      error: () => new OperationTimeoutError('publish', 'private timeout detail'),
      failure: { name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT' },
    },
    {
      label: 'actual termination class',
      error: () =>
        new RuntimeTerminatedError({ cause: 'host-exit', phase: 'session', stderrTail: 'private host detail' }),
      failure: { name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED' },
    },
    {
      label: 'cross-realm abort',
      error: (): unknown =>
        runInNewContext(
          "Object.assign(new Error('private detail'), { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED', phase: 'publish', payload: 'private payload' })",
        ),
      failure: { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED' },
    },
    {
      label: 'cross-realm timeout',
      error: (): unknown =>
        runInNewContext(
          "Object.assign(new Error('private detail'), { name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT', phase: 'publish', payload: 'private payload' })",
        ),
      failure: { name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT' },
    },
    {
      label: 'cross-realm termination',
      error: (): unknown =>
        runInNewContext(
          "Object.assign(new Error('private detail'), { name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED', causeKind: 'transport-closed', detail: { phase: 'session', stderrTail: 'private host detail' }, payload: 'private payload' })",
        ),
      failure: { name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED' },
    },
    {
      label: 'arbitrary error',
      error: () => new Error('private unrecognized detail', { cause: 'private cause' }),
      failure: { name: null, code: null },
    },
    { label: 'raw string', error: () => 'private raw rejection', failure: { name: null, code: null } },
    { label: 'null rejection', error: () => null, failure: { name: null, code: null } },
    {
      label: 'name-only impostor',
      error: () => ({ name: 'OperationTimeoutError' }),
      failure: { name: null, code: null },
    },
    {
      label: 'mismatched pair',
      error: () => ({
        name: 'RuntimeTerminatedError',
        code: 'RUNTIME_OPERATION_TIMEOUT',
        message: 'private detail',
        causeKind: 'explicit',
      }),
      failure: { name: null, code: null },
    },
    {
      label: 'code-only impostor',
      error: () => ({ code: 'RUNTIME_OPERATION_ABORTED' }),
      failure: { name: null, code: null },
    },
    {
      label: 'missing required phase',
      error: () => ({ name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT', message: 'private detail' }),
      failure: { name: null, code: null },
    },
    {
      label: 'invalid termination cause',
      error: () => ({
        name: 'RuntimeTerminatedError',
        code: 'RUNTIME_TERMINATED',
        message: 'private detail',
        causeKind: 'unknown',
      }),
      failure: { name: null, code: null },
    },
    {
      label: 'throwing name getter',
      error: () => ({
        get name(): string {
          throw new Error('private getter detail');
        },
      }),
      failure: { name: null, code: null },
    },
    {
      label: 'throwing message getter',
      error: () => ({
        name: 'OperationTimeoutError',
        code: 'RUNTIME_OPERATION_TIMEOUT',
        phase: 'publish',
        get message(): string {
          throw new Error('private getter detail');
        },
      }),
      failure: { name: null, code: null },
    },
    {
      label: 'throwing phase getter',
      error: () => ({
        name: 'OperationTimeoutError',
        code: 'RUNTIME_OPERATION_TIMEOUT',
        message: 'private detail',
        get phase(): string {
          throw new Error('private getter detail');
        },
      }),
      failure: { name: null, code: null },
    },
    {
      label: 'throwing termination detail getter',
      error: () => ({
        name: 'RuntimeTerminatedError',
        code: 'RUNTIME_TERMINATED',
        message: 'private detail',
        causeKind: 'transport-closed',
        get detail(): never {
          throw new Error('private getter detail');
        },
      }),
      failure: { name: null, code: null },
    },
  ])('should project only the closed observation for $label', async ({ error, failure }) => {
    const { rooted, fileSystem } = await project();
    const { runtime, produce } = makeRuntime();
    const base = inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined });
    const owned = base.materialize();
    const client = createRuntimeClient({ transport: { ...base, materialize: () => owned } });
    try {
      await client.connect();
      const { channel } = await owned.open();
      const rejection = vi.spyOn(channel, 'call').mockRejectedValueOnce(error());
      try {
        const result = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
        expect(rejection).toHaveBeenCalledOnce();
        expect(rejection).toHaveBeenCalledWith(
          'publishAuthoredAssemblyRoot',
          expect.objectContaining({ publicationPath: 'scene.json' }),
          expect.any(AbortSignal),
        );
        rejection.mockRestore();
        expect(result.status).toBe('commit-unknown');
        if (result.status !== 'commit-unknown') {
          throw new Error('Expected ambiguous dispatch rejection.');
        }
        expect(result.failure).toEqual(failure);
        expect(Object.keys(result.failure).sort()).toEqual(['code', 'name']);
        expect(await result.readCurrent()).toEqual({ status: 'absent' });
        expect(await rooted.exists('scene.json')).toBe(false);
        expect(produce).not.toHaveBeenCalled();
      } finally {
        rejection.mockRestore();
      }
    } finally {
      await client.shutdown();
      await owned.close();
    }
  });
});
