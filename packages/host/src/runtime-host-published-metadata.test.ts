import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { validateAdmittedAssemblyGlb, writeGlb } from '@taucad/geometry-core';
import { defineKernel } from '@taucad/runtime';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { createFileSystemBridgePort } from '@taucad/runtime/filesystem';
import { runtimeDocumentProtocolSchemas } from '@taucad/runtime/transport';
import type {
  OnWorkerLog,
  DescribeResult,
  PublishedPartAsset,
  PublishedPartOccurrence,
  TranscoderDefinition,
} from '@taucad/runtime/types';
import { canonicalJson, sha256Bytes } from '@taucad/utils/hash';

const encoder = new TextEncoder();
const bytesFor = (value: string): Uint8Array<ArrayBuffer> => encoder.encode(value);
const emptyParameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:runtime-worker-parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'RuntimeWorkerParameters',
    type: 'object',
  },
  defaults: {},
} as const;
const finiteDisplay = (): Uint8Array<ArrayBuffer> =>
  writeGlb({
    nodes: [
      {
        name: 'triangle',
        extras: { tauComponentId: 'component:body' },
        primitives: [{ material: {}, mode: 4, positions: new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]) }],
      },
    ],
  });

// Fixture only: the current same-realm plugin-definition carrier supports deferred loading.
// Deferred imports are the behavior under test; a public defineKernel factory eagerly owns its definition.
function attachFixtureDefinition<Plugin extends { id: string }, Definition>(
  plugin: Plugin,
  load: () => Definition | Promise<Definition>,
): Plugin {
  Object.defineProperty(plugin, Symbol.for('@taucad/runtime/plugin-definition'), {
    value: load,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return plugin;
}

// Source-free admission uses real immutable records, checked publication and the
// semantic display validator. Native bytes below are opaque fixture payloads:
// these controls prove metadata/lifetime isolation, never codec compatibility.
describe('fresh published capabilities metadata', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const services: WorkspaceFileService[] = [];
  const connections: Array<ReturnType<typeof createFileSystemBridgePort>> = [];
  afterEach(() => {
    for (const connection of connections.splice(0)) {
      connection.dispose();
    }
    for (const service of services.splice(0)) {
      service.dispose();
    }
  });

  async function publication(kernelId = 'native-provider', nested = false) {
    const registry = new ProviderRegistry();
    const scope = { backend: 'memory', storageRootKey: 'memory:pinned-metadata' } as const;
    const provider = await registry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: scope.storageRootKey });
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
    });
    services.push(service);
    const base = service.createRootedFileSystem('/');
    const glb = finiteDisplay();
    const asset = async (path: string, bytes: Uint8Array<ArrayBuffer>): Promise<PublishedPartAsset> =>
      runtimeDocumentProtocolSchemas.calls.openPublishedAssembly.args.parse({
        root: { path, digest: `sha256:${await sha256Bytes(bytes)}`, byteLength: bytes.byteLength },
      }).root;
    const displayAsset = await asset('published/display.glb', glb);
    const source = {
      entry: 'removed.source',
      files: { 'removed.source': `sha256:${await sha256Bytes(bytesFor('cube'))}` },
    };
    const exact = async (id: string) => ({
      kernelId: id,
      provider: 'fixture-provider',
      providerVersion: 'fixture-version',
      codec: 'fixture-codec',
      codecVersion: '1',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
      asset: await asset(`published/${id}.native`, bytesFor(id)),
    });
    const record = runtimeDocumentProtocolSchemas.calls.admitPublishedPart.result.parse({
      schemaVersion: 1,
      variants: {
        default: { source, glb: displayAsset, exact: await exact(kernelId) },
        unused: { source, glb: displayAsset, exact: await exact('unused-provider') },
      },
    });
    const recordBytes = bytesFor(canonicalJson(record));
    const recordAsset = await asset('published/part.json', recordBytes);
    const reference = runtimeDocumentProtocolSchemas.calls.admitPublishedPart.args.parse({
      path: recordAsset.path,
      digest: recordAsset.digest,
    });
    const leaf: PublishedPartOccurrence = { id: 'body', transform: identity, part: 'body', variant: 'default' };
    const occurrences: readonly PublishedPartOccurrence[] = nested
      ? [{ id: 'group', transform: identity, children: [leaf] }]
      : [leaf];
    await base.writeFile(displayAsset.path, glb);
    await base.writeFile(reference.path, recordBytes);
    const authoredPath = 'published/authored.json';
    await base.writeFile(
      authoredPath,
      bytesFor(canonicalJson({ schemaVersion: 1, parts: { body: { publishedPart: reference } }, occurrences })),
    );
    const publisher = createRuntimeWorker({
      runtime: defineRuntime({ kernels: [] }),
      admitAssemblyDisplay: admitDisplay,
    });
    await initializeWorkerForTesting(publisher, { fileSystem: base });
    let root: PublishedPartAsset;
    try {
      const receipt = await publisher.publishAuthoredAssemblyRoot({
        authoredPath,
        publicationPath: 'published/scene.json',
        directory: 'published',
      });
      if (receipt.outcome.status !== 'published') {
        throw new Error(`Fixture checked publication failed: ${receipt.outcome.status}`);
      }
      root = receipt.outcome.root;
    } finally {
      await publisher.cleanup();
    }
    const rootBytes = await base.readFile(root.path);
    await base.unlink(authoredPath);
    // Source and optional native assets have never been written. Actual worker admission validates the durable root.
    const read = vi.spyOn(base, 'readFile');
    const write = vi.spyOn(base, 'writeFile');
    return { base, filesystem: base, prepared: { reference, record }, root, rootBytes, read, write };
  }

  async function isolatedDefinition(
    id: string,
    implementationAssets: NonNullable<Parameters<typeof defineKernel>[0]['implementationAssets']> = [],
  ) {
    const initialize = vi.fn(async () => ({}));
    const resolve = vi.fn(async (input: Readonly<{ entryPath: string }>) => ({
      resolved: [input.entryPath],
      unresolved: [],
    }));
    const describe = vi.fn(
      async (): Promise<DescribeResult> => ({
        success: true,
        data: { parameters: emptyParameterDeclaration },
        issues: [],
      }),
    );
    const evaluate = vi.fn(async () => ({ handle: {}, views: ['model'] as const }));
    const render = vi.fn(async () => ({ content: finiteDisplay() }));
    const serializeHandle = vi.fn(({ handle }: Readonly<{ handle: Record<string, never> }>) => handle);
    const deserializeHandle = vi.fn(() => ({}));
    const exportHandle = vi.fn(async () => ({
      files: [{ name: 'result.glb', mimeType: 'model/gltf-binary', bytes: finiteDisplay() }] as const,
    }));
    const factory = defineKernel({
      id,
      extensions: ['source'],
      name: id,
      version: '1.0.0',
      implementationAssets,
      initialize,
      resolve,
      describe,
      evaluate,
      render,
      serializeHandle,
      deserializeHandle,
      export: exportHandle,
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
      exports:
        id === 'display-codec'
          ? {
              glb: {
                title: 'GLB',
                mimeType: 'model/gltf-binary',
                extension: 'glb',
                optionsSchema: z.object({ binary: z.boolean().default(true) }),
              },
            }
          : {
              step: {
                title: 'STEP',
                mimeType: 'application/step',
                extension: 'step',
                optionsSchema: z.object({ tolerance: z.number().default(0.01) }),
              },
            },
    });
    const definition = await resolveRuntimePluginDefinition('kernel', factory());
    return {
      definition,
      initialize,
      resolve,
      describe,
      evaluate,
      render,
      serializeHandle,
      deserializeHandle,
      exportHandle,
    };
  }

  async function initializeWorkerForTesting(
    worker: ReturnType<typeof createRuntimeWorker>,
    options: { fileSystem: ReturnType<WorkspaceFileService['createRootedFileSystem']>; onLog?: OnWorkerLog },
  ): Promise<void> {
    const connection = createFileSystemBridgePort(options.fileSystem);
    connections.push(connection);
    await worker.initialize({
      callbacks: { onLog: options.onLog ?? (() => undefined) },
      transferables: { fileSystemPort: connection.port },
      options: {},
    });
  }

  const admitDisplay: NonNullable<Parameters<typeof createRuntimeWorker>[0]['admitAssemblyDisplay']> = async ({
    records,
    occurrences,
    readAsset,
  }) => {
    await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
  };

  it.each([false, true])(
    'should discover only selected pin providers and GLB/transcoder schemas without initializing or reading source/native assets (nested=%s)',
    async (nested) => {
      const fixture = await publication('native-provider', nested);
      const display = await isolatedDefinition('display-codec');
      const native = await isolatedDefinition('native-provider');
      const unused = await isolatedDefinition('unused-provider');
      const displayLoad = vi.fn(() => display.definition);
      const nativeLoad = vi.fn(() => native.definition);
      const unusedLoad = vi.fn(() => unused.definition);
      const transcoder: TranscoderDefinition = {
        name: 'Image',
        version: '1',
        edges: [
          { from: 'glb', to: 'webp', fidelity: 'mesh', optionsSchema: z.object({ width: z.number().default(640) }) },
        ],
        initialize: async () => ({}),
        transcode: async () => ({ success: true, data: [], issues: [] }),
      };
      const runtime = defineRuntime({
        kernels: [
          attachFixtureDefinition({ id: 'display-codec', extensions: ['glb', 'gltf'] }, displayLoad),
          attachFixtureDefinition({ id: 'native-provider', extensions: ['source'] }, nativeLoad),
          attachFixtureDefinition({ id: 'unused-provider', extensions: ['unused'] }, unusedLoad),
        ],
        transcoders: [attachFixtureDefinition({ id: 'image' }, () => transcoder)],
      });
      const worker = createRuntimeWorker({ runtime, admitAssemblyDisplay: admitDisplay });
      const updates = vi.fn<NonNullable<ReturnType<typeof createRuntimeWorker>['onCapabilitiesUpdated']>>();
      worker.onCapabilitiesUpdated = updates;
      await initializeWorkerForTesting(worker, { fileSystem: fixture.base });
      try {
        expect(worker.capabilitiesManifest.routes).toEqual([]);
        const admitted = await worker.openPublishedAssembly(fixture.root);
        expect(admitted.partRecords['body']).toEqual(fixture.prepared.reference);
        const { routes } = worker.capabilitiesManifest;
        expect(
          routes.find((route) => route.kernelId === 'native-provider' && route.targetFormat === 'step')?.exportOptions
            .defaults,
        ).toEqual({ tolerance: 0.01 });
        expect(
          routes.find((route) => route.kernelId === 'display-codec' && route.targetFormat === 'glb')?.exportOptions
            .defaults,
        ).toEqual({ binary: true });
        expect(
          routes.find((route) => route.transcoderId === 'image' && route.targetFormat === 'webp')?.exportOptions
            .defaults,
        ).toEqual({ binary: true, width: 640 });
        expect(displayLoad).toHaveBeenCalledOnce();
        expect(nativeLoad).toHaveBeenCalledOnce();
        expect(unusedLoad).not.toHaveBeenCalled();
        expect(updates).toHaveBeenCalled();
        for (const owner of [display, native, unused]) {
          expect(owner.initialize).not.toHaveBeenCalled();
          expect(owner.resolve).not.toHaveBeenCalled();
          expect(owner.evaluate).not.toHaveBeenCalled();
          expect(owner.render).not.toHaveBeenCalled();
          expect(owner.serializeHandle).not.toHaveBeenCalled();
          expect(owner.exportHandle).not.toHaveBeenCalled();
          expect(owner.deserializeHandle).not.toHaveBeenCalled();
        }
        expect(fixture.read.mock.calls.some(([path]) => path === 'removed.source' || path.endsWith('.native'))).toBe(
          false,
        );
        expect(await fixture.filesystem.readFile(fixture.root.path)).toEqual(fixture.rootBytes);
        // Opening the whole part exposes both effective variants, unlike selected assembly leaves.
        await worker.admitPublishedPart(fixture.prepared.reference);
        expect(unusedLoad).toHaveBeenCalledOnce();
        expect(unused.initialize).not.toHaveBeenCalled();
      } finally {
        await worker.cleanup();
      }
    },
  );

  it.each(['unknown-provider', 'failed-provider'])(
    'should preserve display and GLB routes when optional exact metadata is unavailable (%s)',
    async (kernelId) => {
      const fixture = await publication(kernelId);
      const display = await isolatedDefinition('display-codec');
      const failure = vi.fn<() => Awaited<ReturnType<typeof isolatedDefinition>>['definition']>(() => {
        throw new Error('optional module unavailable');
      });
      const runtime = defineRuntime({
        kernels: [
          attachFixtureDefinition({ id: 'display-codec', extensions: ['glb'] }, () => display.definition),
          attachFixtureDefinition({ id: 'failed-provider', extensions: ['source'] }, failure),
        ],
      });
      const worker = createRuntimeWorker({ runtime, admitAssemblyDisplay: admitDisplay });
      const logs = vi.fn<OnWorkerLog>();
      await initializeWorkerForTesting(worker, { fileSystem: fixture.base, onLog: logs });
      try {
        const admitted = await worker.openPublishedAssembly(fixture.root);
        expect(admitted.partRecords['body']).toEqual(fixture.prepared.reference);
        expect(worker.capabilitiesManifest.routes.some((route) => route.targetFormat === 'glb')).toBe(true);
        expect(worker.capabilitiesManifest.routes.some((route) => route.targetFormat === 'step')).toBe(false);
        expect(logs.mock.calls.some(([entry]) => entry.message.includes('metadata is unavailable'))).toBe(true);
        expect(display.initialize).not.toHaveBeenCalled();
        expect(display.resolve).not.toHaveBeenCalled();
        expect(display.evaluate).not.toHaveBeenCalled();
        expect(display.render).not.toHaveBeenCalled();
        expect(display.deserializeHandle).not.toHaveBeenCalled();
        expect(fixture.read.mock.calls.some(([path]) => path === 'removed.source' || path.endsWith('.native'))).toBe(
          false,
        );
        expect(await fixture.filesystem.readFile(fixture.root.path)).toEqual(fixture.rootBytes);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it.each(['missing', 'mismatch'])(
    'should defer native implementation verification until execution and deny invalid assets (%s)',
    async (kind) => {
      const fixture = await publication();
      const bytes = bytesFor('identified engine');
      const digest = `sha256:${await sha256Bytes(bytes)}`;
      const native = await isolatedDefinition('native-provider', [
        { id: 'engine', url: 'https://example.invalid/native-fixture.wasm', sha256: digest.slice('sha256:'.length) },
      ]);
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        if (kind === 'missing') {
          throw new Error('engine unavailable');
        }
        return new Response(bytesFor('other engine'));
      });
      const runtime = defineRuntime({
        kernels: [attachFixtureDefinition({ id: 'native-provider', extensions: ['source'] }, () => native.definition)],
      });
      const worker = createRuntimeWorker({ runtime, admitAssemblyDisplay: admitDisplay });
      await initializeWorkerForTesting(worker, { fileSystem: fixture.base });
      try {
        await worker.openPublishedAssembly(fixture.root);
        expect(fetch).not.toHaveBeenCalled();
        expect(worker.capabilitiesManifest.routes.some((route) => route.targetFormat === 'step')).toBe(true);
        expect(native.initialize).not.toHaveBeenCalled();
        expect(native.resolve).not.toHaveBeenCalled();
        expect(native.describe).not.toHaveBeenCalled();
        expect(native.deserializeHandle).not.toHaveBeenCalled();
        expect(native.evaluate).not.toHaveBeenCalled();
        expect(native.render).not.toHaveBeenCalled();
        expect(fixture.read.mock.calls.some(([path]) => path === 'removed.source' || path.endsWith('.native'))).toBe(
          false,
        );
        expect(await fixture.filesystem.exists('removed.source')).toBe(false);
        // A separate legitimate executable entry tests the next lifecycle phase.
        // The erased producer remains absent; admission is never warmed by evaluation.
        await fixture.filesystem.writeFile('execution.source', bytesFor('separate executable control'));
        const denied = await worker.getParameters({ filename: 'execution.source', path: '' });
        expect(denied.success).toBe(false);
        expect(denied.issues[0]?.message).toContain(
          kind === 'missing' ? 'Failed to load implementation asset' : 'Implementation asset digest mismatch',
        );
        expect(native.initialize).not.toHaveBeenCalled();
        expect(native.resolve).not.toHaveBeenCalled();
        expect(native.describe).not.toHaveBeenCalled();
        expect(native.deserializeHandle).not.toHaveBeenCalled();
        expect(native.evaluate).not.toHaveBeenCalled();
        expect(native.render).not.toHaveBeenCalled();
        expect(await fixture.filesystem.readFile(fixture.root.path)).toEqual(fixture.rootBytes);
        fetch.mockImplementation(async () => new Response(bytes));
        const recovered = await worker.getParameters({ filename: 'execution.source', path: '' });
        expect(recovered.success).toBe(true);
        expect(native.initialize).toHaveBeenCalledOnce();
        expect(native.describe).toHaveBeenCalledOnce();
      } finally {
        fetch.mockRestore();
        await worker.cleanup();
      }
    },
  );

  it.each(['abort', 'cleanup', 'module-abort'])(
    'should preserve termination while admitted metadata import is deferred (%s)',
    async (termination) => {
      const fixture = await publication('unknown-provider');
      const display = await isolatedDefinition('display-codec');
      const started = Promise.withResolvers<void>();
      const loaded = Promise.withResolvers<Awaited<ReturnType<typeof isolatedDefinition>>['definition']>();
      const runtime = defineRuntime({
        kernels: [
          attachFixtureDefinition({ id: 'display-codec', extensions: ['glb'] }, async () => {
            started.resolve();
            return loaded.promise;
          }),
        ],
      });
      const worker = createRuntimeWorker({ runtime, admitAssemblyDisplay: admitDisplay });
      await initializeWorkerForTesting(worker, { fileSystem: fixture.base });
      const controller = new AbortController();
      const pending = worker.openPublishedAssembly(fixture.root, controller.signal);
      // Observe rejection immediately; a pre-import admission failure must also drain
      // instead of leaving either the start wait or an assertion promise unhandled.
      const observeAdmission = async (): Promise<Error | undefined> => {
        try {
          await pending;
          return undefined;
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error), { cause: error });
        }
      };
      const observed = observeAdmission();
      const admissionFinishedBeforeMetadata = async (): Promise<never> => {
        const error = await observed;
        if (error !== undefined) {
          throw error;
        }
        throw new Error('Admission finished before its metadata loader started.');
      };
      let cleanup: Promise<void> | undefined;
      try {
        await Promise.race([started.promise, admissionFinishedBeforeMetadata()]);
        cleanup = termination === 'cleanup' ? worker.cleanup() : undefined;
        expect(await fixture.filesystem.readFile(fixture.root.path)).toEqual(fixture.rootBytes);
        if (termination === 'abort') {
          controller.abort(new Error('metadata canceled'));
        }
        if (termination === 'module-abort') {
          loaded.reject(new DOMException('metadata canceled', 'AbortError'));
        } else {
          loaded.resolve(display.definition);
        }
        const error = await observed;
        expect(error).toBeInstanceOf(termination === 'module-abort' ? DOMException : Error);
        expect(error).toHaveProperty(
          'message',
          termination === 'cleanup' ? 'Runtime worker is closing' : 'metadata canceled',
        );
        expect(display.initialize).not.toHaveBeenCalled();
        expect(display.resolve).not.toHaveBeenCalled();
        expect(display.evaluate).not.toHaveBeenCalled();
        expect(display.render).not.toHaveBeenCalled();
        expect(display.deserializeHandle).not.toHaveBeenCalled();
        expect(fixture.write).not.toHaveBeenCalled();
        if (termination !== 'cleanup') {
          expect(await fixture.filesystem.readFile(fixture.root.path)).toEqual(fixture.rootBytes);
        }
      } finally {
        loaded.resolve(display.definition);
        await observed;
        await (cleanup ?? worker.cleanup());
      }
    },
  );
});
