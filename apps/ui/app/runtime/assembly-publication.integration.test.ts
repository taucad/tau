// @vitest-environment node
// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB-backed project authority.
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mock } from 'vitest-mock-extended';
import { z } from 'zod';
import { createActor, waitFor } from 'xstate';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { parentDirectory } from '@taucad/utils/path';
import { cadMachine, disposeCadRuntime, selectCadAdmittedAssembly, selectCadDisplay } from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import type { PageKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { captureSettledCadImages } from '#services/headless-capture.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import { measureExactOccurrenceDistance } from '#workers/measurement-exact.client.js';
import { createNodeIo, validateAdmittedAssemblyGlb, writeGlb } from '@taucad/geometry-core';
import type { TauCadTopologyRoot } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { digestContent } from '@taucad/cache-core';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type * as FileSystemBridgeModule from '@taucad/fs-bridge';
import { sha256String } from '@taucad/utils/hash';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { defineKernel } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { createAssemblyPublicationAuthority, admitAssemblyDisplay } from '#runtime/assembly-display-admission.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { captureGltfAssemblyPlacements } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';

vi.mock('@taucad/fs-bridge', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystemBridgeModule>();
  return { ...original, createFileSystemBridgePort: vi.fn(original.createFileSystemBridgePort) };
});

let sequence = 0;
let producerCalls = 0;
const disposers: Array<() => void> = [];
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const encoder = new TextEncoder();
type RootedProject = Awaited<ReturnType<typeof project>>['rooted'];

const readStoredLogicalRoot = async (rooted: RootedProject, path: string) => {
  const pointer = z
    .object({
      generation: z.number(),
      manifest: z.object({ path: z.string(), digest: z.string(), byteLength: z.number() }),
    })
    .loose()
    .parse(JSON.parse(new TextDecoder().decode(await rooted.readFile(path))));
  const manifestBytes = await rooted.readFile(pointer.manifest.path);
  expect(manifestBytes.byteLength).toBe(pointer.manifest.byteLength);
  expect(await digestContent({ bytes: manifestBytes })).toBe(pointer.manifest.digest);
  const manifest = z
    .object({ chunks: z.array(z.object({ path: z.string(), digest: z.string(), byteLength: z.number() })) })
    .loose()
    .parse(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const asset of manifest.chunks) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Read chunks in manifest order and stop at the first failed pin.
    const bytes = await rooted.readFile(asset.path);
    expect(bytes.byteLength).toBe(asset.byteLength);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each chunk before admitting the next read.
    expect(await digestContent({ bytes })).toBe(asset.digest);
    chunks.push(bytes);
  }
  const content = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return z
    .object({
      schemaVersion: z.literal(1),
      generation: z.number(),
      parts: z.record(z.string(), z.object({ path: z.string(), digest: z.string() })),
      occurrences: z.array(z.unknown()),
    })
    .parse(JSON.parse(new TextDecoder().decode(content)));
};

const writeStoredLogicalRoot = async (
  rooted: RootedProject,
  path: string,
  logical: Awaited<ReturnType<typeof readStoredLogicalRoot>>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const content = encoder.encode(JSON.stringify(logical));
  expect(content.byteLength).toBeLessThanOrEqual(1_048_576);
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const storage = parent ? `${parent}/roots/sha256` : 'roots/sha256';
  await rooted.mkdir(storage, { recursive: true });
  const digest = await digestContent({ bytes: content });
  const chunk = { path: `${storage}/${digest.slice(7)}.chunk`, digest, byteLength: content.byteLength };
  await rooted.writeFile(chunk.path, content);
  const manifestBytes = encoder.encode(
    JSON.stringify({ schemaVersion: 1, content: { digest, byteLength: content.byteLength }, chunks: [chunk] }),
  );
  const manifestDigest = await digestContent({ bytes: manifestBytes });
  const manifest = {
    path: `${storage}/${manifestDigest.slice(7)}.json`,
    digest: manifestDigest,
    byteLength: manifestBytes.byteLength,
  };
  await rooted.writeFile(manifest.path, manifestBytes);
  const pointer = encoder.encode(JSON.stringify({ schemaVersion: 2, generation: logical.generation, manifest }));
  await rooted.writeFile(path, pointer);
  return pointer;
};
const triangle = writeGlb({
  nodes: [
    {
      name: 'triangle',
      extras: { tauComponentId: 'triangle-face' },
      primitives: [
        {
          mode: 4,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          material: { name: 'steel' },
        },
      ],
    },
  ],
});
const missingComponentId = writeGlb({
  nodes: [
    {
      name: 'triangle',
      primitives: [
        {
          mode: 4,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          material: { name: 'steel' },
        },
      ],
    },
  ],
});

const project = async () => {
  const registry = new ProviderRegistry({ databasePrefix: `assembly-host-${sequence++}` });
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
    service,
    rooted,
    provider,
    mountTable,
    storageRootKey: registry.resolveStorageRootKey(scope),
    fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(rooted)),
  };
};

const kernel = defineKernel({
  id: 'host-assembly',
  name: 'Host assembly',
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
    return {
      success: true,
      data: {
        parameters: {
          defaults: {},
          schema: {
            $schema: 'https://json-structure.org/meta/extended/v0/#',
            $id: 'urn:taucad:test:host-assembly-parameters',
            $uses: ['JSONSchemaUnits'],
            name: 'HostAssemblyParameters',
            type: 'object',
          },
        },
      },
      issues: [],
    };
  },
  async evaluate({ entryPath }, runtime) {
    producerCalls++;
    const text = new TextDecoder().decode(await runtime.filesystem.readFile(entryPath));
    return {
      handle: {
        geometry: { format: 'gltf', content: text === 'bad' ? missingComponentId : triangle },
        nativeHandle: {},
      },
      views: ['model'],
    };
  },
  async render({ handle }) {
    return { content: handle.geometry.content };
  },
})();

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

it('admits a real mesh through the host adapter and keeps the committed root when the next GLB is malformed', async () => {
  const { rooted, fileSystem } = await project();
  const runtime = defineRuntime({ kernels: [kernel] });
  const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }) });
  const authored = (text: string) =>
    JSON.stringify({
      schemaVersion: 1,
      parts: { triangle: { source: { files: { 'triangle.shape': text } } } },
      occurrences: [{ id: 'one', part: 'triangle', transform: identity }],
    });
  await rooted.writeFile('assembly.json', encoder.encode(authored('good')));
  const first = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
  expect(first.status, JSON.stringify(first)).toBe('published');
  if (first.status !== 'published') {
    throw new Error('Expected admitted mesh.');
  }
  expect(first.generation).toBe(1);
  expect(first.admitted.publication.parts['triangle']?.variants['default']).toBeDefined();
  expect(
    await first.admitted.readAsset(first.admitted.publication.parts['triangle']!.variants['default']!.glb.digest),
  ).toEqual(triangle);
  const committed = await rooted.readFile('scene.json');

  await rooted.writeFile('assembly.json', encoder.encode(authored('bad')));
  const second = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
  expect(second).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_DISPLAY_INVALID' }] });
  expect(await rooted.readFile('scene.json')).toEqual(committed);
  client.terminate();
  await rooted.unlink('assembly.json');
  await rooted.unlink('triangle.shape');
  const cold = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }) });
  const reopened = await cold.openAssembly({ root: first.root });
  expect(
    await reopened.admitted.readAsset(reopened.admitted.publication.parts['triangle']!.variants['default']!.glb.digest),
  ).toEqual(triangle);
  cold.terminate();
});

it('rejects a hash-valid legacy GLB without a required component ID on cold reopen', async () => {
  const { rooted, fileSystem } = await project();
  const runtime = defineRuntime({ kernels: [kernel] });
  await rooted.writeFile(
    'assembly.json',
    encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: { triangle: { source: { files: { 'triangle.shape': 'bad' } } } },
        occurrences: [{ id: 'one', part: 'triangle', transform: identity }],
      }),
    ),
  );
  const legacy = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay: async () => undefined }),
  });
  const published = await legacy.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
  expect(published.status).toBe('published');
  if (published.status !== 'published') {
    throw new Error('Expected a hash-valid legacy publication.');
  }
  expect(
    await published.admitted.readAsset(
      published.admitted.publication.parts['triangle']!.variants['default']!.glb.digest,
    ),
  ).toEqual(missingComponentId);
  legacy.terminate();
  await rooted.unlink('assembly.json');
  await rooted.unlink('triangle.shape');

  const consumer = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }),
  });
  await expect(consumer.openAssembly({ root: published.root })).rejects.toThrow();
  consumer.terminate();
});

it.each(['jscad', 'picovoxel'])(
  'opens the %s mixed scene through the real CAD actor without source evaluation',
  async (family) => {
    const { rooted } = await project();
    const example = new URL(
      `../../../../libs/tau-examples/src/kernels/replicad/${family}-part-reuse/`,
      import.meta.url,
    );
    const rootBytes = new Uint8Array(await readFile(fileURLToPath(new URL('scene.json', example))));
    await rooted.writeFile('scene.json', rootBytes);
    const assets = await readdir(fileURLToPath(new URL('assets/', example)), { recursive: true });
    await Promise.all(
      ['assets', 'roots'].map(async (directory) => {
        const files =
          directory === 'assets'
            ? assets
            : await readdir(fileURLToPath(new URL('roots/', example)), { recursive: true });
        await Promise.all(
          files
            .filter((path) => /\.(?:json|glb|stl|chunk)$/u.test(path))
            .map(async (path) => {
              const relative = `${directory}/${path}`;
              await rooted.mkdir(parentDirectory(relative), { recursive: true });
              await rooted.writeFile(
                relative,
                new Uint8Array(await readFile(fileURLToPath(new URL(relative, example)))),
              );
            }),
        );
      }),
    );
    expect(await rooted.exists('main.ts')).toBe(false);
    expect(await rooted.exists('upstream.ts')).toBe(false);
    expect(await rooted.exists('.tau/cache')).toBe(false);
    const agent = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
    const contentService = mock<FileContentService>();
    let releaseFirstRead!: () => void;
    const firstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    contentService.readRawBytes.mockImplementation(async (path) => {
      await firstRead;
      return rooted.readFile(path);
    });
    let notifyRoot: (() => void) | undefined;
    const unsubscribe = vi.fn();
    contentService.subscribe.mockImplementation((_path, listener) => {
      notifyRoot = listener;
      return unsubscribe;
    });
    const openFileSystemBridge = vi.fn((_root: string, consumer: 'agent' | 'user' | 'working-copy') =>
      createFileSystemBridgePort(consumer === 'agent' ? agent : rooted),
    );
    const fileManagerSnapshot = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>({
      status: 'active',
      context: mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>({
        rootDirectory: '/',
        contentService,
        openFileSystemBridge,
      }),
    });
    vi.mocked(fileManagerSnapshot.matches).mockReturnValue(true);
    const fileManager = mock<NonNullable<CadContext['fileManagerRef']>>({
      getSnapshot: () => fileManagerSnapshot,
      subscribe: () => ({ unsubscribe: vi.fn() }),
    });
    const runtime = defineRuntime({ kernels: [] });
    const actor = createActor(cadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        operationTimeout: 0,
        fileManagerRef: fileManager,
        fileSystemRoot: '/',
        kernelOptionsFactory:
          async () =>
          ({ fileSystem }) => ({
            transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }),
          }),
      },
    }).start();
    try {
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      const client = actor.getSnapshot().context.kernelClient;
      if (!client) {
        throw new Error('CAD actor did not connect its actual runtime client.');
      }
      const ordinaryOpen = vi.spyOn(client, 'open');
      const publish = vi.spyOn(client, 'publishAssembly');
      const open = vi.spyOn(client, 'openAssembly');
      const exportPin = vi.spyOn(client, 'exportPublished');
      actor.send({ type: 'setEntryPath', entryPath: 'scene.json' });
      actor.send({ type: 'stateChanged', state: 'idle' });
      actor.send({ type: 'documentStatusChanged', status: 'evaluating' });
      actor.send({
        type: 'documentEvaluated',
        evaluation: { success: false, id: 'old-source', transient: false, issues: [] },
      });
      actor.send({ type: 'parametersParsed', manifest: mock() });
      actor.send({
        type: 'documentDescribed',
        description: mock<Extract<Parameters<typeof actor.send>[0], { type: 'documentDescribed' }>['description']>({
          kernelId: 'prior-source',
          success: true,
        }),
      });
      actor.send({ type: 'kernelIssue', errors: [] });
      expect(actor.getSnapshot().context.parameterManifest).toBeUndefined();
      expect(actor.getSnapshot().context.activeKernelId).toBeUndefined();
      expect(actor.getSnapshot().context.kernelIssues.size).toBe(0);
      expect(actor.getSnapshot().matches({ rendering: 'submitting' })).toBe(true);
      expect(actor.getSnapshot().context.latestRenderingOutcome).toBeUndefined();
      releaseFirstRead();
      await waitFor(actor, (snapshot) => snapshot.context.latestRenderingOutcome === 'success');
      expect(openFileSystemBridge).toHaveBeenCalledWith('/', 'agent');
      expect(open).toHaveBeenCalledOnce();
      expect(open.mock.calls[0]?.[0].root).toEqual({
        path: 'scene.json',
        digest: await digestContent({ bytes: rootBytes }),
        byteLength: rootBytes.byteLength,
      });
      expect(contentService.subscribe).toHaveBeenCalledWith('scene.json', expect.any(Function));
      const committed = actor.getSnapshot().context.committedAssemblyDisplay;
      const admitted = actor.getSnapshot().context.admittedAssembly;
      expect(admitted).toBeDefined();
      if (!admitted || !committed) {
        throw new Error('Expected the actual admitted reader.');
      }
      expect(selectCadAdmittedAssembly(actor.getSnapshot())).toBe(admitted);
      expect(admitted.publication).toBe(actor.getSnapshot().context.publishedAssembly);
      expect(committed.document).toBe(await open.mock.results[0]?.value);
      expect(selectCadDisplay(actor.getSnapshot())).toBe(committed);
      expect(actor.getSnapshot().context.rendering).toBeUndefined();
      expect(actor.getSnapshot().context.committedRendering).toBeUndefined();
      expect(exportPin).not.toHaveBeenCalled();
      const pin = actor.getSnapshot().context.publishedAssemblyRoot;
      if (!pin) {
        throw new Error('Expected admitted scene pin.');
      }
      const exported = await committed.document.exportPublished({ format: 'glb', publishedAssembly: { root: pin } });
      expect(exported.success).toBe(true);
      if (!exported.success || !exported.files[0]) {
        throw new Error('Expected explicit pinned assembly export.');
      }
      const selected = actor.getSnapshot();
      expect(
        selectCadDisplay({ ...selected, context: { ...selected.context, entryPath: 'other.json' } }),
      ).toBeUndefined();
      expect(
        selectCadDisplay({
          ...selected,
          context: {
            ...selected.context,
            publishedAssemblyRoot: { ...pin },
          },
        }),
      ).toBeUndefined();
      expect(
        selectCadDisplay({
          ...selected,
          context: {
            ...selected.context,
            publishedAssembly: { ...admitted.publication },
          },
        }),
      ).toBeUndefined();
      const projectedBytes = exported.files[0].bytes;
      const io = await createNodeIo();
      const document = await io.readBinary(projectedBytes);
      const topology = z
        .object({
          components: z.array(
            z.object({
              id: z.string(),
              name: z.string().optional(),
              capabilities: z.object({ hasPreciseTopology: z.boolean().optional() }).optional(),
            }),
          ),
        })
        .parse(document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload());
      const componentIds = topology.components.map(({ id }) => id);
      expect(new Set(componentIds).size).toBe(componentIds.length);
      expect(topology.components.filter(({ name }) => name === 'source-mesh')).toHaveLength(1);
      expect(topology.components.filter(({ name }) => name === 'mount')).toHaveLength(1);
      expect(
        topology.components.find(({ name }) => name === 'Imported mesh insert')?.capabilities?.hasPreciseTopology,
      ).toBe(false);
      const imageExport = vi
        .fn<HeadlessImageService['export']>()
        .mockResolvedValue([{ name: 'scene.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) }]);
      await captureSettledCadImages({
        cadSnapshot: actor.getSnapshot(),
        imageService: { export: imageExport },
        recipe: { purpose: 'agent', mode: 'isometric', includeEdges: false },
      });
      expect(imageExport).toHaveBeenCalledWith(
        expect.objectContaining({
          content: projectedBytes,
          geometryHash: pin.digest,
          sourcePath: 'scene.json',
        }),
      );
      const metadata = await validateAdmittedAssemblyGlb({
        ...admitted.publication,
        readAsset: async (_part, asset) => rooted.readFile(asset.path),
      });
      const queryIds = metadata.components
        .filter(({ sourceComponentId }) => sourceComponentId !== undefined)
        .slice(0, 2)
        .map(({ component }) => component.id);
      expect(queryIds).toHaveLength(2);
      const placements = captureGltfAssemblyPlacements({ display: committed, metadata }, queryIds, {
        mechanism: undefined,
        pose: undefined,
        revision: 0,
      });
      expect(placements).toHaveLength(2);
      const manifest = buildGltfComponentManifest(projectedBytes, {
        sourceFile: 'scene.json',
        geometryHash: pin.digest,
      });
      expect(queryIds.every((id) => manifest.nodesById[id] !== undefined)).toBe(true);
      const exact = await measureExactOccurrenceDistance({
        cadRef: actor,
        manifest,
        presentedGeometryHash: pin.digest,
        occurrenceA: queryIds[0]!,
        occurrenceB: queryIds[1]!,
        assemblyPose: {
          root: pin,
          placements: placements!,
          isCurrent: () => selectCadDisplay(actor.getSnapshot()) === committed,
        },
      });
      expect(exact).toEqual({
        status: 'unavailable',
        reason: 'This pinned scene has no direct installed Replicad exact export route.',
      });

      actor.send({ type: 'parametersParsed', manifest: mock() });
      actor.send({
        type: 'documentDescribed',
        description: mock<Extract<Parameters<typeof actor.send>[0], { type: 'documentDescribed' }>['description']>({
          kernelId: 'prior-source',
          success: true,
        }),
      });
      actor.send({ type: 'kernelIssue', errors: [] });
      actor.send({
        type: 'documentEvaluated',
        evaluation: { success: false, id: 'old-source', transient: false, issues: [] },
      });
      expect(actor.getSnapshot().context.parameterManifest).toBeUndefined();
      expect(actor.getSnapshot().context.activeKernelId).toBeUndefined();
      expect(actor.getSnapshot().context.latestRenderingOutcome).toBe('success');
      expect(actor.getSnapshot().context.kernelIssues.size).toBe(0);
      expect(ordinaryOpen).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      const rootDocument = await readStoredLogicalRoot(rooted, 'scene.json');
      // A changed root must not admit a closure whose required GLB lost its pinned digest.
      const displayAsset = assets.find((path) => path.endsWith('.glb'));
      if (!displayAsset) {
        throw new Error('Packaged fixture has no display asset.');
      }
      const displayPath = `assets/${displayAsset}`;
      const displayBytes = await rooted.readFile(displayPath);
      await rooted.writeFile(displayPath, encoder.encode('digest mismatch'));
      await writeStoredLogicalRoot(rooted, 'scene.json', { ...rootDocument, generation: rootDocument.generation + 1 });
      notifyRoot?.();
      await waitFor(actor, (snapshot) => snapshot.matches('error'));
      expect(actor.getSnapshot().context.latestRenderingOutcome).toBe('failure');
      expect(actor.getSnapshot().context.lastSettledRenderId).toBe(actor.getSnapshot().context.lastRequestedRenderId);
      expect(actor.getSnapshot().context.committedAssemblyDisplay).toBe(committed);
      expect(selectCadAdmittedAssembly(actor.getSnapshot())).toBe(admitted);
      expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(await digestContent({ bytes: rootBytes }));
      await rooted.writeFile(displayPath, displayBytes);

      // A structurally valid replacement root with a missing record must preserve the committed pin.
      const missingRecordRoot = {
        ...rootDocument,
        parts: Object.fromEntries(
          Object.entries(rootDocument.parts).map(([name, reference]) => [
            name,
            { ...reference, path: 'assets/parts/sha256/missing.json' },
          ]),
        ),
      };
      await writeStoredLogicalRoot(rooted, 'scene.json', missingRecordRoot);
      notifyRoot?.();
      await waitFor(actor, (snapshot) => snapshot.matches('error'));
      expect(actor.getSnapshot().context.latestRenderingOutcome).toBe('failure');
      expect(actor.getSnapshot().context.lastSettledRenderId).toBe(actor.getSnapshot().context.lastRequestedRenderId);
      expect(actor.getSnapshot().context.committedAssemblyDisplay).toBe(committed);
      expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(await digestContent({ bytes: rootBytes }));

      // A valid same-path generation replaces geometry and its exact root pin together.
      const nextBytes = await writeStoredLogicalRoot(rooted, 'scene.json', {
        ...rootDocument,
        generation: rootDocument.generation + 1,
      });
      notifyRoot?.();
      await waitFor(actor, (snapshot) => snapshot.context.latestRenderingOutcome === 'success');
      const replacement = actor.getSnapshot().context.committedAssemblyDisplay;
      expect(replacement).not.toBe(committed);
      expect(selectCadAdmittedAssembly(actor.getSnapshot())).not.toBe(admitted);
      expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(await digestContent({ bytes: nextBytes }));

      /* oxlint-disable eslint/no-await-in-loop -- Each root replacement must settle before the next edit to preserve the selected subject. */
      for (const invalidRoot of ['{"generation":1}', '{', '{"ordinary":true}']) {
        await rooted.writeFile('scene.json', encoder.encode(invalidRoot));
        notifyRoot?.();
        await waitFor(actor, (snapshot) => snapshot.matches('error'));
        expect(actor.getSnapshot().context.latestRenderingOutcome).toBe('failure');
        expect(actor.getSnapshot().context.lastSettledRenderId).toBe(actor.getSnapshot().context.lastRequestedRenderId);
        expect(actor.getSnapshot().context.committedAssemblyDisplay).toBe(replacement);
        expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(
          await digestContent({ bytes: nextBytes }),
        );
      }
      /* oxlint-enable eslint/no-await-in-loop */
      expect(ordinaryOpen).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    } finally {
      disposeCadRuntime(actor.getSnapshot().context);
      actor.stop();
      agent.dispose();
    }
    expect(unsubscribe).toHaveBeenCalledTimes(vi.mocked(contentService.subscribe).mock.calls.length);
  },
);

it('keeps host publication writes scoped and preserves the evaluator records mask', async () => {
  const { rooted } = await project();
  const agent = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
  const authoredPath = 'assembly.json';
  const parent = `.tau/artifacts/reusable-parts/${await sha256String(authoredPath)}`;
  const authored = (id: string) =>
    encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: { triangle: { source: { files: { 'triangle.shape': 'good' } } } },
        occurrences: [{ id, part: 'triangle', transform: identity }],
      }),
    );
  await rooted.writeFile(authoredPath, authored('one'));
  const originalWrite = rooted.writeFileChecked.bind(rooted);
  const write = vi.spyOn(rooted, 'writeFileChecked');
  const controller = new AbortController();
  const authority = await createAssemblyPublicationAuthority(
    () => createFileSystemBridgePort(rooted),
    controller.signal,
  );
  const runtime = defineRuntime({ kernels: [kernel] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      admitAssemblyDisplay,
      fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(agent)),
      publicationFileSystem: authority.fileSystem,
    }),
  });
  try {
    await client.connect();
    const wrapper = vi
      .mocked(createFileSystemBridgePort)
      .mock.calls.findLast(([provider]) => provider.id === 'ui:reusable-parts-publication')?.[0];
    if (!wrapper?.writeFileChecked) {
      throw new Error('Expected actual complete scoped publication provider.');
    }
    await expect(wrapper.writeFile('main.ts', encoder.encode('bad'))).rejects.toThrow();
    await expect(wrapper.writeFile(`${parent}/scene.json`, encoder.encode('bad'))).rejects.toThrow();
    await expect(wrapper.rename(`${parent}/scene.json`, 'main.ts')).rejects.toThrow();
    await expect(
      wrapper.writeFileChecked({
        path: `${parent}/scene.json`,
        data: encoder.encode('bad'),
        preconditions: [{ path: 'main.ts', expected: null }],
      }),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    const wrongEntry = await client.publishAssembly({
      authoredPath,
      publicationPath: '.tau/artifacts/reusable-parts/other-entry/scene.json',
    });
    expect(wrongEntry.status).toBe('invalid');
    expect(write).not.toHaveBeenCalled();
    const published = await client.publishAssembly({ authoredPath, publicationPath: `${parent}/scene.json` });
    expect(published.status, JSON.stringify(published)).toBe('published');
    expect(write).toHaveBeenCalled();
    expect(
      write.mock.calls.every(
        ([input]) =>
          input.path.startsWith(`${parent}/`) &&
          input.preconditions.every((condition) => condition.path.startsWith(`${parent}/`)),
      ),
    ).toBe(true);
    await expect(agent.writeFile(`${parent}/scene.json`, encoder.encode('bad'))).rejects.toThrow();
    const sibling = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        admitAssemblyDisplay,
        fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(agent)),
        publicationFileSystem: authority.fileSystem,
      }),
    });
    await sibling.connect();
    let releaseCommit!: () => void;
    let reachedCommit!: () => void;
    const commitHeld = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commitReached = new Promise<void>((resolve) => {
      reachedCommit = resolve;
    });
    let holdNextRoot = true;
    write.mockImplementation(async (input) => {
      if (input.path === `${parent}/scene.json` && holdNextRoot) {
        holdNextRoot = false;
        reachedCommit();
        await commitHeld;
      }
      return originalWrite(input);
    });
    try {
      const delayed = client.publishAssembly({ authoredPath, publicationPath: `${parent}/scene.json` });
      await commitReached;
      // A changed authored placement makes the sibling produce a new generation instead of reusing the persisted root.
      await rooted.writeFile(authoredPath, authored('two'));
      const winner = await sibling.publishAssembly({ authoredPath, publicationPath: `${parent}/scene.json` });
      expect(winner.status).toBe('published');
      expect(winner).toMatchObject({ generation: 2 });
      const winnerBytes = await rooted.readFile(`${parent}/scene.json`);
      releaseCommit();
      const delayedOutcome = await delayed;
      expect(delayedOutcome.status).toBe('superseded');
      expect(await rooted.readFile(`${parent}/scene.json`)).toEqual(winnerBytes);
    } finally {
      releaseCommit();
      sibling.terminate();
      write.mockImplementation(originalWrite);
    }
    authority.dispose();
    await expect(
      wrapper.writeFileChecked({ path: `${parent}/scene.json`, data: encoder.encode('bad'), preconditions: [] }),
    ).rejects.toThrow('disposed');
  } finally {
    client.terminate();
    authority.dispose();
    agent.dispose();
  }
});

it('releases sibling publication connections and the host proxy after one port disposal throws', async () => {
  const { rooted } = await project();
  const connectionStart = vi.mocked(createFileSystemBridgePort).mock.calls.length;
  const userConnection = createFileSystemBridgePort(rooted);
  const userDispose = vi.spyOn(userConnection, 'dispose');
  const authority = await createAssemblyPublicationAuthority(() => userConnection, new AbortController().signal);
  const runtime = defineRuntime({ kernels: [] });
  const first = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(rooted)),
      publicationFileSystem: authority.fileSystem,
    }),
  });
  const second = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(rooted)),
      publicationFileSystem: authority.fileSystem,
    }),
  });
  await first.connect();
  await second.connect();
  const owned = vi.mocked(createFileSystemBridgePort).mock.calls.flatMap(([provider], index) => {
    const result = vi.mocked(createFileSystemBridgePort).mock.results[index];
    return index >= connectionStart && provider.id === 'ui:reusable-parts-publication' && result?.type === 'return'
      ? [result.value]
      : [];
  });
  const [firstPort, secondPort] = owned;
  if (!firstPort || !secondPort) {
    throw new Error('Expected both real publication binding ports.');
  }
  const originalDispose = firstPort.dispose;
  const firstDispose = vi.spyOn(firstPort, 'dispose').mockImplementation(() => {
    originalDispose();
    throw new Error('injected publication connection disposal failure');
  });
  const secondDispose = vi.spyOn(secondPort, 'dispose');
  const disposalError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    authority.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(userDispose).toHaveBeenCalledOnce();
    authority.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  } finally {
    firstDispose.mockRestore();
    secondDispose.mockRestore();
    userDispose.mockRestore();
    disposalError.mockRestore();
    first.terminate();
    second.terminate();
    authority.dispose();
  }
});

it('closes a host publication bridge when admission is aborted before its ready handshake', async () => {
  const { rooted } = await project();
  const connection = createFileSystemBridgePort(rooted);
  const dispose = vi.fn(connection.dispose);
  const controller = new AbortController();
  const opening = createAssemblyPublicationAuthority(() => ({ port: connection.port, dispose }), controller.signal);
  controller.abort();
  await expect(opening).rejects.toThrow();
  expect(dispose).toHaveBeenCalledOnce();
});

it('should keep source and pinned reads available on a read-only host while denying authored publication', async () => {
  const { rooted, fileSystem } = await project();
  const runtime = defineRuntime({ kernels: [kernel] });
  const authoredBytes = encoder.encode(
    JSON.stringify({
      schemaVersion: 1,
      parts: { triangle: { source: { path: 'triangle.shape' } } },
      occurrences: [{ id: 'one', part: 'triangle', transform: identity }],
    }),
  );
  await rooted.writeFile('triangle.shape', encoder.encode('good'));
  await rooted.writeFile('assembly.json', authoredBytes);
  const publisher = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem, admitAssemblyDisplay }),
  });
  let rootBytes: Uint8Array<ArrayBuffer>;
  try {
    const outcome = await publisher.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(outcome.status).toBe('published');
    rootBytes = await rooted.readFile('scene.json');
  } finally {
    publisher.terminate();
  }
  const denyMutation = vi.fn(async (): Promise<never> => {
    throw new Error('Read-only authority cannot mutate project bytes.');
  });
  const readOnly = {
    ...rooted,
    capabilities: { ...rooted.capabilities, writable: false },
    writeFile: denyMutation,
    writeFileChecked: denyMutation,
    mkdir: denyMutation,
    unlink: denyMutation,
    rmdir: denyMutation,
    rename: denyMutation,
  };
  const contentService = mock<FileContentService>();
  contentService.readRawBytes.mockImplementation(async (path) => rooted.readFile(path));
  contentService.subscribe.mockReturnValue(() => undefined);
  const openFileSystemBridge = vi.fn(() => createFileSystemBridgePort(readOnly));
  const snapshot = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>({
    context: mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>({
      rootDirectory: '/',
      contentService,
      openFileSystemBridge,
    }),
  });
  vi.mocked(snapshot.matches).mockReturnValue(true);
  const fileManagerRef = mock<NonNullable<CadContext['fileManagerRef']>>({
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: vi.fn() }),
  });
  const options = vi.fn<PageKernelOptionsFactory>(({ fileSystem, publicationFileSystem }) => ({
    transport: inProcessTransport({ runtime, fileSystem, publicationFileSystem, admitAssemblyDisplay }),
  }));
  const actor = createActor(cadMachine, {
    input: {
      shouldInitializeKernelOnStart: false,
      operationTimeout: 0,
      fileManagerRef,
      fileSystemRoot: '/',
      kernelOptionsFactory: async () => options,
    },
  }).start();
  try {
    await waitFor(actor, (state) => state.matches('idle'));
    expect(options.mock.calls[0]?.[0].publicationFileSystem).toBeUndefined();
    expect(actor.getSnapshot().context.assemblyPublicationWritable).toBe(false);
    actor.send({ type: 'setEntryPath', entryPath: 'triangle.shape' });
    await waitFor(actor, (state) => state.context.latestRenderingOutcome === 'success');
    const committed = actor.getSnapshot().context.committedRendering;
    expect(committed?.success && committed.artifact.mimeType).toBe('model/gltf-binary');
    actor.send({ type: 'setEntryPath', entryPath: 'scene.json' });
    await waitFor(actor, (state) => state.context.latestRenderingOutcome === 'success');
    expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(await digestContent({ bytes: rootBytes }));
    expect(actor.getSnapshot().context.rendering).toBeUndefined();
    expect(actor.getSnapshot().context.committedRendering).toBeUndefined();
    expect(selectCadAdmittedAssembly(actor.getSnapshot())).toBeDefined();
    const calls = producerCalls;
    const mutationCalls = denyMutation.mock.calls.length;
    const client = actor.getSnapshot().context.kernelClient;
    if (!client) {
      throw new Error('Expected a connected read-only runtime.');
    }
    const publish = vi.spyOn(client, 'publishAssembly');
    actor.send({ type: 'setEntryPath', entryPath: 'assembly.json' });
    await waitFor(actor, (state) => state.matches('error'));
    expect([...actor.getSnapshot().context.kernelIssues.values()].flat()[0]?.message).toContain('read-only');
    expect(publish).not.toHaveBeenCalled();
    const refused = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'scene.json' });
    expect(refused.status).toBe('invalid');
    if (refused.status !== 'invalid') {
      throw new Error('Expected read-only authored publication denial.');
    }
    expect(refused.issues[0]?.message).toContain('read-only');
    expect(producerCalls).toBe(calls);
    expect(denyMutation).toHaveBeenCalledTimes(mutationCalls);
    expect(await rooted.readFile('scene.json')).toEqual(rootBytes);
    expect(await rooted.readFile('assembly.json')).toEqual(authoredBytes);
  } finally {
    disposeCadRuntime(actor.getSnapshot().context);
    actor.stop();
  }
});

it('publishes an authored CAD entry through host authority and refreshes its root without another producer', async () => {
  const { rooted } = await project();
  const agent = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
  await rooted.writeFile(
    'assembly.json',
    encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: { triangle: { source: { files: { 'triangle.shape': 'good' } } } },
        occurrences: [
          { id: 'left', part: 'triangle', transform: identity },
          { id: 'right', part: 'triangle', transform: identity },
        ],
      }),
    ),
  );
  const contentService = mock<FileContentService>();
  contentService.readRawBytes.mockImplementation(async (path) => rooted.readFile(path));
  const listeners = new Map<string, () => void>();
  contentService.subscribe.mockImplementation((path, listener) => {
    if (!path) {
      throw new Error('Expected a bounded selected entry subscription.');
    }
    listeners.set(path, listener);
    return () => {
      listeners.delete(path);
    };
  });
  const openFileSystemBridge = vi.fn((_root: string, consumer: 'agent' | 'user' | 'working-copy') =>
    createFileSystemBridgePort(consumer === 'agent' ? agent : rooted),
  );
  const snapshot = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>({
    status: 'active',
    context: mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>({
      rootDirectory: '/',
      contentService,
      openFileSystemBridge,
    }),
  });
  vi.mocked(snapshot.matches).mockReturnValue(true);
  const fileManagerRef = mock<NonNullable<CadContext['fileManagerRef']>>({
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: vi.fn() }),
  });
  const runtime = defineRuntime({ kernels: [kernel] });
  const actor = createActor(cadMachine, {
    input: {
      shouldInitializeKernelOnStart: false,
      operationTimeout: 0,
      fileManagerRef,
      fileSystemRoot: '/',
      kernelOptionsFactory:
        async () =>
        ({ fileSystem, publicationFileSystem }) => ({
          transport: inProcessTransport({ runtime, fileSystem, publicationFileSystem, admitAssemblyDisplay }),
        }),
    },
  }).start();
  try {
    await waitFor(actor, (state) => state.matches('idle'));
    const client = actor.getSnapshot().context.kernelClient;
    if (!client) {
      throw new Error('Expected connected actual CAD client.');
    }
    const publish = vi.spyOn(client, 'publishAssembly');
    actor.send({ type: 'setEntryPath', entryPath: 'assembly.json' });
    await waitFor(actor, (state) => state.context.latestRenderingOutcome === 'success');
    const root = actor.getSnapshot().context.publishedAssemblyRoot;
    if (!root) {
      throw new Error('Expected committed authored assembly root pin.');
    }
    expect(root.path).toBe(`.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}/scene.json`);
    expect(actor.getSnapshot().context.publishedAssemblyEntryPath).toBe('assembly.json');
    expect(publish).toHaveBeenCalledOnce();
    expect(listeners.has(root.path)).toBe(true);
    const calls = producerCalls;
    const current = await readStoredLogicalRoot(rooted, root.path);
    const nextBytes = await writeStoredLogicalRoot(rooted, root.path, {
      ...current,
      generation: current.generation + 1,
    });
    listeners.get(root.path)?.();
    await waitFor(
      actor,
      (state) =>
        state.context.publishedAssemblyRoot?.digest !== root.digest &&
        state.context.latestRenderingOutcome === 'success',
    );
    expect(publish).toHaveBeenCalledOnce();
    expect(producerCalls).toBe(calls);
    expect(actor.getSnapshot().context.publishedAssemblyRoot?.digest).toBe(await digestContent({ bytes: nextBytes }));
  } finally {
    disposeCadRuntime(actor.getSnapshot().context);
    actor.stop();
    agent.dispose();
  }
  expect(listeners.size).toBe(0);
});

it.each(['', '/nested'])(
  'admits an authored CAD entry through the real content service at a nonempty project root%s without widening publication confinement',
  async (nested) => {
    const projectRoot = '/projects/strict-assembly';
    const { service, rooted: namespace, provider, mountTable, storageRootKey } = await project();
    await namespace.mkdir('projects/strict-assembly', { recursive: true });
    if (nested) {
      await namespace.mkdir(`projects/strict-assembly${nested}`, { recursive: true });
    }
    const kernelRoot = `${projectRoot}${nested}`;
    mountTable.mount(projectRoot, provider, {
      class: 'authored',
      backend: 'indexeddb',
      storageRootKey,
      providerBasePath: projectRoot.slice(1),
    });
    if (nested) {
      mountTable.mount(kernelRoot, provider, {
        class: 'authored',
        backend: 'indexeddb',
        storageRootKey,
        providerBasePath: kernelRoot.slice(1),
      });
    }
    const rooted = service.createRootedFileSystem(kernelRoot);
    await rooted.mkdir('physical', { recursive: true });
    await rooted.writeFile(
      'physical/assembly.json',
      encoder.encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { triangle: { source: { files: { 'triangle.shape': 'good' } } } },
          occurrences: [{ id: 'one', part: 'triangle', transform: identity }],
        }),
      ),
    );
    const paths = new WorkspacePathResolver(projectRoot);
    const proxy = mock<ComposedViewClient>();
    const toRelative = (absolute: string): string => {
      const relative = paths.toRelativePath(absolute);
      if (relative === undefined) {
        throw new Error('Test content proxy escaped its captured project.');
      }
      return relative;
    };
    proxy.stat.mockImplementation(async (absolute) =>
      namespace.stat(`projects/strict-assembly/${toRelative(absolute)}`),
    );
    proxy.readFile.mockImplementation(async (absolute) =>
      namespace.readFile(`projects/strict-assembly/${toRelative(absolute)}`),
    );
    const channel = new WorkerChangeChannel({ transport: { listen: () => () => undefined } });
    const contentService = new FileContentService({
      proxy,
      paths,
      channel,
      refreshGuard: new RefreshGenerationGuard(),
    });
    const read = vi.spyOn(contentService, 'readRawBytes');
    const agent = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
    const openFileSystemBridge = vi.fn((root: string, consumer: 'agent' | 'user' | 'working-copy') => {
      if (root !== kernelRoot) {
        throw new Error('CAD requested a different project authority.');
      }
      return createFileSystemBridgePort(consumer === 'agent' ? agent : rooted);
    });
    const snapshotMock = mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>>();
    vi.mocked(snapshotMock.matches).mockReturnValue(true);
    const snapshot: ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']> = {
      ...snapshotMock,
      matches: snapshotMock.matches,
      context: {
        ...mock<ReturnType<NonNullable<CadContext['fileManagerRef']>['getSnapshot']>['context']>(),
        rootDirectory: projectRoot,
        contentService,
        openFileSystemBridge,
      },
    };
    const fileManagerRef = mock<NonNullable<CadContext['fileManagerRef']>>({
      getSnapshot: () => snapshot,
      subscribe: () => ({ unsubscribe: () => undefined }),
    });
    const runtime = defineRuntime({ kernels: [kernel] });
    const actor = createActor(cadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        operationTimeout: 0,
        fileManagerRef,
        fileSystemRoot: kernelRoot,
        kernelOptionsFactory:
          async () =>
          ({ fileSystem, publicationFileSystem }) => ({
            transport: inProcessTransport({ runtime, fileSystem, publicationFileSystem, admitAssemblyDisplay }),
          }),
      },
    }).start();
    try {
      await waitFor(actor, (state) => state.matches('idle'));
      actor.send({ type: 'setEntryPath', entryPath: 'physical/assembly.json' });
      await waitFor(actor, (state) => state.context.latestRenderingOutcome !== undefined);
      expect(actor.getSnapshot().context.latestRenderingOutcome).toBe('success');
      expect(read).toHaveBeenCalledWith(`${nested ? 'nested/' : ''}physical/assembly.json`);
      expect(proxy.readFile).toHaveBeenCalledWith(`${kernelRoot}/physical/assembly.json`);
      const display = selectCadDisplay(actor.getSnapshot());
      if (!display || !('admitted' in display)) {
        throw new Error('Expected actual committed assembly display.');
      }
      const { root } = display;
      expect(root.path).toBe(
        `.tau/artifacts/reusable-parts/${await sha256String('physical/assembly.json')}/scene.json`,
      );
      const rootBytes = await rooted.readFile(root.path);
      const client = actor.getSnapshot().context.kernelClient;
      if (!client) {
        throw new Error('Actual CAD runtime is unavailable.');
      }
      const before = producerCalls;
      const rejected = await client.publishAssembly({
        authoredPath: 'physical/assembly.json',
        publicationPath:
          '.tau/artifacts/reusable-parts/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/scene.json',
      });
      expect(rejected.status).toBe('invalid');
      expect(producerCalls).toBe(before);
      expect(await rooted.readFile(root.path)).toEqual(rootBytes);
      await expect(contentService.readRawBytes(`${kernelRoot}/physical/assembly.json`)).rejects.toThrow(/escapes/u);
      await expect(contentService.readRawBytes('../outside')).rejects.toThrow(/escapes/u);
    } finally {
      disposeCadRuntime(actor.getSnapshot().context);
      actor.stop();
      agent.dispose();
      contentService.dispose();
      channel.dispose();
    }
  },
);
