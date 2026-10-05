// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB-backed checked authority fixture.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
import type { TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import { emptyGlb } from '#framework/published-part-test-fixture.js';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import * as partsRoot from '#framework/published-parts-root.js';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { sha256Bytes, sha256String } from '@taucad/utils/hash';
import { publishPartsRoot as commitPinnedPartsRoot } from '#framework/published-parts-root.js';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import type { GetDependenciesInput, KernelRuntime, RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { PublishedPartReference } from '#types/runtime-assembly.types.js';
import type {
  EvaluateResult,
  RenderResult,
  HandleSnapshotExactDescriptor,
  ComposeHandlesInput,
} from '#types/runtime-kernel-v2.types.js';
import type { RenderRequest } from '#types/runtime-middleware-v2.types.js';
import type { RuntimeContentInput, RuntimeContentKey } from '#types/runtime-content.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import type { MockKernelWorkerOptions } from '../../test/support/kernel-worker.fixture.js';
import {
  MockKernelWorker,
  initializeWorkerForTesting,
  seedTestFileSystem,
  getTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

class PublicationContentWorker extends MockKernelWorker {
  public readonly meshContents: Array<RuntimeContentInput | undefined> = [];
  public readonly buildInputs: NativeBuildInput[] = [];

  public constructor(
    keys: readonly RuntimeContentKey[],
    middleware: MockKernelWorkerOptions['middleware'] = [],
    admitAssemblyDisplay?: MockKernelWorkerOptions['admitAssemblyDisplay'],
  ) {
    super({
      middleware,
      admitAssemblyDisplay,
      evaluationSnapshot: { shape: 'test-native' },
      evaluationViewContent: emptyGlb(),
    });
    this.kernelRenderContentMap.set('mock-kernel', [...keys]);
    this.kernelAllViewContentMap.set('mock-kernel', [...keys]);
  }

  protected override async onEvaluateForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<EvaluateResult> {
    this.buildInputs.push(input);
    return super.onEvaluateForOwner(owner, input, runtime);
  }

  protected override kernelHasMeshPhaseForOwner(): boolean {
    return true;
  }

  protected override async onRenderForOwner(
    _owner: OperationOwner,
    input: RenderRequest & { nativeHandle: unknown },
    _runtime: KernelRuntime,
  ): Promise<RenderResult> {
    this.meshContents.push(input.content);
    return { success: true, data: { mimeType: 'model/gltf-binary', content: emptyGlb() }, issues: [] };
  }

  protected override async deserializeNativeHandleForOwner(
    _owner: OperationOwner,
    snapshot: unknown,
    _runtime: KernelRuntime,
  ): Promise<unknown> {
    return snapshot;
  }
}

class ExactMockKernelWorker extends MockKernelWorker {
  public expectedProviderVersion = 'identified-test-build';
  public deserializeCalls = 0;
  public bindCalls = 0;

  protected override async bindPublishedExactOwner(
    kernelId: string,
    entryPath: string,
    _runtime: KernelRuntime,
  ): Promise<OperationOwner | undefined> {
    this.bindCalls++;
    if (kernelId !== 'mock-kernel') {
      return undefined;
    }
    const slash = entryPath.lastIndexOf('/');
    return {
      kind: 'request',
      file: { path: slash === -1 ? '' : entryPath.slice(0, slash), filename: entryPath.slice(slash + 1) },
      binding: { kernelId, kernelVersion: '1.0.0', entryPath },
    };
  }

  protected override async deserializeNativeHandleForOwner(
    _owner: OperationOwner,
    snapshot: unknown,
    _runtime: KernelRuntime,
  ): Promise<unknown> {
    this.deserializeCalls++;
    return snapshot;
  }

  protected override async composePublishedAssemblyForOwner(
    _owner: OperationOwner,
    occurrences: ComposeHandlesInput<unknown>['occurrences'],
    _runtime: KernelRuntime,
  ): Promise<unknown> {
    return { occurrences };
  }

  protected override hasNativeSnapshotDescriptorForOwner(_owner: OperationOwner): boolean {
    return true;
  }

  protected override describeNativeSnapshotForOwner(
    _owner: OperationOwner,
    _snapshot: unknown,
    _runtime: KernelRuntime,
  ): HandleSnapshotExactDescriptor {
    return {
      provider: 'test-kernel',
      providerVersion: this.expectedProviderVersion,
      codec: 'test.native-handle-msgpack',
      codecVersion: '1',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    };
  }
}

class TransientDependencyWorker extends MockKernelWorker {
  private dependencyCalls = 0;

  protected override async onGetDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    this.dependencyCalls++;
    // The source snapshot discovers twice; the third discovery hashes the evaluated render.
    if (this.dependencyCalls === 3) {
      await getTestFileSystem().writeFile('parts/screw.kcl', new TextEncoder().encode('changed during evaluation'));
    }
    return super.onGetDependencies(input, runtime);
  }

  protected override async onEvaluateForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<EvaluateResult> {
    await getTestFileSystem().writeFile('parts/screw.kcl', new TextEncoder().encode('original'));
    return super.onEvaluateForOwner(owner, input, runtime);
  }
}

class ThrowingPublicationDisposalWorker extends ExactMockKernelWorker {
  public readonly disposedHandles: unknown[] = [];

  protected override disposeNativeHandleForOwner(
    _owner: OperationOwner,
    nativeHandle: unknown,
    _runtime: KernelRuntime,
  ): void {
    this.disposedHandles.push(nativeHandle);
    if (this.disposedHandles.length === 1) {
      throw new Error('injected generic plugin disposer failure');
    }
  }
}

class MissingTransitiveDependencyWorker extends MockKernelWorker {
  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    const source = await runtime.filesystem.readFile(entryPath, 'utf8');
    const dependency = 'parts/new-dependency.kcl';
    if (!source.includes('include new-dependency')) {
      return { resolved: [entryPath], unresolved: [] };
    }
    return (await runtime.filesystem.exists(dependency))
      ? { resolved: [entryPath, dependency], unresolved: [] }
      : { resolved: [entryPath], unresolved: [dependency] };
  }
}

class OverlappingOptionalDependencyWorker extends MockKernelWorker {
  public requiredDiscovery: number | 'after-production' = 1;
  private dependencyCalls = 0;

  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    this.dependencyCalls++;
    const required =
      this.requiredDiscovery === 'after-production'
        ? this.createGeometryCalls > 0
        : this.dependencyCalls === this.requiredDiscovery;
    return {
      resolved: required ? [entryPath, '.tau/parameters/parts/screw.kcl.json'] : [entryPath],
      unresolved: [],
    };
  }
}

class OverlappingDependencyWorker extends MockKernelWorker {
  protected override async onGetDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    const result = await super.onGetDependencies(input, runtime);
    return input.entryPath === 'parts/default.kcl'
      ? { ...result, resolved: [...result.resolved, 'parts/common.kcl'] }
      : result;
  }
}

const createWorker = async (
  exact = false,
  expectedProviderVersion?: string,
  options?: Pick<MockKernelWorkerOptions, 'transcoders' | 'admitAssemblyDisplay' | 'onLog'> & {
    suppliedWorker?: MockKernelWorker;
    suppliedFileSystem?: RuntimeFileSystemBase;
  },
): Promise<MockKernelWorker> => {
  const { suppliedWorker, suppliedFileSystem, onLog, ...workerOptions } = options ?? {};
  const fileSystem = suppliedFileSystem ?? getTestFileSystem();
  // ponytail: this fixture serializes checked writes; real shared CAS is covered by rooted-client tests.
  fileSystem.writeFileChecked ??= async ({ path, data, preconditions }) => {
    const actuals = await Promise.all(
      preconditions.map(async (precondition) =>
        (await fileSystem.exists(precondition.path)) ? fileSystem.readFile(precondition.path) : null,
      ),
    );
    for (const [index, precondition] of preconditions.entries()) {
      const actual = actuals[index] ?? null;
      const expected =
        typeof precondition.expected === 'string'
          ? new TextEncoder().encode(precondition.expected)
          : precondition.expected;
      if (
        actual === null
          ? expected !== null
          : expected === null || !actual.every((byte, index) => byte === expected[index])
      ) {
        return { status: 'conflict', conflicts: [{ path: precondition.path, actual }] };
      }
    }
    const content = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    await fileSystem.writeFile(path, content);
    return { status: 'applied', content: new Uint8Array(content) };
  };
  const worker =
    suppliedWorker ??
    new (exact ? ExactMockKernelWorker : MockKernelWorker)({
      middleware: [],
      ...workerOptions,
      evaluationViewContent: emptyGlb(),
      ...(exact ? { evaluationSnapshot: { brep: 'test-shape', density: 7.85 } } : {}),
    });
  if (worker instanceof ExactMockKernelWorker && expectedProviderVersion !== undefined) {
    worker.expectedProviderVersion = expectedProviderVersion;
  }
  return initializeWorkerForTesting(worker, { fileSystem, onLog });
};

/** Exercise the current ordinary document/view route before publication. */
const renderOrdinaryControl = async (worker: MockKernelWorker, content?: RuntimeContentInput) => {
  const evaluated = Promise.withResolvers<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]>();
  worker.onEvaluated = evaluated.resolve;
  worker.handleOpenDocument({
    documentId: 'publication-control',
    intent: 1,
    file: { path: 'parts', filename: 'screw.kcl' },
    parameters: {},
    watch: false,
  });
  const evaluation = await evaluated.promise;
  if (!evaluation.success) {
    return evaluation;
  }
  const rendered = Promise.withResolvers<Parameters<NonNullable<MockKernelWorker['onRendered']>>[0]>();
  worker.onRendered = rendered.resolve;
  worker.handleOpenView({
    documentId: 'publication-control',
    subscriptionId: 'publication-view',
    requestId: 'publication-render',
    view: 'model',
    ...(content ? { content } : {}),
  });
  return rendered.promise;
};

describe('KernelWorker completed part publication', () => {
  it.each([
    { keys: ['includeEdges', 'includePhysical'], content: { includeEdges: true, includePhysical: true } },
    { keys: ['includeEdges'], content: { includeEdges: true } },
    { keys: [], content: undefined },
  ] satisfies Array<{ keys: RuntimeContentKey[]; content: RuntimeContentInput | undefined }>)(
    'should request only declared completed-part content $keys',
    async ({ keys, content }) => {
      await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
      const worker = await createWorker(false, undefined, { suppliedWorker: new PublicationContentWorker(keys) });
      if (!(worker instanceof PublicationContentWorker)) {
        throw new TypeError('The publication content fixture requires its concrete worker.');
      }
      try {
        const prepared = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
        expect(prepared.record.variants['default']?.glb.byteLength).toBeGreaterThan(0);
        expect(worker.meshContents).toEqual([content]);
        expect(worker.buildInputs).toHaveLength(1);
        expect(worker.buildInputs[0]).not.toHaveProperty('content');
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('should remesh prior edgeless display for publication while reusing the unchanged native build stage', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const builds = new Map<string, EvaluateResult>();
    const meshes = new Map<string, RenderResult>();
    const buildKeys: string[] = [];
    const meshKeys: string[] = [];
    // This white-box cache records the framework's real stage keys; actual emitted edge bytes are tested in UI.
    const middleware = defineMiddleware({
      id: 'publication-stage-key-control',
      name: 'PublicationStageKeyControl',
      async wrapEvaluate(input, handler, runtime) {
        buildKeys.push(runtime.dependencyHash);
        const cached = builds.get(runtime.dependencyHash);
        if (cached) {
          return cached;
        }
        const result = await handler(input);
        builds.set(runtime.dependencyHash, result);
        return result;
      },
      async wrapRender(input, handler, runtime) {
        meshKeys.push(runtime.dependencyHash);
        const cached = meshes.get(runtime.dependencyHash);
        if (cached) {
          return cached;
        }
        const result = await handler(input);
        meshes.set(runtime.dependencyHash, result);
        return result;
      },
    });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new PublicationContentWorker(['includeEdges'], [middleware]),
    });
    if (!(worker instanceof PublicationContentWorker)) {
      throw new TypeError('The publication stage control requires its concrete worker.');
    }
    try {
      const prior = await renderOrdinaryControl(worker, { includeEdges: false });
      expect(prior.success).toBe(true);
      const first = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      const repeat = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      expect(buildKeys).toHaveLength(3);
      expect(new Set(buildKeys).size).toBe(1);
      expect(meshKeys).toHaveLength(3);
      expect(meshKeys[0]).not.toBe(meshKeys[1]);
      expect(meshKeys[1]).toBe(meshKeys[2]);
      expect(worker.createGeometryCalls).toBe(1);
      expect(worker.meshContents).toEqual([{ includeEdges: false }, { includeEdges: true }]);
      expect(repeat.reference).toEqual(first.reference);
    } finally {
      await worker.cleanup();
    }
  });

  it('keeps source and pinned reads available but denies protected publication without a host writer before producer work', async () => {
    const authored = JSON.stringify({
      schemaVersion: 1,
      parts: { screw: { source: { path: 'parts/screw.kcl' } } },
      occurrences: [],
    });
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube', 'assembly.json': authored });
    const filesystem = getTestFileSystem();
    const producer = await createWorker();
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    await producer.cleanup();
    const directory = `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}`;
    const publicationPath = `${directory}/scene.json`;
    const prior = await commitPinnedPartsRoot(createRuntimeFileSystem(filesystem), {
      path: publicationPath,
      parts: { screw: prepared.reference },
      occurrences: [
        { id: 'screw', part: 'screw', variant: 'default', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      ],
    });
    if (prior.status !== 'published') {
      throw new Error('Missing pinned positive control.');
    }
    const rootBytes = await filesystem.readFile(publicationPath);
    const consumer = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const write = vi.spyOn(filesystem, 'writeFile');
    const mkdir = vi.spyOn(filesystem, 'mkdir');
    const checked = vi.spyOn(filesystem, 'writeFileChecked');
    try {
      await expect(consumer.openPublishedAssembly(prior.root)).resolves.toMatchObject({
        publication: {
          schemaVersion: 1,
          parts: { screw: prepared.record },
          occurrences: [{ id: 'screw', part: 'screw', variant: 'default' }],
        },
        partRecords: { screw: prepared.reference },
      });
      expect(consumer.createGeometryCalls).toBe(0);
      await expect(renderOrdinaryControl(consumer)).resolves.toMatchObject({ success: true });
      const before = consumer.createGeometryCalls;
      expect(before).toBe(1);
      write.mockClear();
      mkdir.mockClear();
      checked.mockClear();
      const denied = await consumer.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        directory,
        publicationPath,
      });
      expect(denied.outcome.status).toBe('invalid');
      if (denied.outcome.status === 'invalid') {
        expect(denied.outcome.issues[0]?.message).toContain('captured host publication authority');
      }
      expect(consumer.createGeometryCalls).toBe(before);
      expect(write).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(checked).not.toHaveBeenCalled();
      expect(await filesystem.readFile(publicationPath)).toEqual(rootBytes);
      expect(await filesystem.readFile('assembly.json', 'utf8')).toBe(authored);
    } finally {
      write.mockRestore();
      mkdir.mockRestore();
      checked.mockRestore();
      await consumer.cleanup();
    }
  });

  it('drains both filesystem bindings when immediate publication port close throws', async () => {
    const fileSystem = getTestFileSystem();
    const evaluatorBridge = createFileSystemBridgePort(fileSystem);
    const publicationBridge = createFileSystemBridgePort(fileSystem);
    const worker = new MockKernelWorker({ middleware: [] });
    await worker.initialize({
      callbacks: { onLog: () => undefined },
      transferables: { fileSystemPort: evaluatorBridge.port, publicationFileSystemPort: publicationBridge.port },
      options: {},
    });
    const evaluatorClose = vi.spyOn(evaluatorBridge.port, 'close');
    const originalClose = publicationBridge.port.close.bind(publicationBridge.port);
    const publicationClose = vi.spyOn(publicationBridge.port, 'close').mockImplementation(() => {
      originalClose();
      throw new Error('injected publication port close failure');
    });
    const disposalError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const drain = worker.cleanup();
      expect(worker.cleanup()).toBe(drain);
      await drain;
      expect(publicationClose).toHaveBeenCalled();
      expect(evaluatorClose).toHaveBeenCalled();
      expect(disposalError).toHaveBeenCalledWith('Failed to dispose:', expect.any(Error));
    } finally {
      publicationClose.mockRestore();
      evaluatorClose.mockRestore();
      disposalError.mockRestore();
      evaluatorBridge.dispose();
      publicationBridge.dispose();
    }
  });
  it('fences captured publication delegates by entry, cancellation and worker disposal', async () => {
    const fileSystem = getTestFileSystem();
    const ensureDirectory = vi.spyOn(fileSystem, 'mkdir');
    const checkedWrite = vi
      .fn<NonNullable<RuntimeFileSystemBase['writeFileChecked']>>()
      .mockResolvedValue({ status: 'applied', content: new Uint8Array() });
    const publication = { ...fileSystem, writeFileChecked: checkedWrite };
    const evaluatorBridge = createFileSystemBridgePort(fileSystem);
    const publicationBridge = createFileSystemBridgePort(publication);
    const worker = new MockKernelWorker({ middleware: [] });
    await worker.initialize({
      callbacks: { onLog: () => undefined },
      transferables: { fileSystemPort: evaluatorBridge.port, publicationFileSystemPort: publicationBridge.port },
      options: {},
    });
    const controller = new AbortController();
    const directory = `.tau/artifacts/reusable-parts/${await sha256String('assembly.json')}`;
    const captured: { options?: Parameters<typeof partsRoot.publishAuthoredAssemblyRoot>[2] } = {};
    type CapturedWriter = NonNullable<
      NonNullable<Parameters<typeof partsRoot.publishAuthoredAssemblyRoot>[2]>['publicationWriter']
    >;
    const abortEntered = Promise.withResolvers<CapturedWriter>();
    const releaseAbort = Promise.withResolvers<void>();
    const cleanupEntered = Promise.withResolvers<CapturedWriter>();
    const releaseCleanup = Promise.withResolvers<void>();
    const commit = vi
      .spyOn(partsRoot, 'publishAuthoredAssemblyRoot')
      .mockImplementation(async (_fs, _input, options) => {
        if (captured.options === undefined) {
          const liveWriter = options.publicationWriter;
          if (!liveWriter?.writeFileChecked) {
            throw new Error('Expected live checked publication delegates.');
          }
          await expect(liveWriter.ensureDir(`${directory}/../other`)).rejects.toThrow();
          await expect(liveWriter.ensureDir('.tau/artifacts/reusable-parts/other')).rejects.toThrow('escapes');
          await expect(
            liveWriter.writeFileChecked({
              path: `${directory}/scene.json`,
              data: new Uint8Array(),
              preconditions: [{ path: '.tau/artifacts/reusable-parts/other/scene.json', expected: null }],
            }),
          ).rejects.toThrow('escapes');
          expect(checkedWrite).not.toHaveBeenCalled();
          expect(ensureDirectory).not.toHaveBeenCalled();
          const liveDirectory = `${directory}/live-scope-positive`;
          expect(await fileSystem.exists(liveDirectory)).toBe(false);
          await liveWriter.ensureDir(liveDirectory);
          await expect(
            liveWriter.writeFileChecked({
              path: `${directory}/scene.json`,
              data: new Uint8Array(),
              preconditions: [{ path: `${directory}/scene.json`, expected: null }],
            }),
          ).resolves.toMatchObject({ status: 'applied' });
          expect(checkedWrite).toHaveBeenCalledOnce();
          expect(ensureDirectory).toHaveBeenCalledExactlyOnceWith(liveDirectory, { recursive: true });
          const liveDirectoryStat = await fileSystem.stat(liveDirectory);
          expect(liveDirectoryStat.type).toBe('dir');
        }
        captured.options = options;
        return { outcome: { status: 'invalid', issues: [] } };
      });
    try {
      await worker.publishAuthoredAssemblyRoot(
        { authoredPath: 'assembly.json', directory, publicationPath: `${directory}/scene.json` },
        controller.signal,
      );
      const writer = captured.options?.publicationWriter;
      if (!writer?.writeFileChecked) {
        throw new Error('Expected the actual captured checked publication delegates.');
      }
      await expect(writer.ensureDir(directory)).rejects.toThrow('no longer active');
      await expect(
        writer.writeFileChecked({ path: `${directory}/scene.json`, data: new Uint8Array(), preconditions: [] }),
      ).rejects.toThrow('no longer active');
      commit.mockImplementationOnce(async (_fs, _input, options) => {
        if (!options.publicationWriter) {
          throw new Error('Missing active abort control delegate.');
        }
        abortEntered.resolve(options.publicationWriter);
        await releaseAbort.promise;
        return { outcome: { status: 'invalid', issues: [] } };
      });
      const abortedOperation = worker.publishAuthoredAssemblyRoot(
        { authoredPath: 'assembly.json', directory, publicationPath: `${directory}/scene.json` },
        controller.signal,
      );
      const activeAbortWriter = await abortEntered.promise;
      if (!activeAbortWriter.writeFileChecked) {
        throw new Error('Expected active checked abort control delegate.');
      }
      const abortReason = new Error('injected live publication cancellation');
      controller.abort(abortReason);
      await expect(activeAbortWriter.ensureDir(directory)).rejects.toBe(abortReason);
      await expect(
        activeAbortWriter.writeFileChecked({
          path: `${directory}/scene.json`,
          data: new Uint8Array(),
          preconditions: [],
        }),
      ).rejects.toBe(abortReason);
      releaseAbort.resolve();
      await abortedOperation;
      await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        directory,
        publicationPath: `${directory}/scene.json`,
      });
      const freshWriter = captured.options?.publicationWriter;
      if (!freshWriter?.writeFileChecked) {
        throw new Error('Expected a fresh operation delegate.');
      }
      commit.mockImplementationOnce(async () => {
        await expect(freshWriter.ensureDir(directory)).rejects.toThrow('no longer active');
        return { outcome: { status: 'invalid', issues: [] } };
      });
      await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        directory,
        publicationPath: `${directory}/scene.json`,
      });
      commit.mockImplementationOnce(async (_fs, _input, options) => {
        if (!options.publicationWriter) {
          throw new Error('Missing active cleanup control delegate.');
        }
        cleanupEntered.resolve(options.publicationWriter);
        await releaseCleanup.promise;
        return { outcome: { status: 'invalid', issues: [] } };
      });
      const heldOperation = worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        directory,
        publicationPath: `${directory}/scene.json`,
      });
      const activeCleanupWriter = await cleanupEntered.promise;
      if (!activeCleanupWriter.writeFileChecked) {
        throw new Error('Expected active checked cleanup control delegate.');
      }
      // Close admission while this operation is still live; release it before awaiting its own drain.
      const cleanup = worker.cleanup();
      expect(worker.cleanup()).toBe(cleanup);
      await expect(activeCleanupWriter.ensureDir(directory)).rejects.toThrow('no longer active');
      await expect(
        activeCleanupWriter.writeFileChecked({
          path: `${directory}/scene.json`,
          data: new Uint8Array(),
          preconditions: [],
        }),
      ).rejects.toThrow('no longer active');
      expect(checkedWrite).toHaveBeenCalledOnce();
      expect(ensureDirectory).toHaveBeenCalledOnce();
      releaseCleanup.resolve();
      await heldOperation;
      await cleanup;
    } finally {
      releaseAbort.resolve();
      releaseCleanup.resolve();
      commit.mockRestore();
      ensureDirectory.mockRestore();
      await worker.cleanup();
      evaluatorBridge.dispose();
      publicationBridge.dispose();
    }
  });
  it('exports admitted display GLB with empty options and converts mesh bytes without exact evidence', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker();
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    await producer.cleanup();
    await getTestFileSystem().unlink('parts/screw.kcl');
    const transcode = vi.fn<TranscoderDefinition['transcode']>().mockResolvedValue({
      success: true,
      data: [{ name: 'model.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1, 2, 3]) }],
      issues: [],
    });
    const transcoder = attachRuntimePluginDefinition(
      { id: 'display-mock' },
      () =>
        ({
          name: 'DisplayMock',
          version: '1',
          edges: [{ from: 'glb', to: 'usdz', fidelity: 'mesh' }] as const,
          initialize: async () => ({}),
          transcode,
        }) satisfies TranscoderDefinition,
    );
    const consumer = await createWorker(false, undefined, {
      transcoders: [transcoder],
      admitAssemblyDisplay: async () => emptyGlb(),
    });
    try {
      const glb = await consumer.exportPublished({
        publishedPart: { reference: prepared.reference },
        format: 'glb',
        exportOptions: {},
      });
      expect(glb.success).toBe(true);
      if (glb.success) {
        expect(glb.files[0].bytes).toEqual(emptyGlb());
      }
      const mesh = await consumer.exportPublished({ publishedPart: { reference: prepared.reference }, format: 'usdz' });
      expect(mesh.success).toBe(true);
      expect(transcode).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'glb', to: 'usdz', files: [expect.objectContaining({ bytes: emptyGlb() })] }),
        expect.any(Object),
        expect.any(Object),
      );
      const exact = await consumer.exportPublished({
        publishedPart: { reference: prepared.reference },
        format: 'step',
      });
      expect(exact.success).toBe(false);
      expect(exact.issues[0]?.code).toBe('REPRESENTATION_UNSUPPORTED');
      const root = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
        path: 'published/display-root.json',
        parts: { screw: prepared.reference },
        occurrences: [
          {
            id: 'placed',
            part: 'screw',
            variant: 'default',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
        ],
      });
      expect(root.status).toBe('published');
      if (root.status === 'published') {
        const assemblyGlb = await consumer.exportPublished({
          publishedAssembly: { root: root.root },
          format: 'glb',
          exportOptions: {},
        });
        expect(assemblyGlb.success).toBe(true);
        if (assemblyGlb.success) {
          expect(assemblyGlb.files[0].bytes).toEqual(emptyGlb());
        }
      }
      expect(consumer.createGeometryCalls).toBe(0);
    } finally {
      await consumer.cleanup();
    }
  });

  it('fails exact pinned export explicitly when the publication has display bytes only', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker();
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    await producer.cleanup();
    await getTestFileSystem().unlink('parts/screw.kcl');
    const consumer = await createWorker(true);
    try {
      const result = await consumer.exportPublished({
        publishedPart: { reference: prepared.reference },
        format: 'gltf',
      });
      expect(result.success).toBe(false);
      expect(result.issues[0]?.code).toBe('REPRESENTATION_UNSUPPORTED');
      expect(consumer.createGeometryCalls).toBe(0);
    } finally {
      await consumer.cleanup();
    }
  });

  it('rejects incompatible exact producer evidence without re-evaluating source', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker(true);
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    await producer.cleanup();
    await getTestFileSystem().unlink('parts/screw.kcl');
    const consumer = await createWorker(true, 'changed-implementation');
    try {
      const result = await consumer.exportPublished({
        publishedPart: { reference: prepared.reference },
        format: 'gltf',
      });
      expect(result.success).toBe(false);
      expect(result.issues[0]?.code).toBe('REPRESENTATION_UNSUPPORTED');
      expect(result.issues[0]?.message).toMatch(/incompatible exact/u);
      expect(consumer.createGeometryCalls).toBe(0);
    } finally {
      await consumer.cleanup();
    }
  });

  it('reopens a pinned assembly with placed exact occurrences after deleting the authored source', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker(true);
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0, 0, 1];
    const outcome = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
      path: 'published/root.json',
      parts: { screw: prepared.reference },
      occurrences: [
        { id: 'placed', part: 'screw', variant: 'default', transform },
        { id: 'placed-again', part: 'screw', variant: 'default', transform },
      ],
    });
    expect(outcome.status).toBe('published');
    await producer.cleanup();
    if (outcome.status !== 'published') {
      return;
    }
    await getTestFileSystem().unlink('parts/screw.kcl');
    const consumer = await createWorker(true);
    try {
      const result = await consumer.exportPublished({ publishedAssembly: { root: outcome.root }, format: 'gltf' });
      expect(result.success).toBe(true);
      expect(consumer.createGeometryCalls).toBe(0);
      expect(consumer.exportGeometrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nativeHandle: {
            occurrences: [
              {
                handle: { brep: 'test-shape', density: 7.85 },
                occurrencePath: ['placed'],
                worldTransform: transform,
              },
              {
                handle: { brep: 'test-shape', density: 7.85 },
                occurrencePath: ['placed-again'],
                worldTransform: transform,
              },
            ],
          },
        }),
        expect.any(Object),
      );
      if (consumer instanceof ExactMockKernelWorker) {
        expect(consumer.deserializeCalls).toBe(1);
      }
      await getTestFileSystem().writeFile(outcome.root.path, 'overwritten');
      const stale = await consumer.exportPublished({ publishedAssembly: { root: outcome.root }, format: 'gltf' });
      expect(stale.success).toBe(false);
      expect(stale.issues[0]?.code).toBe('INVALID_REFERENCE');
      expect(consumer.createGeometryCalls).toBe(0);
    } finally {
      await consumer.cleanup();
    }
  });

  it.each([
    { subject: 'assembly', primary: 'success' },
    { subject: 'assembly', primary: 'error' },
    { subject: 'part', primary: 'success' },
    { subject: 'part', primary: 'error' },
  ] as const)(
    'drains published $subject native disposal and preserves primary $primary when a plugin disposer throws',
    async ({ subject, primary }) => {
      await seedTestFileSystem({ 'parts/a.kcl': 'a', 'parts/b.kcl': 'b' });
      const pins: PublishedPartReference[] = [];
      /* eslint-disable no-await-in-loop -- Each distinct producer session must finish and release before the next starts. */
      for (const name of ['a', 'b']) {
        const producer = await createWorker(false, undefined, {
          suppliedWorker: new ExactMockKernelWorker({
            middleware: [],
            evaluationViewContent: emptyGlb(),
            evaluationSnapshot: { brep: name, density: 7.85 },
          }),
        });
        try {
          const preparedPin = await producer.preparePublishedPart({
            sourcePath: `parts/${name}.kcl`,
            directory: 'published',
          });
          pins.push(preparedPin.reference);
        } finally {
          await producer.cleanup();
        }
      }
      /* eslint-enable no-await-in-loop -- End the ordered producer sessions. */
      const root = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
        path: 'published/disposal-root.json',
        parts: { a: pins[0]!, b: pins[1]! },
        occurrences: ['a', 'b'].map((name) => ({
          id: name,
          part: name,
          variant: 'default',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        })),
      });
      if (root.status !== 'published') {
        throw new Error('Missing actual pinned cleanup control.');
      }
      await getTestFileSystem().unlink('parts/a.kcl');
      await getTestFileSystem().unlink('parts/b.kcl');
      const suppliedWorker = new ThrowingPublicationDisposalWorker({ middleware: [] });
      const consumer = await createWorker(false, undefined, { suppliedWorker });
      if (primary === 'error') {
        consumer.exportGeometrySpy.mockImplementation(() => {
          throw new Error('primary export failure');
        });
      }
      try {
        const result = await consumer.exportPublished({
          ...(subject === 'assembly'
            ? { publishedAssembly: { root: root.root } }
            : { publishedPart: { reference: pins[0]! } }),
          format: 'gltf',
        });
        expect(result.success).toBe(primary === 'success');
        if (primary === 'error') {
          expect(result.issues[0]?.message).toContain('primary export failure');
        }
        expect(suppliedWorker.disposedHandles).toHaveLength(subject === 'assembly' ? 3 : 1);
        expect(new Set(suppliedWorker.disposedHandles).size).toBe(suppliedWorker.disposedHandles.length);
        if (subject === 'assembly') {
          expect(suppliedWorker.disposedHandles.slice(0, 2)).toEqual([
            { brep: 'a', density: 7.85 },
            { brep: 'b', density: 7.85 },
          ]);
        }
        expect(suppliedWorker.disposedHandles.at(-1)).toBe(consumer.exportGeometrySpy.mock.calls[0]?.[0].nativeHandle);
        expect(consumer.createGeometryCalls).toBe(0);
      } finally {
        await consumer.cleanup();
      }
    },
  );

  it('denies legacy or malformed component overlays while preserving ordinary pinned export and source bytes', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker(true);
    const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
    const worldTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0, 0, 1] as const;
    const outcome = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
      path: 'published/overlay-root.json',
      parts: { screw: prepared.reference },
      occurrences: [{ id: 'placed', part: 'screw', variant: 'default', transform: worldTransform }],
    });
    await producer.cleanup();
    if (outcome.status !== 'published') {
      throw new Error('Expected published fixture.');
    }
    const bytes = await getTestFileSystem().readFile(outcome.root.path);
    await getTestFileSystem().unlink('parts/screw.kcl');
    const consumer = await createWorker(true, undefined, {
      suppliedWorker: new ExactMockKernelWorker({
        middleware: [],
        evaluationViewContent: emptyGlb(),
        admitAssemblyDisplay: async () => undefined,
        exportZodSchemas: { glb: z.object({}), gltf: z.object({}), step: z.object({}) },
      }),
    });
    try {
      const legacy = await consumer.exportPublished({
        publishedAssembly: { root: outcome.root, placements: [] },
        format: 'step',
      });
      expect(legacy.success).toBe(false);
      expect(legacy.issues[0]?.code).toBe('REPRESENTATION_UNSUPPORTED');
      if (consumer instanceof ExactMockKernelWorker) {
        expect(consumer.deserializeCalls).toBe(0);
      }
      const unknown = await consumer.exportPublished({
        publishedAssembly: { root: outcome.root, placements: [{ componentId: 'unknown', worldTransform }] },
        format: 'step',
      });
      expect(unknown.issues[0]?.code).toBe('INVALID_REFERENCE');
      const duplicate = await consumer.exportPublished({
        publishedAssembly: {
          root: outcome.root,
          placements: [
            { componentId: 'unknown', worldTransform },
            { componentId: 'unknown', worldTransform },
          ],
        },
        format: 'step',
      });
      expect(duplicate.issues[0]?.message).toContain('Duplicate');
      const wrongFormat = await consumer.exportPublished({
        publishedAssembly: { root: outcome.root, placements: [] },
        format: 'glb',
      });
      expect(wrongFormat.issues[0]?.code).toBe('REPRESENTATION_UNSUPPORTED');
      const read = vi.spyOn(getTestFileSystem(), 'readFile');
      const tinyProjective = await consumer.exportPublished({
        publishedAssembly: {
          root: outcome.root,
          placements: [
            { componentId: 'unknown', worldTransform: [1, 0, 0, 1e-9, 0, 1, 0, 0, 0, 0, 1, 0, 1e12, 0, 0, 1] },
          ],
        },
        format: 'step',
      });
      expect(tinyProjective.issues[0]?.message).toContain('affine');
      expect(read).not.toHaveBeenCalled();
      read.mockRestore();
      if (consumer instanceof ExactMockKernelWorker) {
        expect(consumer.bindCalls).toBe(0);
        expect(consumer.deserializeCalls).toBe(0);
      }
      const ordinary = await consumer.exportPublished({ publishedAssembly: { root: outcome.root }, format: 'gltf' });
      expect(ordinary.success).toBe(true);
      expect(consumer.createGeometryCalls).toBe(0);
      expect(await getTestFileSystem().readFile(outcome.root.path)).toEqual(bytes);
    } finally {
      await consumer.cleanup();
    }
  });

  it.each(['undeclared-route', 'unavailable-metadata'] as const)(
    'should reject a nested assembly STEP export with %s before binding or restoring native assets',
    async (scenario) => {
      await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
      const producer = await createWorker(true);
      const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const outcome = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
        path: 'published/nested-root.json',
        parts: { screw: prepared.reference },
        occurrences: [
          {
            id: 'group',
            transform: identity,
            children: [{ id: 'leaf', part: 'screw', variant: 'default', transform: identity }],
          },
        ],
      });
      expect(outcome.status).toBe('published');
      await producer.cleanup();
      if (outcome.status !== 'published') {
        return;
      }
      await getTestFileSystem().unlink('parts/screw.kcl');
      const consumer =
        scenario === 'undeclared-route'
          ? await createWorker(true)
          : await createWorker(true, undefined, {
              suppliedWorker: new (class extends ExactMockKernelWorker {
                protected override getPublishedExportMetadataOwner(): OperationOwner | undefined {
                  return undefined;
                }
              })({ middleware: [], evaluationViewContent: emptyGlb() }),
            });
      try {
        const result = await consumer.exportPublished({ publishedAssembly: { root: outcome.root }, format: 'step' });
        expect(result.success).toBe(false);
        expect(result.issues[0]?.code).toBe(
          scenario === 'undeclared-route' ? 'TRANSCODER_CAPABILITY_MISSING' : 'REPRESENTATION_UNSUPPORTED',
        );
        expect(consumer.createGeometryCalls).toBe(0);
        if (consumer instanceof ExactMockKernelWorker) {
          expect(consumer.bindCalls).toBe(0);
          expect(consumer.deserializeCalls).toBe(0);
        }
      } finally {
        await consumer.cleanup();
      }
    },
  );

  it.each(['missing', 'present'] as const)(
    'should publish a normal %s optional middleware sidecar with its exact snapshot identity',
    async (presence) => {
      const sidecarPath = '.tau/parameters/parts/screw.kcl.json';
      const sidecar = '{"parameters":{}}';
      await seedTestFileSystem({
        'parts/screw.kcl': 'original',
        ...(presence === 'present' ? { [sidecarPath]: sidecar } : {}),
      });
      const middleware = defineMiddleware({
        id: 'optional-sidecar',
        name: 'OptionalSidecar',
        resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
      });
      const worker = await createWorker(false, undefined, {
        suppliedWorker: new MockKernelWorker({
          middleware: [middleware],
          evaluationViewContent: emptyGlb(),
        }),
      });
      try {
        const prepared = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
        const expected = presence === 'missing' ? 'missing' : `sha256:${await sha256String(sidecar)}`;
        expect(prepared.record.variants['default']?.source.files[sidecarPath]).toBe(expected);
        const admittedPart = await worker.admitPublishedPart(prepared.reference);
        expect(admittedPart.variants['default']?.source.files[sidecarPath]).toBe(expected);
        expect(worker.createGeometryCalls).toBe(1);
        expect(await getTestFileSystem().exists(sidecarPath)).toBe(presence === 'present');
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('should reject an optional middleware sidecar that appears during production and preserve the coherent root', async () => {
    const sidecarPath = '.tau/parameters/parts/screw.kcl.json';
    const rootPath = 'published/optional-root.json';
    await seedTestFileSystem({
      'parts/screw.kcl': 'original',
      'parts/second.kcl': 'second',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { second: { source: { path: 'parts/second.kcl' } } },
        occurrences: [],
      }),
    });
    let appear = false;
    const middleware = defineMiddleware({
      id: 'appearing-sidecar',
      name: 'AppearingSidecar',
      resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
      async wrapEvaluate(input, handler, runtime) {
        if (appear) {
          await runtime.filesystem.writeFile(sidecarPath, 'appeared during production');
        }
        return handler(input);
      },
    });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new MockKernelWorker({
        middleware: [middleware],
        admitAssemblyDisplay: async () => undefined,
        evaluationViewContent: emptyGlb(),
      }),
    });
    try {
      const baseline = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      const committed = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
        path: rootPath,
        parts: { baseline: baseline.reference },
        occurrences: [],
      });
      expect(committed.status).toBe('published');
      const priorRootBytes = await getTestFileSystem().readFile(rootPath);
      appear = true;
      const result = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: rootPath,
        directory: 'published',
      });
      expect(result.outcome.status).toBe('invalid');
      if (result.outcome.status === 'invalid') {
        expect(result.outcome.issues[0]?.code).toBe('SCENE_REFERENCE_INVALID');
        expect(result.outcome.issues[0]?.message).toContain('source changed during production');
      }
      expect(await getTestFileSystem().readFile(rootPath)).toEqual(priorRootBytes);
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it.each([1, 2, 'after-production'] as const)(
    'should deny a missing required kernel dependency declared by middleware in discovery pass %s',
    async (pass) => {
      await seedTestFileSystem({ 'parts/screw.kcl': 'original' });
      const suppliedWorker = new OverlappingOptionalDependencyWorker({
        middleware: [
          defineMiddleware({
            id: 'overlapping-sidecar',
            name: 'OverlappingSidecar',
            resolve: () => [{ path: '.tau/parameters/parts/screw.kcl.json', affects: ['evaluate'] }],
          }),
        ],
        evaluationViewContent: emptyGlb(),
      });
      suppliedWorker.requiredDiscovery = pass;
      const worker = await createWorker(false, undefined, { suppliedWorker });
      try {
        const before =
          pass === 'after-production'
            ? await worker.snapshotSource({ file: { path: 'parts', filename: 'screw.kcl' } })
            : undefined;
        if (before) {
          expect(before).toMatchObject({ success: true, data: { unresolvedPaths: [] } });
          expect(before.sourceRevision?.files['.tau/parameters/parts/screw.kcl.json']).toBe('missing');
        }
        await expect(
          worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' }),
        ).rejects.toThrow(
          pass === 'after-production' ? 'source changed during production' : 'complete source snapshot',
        );
        expect(worker.createGeometryCalls).toBe(pass === 'after-production' ? 1 : 0);
        if (before) {
          const after = await worker.snapshotSource({ file: { path: 'parts', filename: 'screw.kcl' } });
          expect(after).toMatchObject({
            success: true,
            data: { unresolvedPaths: ['.tau/parameters/parts/screw.kcl.json'] },
          });
          // The added post-production unresolved guard is necessary: revision JSON and absence are identical.
          expect(JSON.stringify(after.sourceRevision)).toBe(JSON.stringify(before.sourceRevision));
        }
        expect(await getTestFileSystem().exists('published')).toBe(false);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('should reject an optional middleware sidecar appearing during admission after production and preserve the coherent root', async () => {
    const sidecarPath = '.tau/parameters/parts/second.kcl.json';
    const rootPath = 'published/optional-late-root.json';
    await seedTestFileSystem({
      'parts/screw.kcl': 'baseline',
      'parts/second.kcl': 'second',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { second: { source: { path: 'parts/second.kcl' } } },
        occurrences: [],
      }),
    });
    const middleware = defineMiddleware({
      id: 'late-sidecar',
      name: 'LateSidecar',
      resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
    });
    const admission = vi.fn(
      async ({
        records,
        purpose,
      }: Parameters<NonNullable<MockKernelWorkerOptions['admitAssemblyDisplay']>>[0]): Promise<void> => {
        expect(purpose).toBe('admission');
        expect(worker.createGeometryCalls).toBe(2);
        expect(records['second']?.variants['default']?.source.files[sidecarPath]).toBe('missing');
        await getTestFileSystem().writeFile(sidecarPath, 'appeared after completed part production');
      },
    );
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new MockKernelWorker({
        middleware: [middleware],
        admitAssemblyDisplay: admission,
        evaluationViewContent: emptyGlb(),
      }),
    });
    try {
      const baseline = await worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      const committed = await commitPinnedPartsRoot(createRuntimeFileSystem(getTestFileSystem()), {
        path: rootPath,
        parts: { baseline: baseline.reference },
        occurrences: [],
      });
      expect(committed.status).toBe('published');
      const before = await getTestFileSystem().readFile(rootPath);
      const result = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: rootPath,
        directory: 'published',
      });
      expect(admission).toHaveBeenCalledOnce();
      expect(result.outcome.status).toBe('invalid');
      if (result.outcome.status === 'invalid') {
        expect(result.outcome.issues[0]?.code).toBe('SCENE_REFERENCE_INVALID');
        expect(result.outcome.issues[0]?.message).toContain(`Source ${sidecarPath} changed during publication`);
      }
      expect(await getTestFileSystem().readFile(rootPath)).toEqual(before);
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('should deny publication with a missing required kernel dependency before producing a part', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'include new-dependency' });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new MissingTransitiveDependencyWorker({ middleware: [] }),
    });
    try {
      await expect(
        worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' }),
      ).rejects.toThrow('a complete source snapshot is unavailable');
      expect(worker.createGeometryCalls).toBe(0);
      expect(await getTestFileSystem().exists('parts/new-dependency.kcl')).toBe(false);
    } finally {
      await worker.cleanup();
    }
  });

  it('rejects an evaluated dependency that changed and returned to its preflight bytes', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'original' });
    const worker = await initializeWorkerForTesting(
      new TransientDependencyWorker({
        middleware: [],
        evaluationViewContent: emptyGlb(),
      }),
    );
    try {
      await expect(
        worker.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' }),
      ).rejects.toThrow(/evaluated dependency closure differs/u);
      expect(await getTestFileSystem().readFile('parts/screw.kcl')).toEqual(new TextEncoder().encode('original'));
    } finally {
      await worker.cleanup();
    }
  });

  it('pins a producer-qualified native snapshot for another worker without rebuilding source', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker(true);
    try {
      const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      const exact = prepared.record.variants['default']?.exact;
      expect(exact).toMatchObject({ provider: 'test-kernel', codec: 'test.native-handle-msgpack' });
      const consumer = await createWorker(true);
      try {
        const admitted = await consumer.admitPublishedPart(prepared.reference);
        expect(admitted.variants['default']?.exact).toEqual(exact);
        const bytes = await consumer.readPublishedPartAsset(prepared.reference, exact!.asset.digest);
        expect(msgpackCodec.decode(bytes)).toEqual({ brep: 'test-shape', density: 7.85 });
        expect(consumer.createGeometryCalls).toBe(0);
        await getTestFileSystem().unlink('parts/screw.kcl');
        const exported = await consumer.exportPublished({
          publishedPart: { reference: prepared.reference },
          format: 'gltf',
        });
        expect(exported.success).toBe(true);
        expect(consumer.createGeometryCalls).toBe(0);
        expect(consumer.exportGeometrySpy).toHaveBeenCalledWith(
          expect.objectContaining({ nativeHandle: { brep: 'test-shape', density: 7.85 } }),
          expect.any(Object),
        );
      } finally {
        await consumer.cleanup();
      }
    } finally {
      await producer.cleanup();
    }
  });

  it('reopens a pinned record in another worker session with zero producer calls', async () => {
    await seedTestFileSystem({ 'parts/screw.kcl': 'cube' });
    const producer = await createWorker();
    try {
      const prepared = await producer.preparePublishedPart({ sourcePath: 'parts/screw.kcl', directory: 'published' });
      expect(producer.createGeometryCalls).toBe(1);
      const consumer = await createWorker();
      try {
        const record = await consumer.admitPublishedPart(prepared.reference);
        expect(record).toEqual(prepared.record);
        expect(consumer.createGeometryCalls).toBe(0);
        const glb = await consumer.readPublishedPartAsset(prepared.reference, record.variants['default']!.glb.digest);
        expect(glb).toEqual(emptyGlb());
        expect(consumer.createGeometryCalls).toBe(0);
      } finally {
        await consumer.cleanup();
      }
    } finally {
      await producer.cleanup();
    }
  });

  it('does not infer identity from equal source text at another entry path', async () => {
    await seedTestFileSystem({ 'a/screw.kcl': 'cube', 'b/screw.kcl': 'cube' });
    const worker = await createWorker();
    try {
      const first = await worker.preparePublishedPart({ sourcePath: 'a/screw.kcl', directory: 'published' });
      const second = await worker.preparePublishedPart({ sourcePath: 'b/screw.kcl', directory: 'published' });
      expect(worker.createGeometryCalls).toBe(2);
      expect(second.reference.digest).not.toBe(first.reference.digest);
      expect(second.record.variants['default']!.glb.digest).toBe(first.record.variants['default']!.glb.digest);
    } finally {
      await worker.cleanup();
    }
  });

  it('builds each effective variant independently and retains its source closure', async () => {
    await seedTestFileSystem({ 'parts/default.kcl': 'cube', 'parts/red.kcl': 'sphere' });
    const worker = await createWorker();
    try {
      const prepared = await worker.preparePublishedPartVariants({
        directory: 'published',
        sources: { default: 'parts/default.kcl', red: 'parts/red.kcl' },
      });
      expect(worker.createGeometryCalls).toBe(2);
      expect(prepared.record.variants['default']?.source.entry).toBe('parts/default.kcl');
      expect(prepared.record.variants['red']?.source.entry).toBe('parts/red.kcl');
      expect(await worker.admitPublishedPart(prepared.reference)).toEqual(prepared.record);
    } finally {
      await worker.cleanup();
    }
  });

  it('resolves mixed authored and pinned parts in one rooted worker lane', async () => {
    await seedTestFileSystem({
      'parts/reused.kcl': 'cube',
      'parts/default.kcl': 'sphere',
      'parts/red.kcl': 'cylinder',
    });
    const worker = await createWorker();
    try {
      const reused = await worker.preparePublishedPart({ sourcePath: 'parts/reused.kcl', directory: 'published' });
      await getTestFileSystem().writeFile(
        'assembly.json',
        JSON.stringify({
          schemaVersion: 1,
          parts: {
            reused: { publishedPart: reused.reference },
            fresh: { source: { path: 'parts/default.kcl' }, variants: { red: { source: { path: 'parts/red.kcl' } } } },
          },
          occurrences: [
            {
              id: 'root',
              transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
              children: [
                { id: 'a', part: 'reused', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
                { id: 'b', part: 'fresh', variant: 'red', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1] },
              ],
            },
          ],
        }),
      );
      const before = worker.createGeometryCalls;
      const resolved = await worker.resolveAuthoredAssembly({ authoredPath: 'assembly.json', directory: 'published' });
      expect(worker.createGeometryCalls - before).toBe(2);
      expect(resolved.parts['reused']).toEqual(reused.reference);
      expect(resolved.records['fresh']?.variants['red']?.source.entry).toBe('parts/red.kcl');
      const [root] = resolved.occurrences;
      if (root === undefined) {
        throw new Error('Expected published root occurrence.');
      }
      expect(root.children?.[1]).toMatchObject({ part: 'fresh', variant: 'red' });
    } finally {
      await worker.cleanup();
    }
  });

  it('publishes JSON-safe inline text with inferred entry and rejects numeric-array content', async () => {
    await seedTestFileSystem({
      'inline.json': JSON.stringify({
        schemaVersion: 1,
        parts: { inline: { source: { files: { 'parts/inline.kcl': 'cube' } } } },
        occurrences: [],
      }),
      'binary.json': JSON.stringify({
        schemaVersion: 1,
        parts: { binary: { source: { files: { 'parts/binary.kcl': [99, 117, 98, 101] } } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker();
    try {
      const resolved = await worker.resolveAuthoredAssembly({ authoredPath: 'inline.json', directory: 'published' });
      expect(resolved.records['inline']?.variants['default']?.source.entry).toBe('parts/inline.kcl');
      expect(worker.createGeometryCalls).toBe(1);
      await expect(
        worker.resolveAuthoredAssembly({ authoredPath: 'binary.json', directory: 'published' }),
      ).rejects.toThrow();
      expect(worker.createGeometryCalls).toBe(1);
    } finally {
      await worker.cleanup();
    }
  });

  it('preserves a successful mesh when observational GLB hashing refuses', async () => {
    await seedTestFileSystem({ 'parts/a.kcl': 'cube' });
    const worker = await createWorker(false, undefined, { suppliedWorker: new PublicationContentWorker([]) });
    const batches: TelemetryEntry[][] = [];
    worker.setTelemetrySend((entries) => batches.push(entries));
    const bytes = emptyGlb();
    const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    let refused = false;
    const hash = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      if (
        !refused &&
        data instanceof Uint8Array &&
        data.length === bytes.length &&
        data.every((byte, index) => byte === bytes[index])
      ) {
        refused = true;
        throw new Error('observational hash refused');
      }
      return digest(algorithm, data);
    });
    try {
      const prepared = await worker.preparePublishedPart({ sourcePath: 'parts/a.kcl', directory: 'published' });
      worker.flushTelemetry();
      expect(refused).toBe(true);
      const meshes = batches.flat().filter((entry) => entry.name === 'kernel.mesh');
      expect(meshes).toHaveLength(1);
      expect(meshes[0]?.detail).toMatchObject({ entryPath: 'parts/a.kcl', kernelId: 'mock-kernel' });
      expect(meshes[0]?.detail).not.toHaveProperty('glbDigest');
      const asset = prepared.record.variants['default']?.glb;
      if (!asset) {
        throw new Error('Expected published GLB after observational refusal');
      }
      expect(await worker.readPublishedPartAsset(prepared.reference, asset.digest)).toEqual(bytes);
    } finally {
      hash.mockRestore();
      await worker.cleanup();
    }
  });

  it.each(['throw', 'abort', 'superseded'] as const)(
    'should clear ordinary document span attribution before publication after %s',
    async (scenario) => {
      await seedTestFileSystem({
        'parts/screw.kcl': 'ordinary',
        'parts/published.kcl': 'published',
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: { part: { source: { path: 'parts/published.kcl' } } },
          occurrences: [],
        }),
      });
      const entered = Promise.withResolvers<AbortSignal>();
      const released = Promise.withResolvers<void>();
      let blocking = true;
      const hold = async (signal: AbortSignal) => {
        entered.resolve(signal);
        await released.promise;
        if (scenario === 'throw') {
          throw new Error('Ordinary rendering failed.');
        }
        signal.throwIfAborted();
      };
      const middleware = defineMiddleware({
        id: 'document-lifetime',
        name: 'DocumentLifetime',
        async wrapEvaluate(input, handler, runtime) {
          if (blocking && scenario === 'abort') {
            await hold(runtime.signal);
          }
          return handler(input);
        },
        async wrapRender(input, handler, runtime) {
          if (blocking && scenario !== 'abort') {
            await hold(runtime.signal);
          }
          return handler(input);
        },
      });
      const worker = await createWorker(false, undefined, {
        suppliedWorker: new MockKernelWorker({
          middleware: [middleware],
          evaluationViewContent: emptyGlb(),
          admitAssemblyDisplay: async () => undefined,
        }),
      });
      const entries: TelemetryEntry[] = [];
      worker.setTelemetrySend((batch) => entries.push(...batch));
      try {
        worker.handleOpenDocument({
          documentId: 'ordinary',
          intent: 1,
          file: { path: 'parts', filename: 'screw.kcl' },
          parameters: {},
          watch: false,
        });
        worker.handleOpenView({
          documentId: 'ordinary',
          subscriptionId: 'ordinary-view',
          requestId: 'ordinary-request',
          view: 'model',
        });
        const signal = await entered.promise;
        blocking = false;
        if (scenario === 'abort') {
          worker.handleCloseDocument({ documentId: 'ordinary' });
          expect(signal.aborted).toBe(true);
        } else if (scenario === 'superseded') {
          worker.handleUpdateView({ subscriptionId: 'ordinary-view', requestId: 'replacement-request' });
        }
        released.resolve();
        const published = await worker.publishAuthoredAssemblyRoot({
          authoredPath: 'assembly.json',
          publicationPath: 'published/root.json',
          directory: 'published',
        });
        expect(published.outcome.status).toBe('published');
        worker.flushTelemetry();
        expect(entries.some((entry) => entry.detail?.['documentId'] === 'ordinary')).toBe(true);
        const publicationWork = entries.filter((entry) => entry.detail?.['entryPath'] === 'parts/published.kcl');
        for (const name of ['kernel.extract-params', 'kernel.compute', 'kernel.mesh-compute']) {
          expect(publicationWork.some((entry) => entry.name === name)).toBe(true);
        }
        for (const entry of publicationWork) {
          for (const key of ['documentId', 'evaluationId', 'operationId', 'subscriptionId', 'requestId']) {
            expect(entry.detail?.[key], `${entry.name}.${key}`).toBeUndefined();
          }
        }
      } finally {
        released.resolve();
        await worker.cleanup();
      }
    },
  );

  it('keeps authored child evaluation scoped to its verified source while the final root verifies earlier recipes', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'parts/b.kcl': 'sphere',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } }, b: { source: { path: 'parts/b.kcl' } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new PublicationContentWorker([], [], async () => undefined),
    });
    const entries: TelemetryEntry[] = [];
    worker.setTelemetrySend((batch) => entries.push(...batch));
    try {
      const published = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: 'published/root.json',
        directory: 'published',
      });
      expect(published.outcome.status).toBe('published');
      expect(worker.createGeometryCalls).toBe(2);
      expect(Object.keys(published.partRecords ?? {})).toEqual(['a', 'b']);
      worker.flushTelemetry();
      const evaluations = entries.filter(
        (entry) => entry.name === 'kernel.evaluate-model' && entry.detail?.['file'] === 'b.kcl',
      );
      expect(evaluations).toHaveLength(1);
      const [evaluation] = evaluations;
      if (!evaluation) {
        throw new Error('The actual second recipe evaluation is unavailable.');
      }
      const byId = new Map(entries.map((entry) => [entry.detail?.['spanId'], entry]));
      const isEvaluationChild = (entry: TelemetryEntry): boolean => {
        let current = entry;
        const visited = new Set<unknown>();
        while (current.detail?.['parentSpanId'] !== undefined) {
          const parentId = current.detail['parentSpanId'];
          if (visited.has(parentId)) {
            throw new Error('Cyclic actual publication fixture ancestry.');
          }
          visited.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) {
            throw new Error('Missing actual publication fixture ancestor.');
          }
          if (parent === evaluation) {
            return true;
          }
          current = parent;
        }
        return false;
      };
      const earlierReads = entries.filter(
        (entry) => entry.name === 'fs.read' && entry.detail?.['path'] === 'parts/a.kcl',
      );
      // A's initial production, B's global BEFORE and final independent source check remain real reads.
      expect(earlierReads.length).toBeGreaterThan(0);
      expect(earlierReads.filter((entry) => isEvaluationChild(entry))).toHaveLength(0);
      expect(entries.at(-1)).toMatchObject({
        name: 'kernel.render',
        detail: { status: 'published', generation: 1 },
      });
    } finally {
      await worker.cleanup();
    }
  });

  it.each([
    { path: 'parts/b.kcl', bytes: 'cubf', label: 'equal-length selected entry', finalFence: false },
    { path: 'parts/import.kcl', bytes: 'new!', label: 'equal-length selected import', finalFence: false },
    { path: '.tau/parameters/parts/b.kcl.json', bytes: '{}', label: 'missing optional sidecar', finalFence: false },
    { path: 'parts/a.kcl', bytes: 'cubf', label: 'earlier recipe', finalFence: true },
  ])(
    'refuses authored publication when $label changes during its child evaluation',
    async ({ path, bytes, finalFence }) => {
      const sidecarPath = '.tau/parameters/parts/b.kcl.json';
      await seedTestFileSystem({
        'parts/a.kcl': 'cube',
        'parts/b.kcl': 'cube',
        'parts/import.kcl': 'old!',
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: { a: { source: { path: 'parts/a.kcl' } }, b: { source: { path: 'parts/b.kcl' } } },
          occurrences: [],
        }),
      });
      const middleware = defineMiddleware({
        id: 'publication-optional-sidecar',
        name: 'PublicationOptionalSidecar',
        resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
      });
      class EditingPublicationWorker extends PublicationContentWorker {
        protected override async onGetDependencies(
          { entryPath }: GetDependenciesInput,
          _runtime: KernelRuntime,
        ): Promise<GetDependenciesResult> {
          return {
            resolved: entryPath === 'parts/b.kcl' ? [entryPath, 'parts/import.kcl'] : [entryPath],
            unresolved: [],
          };
        }

        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          if (owner.binding?.entryPath === 'parts/b.kcl') {
            // External bytes change without a runtime watch notification; raw AFTER/final reads own refusal.
            await getTestFileSystem().writeFile(path, bytes);
          }
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      const worker = await createWorker(false, undefined, {
        suppliedWorker: new EditingPublicationWorker([], [middleware], async () => undefined),
      });
      try {
        const published = await worker.publishAuthoredAssemblyRoot({
          authoredPath: 'assembly.json',
          publicationPath: 'published/root.json',
          directory: 'published',
        });
        expect(published.outcome.status).toBe('invalid');
        if (published.outcome.status !== 'invalid') {
          throw new Error('Changed source must refuse the real root commit.');
        }
        expect(
          published.outcome.issues.some((issue) =>
            finalFence
              ? issue.message.includes('Source parts/a.kcl changed during publication')
              : issue.message.includes('source changed during production'),
          ),
        ).toBe(true);
        expect(worker.createGeometryCalls).toBe(2);
        expect(await getTestFileSystem().exists('published/root.json')).toBe(false);
        expect(await getTestFileSystem().readFile(path, 'utf8')).toBe(bytes);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it.each([2, 4])(
    'should reread an unrelated retained source once per authored child for %i children',
    async (childCount) => {
      const sentinelPath = 'retained/sentinel.kcl';
      const sources = Array.from({ length: childCount }, (_, index) => ({
        name: `part-${index}`,
        path: `parts/part-${index}.kcl`,
      }));
      await seedTestFileSystem({
        [sentinelPath]: 'sphere',
        ...Object.fromEntries(sources.map(({ path }) => [path, 'cube'])),
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: Object.fromEntries(sources.map(({ name, path }) => [name, { source: { path } }])),
          occurrences: [],
        }),
      });
      const filesystem = getTestFileSystem();
      const readFile = vi.spyOn(filesystem, 'readFile');
      let worker: MockKernelWorker | undefined;
      try {
        worker = await createWorker(false, undefined, {
          suppliedFileSystem: filesystem,
          suppliedWorker: new PublicationContentWorker([], [], async () => undefined),
        });
        const entries: TelemetryEntry[] = [];
        worker.setTelemetrySend((batch) => entries.push(...batch));
        await worker.preparePublishedPart({ sourcePath: sentinelPath, directory: 'retained-published' });
        expect(worker.createGeometryCalls).toBe(1);
        worker.flushTelemetry();
        expect(
          entries.filter((entry) => entry.name === 'kernel.revalidate-retained').map((entry) => entry.detail),
        ).toContainEqual(
          expect.objectContaining({
            retainedPresentCount: 0,
            retainedMissingCount: 0,
            observedBodyBytes: 0,
            bodyByteCoverageComplete: true,
            status: 'completed',
          }),
        );
        entries.length = 0;
        readFile.mockClear();
        const published = await worker.publishAuthoredAssemblyRoot({
          authoredPath: 'assembly.json',
          publicationPath: 'published/root.json',
          directory: 'published',
        });
        expect(published.outcome.status).toBe('published');
        expect(worker.createGeometryCalls).toBe(childCount + 1);
        expect(Object.keys(published.partRecords ?? {})).toEqual(sources.map(({ name }) => name));
        const sourceDigest = `sha256:${await sha256String('cube')}`;
        for (const { name, path } of sources) {
          expect(published.publication?.parts[name]?.variants['default']?.source.files).toEqual({
            [path]: sourceDigest,
          });
        }
        // The sentinel is outside every selected snapshot and the final published source closure.
        // Its real provider reads isolate each child's global BEFORE validation, without span ancestry.
        expect(readFile.mock.calls.filter(([path]) => path === sentinelPath)).toHaveLength(childCount);
        const recipeReadCounts = sources.map(
          ({ path }) => readFile.mock.calls.filter(([readPath]) => readPath === path).length,
        );
        const lastRecipeReadCount = recipeReadCounts.at(-1);
        if (lastRecipeReadCount === undefined) {
          throw new Error('The final authored recipe provider read count is unavailable.');
        }
        expect(lastRecipeReadCount).toBeGreaterThan(0);
        // Equal independent recipes share local snapshot/evaluation/final-fence work.
        // Each earlier recipe additionally participates in every later child's global BEFORE walk.
        const earlierRecipeExcess = recipeReadCounts.map((count) => count - lastRecipeReadCount);
        expect(earlierRecipeExcess).toEqual(childCount === 2 ? [1, 0] : [3, 2, 1, 0]);
        expect(earlierRecipeExcess.reduce((sum, count) => sum + count, 0)).toBe(childCount === 2 ? 1 : 6);
        worker.flushTelemetry();
        const validations = entries.filter((entry) => entry.name === 'kernel.revalidate-retained');
        expect(validations).toHaveLength(childCount);
        for (const [index, validation] of validations.entries()) {
          expect(Number.isFinite(validation.duration)).toBe(true);
          expect(validation.duration).toBeGreaterThanOrEqual(0);
          expect(validation.detail).toMatchObject({
            retainedPresentCount: index + 1,
            retainedMissingCount: 0,
            observedBodyBytes: 6 + index * 4,
            bodyByteCoverageComplete: true,
            status: 'completed',
          });
        }
      } finally {
        await worker?.cleanup();
        readFile.mockRestore();
      }
    },
  );

  it.each(['error', 'missing-batch', 'abort'] as const)(
    'should close retained validation telemetry with truthful byte coverage after %s',
    async (scenario) => {
      await seedTestFileSystem({ 'retained/sentinel.kcl': 'sphere', 'parts/next.kcl': 'cube' });
      const filesystem = getTestFileSystem();
      const readFile = vi.spyOn(filesystem, 'readFile');
      const controller = new AbortController();
      const reason = new Error(`retained validation ${scenario}`);
      const entries: TelemetryEntry[] = [];
      let worker: MockKernelWorker | undefined;
      try {
        worker = await createWorker(false, undefined, {
          suppliedFileSystem: filesystem,
          suppliedWorker: new PublicationContentWorker([]),
        });
        worker.setTelemetrySend((batch) => entries.push(...batch));
        await worker.preparePublishedPart({ sourcePath: 'retained/sentinel.kcl', directory: 'retained-published' });
        worker.flushTelemetry();
        entries.length = 0;
        readFile.mockClear();
        if (scenario === 'missing-batch') {
          readFile.mockRejectedValueOnce(
            Object.assign(new Error('injected missing retained batch'), { code: 'ENOENT' }),
          );
        } else if (scenario === 'abort') {
          readFile.mockImplementationOnce(async () => {
            controller.abort(reason);
            throw reason;
          });
        } else {
          readFile.mockRejectedValueOnce(reason);
        }
        const snapshot = worker.snapshotSource({ file: { path: 'parts', filename: 'next.kcl' } }, controller.signal);
        if (scenario === 'missing-batch') {
          const result = await snapshot;
          expect(result.success).toBe(true);
          expect(result.sourceRevision?.files['parts/next.kcl']).toBe(`sha256:${await sha256String('cube')}`);
          expect(readFile.mock.calls.filter(([path]) => path === 'retained/sentinel.kcl')).toHaveLength(2);
        } else {
          await expect(snapshot).rejects.toThrow(reason.message);
          expect(readFile.mock.calls.filter(([path]) => path === 'retained/sentinel.kcl')).toHaveLength(1);
        }
        worker.flushTelemetry();
        const validations = entries.filter((entry) => entry.name === 'kernel.revalidate-retained');
        expect(validations).toHaveLength(1);
        expect(validations[0]?.detail).toMatchObject({
          retainedPresentCount: 1,
          retainedMissingCount: 0,
          observedBodyBytes: scenario === 'missing-batch' ? 6 : 0,
          bodyByteCoverageComplete: false,
          status: scenario === 'missing-batch' ? 'completed' : scenario === 'abort' ? 'aborted' : 'error',
        });
        expect(await filesystem.exists('published/root.json')).toBe(false);
        entries.length = 0;
        const recovered = await worker.snapshotSource({ file: { path: 'parts', filename: 'next.kcl' } });
        expect(recovered.success).toBe(true);
        worker.flushTelemetry();
        const recoveryValidations = entries.filter((entry) => entry.name === 'kernel.revalidate-retained');
        expect(recoveryValidations).toHaveLength(1);
        expect(recoveryValidations[0]?.detail).toMatchObject({
          observedBodyBytes: 6,
          bodyByteCoverageComplete: true,
          status: 'completed',
        });
      } finally {
        await worker?.cleanup();
        readFile.mockRestore();
      }
    },
  );

  it('keeps direct part preparation on the full retained-source freshness path', async () => {
    await seedTestFileSystem({ 'parts/a.kcl': 'cube', 'parts/b.kcl': 'sphere' });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new PublicationContentWorker([]),
    });
    const entries: TelemetryEntry[] = [];
    worker.setTelemetrySend((batch) => entries.push(...batch));
    try {
      await worker.preparePublishedPart({ sourcePath: 'parts/a.kcl', directory: 'published' });
      worker.flushTelemetry();
      entries.length = 0;
      await worker.preparePublishedPart({ sourcePath: 'parts/b.kcl', directory: 'published' });
      worker.flushTelemetry();
      const evaluation = entries.find((entry) => entry.name === 'kernel.evaluate-model');
      if (!evaluation) {
        throw new Error('The actual direct part evaluation is unavailable.');
      }
      const validation = entries.find(
        (entry) =>
          entry.name === 'kernel.revalidate-retained' &&
          entry.detail?.['parentSpanId'] === evaluation.detail?.['spanId'],
      );
      if (!validation) {
        throw new Error('The actual evaluation-owned retained validation is unavailable.');
      }
      expect(validation.detail).toMatchObject({ status: 'completed', bodyByteCoverageComplete: true });
      expect(
        entries.some(
          (entry) =>
            entry.name === 'fs.read' &&
            entry.detail?.['path'] === 'parts/a.kcl' &&
            entry.detail['parentSpanId'] === validation.detail?.['spanId'],
        ),
      ).toBe(true);
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('refreshes an equal-size same-tick entry and its import graph before an authored child', async () => {
    const original = 'exclude new-dependency';
    const replacement = 'include new-dependency';
    expect(replacement.length).toBe(original.length);
    await seedTestFileSystem({
      'parts/a.kcl': original,
      'parts/new-dependency.kcl': 'sphere',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const filesystem = getTestFileSystem();
    const readStat = filesystem.stat.bind(filesystem);
    // This filesystem's clock has one tick for both writes; bytes, never stat, decide freshness.
    const stat = vi.spyOn(filesystem, 'stat').mockImplementation(async (path) => ({
      ...(await readStat(path)),
      mtimeMs: 7,
    }));
    const worker = await createWorker(false, undefined, {
      suppliedFileSystem: { ...filesystem, watch: undefined },
      suppliedWorker: new MissingTransitiveDependencyWorker({
        middleware: [],
        admitAssemblyDisplay: async () => undefined,
        evaluationViewContent: emptyGlb(),
      }),
    });
    try {
      await worker.preparePublishedPart({ sourcePath: 'parts/a.kcl', directory: 'published' });
      const beforeStat = await filesystem.stat('parts/a.kcl');
      await filesystem.writeFile('parts/a.kcl', replacement);
      const afterStat = await filesystem.stat('parts/a.kcl');
      expect(afterStat.size).toBe(beforeStat.size);
      expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
      const published = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: 'published/root.json',
        directory: 'published',
      });
      expect(published.outcome.status).toBe('published');
      expect(published.publication?.parts['a']?.variants['default']?.source.files).toMatchObject({
        'parts/a.kcl': `sha256:${await sha256String(replacement)}`,
        'parts/new-dependency.kcl': `sha256:${await sha256String('sphere')}`,
      });
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
      stat.mockRestore();
    }
  });

  it('revokes an aborted authored child proof before a later publication operation', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const controller = new AbortController();
    let interrupt = true;
    class AbortedPublicationWorker extends PublicationContentWorker {
      protected override async onEvaluateForOwner(
        owner: OperationOwner,
        input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        if (interrupt) {
          controller.abort(new Error('cancelled authored child'));
        }
        return super.onEvaluateForOwner(owner, input, runtime);
      }
    }
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new AbortedPublicationWorker([], [], async () => undefined),
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    try {
      await expect(worker.publishAuthoredAssemblyRoot(input, controller.signal)).rejects.toThrow(
        'cancelled authored child',
      );
      expect(await getTestFileSystem().exists(input.publicationPath)).toBe(false);
      interrupt = false;
      const published = await worker.publishAuthoredAssemblyRoot(input);
      expect(published.outcome).toMatchObject({ status: 'published', generation: 1 });
    } finally {
      await worker.cleanup();
    }
  });

  it('drains attributed authored publication traces for explicit watched and cached work', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'parts/b.kcl': 'sphere',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } }, b: { source: { path: 'parts/b.kcl' } } },
        occurrences: [],
      }),
    });
    let throwsOnLog = false;
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new PublicationContentWorker([], [], async () => undefined),
      onLog: () => {
        if (throwsOnLog) {
          throw new Error('host logging failed');
        }
      },
    });
    const batches: TelemetryEntry[][] = [];
    worker.setTelemetrySend((entries) => batches.push(entries));
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const glbDigest = `sha256:${await sha256Bytes(emptyGlb())}`;
    const expectTrace = (entries: TelemetryEntry[], computedPaths: string[]): void => {
      const roots = entries.filter((entry) => entry.detail?.['parentSpanId'] === undefined);
      expect(roots).toHaveLength(1);
      const root = roots[0];
      expect(root).toMatchObject({ name: 'kernel.render', detail: { file: input.authoredPath } });
      expect(entries.at(-1)).toBe(root);
      const byId = new Map(entries.map((entry) => [entry.detail?.['spanId'], entry]));
      expect(byId.size).toBe(entries.length);
      for (const entry of entries) {
        let ancestor = entry;
        const visited = new Set<unknown>();
        while (ancestor !== root) {
          const parentId = ancestor.detail?.['parentSpanId'];
          expect(visited.has(parentId)).toBe(false);
          visited.add(parentId);
          const parent = byId.get(parentId);
          expect(parent).toBeDefined();
          if (!parent) {
            throw new Error('Publication trace has a missing parent.');
          }
          ancestor = parent;
        }
      }
      for (const mesh of entries.filter((entry) => entry.name === 'kernel.mesh')) {
        expect(mesh.detail).toMatchObject({ kernelId: 'mock-kernel', glbDigest });
        expect(typeof mesh.detail?.['entryPath']).toBe('string');
        expect(typeof mesh.detail?.['dependencyHash']).toBe('string');
        const encoded = mesh.detail?.['fileDependencies'];
        if (typeof encoded !== 'string') {
          throw new TypeError('Expected exact mesh file dependencies');
        }
        expect(encoded).toContain('"contentHash":"');
        const dependencies: unknown = JSON.parse(encoded);
        expect(dependencies).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'file', path: mesh.detail?.['entryPath'] })]),
        );
      }
      for (const name of ['kernel.compute', 'kernel.mesh-compute']) {
        const work = entries.filter((entry) => entry.name === name);
        expect(work).toHaveLength(computedPaths.length);
        expect(work.map((entry) => entry.detail?.['entryPath'])).toEqual(expect.arrayContaining(computedPaths));
        for (const entry of work) {
          expect(entry.detail?.['kernelId']).toBe('mock-kernel');
        }
      }
    };
    const expectPublishedRoot = (
      entries: TelemetryEntry[],
      outcome: { root: { digest: string }; generation: number },
    ): void => {
      expect(entries.at(-1)?.detail).toMatchObject({
        status: 'published',
        digest: outcome.root.digest,
        generation: outcome.generation,
      });
    };
    try {
      const first = await worker.publishAuthoredAssemblyRoot(input);
      expect(first.outcome.status).toBe('published');
      expect(batches).toHaveLength(1);
      expectTrace(batches[0] ?? [], ['parts/a.kcl', 'parts/b.kcl']);
      if (first.outcome.status !== 'published') {
        throw new Error('Expected an explicit publication receipt.');
      }
      expectPublishedRoot(batches[0] ?? [], first.outcome);
      await getTestFileSystem().writeFile('parts/a.kcl', 'cylinder');
      await vi.waitFor(
        () => {
          expect(batches).toHaveLength(2);
        },
        { timeout: 3000 },
      );
      expectTrace(batches[1] ?? [], ['parts/a.kcl']);
      const watchedText = new TextDecoder().decode(await getTestFileSystem().readFile(input.publicationPath));
      const watched = JSON.parse(watchedText) as { generation: number };
      expect(watched.generation).toBe(2);
      expectPublishedRoot(batches[1] ?? [], {
        root: { digest: `sha256:${await sha256String(watchedText)}` },
        generation: watched.generation,
      });
      const cached = await worker.publishAuthoredAssemblyRoot(input);
      expect(cached.outcome.status).toBe('published');
      expect(batches).toHaveLength(3);
      expectTrace(batches[2] ?? [], []);
      if (cached.outcome.status !== 'published') {
        throw new Error('Expected a cached publication receipt.');
      }
      expectPublishedRoot(batches[2] ?? [], cached.outcome);
      expect(worker.createGeometryCalls).toBe(3);
      const commit = vi
        .spyOn(partsRoot, 'publishAuthoredAssemblyRoot')
        .mockRejectedValueOnce(new Error('publication failed'));
      try {
        await expect(worker.publishAuthoredAssemblyRoot(input)).rejects.toThrow('publication failed');
        expect(batches).toHaveLength(4);
        expectTrace(batches[3] ?? [], []);
      } finally {
        commit.mockRestore();
      }
      throwsOnLog = true;
      worker.setTelemetrySend(() => {
        throw new Error('telemetry failed');
      });
      const withoutTelemetry = await worker.publishAuthoredAssemblyRoot(input);
      expect(withoutTelemetry.outcome.status).toBe('published');
      const failedCommit = vi
        .spyOn(partsRoot, 'publishAuthoredAssemblyRoot')
        .mockRejectedValueOnce(new Error('original publication failed'));
      try {
        await expect(worker.publishAuthoredAssemblyRoot(input)).rejects.toThrow('original publication failed');
      } finally {
        failedCommit.mockRestore();
        throwsOnLog = false;
      }
    } finally {
      await worker.cleanup();
    }
  });

  it('advances a live authored root after a watched edit and reuses its unchanged part', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'parts/b.kcl': 'sphere',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } }, b: { source: { path: 'parts/b.kcl' } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const readRoot = async (): Promise<{ generation: number }> =>
      JSON.parse(new TextDecoder().decode(await getTestFileSystem().readFile(input.publicationPath))) as {
        generation: number;
      };
    try {
      const first = await worker.publishAuthoredAssemblyRoot(input);
      expect(first.outcome.status).toBe('published');
      expect(worker.createGeometryCalls).toBe(2);
      expect(worker.getWatchedPaths()).toEqual(new Set(['assembly.json', 'parts/a.kcl', 'parts/b.kcl']));
      await getTestFileSystem().writeFile('parts/a.kcl', 'cylinder');
      await vi.waitFor(
        async () => {
          const root = await readRoot();
          expect(root.generation).toBe(2);
        },
        { timeout: 3000 },
      );
      expect(worker.createGeometryCalls).toBe(3);
      const repeated = await worker.publishAuthoredAssemblyRoot(input);
      expect(repeated.outcome.status).toBe('published');
      expect(worker.createGeometryCalls).toBe(3);
      await getTestFileSystem().writeFile(
        'assembly.json',
        JSON.stringify({
          schemaVersion: 1,
          parts: { a: { source: { path: 'parts/a.kcl' } } },
          occurrences: [],
        }),
      );
      await worker.notifyFileChanged(['assembly.json']);
      await vi.waitFor(
        async () => {
          const root = await readRoot();
          expect(root.generation).toBe(4);
        },
        { timeout: 3000 },
      );
      expect(worker.getWatchedPaths().has('parts/b.kcl')).toBe(false);
      expect(worker.createGeometryCalls).toBe(3);
    } finally {
      await worker.cleanup();
    }
  });

  it('should watch optional middleware sidecar absence and invalidate retained part reuse when it appears', async () => {
    const sidecarPath = '.tau/parameters/parts/screw.kcl.json';
    await seedTestFileSystem({
      'parts/screw.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { screw: { source: { path: 'parts/screw.kcl' } } },
        occurrences: [],
      }),
    });
    const middleware = defineMiddleware({
      id: 'watched-optional-sidecar',
      name: 'WatchedOptionalSidecar',
      resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
    });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new MockKernelWorker({
        middleware: [middleware],
        admitAssemblyDisplay: async () => undefined,
        evaluationViewContent: emptyGlb(),
      }),
    });
    const input = {
      authoredPath: 'assembly.json',
      publicationPath: 'published/optional-watch-root.json',
      directory: 'published',
    };
    const readRoot = async (): Promise<{ generation: number; parts: Record<string, PublishedPartReference> }> =>
      JSON.parse(await getTestFileSystem().readFile(input.publicationPath, 'utf8')) as {
        generation: number;
        parts: Record<string, PublishedPartReference>;
      };
    try {
      const publishedAgain = await worker.publishAuthoredAssemblyRoot(input);
      expect(publishedAgain.outcome.status).toBe('published');
      const initial = await readRoot();
      const initialPart = initial.parts['screw']!;
      const initiallyAdmitted = await worker.admitPublishedPart(initialPart);
      expect(initiallyAdmitted.variants['default']?.source.files[sidecarPath]).toBe('missing');
      expect(worker.getWatchedPaths().has(sidecarPath)).toBe(true);
      expect(worker.createGeometryCalls).toBe(1);
      const refreshedAgain = await worker.publishAuthoredAssemblyRoot(input);
      expect(refreshedAgain.outcome.status).toBe('published');
      expect(worker.createGeometryCalls).toBe(1);
      const retained = await readRoot();
      expect(retained.parts['screw']).toEqual(initialPart);
      const bytes = 'new authored sidecar';
      await getTestFileSystem().writeFile(sidecarPath, bytes);
      await vi.waitFor(
        async () => {
          const observedRoot = await readRoot();
          expect(observedRoot.generation).toBe(retained.generation + 1);
        },
        { timeout: 3000 },
      );
      const refreshed = await readRoot();
      expect(refreshed.parts['screw']?.digest).not.toBe(initialPart.digest);
      const refreshedPart = await worker.admitPublishedPart(refreshed.parts['screw']!);
      expect(refreshedPart.variants['default']?.source.files[sidecarPath]).toBe(`sha256:${await sha256String(bytes)}`);
      expect(worker.createGeometryCalls).toBe(2);
      const postAppearanceRepeat = await worker.publishAuthoredAssemblyRoot(input);
      expect(postAppearanceRepeat.outcome.status).toBe('published');
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('should rebuild an initial source divergence between root commit and watch arm', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const filesystem = getTestFileSystem();
    const checkedWrite = filesystem.writeFileChecked;
    if (!checkedWrite) {
      throw new Error('Expected the checked publication fixture.');
    }
    let changed = false;
    filesystem.writeFileChecked = async (input) => {
      const result = await checkedWrite(input);
      if (!changed && input.path === 'published/root.json' && result.status === 'applied') {
        changed = true;
        await filesystem.writeFile('parts/a.kcl', 'sphere');
      }
      return result;
    };
    try {
      const first = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: 'published/root.json',
        directory: 'published',
      });
      expect(first.outcome.status).toBe('published');
      await vi.waitFor(
        async () => {
          const root = JSON.parse(new TextDecoder().decode(await filesystem.readFile('published/root.json'))) as {
            generation: number;
          };
          expect(root.generation).toBe(2);
        },
        { timeout: 3000 },
      );
      expect(worker.createGeometryCalls).toBe(2);
      expect(worker.getWatchedPaths().has('parts/a.kcl')).toBe(true);
    } finally {
      filesystem.writeFileChecked = checkedWrite;
      await worker.cleanup();
    }
  });

  it('retains the coherent root and retries a missing authored source when it appears', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const errors = vi.fn();
    worker.onDocumentError = errors;
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const rootBytes = async (): Promise<Uint8Array<ArrayBuffer>> => getTestFileSystem().readFile(input.publicationPath);
    try {
      const published = await worker.publishAuthoredAssemblyRoot(input);
      expect(published.outcome.status).toBe('published');
      const coherent = await rootBytes();
      await getTestFileSystem().unlink('parts/a.kcl');
      await worker.notifyFileChanged(['parts/a.kcl']);
      await vi.waitFor(
        () => {
          expect(errors).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
      expect(await rootBytes()).toEqual(coherent);
      expect(worker.getWatchedPaths().has('parts/a.kcl')).toBe(true);
      await getTestFileSystem().writeFile('parts/a.kcl', 'sphere');
      await vi.waitFor(
        async () => {
          expect(await rootBytes()).not.toEqual(coherent);
        },
        { timeout: 3000 },
      );
    } finally {
      await worker.cleanup();
    }
  });

  it('watches a newly declared missing source and publishes only after it appears', async () => {
    const authored = (extra: boolean): string =>
      JSON.stringify({
        schemaVersion: 1,
        parts: {
          a: { source: { path: 'parts/a.kcl' } },
          ...(extra ? { b: { source: { path: 'parts/b.kcl' } } } : {}),
        },
        occurrences: [],
      });
    await seedTestFileSystem({ 'parts/a.kcl': 'cube', 'assembly.json': authored(false) });
    const worker = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const errors = vi.fn();
    worker.onDocumentError = errors;
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const rootBytes = async (): Promise<Uint8Array<ArrayBuffer>> => getTestFileSystem().readFile(input.publicationPath);
    try {
      const published = await worker.publishAuthoredAssemblyRoot(input);
      expect(published.outcome.status).toBe('published');
      const coherent = await rootBytes();
      await getTestFileSystem().writeFile('assembly.json', authored(true));
      await worker.notifyFileChanged(['assembly.json']);
      await vi.waitFor(
        () => {
          expect(errors).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
      expect(await rootBytes()).toEqual(coherent);
      expect(worker.getWatchedPaths().has('parts/b.kcl')).toBe(true);
      await getTestFileSystem().writeFile('parts/b.kcl', 'sphere');
      await worker.notifyFileChanged(['parts/b.kcl']);
      await vi.waitFor(
        async () => {
          expect(await rootBytes()).not.toEqual(coherent);
        },
        { timeout: 3000 },
      );
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('should watch a newly missing transitive dependency and recover when only that file appears', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, {
      suppliedWorker: new MissingTransitiveDependencyWorker({
        middleware: [],
        admitAssemblyDisplay: async () => undefined,
        evaluationViewContent: emptyGlb(),
      }),
    });
    const errors = vi.fn();
    worker.onDocumentError = errors;
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    try {
      const first = await worker.publishAuthoredAssemblyRoot(input);
      expect(first.outcome.status).toBe('published');
      const coherent = await getTestFileSystem().readFile(input.publicationPath);
      await getTestFileSystem().writeFile('parts/a.kcl', 'include new-dependency');
      await worker.notifyFileChanged(['parts/a.kcl']);
      await vi.waitFor(
        () => {
          expect(errors).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
      expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(coherent);
      expect(worker.getWatchedPaths().has('parts/new-dependency.kcl')).toBe(true);
      expect(worker.createGeometryCalls).toBe(1);
      await getTestFileSystem().writeFile('parts/new-dependency.kcl', 'sphere');
      await vi.waitFor(
        async () => {
          expect(await getTestFileSystem().readFile(input.publicationPath)).not.toEqual(coherent);
        },
        { timeout: 3000 },
      );
      expect(worker.createGeometryCalls).toBe(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('should retain the coherent root when cleanup interrupts an automatic publication', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let interrupt = false;
    const worker = await createWorker(false, undefined, {
      admitAssemblyDisplay: async () => {
        if (interrupt) {
          entered.resolve();
          await release.promise;
        }
      },
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    try {
      const first = await worker.publishAuthoredAssemblyRoot(input);
      expect(first.outcome.status).toBe('published');
      const coherent = await getTestFileSystem().readFile(input.publicationPath);
      interrupt = true;
      await getTestFileSystem().writeFile('parts/a.kcl', 'sphere');
      await worker.notifyFileChanged(['parts/a.kcl']);
      await entered.promise;
      expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(coherent);
      const cleanup = worker.cleanup();
      release.resolve();
      await cleanup;
      expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(coherent);
      const cold = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      try {
        const reopened = await cold.publishAuthoredAssemblyRoot(input);
        expect(reopened.outcome).toMatchObject({ status: 'published', generation: 2 });
        expect(cold.createGeometryCalls).toBe(1);
      } finally {
        await cold.cleanup();
      }
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('rejects a source edit during display admission before advancing the root', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    let editDuringAdmission = false;
    const worker = await createWorker(false, undefined, {
      admitAssemblyDisplay: async () => {
        if (editDuringAdmission) {
          await getTestFileSystem().writeFile('parts/a.kcl', 'sphere');
        }
      },
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    try {
      const published = await worker.publishAuthoredAssemblyRoot(input);
      expect(published.outcome.status).toBe('published');
      const coherent = await getTestFileSystem().readFile(input.publicationPath);
      editDuringAdmission = true;
      const late = await worker.publishAuthoredAssemblyRoot(input);
      expect(late.outcome).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
      expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(coherent);
    } finally {
      await worker.cleanup();
    }
  });

  it('rejects mixed inline ownership before staging a file-backed dependency', async () => {
    await seedTestFileSystem({
      'parts/default.kcl': 'include common',
      'parts/common.kcl': 'original',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: {
          default: { source: { path: 'parts/default.kcl' } },
          inline: {
            source: {
              files: { 'parts/inline.kcl': 'cube', 'parts/common.kcl': 'clobbered' },
              entry: 'parts/inline.kcl',
            },
          },
        },
        occurrences: [],
      }),
    });
    const worker = await createWorker(false, undefined, {
      admitAssemblyDisplay: async () => undefined,
      suppliedWorker: new OverlappingDependencyWorker({
        middleware: [],
        admitAssemblyDisplay: async () => undefined,
        evaluationViewContent: emptyGlb(),
      }),
    });
    try {
      const result = await worker.publishAuthoredAssemblyRoot({
        authoredPath: 'assembly.json',
        publicationPath: 'published/root.json',
        directory: 'published',
      });
      expect(result.outcome).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
      expect(worker.createGeometryCalls).toBe(0);
      expect(await getTestFileSystem().readFile('parts/common.kcl', 'utf8')).toBe('original');
      expect(await getTestFileSystem().exists('parts/inline.kcl')).toBe(false);
      expect(await getTestFileSystem().exists('published/root.json')).toBe(false);
    } finally {
      await worker.cleanup();
    }
  });

  it('lets only one live client advance a shared watched root after the same edit', async () => {
    const registry = new ProviderRegistry({ databasePrefix: `assembly-watch-race-${Date.now()}` });
    const scope = { backend: 'indexeddb' } as const;
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
    let admissionCount = 0;
    let admitBoth: (() => void) | undefined;
    const bothAdmitted = new Promise<void>((resolve) => {
      admitBoth = resolve;
    });
    const projector = async (): Promise<void> => {
      admissionCount++;
      if (admissionCount > 2) {
        if (admissionCount === 4) {
          admitBoth?.();
        }
        await bothAdmitted;
      }
    };
    let left: MockKernelWorker | undefined;
    let right: MockKernelWorker | undefined;
    try {
      await rooted.mkdir('parts', { recursive: true });
      await rooted.writeFile('parts/a.kcl', 'cube');
      await rooted.writeFile(
        'assembly.json',
        JSON.stringify({
          schemaVersion: 1,
          parts: { a: { source: { path: 'parts/a.kcl' } } },
          occurrences: [],
        }),
      );
      left = await createWorker(false, undefined, { admitAssemblyDisplay: projector, suppliedFileSystem: rooted });
      right = await createWorker(false, undefined, { admitAssemblyDisplay: projector, suppliedFileSystem: rooted });
      const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
      const leftPublished = await left.publishAuthoredAssemblyRoot(input);
      const rightPublished = await right.publishAuthoredAssemblyRoot(input);
      expect(leftPublished.outcome.status).toBe('published');
      expect(rightPublished.outcome.status).toBe('published');
      expect(rightPublished.outcome).toEqual(leftPublished.outcome);
      expect(rightPublished.partRecords).toEqual(leftPublished.partRecords);
      await rooted.writeFile('parts/a.kcl', 'sphere');
      await Promise.all([left.notifyFileChanged(['parts/a.kcl']), right.notifyFileChanged(['parts/a.kcl'])]);
      await vi.waitFor(
        async () => {
          const root = JSON.parse(await rooted.readFile(input.publicationPath, 'utf8')) as { generation: number };
          expect(root.generation).toBe(2);
          expect(admissionCount).toBeGreaterThanOrEqual(4);
        },
        { timeout: 5000 },
      );
    } finally {
      admitBoth?.();
      await Promise.all([left?.cleanup(), right?.cleanup()]);
      service.dispose();
    }
  });
  it('rebinds a fresh authored client to the unchanged persisted pin before a deferred source edit', async () => {
    await seedTestFileSystem({
      'parts/default.kcl': 'cube',
      'parts/named.kcl': 'sphere',
      'parts/fixed.kcl': 'cylinder',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: {
          edited: {
            source: { path: 'parts/default.kcl' },
            variants: { named: { source: { path: 'parts/named.kcl' } } },
          },
          fixed: { source: { path: 'parts/fixed.kcl' } },
        },
        occurrences: [
          {
            id: 'group',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            children: [
              {
                id: 'placed',
                part: 'edited',
                variant: 'named',
                transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
              },
            ],
          },
        ],
      }),
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const original = await first.publishAuthoredAssemblyRoot(input);
    expect(original.outcome.status).toBe('published');
    if (original.outcome.status !== 'published') {
      throw new Error('Expected initial publication');
    }
    const originalOutcome = original.outcome;
    const bytes = await getTestFileSystem().readFile(input.publicationPath);
    await first.cleanup();
    const second = await createWorker(false, undefined, {
      suppliedWorker: new PublicationContentWorker([], [], async () => undefined),
    });
    try {
      const reused = await second.publishAuthoredAssemblyRoot(input);
      expect(reused.outcome).toEqual(original.outcome);
      expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(bytes);
      expect(second.createGeometryCalls).toBe(0);
      expect((second as PublicationContentWorker).meshContents).toEqual([]);
      expect((second as PublicationContentWorker).buildInputs).toEqual([]);
      expect(second.getWatchedPaths().has('parts/named.kcl')).toBe(true);
      expect(reused.partRecords).toEqual(original.partRecords);
      await getTestFileSystem().writeFile('parts/named.kcl', new TextEncoder().encode('changed named source'));
      await second.notifyFileChanged(['parts/named.kcl']);
      await vi.waitFor(
        async () => {
          const current = await second.readPublishedAssemblyRoot(input.publicationPath);
          expect(current.status).toBe('present');
          if (current.status !== 'present') {
            throw new Error('Expected watched publication');
          }
          expect(current.generation).toBe(originalOutcome.generation + 1);
          expect(current.root.digest).not.toBe(originalOutcome.root.digest);
        },
        { timeout: 5000 },
      );
      expect(second.createGeometryCalls).toBe(2);
      const current = JSON.parse(await getTestFileSystem().readFile(input.publicationPath, 'utf8')) as {
        parts: Record<string, PublishedPartReference>;
      };
      expect(current.parts['fixed']).toEqual(original.partRecords?.['fixed']);
      const oldReference = original.partRecords?.['edited'];
      const oldAsset = original.publication?.parts['edited']?.variants['named']?.glb;
      if (!oldReference || !oldAsset) {
        throw new Error('Expected old immutable named part');
      }
      expect(await second.readPublishedPartAsset(oldReference, oldAsset.digest)).toEqual(emptyGlb());
    } finally {
      await second.cleanup();
    }
  });

  it.each(['entry', 'variants', 'inline', 'durable', 'occurrences'] as const)(
    'keeps normal generation advancement when persisted %s proof differs',
    async (change) => {
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const authored = {
        schemaVersion: 1,
        parts: { a: { source: { files: { 'parts/a.kcl': 'cube' }, entry: 'parts/a.kcl' }, variants: {} } },
        occurrences: [{ id: 'a', part: 'a', transform: identity }],
      };
      await seedTestFileSystem({
        'parts/a.kcl': 'cube',
        'parts/b.kcl': 'sphere',
        'assembly.json': JSON.stringify(authored),
      });
      const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
      const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      const original = await first.publishAuthoredAssemblyRoot(input);
      expect(original.outcome.status).toBe('published');
      if (original.outcome.status !== 'published') {
        throw new Error('Expected initial publication');
      }
      await first.cleanup();
      const changed = structuredClone(authored) as {
        schemaVersion: number;
        parts: Record<
          string,
          {
            source: { files?: Record<string, string>; entry?: string; path?: string };
            variants: Record<string, { source: { path: string } }>;
          }
        >;
        occurrences: Array<{ id: string; part: string; transform: number[] }>;
      };
      const recipe = changed.parts['a'];
      if (!recipe) {
        throw new Error('Expected recipe');
      }
      if (change === 'entry') {
        recipe.source = { path: 'parts/b.kcl' };
      }
      if (change === 'variants') {
        recipe.variants['named'] = { source: { path: 'parts/b.kcl' } };
      }
      if (change === 'inline') {
        recipe.source.files = { 'parts/a.kcl': 'changed inline' };
      }
      if (change === 'durable') {
        recipe.source = { path: 'parts/a.kcl' };
        await getTestFileSystem().writeFile('parts/a.kcl', new TextEncoder().encode('changed durable'));
      }
      if (change === 'occurrences') {
        changed.occurrences[0]!.transform[12] = 2;
      }
      await getTestFileSystem().writeFile('assembly.json', new TextEncoder().encode(JSON.stringify(changed)));
      const second = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      try {
        const result = await second.publishAuthoredAssemblyRoot(input);
        expect(result.outcome.status).toBe('published');
        if (result.outcome.status !== 'published') {
          throw new Error('Expected changed publication');
        }
        expect(result.outcome.generation).toBe(original.outcome.generation + 1);
        expect(result.outcome.root.digest).not.toBe(original.outcome.root.digest);
      } finally {
        await second.cleanup();
      }
    },
  );

  it('preserves an abort at fresh persisted watch arm and permits exact retry', async () => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const original = await first.publishAuthoredAssemblyRoot(input);
    if (original.outcome.status !== 'published') {
      throw new Error('Expected initial publication');
    }
    await first.cleanup();
    const filesystem = getTestFileSystem();
    const { watch } = filesystem;
    if (!watch) {
      throw new Error('Expected watch-capable fixture');
    }
    const before = await filesystem.readFile(input.publicationPath);
    const controller = new AbortController();
    const reason = new Error('cancelled at persisted watch arm');
    const { generation } = original.outcome;
    let armed = false;
    filesystem.watch = (request, handler) => {
      const unsubscribe = watch.call(filesystem, request, handler);
      if (!armed && request.paths.includes(input.authoredPath)) {
        armed = true;
        controller.abort(reason);
      }
      return unsubscribe;
    };
    const second = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    try {
      await expect(second.publishAuthoredAssemblyRoot(input, controller.signal)).rejects.toBe(reason);
      expect(armed).toBe(true);
      expect(second.createGeometryCalls).toBe(0);
      expect(await filesystem.readFile(input.publicationPath)).toEqual(before);
      filesystem.watch = watch;
      const retry = await second.publishAuthoredAssemblyRoot(input);
      expect(retry.outcome).toEqual(original.outcome);
      expect(second.createGeometryCalls).toBe(0);
      await filesystem.writeFile('parts/a.kcl', 'changed after retry');
      await vi.waitFor(
        async () => {
          const root = JSON.parse(await filesystem.readFile(input.publicationPath, 'utf8')) as { generation: number };
          expect(root.generation).toBe(generation + 1);
        },
        { timeout: 3000 },
      );
      expect(second.createGeometryCalls).toBe(1);
    } finally {
      filesystem.watch = watch;
      await second.cleanup();
    }
  });

  it.each(['source', 'root'] as const)('refuses an unchanged receipt after %s changes at watch arm', async (change) => {
    await seedTestFileSystem({
      'parts/a.kcl': 'cube',
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      }),
    });
    const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
    const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    const original = await first.publishAuthoredAssemblyRoot(input);
    if (original.outcome.status !== 'published') {
      throw new Error('Expected initial publication');
    }
    const { generation } = original.outcome;
    await first.cleanup();
    const filesystem = getTestFileSystem();
    const { watch } = filesystem;
    if (!watch) {
      throw new Error('Expected watch-capable fixture');
    }
    const root = JSON.parse(await filesystem.readFile(input.publicationPath, 'utf8')) as { generation: number };
    let mutation: Promise<void> | undefined;
    filesystem.watch = (request, handler) => {
      const unsubscribe = watch.call(filesystem, request, handler);
      if (!mutation && request.paths.includes('assembly.json')) {
        mutation =
          change === 'source'
            ? filesystem.writeFile('parts/a.kcl', 'changed while arming')
            : filesystem.writeFile(input.publicationPath, JSON.stringify({ ...root, generation: generation + 1 }));
      }
      return unsubscribe;
    };
    const second = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
    try {
      const result = await second.publishAuthoredAssemblyRoot(input);
      await mutation;
      expect(mutation).toBeDefined();
      expect(result.outcome.status).toBe('published');
      if (result.outcome.status !== 'published') {
        throw new Error('Expected changed publication');
      }
      expect(result.outcome.root).not.toEqual(original.outcome.root);
      expect(result.outcome.generation).toBe(generation + (change === 'root' ? 2 : 1));
      expect(second.createGeometryCalls).toBeGreaterThan(0);
    } finally {
      filesystem.watch = watch;
      await second.cleanup();
    }
  });

  it.each(['source-authored', 'source-root', 'inline-authored', 'inline-root', 'inline-file-backed'] as const)(
    'denies fresh persisted reuse for forbidden %s ownership',
    async (ownership) => {
      const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
      await seedTestFileSystem({
        'parts/a.kcl': 'cube',
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: { a: { source: { path: 'parts/a.kcl' } } },
          occurrences: [],
        }),
      });
      const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      const original = await first.publishAuthoredAssemblyRoot(input);
      if (original.outcome.status !== 'published') {
        throw new Error('Expected initial publication');
      }
      const rootBytes = await getTestFileSystem().readFile(input.publicationPath);
      await first.cleanup();
      const path = ownership.endsWith('authored') ? input.authoredPath : input.publicationPath;
      const source = ownership.startsWith('source')
        ? { path }
        : { files: { [path]: 'would overwrite owner' }, entry: path };
      const authored =
        ownership === 'inline-file-backed'
          ? {
              schemaVersion: 1,
              parts: {
                a: { source: { path: 'parts/a.kcl' } },
                inline: { source: { files: { 'parts/a.kcl': 'would overwrite source' }, entry: 'parts/a.kcl' } },
              },
              occurrences: [],
            }
          : { schemaVersion: 1, parts: { a: { source } }, occurrences: [] };
      const authoredBytes = new TextEncoder().encode(JSON.stringify(authored));
      await getTestFileSystem().writeFile(input.authoredPath, authoredBytes);
      const second = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      try {
        const result = await second.publishAuthoredAssemblyRoot(input);
        expect(result.outcome).toMatchObject({ status: 'invalid', issues: [{ code: 'SCENE_REFERENCE_INVALID' }] });
        expect(second.createGeometryCalls).toBe(0);
        expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(rootBytes);
        expect(await getTestFileSystem().readFile(input.authoredPath)).toEqual(authoredBytes);
        expect(await getTestFileSystem().readFile('parts/a.kcl', 'utf8')).toBe('cube');
      } finally {
        await second.cleanup();
      }
    },
  );

  it.each(['malformed', 'schema', 'projector'] as const)(
    'preserves the original fresh-root %s invalid outcome and repairs its watch',
    async (failure) => {
      const authored = JSON.stringify({
        schemaVersion: 1,
        parts: { a: { source: { path: 'parts/a.kcl' } } },
        occurrences: [],
      });
      await seedTestFileSystem({ 'parts/a.kcl': 'cube', 'assembly.json': authored });
      const input = { authoredPath: 'assembly.json', publicationPath: 'published/root.json', directory: 'published' };
      const first = await createWorker(false, undefined, { admitAssemblyDisplay: async () => undefined });
      const original = await first.publishAuthoredAssemblyRoot(input);
      if (original.outcome.status !== 'published') {
        throw new Error('Expected initial publication');
      }
      const initialGeneration = original.outcome.generation;
      const rootBytes = await getTestFileSystem().readFile(input.publicationPath);
      await first.cleanup();
      if (failure !== 'projector') {
        await getTestFileSystem().writeFile(
          'assembly.json',
          failure === 'malformed' ? '{broken' : '{"schemaVersion":7}',
        );
      }
      let projectorFails = failure === 'projector';
      const second = await createWorker(false, undefined, {
        admitAssemblyDisplay: async () => {
          if (projectorFails) {
            throw new Error('Display admission refused');
          }
        },
      });
      try {
        const refused = await second.publishAuthoredAssemblyRoot(input);
        expect(refused.outcome).toMatchObject({
          status: 'invalid',
          issues: [{ code: failure === 'projector' ? 'SCENE_DISPLAY_INVALID' : 'SCENE_REFERENCE_INVALID' }],
        });
        expect(await getTestFileSystem().readFile(input.publicationPath)).toEqual(rootBytes);
        expect(second.getWatchedPaths().has('assembly.json')).toBe(true);
        projectorFails = false;
        await getTestFileSystem().writeFile('assembly.json', `${authored}\n`);
        await second.notifyFileChanged(['assembly.json']);
        await vi.waitFor(
          async () => {
            const current = await second.readPublishedAssemblyRoot(input.publicationPath);
            expect(current.status).toBe('present');
            if (current.status !== 'present') {
              throw new Error('Expected repaired publication');
            }
            expect(current.generation).toBe(initialGeneration + 1);
          },
          { timeout: 5000 },
        );
      } finally {
        await second.cleanup();
      }
    },
  );
});
