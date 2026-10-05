// @vitest-environment node
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Matrix4, PerspectiveCamera } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import {
  deriveAssemblyDetailGeometry,
  estimateAssemblyDetailPixelError,
  shouldUseAssemblyDetail,
} from '#components/geometry/graphics/three/react/gltf-mesh.js';
import type { AuthoredAssembly } from '@taucad/runtime/types';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import type { RuntimeTransportCloseResult } from '@taucad/runtime/transport';
import { defineRuntime } from '@taucad/runtime/worker';
import { jscadKernel } from '@taucad/jscad';
import { esbuildBundler } from '@taucad/esbuild';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createNodeIo, readGltfSceneBounds, validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import { digestContent } from '@taucad/cache-core';
import { sha256String } from '@taucad/utils/hash';
import { admitAssemblyDisplay, createAssemblyPublicationAuthority } from '#runtime/assembly-display-admission.js';
import { createScaleFixture, isScaleFixtureName } from '#routes/[__e2e].project-file-tree/scale-fixture.js';
import { prepareScaleCorpus } from '#routes/[__e2e].project-file-tree/route.js';

/* eslint-disable @typescript-eslint/naming-convention -- ENV and its uppercase client environment keys are the existing external contract. */
vi.mock('#environment.config.js', () => ({
  ENV: {
    TAU_API_URL: 'https://api.tau.test',
    TAU_WEBSOCKET_URL: 'wss://api.tau.test',
    TAU_FRONTEND_URL: 'https://tau.test',
    TAU_DEBUG: false,
    NODE_ENV: 'test',
  },
}));
/* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary naming rules after the external ENV contract fixture. */

const decoder = new TextDecoder();

describe('finite authored scale fixtures', () => {
  it.each([undefined, 'physical-inspection', 'scale-1000000', '__proto__', 'constructor'])(
    'does not reinterpret the existing or arbitrary selector %s as a scale seed',
    (name) => {
      expect(isScaleFixtureName(name)).toBe(false);
    },
  );

  it.each([
    { name: 'scale-123', definitions: 123, occurrences: 123, sourceBytes: 17_343, authoredBytes: 16_537 },
    { name: 'scale-10k', definitions: 100, occurrences: 10_000, sourceBytes: 14_100, authoredBytes: 839_545 },
    { name: 'scale-100k', definitions: 1000, occurrences: 100_000, sourceBytes: 141_000, authoredBytes: 8_475_045 },
  ] as const)('seeds $name with real unique sources and a closed placement graph', (workload) => {
    const fixture = createScaleFixture(workload.name);
    const authored = JSON.parse(decoder.decode(fixture.files[fixture.entryPath]!.content)) as AuthoredAssembly;
    expect(fixture.denominator).toMatchObject({
      definitions: workload.definitions,
      occurrences: workload.occurrences,
      sourceBytes: workload.sourceBytes,
      authoredBytes: workload.authoredBytes,
    });
    expect(Object.keys(authored.parts)).toHaveLength(workload.definitions);
    expect(authored.occurrences).toHaveLength(workload.occurrences);
    expect(new Set(authored.occurrences.map(({ id }) => id)).size).toBe(workload.occurrences);
    expect(Object.keys(fixture.files)).toHaveLength(workload.definitions + 1);
    const recipes = Object.values(fixture.files).filter((_, index) => index < workload.definitions);
    expect(new Set(recipes.map(({ content }) => decoder.decode(content))).size).toBe(workload.definitions);
    expect(recipes.every(({ content }) => decoder.decode(content).includes("from '@jscad/modeling'"))).toBe(true);
    const placements = authored.occurrences;
    expect(
      placements.every((occurrence) => occurrence.part !== undefined && Object.hasOwn(authored.parts, occurrence.part)),
    ).toBe(true);
    expect(
      placements.every(
        ({ transform }) => transform.length === 16 && transform.every((value) => Number.isFinite(value)),
      ),
    ).toBe(true);
    expect(
      placements.every(
        ({ transform }) => [transform[3], transform[7], transform[11], transform[15]].join(',') === '0,0,0,1',
      ),
    ).toBe(true);
    expect(fixture.denominator.expectedExpandedTriangles).toBeLessThanOrEqual(2_000_000);
    expect(placements[1]?.transform[12]).toBe(0.04);
    expect(placements[workload.name === 'scale-123' ? 11 : 100]?.transform[13]).toBe(0.04);
  });

  it('keeps warehouse cells disjoint while reusing each of the 1000 definitions exactly 100 times', () => {
    const fixture = createScaleFixture('scale-100k');
    const authored = JSON.parse(decoder.decode(fixture.files[fixture.entryPath]!.content)) as AuthoredAssembly;
    const counts = new Map<string, number>();
    for (const occurrence of authored.occurrences) {
      if (occurrence.part !== undefined) {
        counts.set(occurrence.part, (counts.get(occurrence.part) ?? 0) + 1);
      }
    }
    expect([...counts.values()].every((count) => count === 100)).toBe(true);
    expect(authored.occurrences[0]?.transform.slice(12, 15)).toEqual([0, 0, 0]);
    expect(authored.occurrences[10_000]?.transform.slice(12, 15)).toEqual([6, 0, 0]);
    expect(authored.occurrences[99_999]?.transform.slice(12, 15)).toEqual([57.96, 3.96, 0]);
  });
  it('keeps finite curved calibration separate from the complete cuboid denominators', () => {
    const fixture = createScaleFixture('scale-detail-calibration');
    expect(isScaleFixtureName('scale-detail-calibration')).toBe(true);
    const sphere = fixture.files['scale/parts/p0000.js'];
    const torus = fixture.files['scale/parts/p0001.js'];
    if (!sphere || !torus) {
      throw new Error('Finite calibration recipes are missing.');
    }
    expect(decoder.decode(sphere.content)).toContain('primitives.sphere({radius:100,segments:128})');
    expect(decoder.decode(torus.content)).toContain(
      'primitives.torus({innerRadius:30,outerRadius:70,innerSegments:64,outerSegments:128})',
    );
    expect(fixture.denominator.definitions).toBe(2);
    expect(fixture.denominator.occurrences).toBe(2);
    expect(fixture.denominator.expectedDefinitionTriangles).toBeUndefined();
    expect(fixture.denominator.expectedExpandedTriangles).toBeUndefined();
    const authored: unknown = JSON.parse(decoder.decode(fixture.files[fixture.entryPath]!.content));
    expect(authored).toMatchObject({
      occurrences: [
        { id: 'o000000', part: 'p0000' },
        { id: 'o000001', part: 'p0001', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.3, 0, 0, 1] },
      ],
    });
    expect(createScaleFixture('scale-100k').denominator).toMatchObject({
      definitions: 1000,
      occurrences: 100_000,
      expectedExpandedTriangles: 1_200_000,
    });
  });
});

/** Real rooted memory project; the runtime and host keep checked publication authority. */
const createCurvedProject = async (files: Readonly<Record<string, { content: Uint8Array<ArrayBuffer> }>>) => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:curved-calibration-test' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const service = new WorkspaceFileService({
    providerRegistry,
    mountTable,
    eventBus: new ChangeEventBus(),
    resourceQueue: new ResourceQueue(),
  });
  const fileSystem = service.createRootedFileSystem('/');
  try {
    for (const [path, file] of Object.entries(files)) {
      // eslint-disable-next-line no-await-in-loop -- Seed this one owned project before its real checked publication.
      await fileSystem.writeFile(path, file.content);
    }
  } catch (error) {
    service.dispose();
    throw error;
  }
  return {
    fileSystem,
    runtimeFileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(fileSystem)),
    dispose: () => {
      service.dispose();
    },
  };
};

describe('checked completed scale corpus handoff', () => {
  it.each(['retained', 'throwing'])(
    'should complete every real record and GLB with a %s phase observer and reopen the same pin without sources or kernels',
    async (observer) => {
      const fixture = createScaleFixture('scale-detail-calibration');
      const producer = await createCurvedProject(fixture.files);
      const connections: FileSystemBridgeConnection[] = [];
      const disposeCalls: Array<ReturnType<typeof vi.fn<() => void>>> = [];
      const phases: Array<Parameters<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>[0]> = [];
      try {
        const parent = await sha256String(fixture.entryPath);
        const completed = await prepareScaleCorpus({
          fixture,
          publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
          signal: new AbortController().signal,
          isCurrent: () => true,
          onPhase: (phase) => {
            phases.push(phase);
            if (observer === 'throwing') {
              throw new Error('Phase observation failed.');
            }
          },
          openProjectBridge: () => {
            const connection = createFileSystemBridgePort(producer.fileSystem);
            const originalDispose = connection.dispose;
            const dispose = vi.fn(() => {
              originalDispose();
            });
            connection.dispose = dispose;
            connections.push(connection);
            disposeCalls.push(dispose);
            return connection;
          },
          kernelOptions: (deps) => ({
            transport: inProcessTransport({
              runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
              ...deps,
              admitAssemblyDisplay,
            }),
          }),
        });
        expect(completed).toMatchObject({ definitions: 2, occurrences: 2, closureAssets: 5 });
        expect(phases.map(({ phase }) => phase)).toEqual([
          'authority',
          'publication',
          'closure',
          'shutdown',
          'source-retirement',
        ]);
        expect(phases.slice(0, 2).every(({ root }) => root === undefined)).toBe(true);
        expect(phases.slice(2).map(({ root }) => root)).toEqual([completed.root, completed.root, completed.root]);
        expect(await digestContent({ bytes: await producer.fileSystem.readFile(completed.root.path) })).toBe(
          completed.root.digest,
        );
        expect(disposeCalls.length).toBeGreaterThan(0);
        for (const dispose of disposeCalls) {
          expect(dispose).toHaveBeenCalledOnce();
        }
        for (const path of Object.keys(fixture.files)) {
          // eslint-disable-next-line no-await-in-loop -- The preparation owner retired every real authored source before handing off the same pin.
          expect(await producer.fileSystem.exists(path)).toBe(false);
        }
        const consumer = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({ kernels: [] }),
            fileSystem: producer.runtimeFileSystem,
            admitAssemblyDisplay,
          }),
        });
        try {
          const opened = await consumer.openAssembly({ root: completed.root });
          expect(opened.root).toEqual(completed.root);
          expect(Object.keys(opened.admitted.publication.parts)).toHaveLength(completed.definitions);
          expect(opened.admitted.publication.occurrences).toHaveLength(completed.occurrences);
          for (const record of Object.values(opened.admitted.publication.parts)) {
            const variant = record.variants['default'];
            if (!variant) {
              throw new Error('The completed source-free definition is missing.');
            }
            // eslint-disable-next-line no-await-in-loop -- Check each actual admitted display asset, with no producer kernel available.
            const bytes = await opened.admitted.readAsset(variant.glb.digest);
            expect(bytes.byteLength).toBe(variant.glb.byteLength);
            // eslint-disable-next-line no-await-in-loop -- The pin must bind these exact surviving source-free asset bytes.
            expect(await digestContent({ bytes })).toBe(variant.glb.digest);
          }
        } finally {
          await consumer.shutdown();
        }
      } finally {
        for (const connection of connections) {
          connection.dispose();
        }
        producer.dispose();
      }
    },
    60_000,
  );

  it.each(['aborted', 'replaced'])(
    'should deny an already %s owner before acquiring any bridge or evaluator',
    async (change) => {
      const abort = new AbortController();
      if (change === 'aborted') {
        abort.abort(new Error('Preparation was already closed.'));
      }
      const openProjectBridge = vi.fn<Parameters<typeof prepareScaleCorpus>[0]['openProjectBridge']>();
      const kernelOptions = vi.fn<Parameters<typeof prepareScaleCorpus>[0]['kernelOptions']>();
      const onPhase = vi.fn<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>();
      const pending = prepareScaleCorpus({
        fixture: createScaleFixture('scale-detail-calibration'),
        publicationPath: 'scene.json',
        signal: abort.signal,
        isCurrent: () => change !== 'replaced',
        openProjectBridge,
        kernelOptions,
        onPhase,
      });
      await expect(pending).rejects.toThrow(change === 'aborted' ? 'already closed' : 'owner was replaced');
      expect(openProjectBridge).not.toHaveBeenCalled();
      expect(kernelOptions).not.toHaveBeenCalled();
      expect(onPhase).not.toHaveBeenCalled();
    },
  );

  it('should refuse a real read-only checked authority before creating a producer', async () => {
    const fixture = createScaleFixture('scale-detail-calibration');
    const producer = await createCurvedProject(fixture.files);
    const kernelOptions = vi.fn<Parameters<typeof prepareScaleCorpus>[0]['kernelOptions']>();
    const onPhase = vi.fn<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>();
    const connection = createFileSystemBridgePort({
      ...producer.fileSystem,
      capabilities: { ...producer.fileSystem.capabilities, writable: false },
    });
    const dispose = vi.spyOn(connection, 'dispose');
    try {
      await expect(
        prepareScaleCorpus({
          fixture,
          publicationPath: 'scene.json',
          signal: new AbortController().signal,
          isCurrent: () => true,
          openProjectBridge: () => connection,
          kernelOptions,
          onPhase,
        }),
      ).rejects.toThrow('checked warehouse publication authority is unavailable');
      expect(kernelOptions).not.toHaveBeenCalled();
      expect(onPhase.mock.calls).toEqual([[{ phase: 'authority', root: undefined }]]);
      expect(dispose).toHaveBeenCalledOnce();
      expect(await producer.fileSystem.exists('scene.json')).toBe(false);
    } finally {
      connection.dispose();
      producer.dispose();
    }
  });

  it.each(['aborted', 'replaced'])(
    'should deny %s handoff after a real checked root commit and close owned bridges',
    async (change) => {
      const fixture = createScaleFixture('scale-detail-calibration');
      const producer = await createCurvedProject(fixture.files);
      const parent = await sha256String(fixture.entryPath);
      const publicationPath = `.tau/artifacts/reusable-parts/${parent}/scene.json`;
      const abort = new AbortController();
      let current = true;
      const onPhase = vi.fn<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>();
      const originalWrite = producer.fileSystem.writeFileChecked.bind(producer.fileSystem);
      const write = vi.spyOn(producer.fileSystem, 'writeFileChecked').mockImplementation(async (input) => {
        const receipt = await originalWrite(input);
        if (input.path === publicationPath) {
          if (change === 'aborted') {
            abort.abort(new Error('Preparation closed before handoff.'));
          } else {
            current = false;
          }
        }
        return receipt;
      });
      const disposers: Array<ReturnType<typeof vi.fn<() => void>>> = [];
      try {
        await expect(
          prepareScaleCorpus({
            fixture,
            publicationPath,
            signal: abort.signal,
            isCurrent: () => current,
            onPhase,
            openProjectBridge: () => {
              const connection = createFileSystemBridgePort(producer.fileSystem);
              const originalDispose = connection.dispose;
              const dispose = vi.fn(() => {
                originalDispose();
              });
              connection.dispose = dispose;
              disposers.push(dispose);
              return connection;
            },
            kernelOptions: (deps) => ({
              transport: inProcessTransport({
                runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
                ...deps,
                admitAssemblyDisplay,
              }),
            }),
          }),
        ).rejects.toThrow(change === 'aborted' ? 'closed before handoff' : 'owner was replaced');
        expect(write.mock.calls.some(([input]) => input.path === publicationPath)).toBe(true);
        expect(await producer.fileSystem.exists(publicationPath)).toBe(true);
        expect(onPhase.mock.calls.map(([{ phase }]) => phase)).toEqual(['authority', 'publication', 'shutdown']);
        expect(onPhase.mock.calls.slice(0, -1).every(([{ root }]) => root === undefined)).toBe(true);
        expect(onPhase.mock.calls.at(-1)?.[0].root).toEqual(
          change === 'aborted' ? expect.objectContaining({ path: publicationPath }) : undefined,
        );
        for (const dispose of disposers) {
          expect(dispose).toHaveBeenCalledOnce();
        }
      } finally {
        write.mockRestore();
        producer.dispose();
      }
    },
    60_000,
  );

  it.each(['missing', 'corrupted'])(
    'should deny a %s real closure member before retiring any producer source',
    async (change) => {
      const fixture = createScaleFixture('scale-detail-calibration');
      const producer = await createCurvedProject(fixture.files);
      const parent = await sha256String(fixture.entryPath);
      const publicationPath = `.tau/artifacts/reusable-parts/${parent}/scene.json`;
      let actualGlbPath: string | undefined;
      const originalWrite = producer.fileSystem.writeFileChecked.bind(producer.fileSystem);
      const write = vi.spyOn(producer.fileSystem, 'writeFileChecked').mockImplementation(async (input) => {
        const receipt = await originalWrite(input);
        if (input.path.endsWith('.glb')) {
          actualGlbPath = input.path;
        }
        if (input.path === publicationPath) {
          if (!actualGlbPath) {
            throw new Error('The real producer did not commit a display asset.');
          }
          await (change === 'missing'
            ? producer.fileSystem.unlink(actualGlbPath)
            : producer.fileSystem.writeFile(actualGlbPath, new Uint8Array([0])));
        }
        return receipt;
      });
      try {
        await expect(
          prepareScaleCorpus({
            fixture,
            publicationPath,
            signal: new AbortController().signal,
            isCurrent: () => true,
            openProjectBridge: () => createFileSystemBridgePort(producer.fileSystem),
            kernelOptions: (deps) => ({
              transport: inProcessTransport({
                runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
                ...deps,
                admitAssemblyDisplay,
              }),
            }),
          }),
        ).rejects.toThrow(Error);
        expect(actualGlbPath).toBeDefined();
        expect(await producer.fileSystem.exists(publicationPath)).toBe(true);
        for (const path of Object.keys(fixture.files)) {
          // eslint-disable-next-line no-await-in-loop -- Refused closure cannot retire any owned authored source or expose a completed destination.
          expect(await producer.fileSystem.exists(path)).toBe(true);
        }
      } finally {
        write.mockRestore();
        producer.dispose();
      }
    },
    60_000,
  );
});

it('publishes actual finite curved GLBs and reopens their checked closure without source or kernels', async () => {
  const fixture = createScaleFixture('scale-detail-calibration');
  const producer = await createCurvedProject(fixture.files);
  try {
    const authority = await createAssemblyPublicationAuthority(
      () => createFileSystemBridgePort(producer.fileSystem),
      new AbortController().signal,
    );
    try {
      if (!authority.fileSystem) {
        throw new Error('Actual checked host publication authority is unavailable.');
      }
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
          fileSystem: producer.runtimeFileSystem,
          publicationFileSystem: authority.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      try {
        const parent = await sha256String(fixture.entryPath);
        const published = await client.publishAssembly({
          authoredPath: fixture.entryPath,
          publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
        });
        if (published.status !== 'published') {
          throw new Error(`Actual curved JSCAD publication failed: ${published.status}`);
        }
        expect(Object.keys(published.partRecords).sort()).toEqual(['p0000', 'p0001']);
        const { publication } = published.admitted;
        expect(publication.occurrences.map(({ id }) => id)).toEqual(['o000000', 'o000001']);
        expect(publication.occurrences[1]?.transform.slice(12, 15)).toEqual([0.3, 0, 0]);
        const targetWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
        const io = await createNodeIo();
        // Cardinal vertices occur at the authored 64/128 quarter-turn samples. Export snaps
        // source millimeters by EPS * mean bounding span before [x,z,-y]/1000 Float32 encoding.
        // The sphere's 0.002mm grid preserves 100mm; the torus's 460/3 * 1e-5 grid does not.
        const sphereHalfExtent = Math.fround(100 / 1000);
        const torusSnapEpsilon = (1e-5 * (200 + 200 + 60)) / 3;
        const torusRadialHalfExtent = Math.fround((Math.round(100 / torusSnapEpsilon) * torusSnapEpsilon) / 1000);
        const torusAxialHalfExtent = Math.fround((Math.round(30 / torusSnapEpsilon) * torusSnapEpsilon) / 1000);
        for (const [part, expectedHalfExtents] of [
          ['p0000', [sphereHalfExtent, sphereHalfExtent, sphereHalfExtent]],
          ['p0001', [torusRadialHalfExtent, torusAxialHalfExtent, torusRadialHalfExtent]],
        ] as const) {
          const variant = publication.parts[part]?.variants['default'];
          if (!variant) {
            throw new Error(`Real curved published variant is missing: ${part}`);
          }
          expect(variant.exact).toBeUndefined(); // JSCAD is a mesh kernel, never an invented native pin.
          // eslint-disable-next-line no-await-in-loop -- Inspect each actual emitted definition before source-free admission.
          const bytes = await published.admitted.readAsset(variant.glb.digest);
          // eslint-disable-next-line no-await-in-loop -- Each bounds observation belongs to the same checked definition bytes.
          const bounds = await readGltfSceneBounds({ bytes, targetWorld });
          for (const axis of [0, 1, 2] as const) {
            expect(bounds.min[axis]).toBeCloseTo(-expectedHalfExtents[axis], 7);
            expect(bounds.max[axis]).toBeCloseTo(expectedHalfExtents[axis], 7);
            expect(bounds.max[axis] - bounds.min[axis]).toBeCloseTo(2 * expectedHalfExtents[axis], 7);
          }
          // eslint-disable-next-line no-await-in-loop -- Accessors establish actual curved emitted triangles, not a cuboid estimate.
          const document = await io.readBinary(bytes);
          const surfaces = document
            .getRoot()
            .listMeshes()
            .flatMap((mesh) => mesh.listPrimitives())
            .filter((primitive) => primitive.getMode() === 4);
          const actualTriangles = surfaces.reduce(
            (sum, primitive) =>
              sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3,
            0,
          );
          expect(actualTriangles).toBeGreaterThan(12);
          const normals = surfaces.flatMap((primitive) => {
            const array = primitive.getAttribute('NORMAL')?.getArray();
            return array ? [...array] : [];
          });
          // A cuboid's axis-only normals cannot satisfy the genuine curved-definition evidence.
          expect(normals.some((value) => Math.abs(value) > 0.01 && Math.abs(value) < 0.99)).toBe(true);
        }
        const metadata = await validateAdmittedAssemblyGlb({
          parts: publication.parts,
          occurrences: publication.occurrences,
          readAsset: async (_part, asset) => published.admitted.readAsset(asset.digest),
        });
        const sphere = metadata.occurrences.find(({ ancestry }) => ancestry.length === 1 && ancestry[0] === 'o000000');
        const torus = metadata.occurrences.find(({ ancestry }) => ancestry.length === 1 && ancestry[0] === 'o000001');
        if (!sphere?.bounds || !torus?.bounds) {
          throw new Error('Actual shared admission omitted finite placed curved bounds.');
        }
        expect(sphere.worldTransform.slice(12, 15)).toEqual([0, 0, 0]);
        expect(torus.worldTransform.slice(12, 15)).toEqual([0.3, 0, 0]);
        expect(sphere.bounds.min[0]).toBeCloseTo(-sphereHalfExtent, 7);
        expect(sphere.bounds.max[0]).toBeCloseTo(sphereHalfExtent, 7);
        expect(torus.bounds.min[0]).toBeCloseTo(0.3 - torusRadialHalfExtent, 7);
        expect(torus.bounds.max[0]).toBeCloseTo(0.3 + torusRadialHalfExtent, 7);
        const assets = [
          published.root,
          ...Object.values(published.partRecords),
          ...Object.values(publication.parts).flatMap((record) => Object.values(record.variants).map(({ glb }) => glb)),
        ];
        expect(new Set(assets.map(({ path }) => path)).size).toBe(5);
        const consumerProject = await createCurvedProject({});
        try {
          for (const asset of assets) {
            // eslint-disable-next-line no-await-in-loop -- Copy only each actual immutable checked root, record and emitted asset.
            const bytes = await producer.fileSystem.readFile(asset.path);
            // eslint-disable-next-line no-await-in-loop -- Verify bytes against the actual publication before the consumer write.
            expect(await digestContent({ bytes })).toBe(asset.digest);
            if ('byteLength' in asset) {
              expect(bytes.byteLength).toBe(asset.byteLength);
            }
            // eslint-disable-next-line no-await-in-loop -- Finish this finite closure before admitting it without source or kernels.
            await consumerProject.fileSystem.writeFile(asset.path, bytes);
          }
          const consumer = createRuntimeClient({
            transport: inProcessTransport({
              runtime: defineRuntime({ kernels: [] }),
              fileSystem: consumerProject.runtimeFileSystem,
              admitAssemblyDisplay,
            }),
          });
          try {
            const document = await consumer.openAssembly({ root: published.root });
            const { admitted } = document;
            expect(admitted.publication).toEqual(publication);
            for (const path of Object.keys(fixture.files)) {
              // eslint-disable-next-line no-await-in-loop -- Source absence is checked independently for every authored producer file.
              expect(await consumerProject.fileSystem.exists(path)).toBe(false);
            }
            const reopened = await validateAdmittedAssemblyGlb({
              parts: admitted.publication.parts,
              occurrences: admitted.publication.occurrences,
              readAsset: async (_part, asset) => admitted.readAsset(asset.digest),
            });
            expect(reopened.bounds).toEqual(metadata.bounds);
            expect(reopened.occurrences).toEqual(metadata.occurrences);
          } finally {
            await consumer.shutdown();
          }
        } finally {
          consumerProject.dispose();
        }
      } finally {
        await client.shutdown();
      }
    } finally {
      authority.dispose();
    }
  } finally {
    producer.dispose();
  }
}, 60_000);

it.each([
  { mode: 'aborted', failure: { name: 'OperationAbortedError', code: 'RUNTIME_OPERATION_ABORTED' } },
  { mode: 'timeout', failure: { name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT' } },
  { mode: 'terminated', failure: { name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED' } },
  { mode: 'unknown', failure: { name: null, code: null } },
  { mode: 'missing', failure: { name: null, code: null } },
  { mode: 'refused', failure: { name: 'RuntimeTerminatedError', code: 'RUNTIME_TERMINATED' } },
] as const)(
  'should retain the $mode failure after checked publication and cleanup',
  async ({ mode, failure }) => {
    const authoredPath = 'scale/assembly.json';
    const publicationPath = `.tau/artifacts/reusable-parts/${await sha256String(authoredPath)}/scene.json`;
    const source = new TextEncoder().encode('good');
    const authored = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: { triangle: { source: { path: 'scale/triangle.shape' } } },
        occurrences: [{ id: 'one', part: 'triangle', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
      }),
    );
    const fixture: Parameters<typeof prepareScaleCorpus>[0]['fixture'] = {
      entryPath: authoredPath,
      files: { 'scale/triangle.shape': { content: source }, [authoredPath]: { content: authored } },
      denominator: {
        definitions: 1,
        occurrences: 1,
        sourceBytes: source.byteLength,
        authoredBytes: authored.byteLength,
        expectedDefinitionTriangles: 1,
        expectedExpandedTriangles: 1,
      },
    };
    const producer = await createCurvedProject(fixture.files);
    const controller = new AbortController();
    const committed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<RuntimeTransportCloseResult>();
    const observations: Array<Parameters<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>[0]> = [];
    const diagnostics: Array<Parameters<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onDiagnostic']>>[0]> = [];
    const connections: FileSystemBridgeConnection[] = [];
    const workers: NodeWorker[] = [];
    let transportCount = 0;
    let reachedCheckedRoot = false;
    class TsxWorker extends NodeWorker {
      public constructor(url: string | URL) {
        super(url, { execArgv: ['--import', 'tsx'] });
        workers.push(this);
      }
    }
    const originalWrite = producer.fileSystem.writeFileChecked.bind(producer.fileSystem);
    const write = vi.spyOn(producer.fileSystem, 'writeFileChecked').mockImplementation(async (input) => {
      if (input.path === publicationPath && mode === 'missing') {
        reachedCheckedRoot = true;
        committed.resolve();
        throw new Error('private missing checked root');
      }
      const receipt = await originalWrite(input);
      if (input.path === publicationPath) {
        reachedCheckedRoot = true;
        committed.resolve();
        if (mode === 'aborted') {
          controller.abort(new Error('private abort reason'));
        }
        if (mode === 'terminated' || mode === 'refused') {
          closed.resolve({ cause: 'host-exit', phase: 'session', exitCode: 7 });
        }
        if (mode === 'unknown') {
          throw new Error('private checked receipt');
        }
        if (mode === 'timeout') {
          await release.promise;
        }
      }
      return receipt;
    });
    const originalRead = producer.fileSystem.readFile.bind(producer.fileSystem);
    const read = vi.spyOn(producer.fileSystem, 'readFile').mockImplementation(async (path, encoding) => {
      if (mode === 'refused' && reachedCheckedRoot && path === publicationPath) {
        throw new Error('private same-authority read refusal');
      }
      return originalRead(path, encoding);
    });
    try {
      const pending = prepareScaleCorpus({
        fixture,
        publicationPath,
        signal: controller.signal,
        isCurrent: () => true,
        onPhase: (observation) => {
          observations.push(observation);
          if (mode === 'timeout' && observation.phase === 'shutdown') {
            release.resolve();
          }
        },
        onDiagnostic: (diagnostic) => {
          diagnostics.push(diagnostic);
        },
        openProjectBridge: () => {
          const connection = createFileSystemBridgePort(producer.fileSystem);
          connections.push(connection);
          return connection;
        },
        kernelOptions: (deps) => {
          transportCount += 1;
          const transport = nodeWorkerTransport({
            url: new URL(
              '../../../../../packages/runtime/test/support/publication-timeout.worker.fixture.ts',
              import.meta.url,
            ),
            workerCtor: TsxWorker,
            fileSystem: deps.fileSystem,
            publicationFileSystem: deps.publicationFileSystem,
          });
          return {
            operationTimeout: mode === 'timeout' ? 2000 : 0,
            transport:
              (mode === 'terminated' || mode === 'refused') && transportCount === 1
                ? { ...transport, materialize: () => ({ ...transport.materialize(), closed: closed.promise }) }
                : transport,
          };
        },
      });
      await Promise.race([
        committed.promise,
        pending.then(
          () => {
            if (!reachedCheckedRoot) {
              throw new Error('Warehouse unexpectedly published before checked root.');
            }
          },
          (error: unknown) => {
            if (!reachedCheckedRoot) {
              throw error;
            }
          },
        ),
      ]);
      await expect(pending).rejects.toThrow(
        mode === 'aborted' ? 'private abort reason' : 'Completed warehouse publication is unavailable: commit-unknown',
      );
      expect(observations.map(({ phase }) => phase)).toEqual(['authority', 'publication', 'shutdown']);
      const currentRoot = observations.at(-1)?.root;
      if (mode === 'unknown' || mode === 'terminated' || mode === 'timeout' || mode === 'aborted') {
        expect(currentRoot).toMatchObject({ path: publicationPath });
      }
      expect(observations.at(-1)).toEqual({
        phase: 'shutdown',
        root:
          mode === 'unknown' || mode === 'terminated' || mode === 'timeout' || mode === 'aborted'
            ? currentRoot
            : undefined,
        failure,
      });
      if (mode === 'unknown' || mode === 'missing') {
        const rejection = diagnostics.find((diagnostic) => diagnostic.phase === 'transport-rejection');
        expect(rejection).toMatchObject({ phase: 'transport-rejection' });
        expect(rejection?.phase === 'transport-rejection' && rejection.error instanceof Error).toBe(true);
        expect(diagnostics.findIndex((diagnostic) => diagnostic.phase === 'transport-rejection')).toBeLessThan(
          diagnostics.findIndex((diagnostic) => diagnostic.phase === 'pre-close-root'),
        );
      }
      if (mode === 'missing') {
        expect(diagnostics).toContainEqual({ phase: 'pre-close-root', snapshot: { status: 'absent' } });
      }
      if (mode === 'refused') {
        expect(diagnostics.some((diagnostic) => diagnostic.phase === 'fresh-root-refusal')).toBe(true);
      }
      if (mode === 'terminated' || mode === 'timeout') {
        expect(diagnostics).toContainEqual({ phase: 'fresh-root', status: 'present', root: currentRoot });
      }
      expect(JSON.stringify(observations)).not.toContain('private');
      if (mode === 'missing') {
        await expect(producer.fileSystem.readFile(publicationPath)).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        expect(JSON.parse(decoder.decode(await originalRead(publicationPath)))).toMatchObject({
          generation: 1,
        });
      }
      expect(workers).toHaveLength(mode === 'terminated' || mode === 'timeout' ? 2 : 1);
      if (mode === 'terminated' || mode === 'refused') {
        await workers[0]?.terminate();
      }
      expect(workers[0]?.threadId).toBe(-1);
    } finally {
      release.resolve();
      write.mockRestore();
      read.mockRestore();
      for (const connection of connections) {
        connection.dispose();
      }
      await Promise.all(workers.map(async (worker) => worker.terminate()));
      producer.dispose();
    }
  },
  25_000,
);

it('should retain a synchronous selected-channel rejection with nested private evidence and an absent checked root', async () => {
  const authoredPath = 'scale/assembly.json';
  const publicationPath = `.tau/artifacts/reusable-parts/${await sha256String(authoredPath)}/scene.json`;
  const source = new TextEncoder().encode('good');
  const authored = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 1,
      parts: { triangle: { source: { path: 'scale/triangle.shape' } } },
      occurrences: [{ id: 'one', part: 'triangle', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    }),
  );
  const fixture: Parameters<typeof prepareScaleCorpus>[0]['fixture'] = {
    entryPath: authoredPath,
    files: { 'scale/triangle.shape': { content: source }, [authoredPath]: { content: authored } },
    denominator: {
      definitions: 1,
      occurrences: 1,
      sourceBytes: source.byteLength,
      authoredBytes: authored.byteLength,
      expectedDefinitionTriangles: 1,
      expectedExpandedTriangles: 1,
    },
  };
  const producer = await createCurvedProject(fixture.files);
  const nested = Object.assign(new Error('private nested origin'), {
    code: 'PRIVATE_NESTED',
    details: { issues: [{ code: 'PRIVATE_ISSUE', reason: 'private checked denial' }] },
  });
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  let getterReads = 0;
  const guarded = Object.defineProperty({}, 'danger', {
    enumerable: true,
    get: () => {
      getterReads += 1;
      throw new Error('private getter must not run');
    },
  });
  const binary = Object.defineProperty(new Uint8Array(1_048_576), 'byteLength', {
    get: () => {
      getterReads += 1;
      throw new Error('private binary getter must not run');
    },
  });
  const array = new Proxy(['private array element'], {
    get(target, property, receiver) {
      if (property === 'length') {
        getterReads += 1;
        throw new Error('private array length getter must not run');
      }
      const inherited: unknown = Reflect.get(target, property, receiver);
      return inherited;
    },
  });
  const origin = Object.assign(new Error('private synchronous origin', { cause: nested }), {
    code: 'PRIVATE_SYNC',
    details: {
      binary,
      array,
      largeBigint: BigInt('9'.repeat(1000)),
      largeSymbol: Symbol('private symbol '.repeat(10_000)),
      cycle,
      guarded,
      huge: Object.fromEntries(Array.from({ length: 512 }, (_, index) => [`field${String(index)}`, index])),
    },
  });
  const diagnostics: Array<Parameters<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onDiagnostic']>>[0]> = [];
  const observations: Array<Parameters<NonNullable<Parameters<typeof prepareScaleCorpus>[0]['onPhase']>>[0]> = [];
  const connections: FileSystemBridgeConnection[] = [];
  try {
    await expect(
      prepareScaleCorpus({
        fixture,
        publicationPath,
        signal: new AbortController().signal,
        isCurrent: () => true,
        onPhase: (observation) => observations.push(observation),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        openProjectBridge: () => {
          const connection = createFileSystemBridgePort(producer.fileSystem);
          connections.push(connection);
          return connection;
        },
        kernelOptions: (deps) => {
          const transport = inProcessTransport({
            runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
            ...deps,
            admitAssemblyDisplay,
          });
          return {
            transport: {
              ...transport,
              materialize: () => {
                const selected = transport.materialize();
                return {
                  ...selected,
                  open: async () => {
                    const ready = await selected.open();
                    return {
                      ...ready,
                      channel: new Proxy(ready.channel, {
                        get(channel, property, receiver) {
                          if (property !== 'call') {
                            const inherited: unknown = Reflect.get(channel, property, receiver);
                            return inherited;
                          }
                          return new Proxy(channel.call, {
                            apply(call, _receiver, args: unknown[]) {
                              if (args[0] === 'publishAuthoredAssemblyRoot') {
                                throw origin;
                              }
                              const result: unknown = Reflect.apply(call, channel, args);
                              return result;
                            },
                          });
                        },
                      }),
                    };
                  },
                };
              },
            },
          };
        },
      }),
    ).rejects.toThrow('Completed warehouse publication is unavailable: commit-unknown');
    const rejection = diagnostics.find((diagnostic) => diagnostic.phase === 'transport-rejection');
    expect(rejection?.phase === 'transport-rejection' && rejection.error).toBe(origin);
    const evidence = JSON.stringify(rejection?.phase === 'transport-rejection' ? rejection.evidence : undefined);
    expect(evidence).toContain('PRIVATE_SYNC');
    expect(evidence).toContain('PRIVATE_NESTED');
    expect(evidence).toContain('PRIVATE_ISSUE');
    expect(evidence).toContain('"type":"Uint8Array","byteLength":1048576');
    expect(evidence).toContain('"kind":"bigint"');
    expect(evidence).toContain('"kind":"symbol"');
    expect(evidence).toContain('"originalLength":150000');
    expect(evidence).toContain('"kind":"array","length":1');
    expect(evidence).toContain('"kind":"cycle"');
    expect(evidence).toContain('"kind":"accessor"');
    expect(evidence).toContain('"truncated":true');
    expect(evidence.length).toBeLessThan(65_536);
    expect(getterReads).toBe(0);
    expect(diagnostics).toContainEqual({ phase: 'pre-close-root', snapshot: { status: 'absent' } });
    expect(observations.at(-1)).toEqual({
      phase: 'shutdown',
      root: undefined,
      failure: { name: null, code: null },
    });
    expect(JSON.stringify(observations)).not.toContain('private');
    await expect(producer.fileSystem.readFile(publicationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    for (const connection of connections) {
      connection.dispose();
    }
    producer.dispose();
  }
}, 25_000);

it('should publish the actual scale-123 cuboid with twelve crease segments and reopen its checked closure source-free', async () => {
  const fixture = createScaleFixture('scale-123');
  const sourcePath = 'scale/parts/p0000.js';
  const source = fixture.files[sourcePath];
  const assemblyFile = fixture.files[fixture.entryPath];
  if (!source || !assemblyFile) {
    throw new Error('The existing scale-123 cuboid source and authored entry are required.');
  }
  const authored: unknown = JSON.parse(decoder.decode(assemblyFile.content));
  if (
    typeof authored !== 'object' ||
    authored === null ||
    !('parts' in authored) ||
    typeof authored.parts !== 'object' ||
    authored.parts === null ||
    !('p0000' in authored.parts) ||
    !('occurrences' in authored) ||
    !Array.isArray(authored.occurrences)
  ) {
    throw new TypeError('The existing scale-123 authored part and occurrence must remain present.');
  }
  const part = authored.parts.p0000;
  const occurrences: readonly unknown[] = authored.occurrences;
  const first = occurrences[0];
  if (
    typeof part !== 'object' ||
    part === null ||
    !('source' in part) ||
    typeof part.source !== 'object' ||
    part.source === null ||
    !('path' in part.source) ||
    part.source.path !== sourcePath ||
    typeof first !== 'object' ||
    first === null ||
    !('id' in first) ||
    typeof first.id !== 'string' ||
    !('part' in first) ||
    first.part !== 'p0000' ||
    !('transform' in first) ||
    !Array.isArray(first.transform)
  ) {
    throw new TypeError('The existing scale-123 first source and placement must remain bound.');
  }
  const transform: readonly unknown[] = first.transform;
  if (
    transform.length !== 16 ||
    !transform.every((value): value is number => typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new TypeError('The existing scale-123 placement must have sixteen finite entries.');
  }
  const occurrence = { id: first.id, part: first.part, transform };
  // A bounded selection of the existing real corpus, not an independently synthesized geometry or record.
  const selected: AuthoredAssembly = {
    schemaVersion: 1,
    parts: { p0000: { source: { path: part.source.path } } },
    occurrences: [occurrence],
  };
  const producer = await createCurvedProject({
    [sourcePath]: source,
    [fixture.entryPath]: { content: new TextEncoder().encode(JSON.stringify(selected)) },
  });
  try {
    const authority = await createAssemblyPublicationAuthority(
      () => createFileSystemBridgePort(producer.fileSystem),
      new AbortController().signal,
    );
    try {
      if (!authority.fileSystem) {
        throw new Error('Actual checked cuboid publication authority is unavailable.');
      }
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
          fileSystem: producer.runtimeFileSystem,
          publicationFileSystem: authority.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      try {
        const parent = await sha256String(fixture.entryPath);
        const published = await client.publishAssembly({
          authoredPath: fixture.entryPath,
          publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
        });
        if (published.status !== 'published') {
          throw new Error(`Actual cuboid JSCAD publication failed: ${published.status}`);
        }
        expect(Object.keys(published.partRecords)).toEqual(['p0000']);
        expect(published.admitted.publication.occurrences).toEqual([{ ...occurrence, variant: 'default' }]);
        const variant = published.admitted.publication.parts['p0000']?.variants['default'];
        if (!variant) {
          throw new Error('Actual cuboid publication omitted its default variant.');
        }
        expect(variant.exact).toBeUndefined();
        const bytes = await published.admitted.readAsset(variant.glb.digest);
        expect(bytes.byteLength).toBe(variant.glb.byteLength);
        expect(await digestContent({ bytes })).toBe(variant.glb.digest);
        const io = await createNodeIo();
        const document = await io.readBinary(bytes);
        const primitives = document
          .getRoot()
          .listMeshes()
          .flatMap((mesh) => mesh.listPrimitives());
        const surfaces = primitives.filter((primitive) => primitive.getMode() === 4);
        const edges = primitives.filter((primitive) => primitive.getMode() === 1);
        const surfaceTriangles = surfaces.reduce(
          (sum, primitive) =>
            sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3,
          0,
        );
        const edgeSegments = edges.reduce(
          (sum, primitive) =>
            sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 2,
          0,
        );
        expect(surfaceTriangles).toBe(12);
        expect(edgeSegments).toBe(12);
        const bounds = await readGltfSceneBounds({ bytes, targetWorld: { up: '+y', forward: '+z', metersPerUnit: 1 } });
        for (const [axis, size] of [
          [0, 0.02],
          [1, 0.012],
          [2, 0.016],
        ] as const) {
          expect(bounds.max[axis] - bounds.min[axis]).toBeCloseTo(size, 7);
        }
        const assets = [published.root, ...Object.values(published.partRecords), variant.glb];
        expect(new Set(assets.map(({ path }) => path)).size).toBe(3);
        const consumerProject = await createCurvedProject({});
        try {
          for (const asset of assets) {
            // eslint-disable-next-line no-await-in-loop -- Validate each immutable producer asset before the source-free import.
            const assetBytes = await producer.fileSystem.readFile(asset.path);
            // eslint-disable-next-line no-await-in-loop -- Bind every imported byte array to the actual checked publication digest.
            expect(await digestContent({ bytes: assetBytes })).toBe(asset.digest);
            if ('byteLength' in asset) {
              expect(assetBytes.byteLength).toBe(asset.byteLength);
            }
            // eslint-disable-next-line no-await-in-loop -- Complete this three-file closure before source-free admission.
            await consumerProject.fileSystem.writeFile(asset.path, assetBytes);
          }
          const consumer = createRuntimeClient({
            transport: inProcessTransport({
              runtime: defineRuntime({ kernels: [] }),
              fileSystem: consumerProject.runtimeFileSystem,
              admitAssemblyDisplay,
            }),
          });
          try {
            const document = await consumer.openAssembly({ root: published.root });
            const { admitted } = document;
            expect(admitted.publication).toEqual(published.admitted.publication);
            expect(await consumerProject.fileSystem.exists(sourcePath)).toBe(false);
            expect(await consumerProject.fileSystem.exists(fixture.entryPath)).toBe(false);
            expect(await admitted.readAsset(variant.glb.digest)).toEqual(bytes);
          } finally {
            await consumer.shutdown();
          }
        } finally {
          consumerProject.dispose();
        }
      } finally {
        await client.shutdown();
      }
    } finally {
      authority.dispose();
    }
  } finally {
    producer.dispose();
  }
}, 60_000);

it('should publish a real sharp curved cylinder with positive lines and strictly reduced immutable normal-only surfaces', async () => {
  const fixture = createScaleFixture('scale-detail-edge-calibration');
  const producer = await createCurvedProject(fixture.files);
  try {
    const authority = await createAssemblyPublicationAuthority(
      () => createFileSystemBridgePort(producer.fileSystem),
      new AbortController().signal,
    );
    try {
      if (!authority.fileSystem) {
        throw new Error('Checked cylinder publication authority is unavailable.');
      }
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
          fileSystem: producer.runtimeFileSystem,
          publicationFileSystem: authority.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      try {
        const parent = await sha256String(fixture.entryPath);
        const published = await client.publishAssembly({
          authoredPath: fixture.entryPath,
          publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
        });
        if (published.status !== 'published') {
          throw new Error(`Real sharp cylinder publication refused: ${published.status}`);
        }
        expect(Object.keys(published.partRecords)).toEqual(['p0000']);
        expect(published.admitted.publication.occurrences).toHaveLength(1);
        const variant = published.admitted.publication.parts['p0000']?.variants['default'];
        if (!variant) {
          throw new Error('The actual emitted cylinder variant is unavailable.');
        }
        expect(variant.exact).toBeUndefined();
        const bytes = await published.admitted.readAsset(variant.glb.digest);
        expect(await digestContent({ bytes })).toBe(variant.glb.digest);
        expect(bytes.byteLength).toBe(variant.glb.byteLength);
        const io = await createNodeIo();
        const document = await io.readBinary(bytes);
        const primitives = document
          .getRoot()
          .listMeshes()
          .flatMap((mesh) => mesh.listPrimitives());
        const surfaces = primitives.filter((primitive) => primitive.getMode() === 4);
        const lines = primitives.filter((primitive) => primitive.getMode() === 1);
        expect(surfaces).toHaveLength(1);
        expect(lines.length).toBeGreaterThan(0);
        const lineArrays = lines.map((primitive) => {
          const positions = primitive.getAttribute('POSITION')?.getArray();
          if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 6 !== 0) {
            throw new Error('Actual cylinder LINES require finite nonempty segment endpoints.');
          }
          expect(positions.every((value) => Number.isFinite(value))).toBe(true);
          return positions;
        });
        const lineCopies = lineArrays.map((positions) => new Float32Array(positions));
        const surface = surfaces[0];
        const positions = surface?.getAttribute('POSITION')?.getArray();
        const normals = surface?.getAttribute('NORMAL')?.getArray();
        if (!surface || !(positions instanceof Float32Array) || !(normals instanceof Float32Array)) {
          throw new Error('Actual cylinder normal-only surface arrays are unavailable.');
        }
        expect(surface.listSemantics().sort()).toEqual(['NORMAL', 'POSITION']);
        expect(normals.some((value) => Math.abs(value) > 0.01 && Math.abs(value) < 0.99)).toBe(true);
        const targetWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
        const snapEpsilon = (1e-5 * (200 + 200 + 120)) / 3;
        const radialHalfExtent = Math.fround((Math.round(100 / snapEpsilon) * snapEpsilon) / 1000);
        const axialHalfExtent = Math.fround((Math.round(60 / snapEpsilon) * snapEpsilon) / 1000);
        const expectedHalfExtents = [radialHalfExtent, axialHalfExtent, radialHalfExtent];
        const bounds = await readGltfSceneBounds({ bytes, targetWorld });
        const metadata = await validateAdmittedAssemblyGlb({
          parts: published.admitted.publication.parts,
          occurrences: published.admitted.publication.occurrences,
          readAsset: async (_part, asset) => published.admitted.readAsset(asset.digest),
        });
        const placed = metadata.occurrences.find(({ ancestry }) => ancestry.length === 1 && ancestry[0] === 'o000000');
        if (!placed?.bounds) {
          throw new Error('Actual sharp cylinder placed bounds are unavailable.');
        }
        expect(placed.worldTransform.slice(12, 15)).toEqual([0, 0, 0]);
        for (const axis of [0, 1, 2] as const) {
          const expected = expectedHalfExtents[axis];
          if (expected === undefined) {
            throw new Error('Cylinder cardinal snapped extent is unavailable.');
          }
          expect(bounds.min[axis]).toBeCloseTo(-expected, 7);
          expect(bounds.max[axis]).toBeCloseTo(expected, 7);
          expect(bounds.max[axis] - bounds.min[axis]).toBeCloseTo(2 * expected, 7);
          expect(placed.bounds.min[axis]).toBeCloseTo(-expected, 7);
          expect(placed.bounds.max[axis]).toBeCloseTo(expected, 7);
        }

        const material = surface.getMaterial();
        if (!material) {
          throw new Error('Actual cylinder source material is unavailable.');
        }
        const originalMaterial = {
          color: [...material.getBaseColorFactor()],
          metallic: material.getMetallicFactor(),
          roughness: material.getRoughnessFactor(),
          doubleSided: material.getDoubleSided(),
        };
        const originalPositions = new Float32Array(positions);
        const originalNormals = new Float32Array(normals);
        const canonical = new BufferGeometry();
        canonical.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        canonical.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
        const emittedIndices = surface.getIndices()?.getArray();
        if (emittedIndices) {
          canonical.setIndex(new BufferAttribute(Uint32Array.from(emittedIndices), 1));
        }
        const originalCanonicalIndices = canonical.index ? Uint32Array.from(canonical.index.array) : undefined;
        const originalCanonicalPositions = Float32Array.from(canonical.getAttribute('position').array);
        const originalCanonicalNormals = Float32Array.from(canonical.getAttribute('normal').array);
        const fullTriangles = (canonical.index?.count ?? canonical.getAttribute('position').count) / 3;
        let detail: Awaited<ReturnType<typeof deriveAssemblyDetailGeometry>>;
        const simplify = vi.spyOn(MeshoptSimplifier, 'simplifyWithAttributes');
        try {
          detail = await deriveAssemblyDetailGeometry({
            canonical,
            policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
          });
          if (!detail?.geometry.index) {
            throw new Error('Dense cylinder identity rejects this proposed calibration subject.');
          }
          expect(detail.geometry).not.toBe(canonical);
          expect(detail.geometry.index.count / 3).toBeGreaterThan(0);
          expect(detail.geometry.index.count / 3).toBeLessThan(fullTriangles);
          expect(simplify).toHaveBeenCalledOnce();
          expect(simplify.mock.calls[0]?.[9]).toEqual(['LockBorder', 'Permissive']);
          expect(positions).toEqual(originalPositions);
          expect(normals).toEqual(originalNormals);
          expect(canonical.index?.array).toEqual(originalCanonicalIndices);
          expect(canonical.getAttribute('position').array).toEqual(originalCanonicalPositions);
          expect(canonical.getAttribute('normal').array).toEqual(originalCanonicalNormals);
          expect(lineArrays).toEqual(lineCopies);
          expect({
            color: [...material.getBaseColorFactor()],
            metallic: material.getMetallicFactor(),
            roughness: material.getRoughnessFactor(),
            doubleSided: material.getDoubleSided(),
          }).toEqual(originalMaterial);
        } finally {
          simplify.mockRestore();
          detail?.geometry.dispose();
          canonical.dispose();
        }
        const assets = [published.root, ...Object.values(published.partRecords), variant.glb];
        const closureDigests: string[] = [];
        for (const asset of assets) {
          // eslint-disable-next-line no-await-in-loop -- Inspect every actual immutable checked closure byte, not an imagined denominator.
          const actual = await producer.fileSystem.readFile(asset.path);
          // eslint-disable-next-line no-await-in-loop -- Each closure digest belongs to its actual ordered bytes.
          const digest = await digestContent({ bytes: actual });
          expect(digest).toBe(asset.digest);
          if ('byteLength' in asset) {
            expect(actual.byteLength).toBe(asset.byteLength);
          }
          closureDigests.push(digest);
        }
        expect(closureDigests).toHaveLength(3);
        expect(await digestContent({ bytes: await published.admitted.readAsset(variant.glb.digest) })).toBe(
          variant.glb.digest,
        );
      } finally {
        await client.shutdown();
      }
    } finally {
      authority.dispose();
    }
  } finally {
    producer.dispose();
  }
}, 60_000);

it('should qualify hybrid authored edges at the frozen WebGL camera before product acquisition', async () => {
  const fixture = createScaleFixture('scale-detail-hybrid-calibration');
  const producer = await createCurvedProject(fixture.files);
  try {
    const authority = await createAssemblyPublicationAuthority(
      () => createFileSystemBridgePort(producer.fileSystem),
      new AbortController().signal,
    );
    try {
      if (!authority.fileSystem) {
        throw new Error('Checked cylinder publication authority is unavailable.');
      }
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
          fileSystem: producer.runtimeFileSystem,
          publicationFileSystem: authority.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      try {
        const parent = await sha256String(fixture.entryPath);
        const published = await client.publishAssembly({
          authoredPath: fixture.entryPath,
          publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
        });
        if (published.status !== 'published') {
          throw new Error(`Real hybrid publication refused: ${published.status}`);
        }
        expect(Object.keys(published.partRecords)).toEqual(['p0000']);
        expect(published.admitted.publication.occurrences).toHaveLength(1);
        const variant = published.admitted.publication.parts['p0000']?.variants['default'];
        if (!variant) {
          throw new Error('The actual emitted hybrid variant is unavailable.');
        }
        expect(variant.exact).toBeUndefined();
        const bytes = await published.admitted.readAsset(variant.glb.digest);
        expect(await digestContent({ bytes })).toBe(variant.glb.digest);
        expect(bytes.byteLength).toBe(variant.glb.byteLength);
        const io = await createNodeIo();
        const document = await io.readBinary(bytes);
        const primitives = document
          .getRoot()
          .listMeshes()
          .flatMap((mesh) => mesh.listPrimitives());
        const surfaces = primitives.filter((primitive) => primitive.getMode() === 4);
        const lines = primitives.filter((primitive) => primitive.getMode() === 1);
        expect(surfaces).toHaveLength(2);
        expect(lines.length).toBeGreaterThan(0);
        const lineArrays = lines.map((primitive) => {
          const positions = primitive.getAttribute('POSITION')?.getArray();
          if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 6 !== 0) {
            throw new Error('Actual hybrid LINES require finite nonempty segment endpoints.');
          }
          expect(positions.every((value) => Number.isFinite(value))).toBe(true);
          return positions;
        });
        const lineCopies = lineArrays.map((positions) => new Float32Array(positions));
        const targetWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
        const bounds = await readGltfSceneBounds({ bytes, targetWorld });
        const metadata = await validateAdmittedAssemblyGlb({
          parts: published.admitted.publication.parts,
          occurrences: published.admitted.publication.occurrences,
          readAsset: async (_part, asset) => published.admitted.readAsset(asset.digest),
        });
        const placed = metadata.occurrences.find(({ ancestry }) => ancestry.length === 1 && ancestry[0] === 'o000000');
        if (!placed?.bounds) {
          throw new Error('Actual sharp cylinder placed bounds are unavailable.');
        }
        expect(placed.worldTransform.slice(12, 15)).toEqual([0, 0, 0]);
        for (const axis of [0, 1, 2] as const) {
          const minimum = Math.fround(-0.1);
          const maximum = Math.fround(axis === 0 ? 0.14 : 0.1);
          expect(bounds.min[axis]).toBeCloseTo(minimum, 7);
          expect(bounds.max[axis]).toBeCloseTo(maximum, 7);
          expect(placed.bounds.min[axis]).toBeCloseTo(minimum, 7);
          expect(placed.bounds.max[axis]).toBeCloseTo(maximum, 7);
        }
        // R181 physical position is in metres; native clipping and retained render matrix use millimetres.
        const renderPlacement = new Matrix4().fromArray([1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 0, 0, 0, 1]);
        const camera = new PerspectiveCamera(30, 0.8764367816091954, 5693.609446587147, 24_984.022249610633);
        camera.position.set(150, -6499.999999999997, 4499.999999999998);
        camera.quaternion.set(0.46410668017692425, 0, 0, 0.8857793119141777);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const viewport = { width: 915, height: 1044 };
        const policy = {
          triangleRatio: 0.5,
          approximateRelativeError: 0.05,
          screenSpace: { maxApproximatePixelError: 1, enterDetailRatio: 0.6 },
        };
        const observations: Array<{
          curved: boolean;
          fullTriangles: number;
          candidateTriangles: number;
          selectedTriangles: number;
          sourceError: unknown;
          projectedError: unknown;
          eligible: boolean;
        }> = [];
        for (const surface of surfaces) {
          const positions = surface.getAttribute('POSITION')?.getArray();
          const normals = surface.getAttribute('NORMAL')?.getArray();
          if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array)) {
            throw new Error('Actual hybrid normal-only surface arrays are unavailable.');
          }
          expect(surface.listSemantics().sort()).toEqual(['NORMAL', 'POSITION']);
          const curved = normals.some((value) => Math.abs(value) > 0.01 && Math.abs(value) < 0.99);

          const material = surface.getMaterial();
          if (!material) {
            throw new Error('Actual hybrid source material is unavailable.');
          }
          const originalMaterial = {
            color: [...material.getBaseColorFactor()],
            metallic: material.getMetallicFactor(),
            roughness: material.getRoughnessFactor(),
            doubleSided: material.getDoubleSided(),
          };
          const originalPositions = new Float32Array(positions);
          const originalNormals = new Float32Array(normals);
          const canonical = new BufferGeometry();
          canonical.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
          canonical.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
          const emittedIndices = surface.getIndices()?.getArray();
          if (emittedIndices) {
            canonical.setIndex(new BufferAttribute(Uint32Array.from(emittedIndices), 1));
          }
          const originalCanonicalIndices = canonical.index ? Uint32Array.from(canonical.index.array) : undefined;
          const originalCanonicalPositions = Float32Array.from(canonical.getAttribute('position').array);
          const originalCanonicalNormals = Float32Array.from(canonical.getAttribute('normal').array);
          const fullTriangles = (canonical.index?.count ?? canonical.getAttribute('position').count) / 3;
          let detail: Awaited<ReturnType<typeof deriveAssemblyDetailGeometry>>;
          const simplify = vi.spyOn(MeshoptSimplifier, 'simplifyWithAttributes');
          try {
            // eslint-disable-next-line no-await-in-loop -- Independently derive actual components with the unchanged reviewed policy.
            detail = await deriveAssemblyDetailGeometry({ canonical, policy });
            canonical.computeBoundingBox();
            if (!canonical.boundingBox) {
              throw new Error('Hybrid source bounds are unavailable.');
            }
            const node = document
              .getRoot()
              .listNodes()
              .find((candidate) => candidate.getMesh()?.listPrimitives().includes(surface));
            if (!node) {
              throw new Error('Hybrid actual primitive placement is unavailable.');
            }
            const projectedError = detail
              ? estimateAssemblyDetailPixelError({
                  sourceBounds: canonical.boundingBox,
                  sourceError: detail.approximateSourceError,
                  drawToRender: renderPlacement
                    .clone()
                    .multiply(
                      new Matrix4()
                        .fromArray(placed.worldTransform)
                        .multiply(new Matrix4().fromArray(node.getWorldMatrix())),
                    ),
                  camera,
                  viewport,
                })
              : null;
            const eligible =
              projectedError !== null &&
              shouldUseAssemblyDetail({
                approximatePixelError: projectedError,
                previousDetail: false,
                fullEvidence: false,
                screenSpace: policy.screenSpace,
              });
            const candidateTriangles = detail
              ? (detail.geometry.index?.count ?? detail.geometry.getAttribute('position').count) / 3
              : fullTriangles;
            observations.push({
              curved,
              fullTriangles,
              candidateTriangles,
              selectedTriangles: eligible ? candidateTriangles : fullTriangles,
              sourceError: detail?.approximateSourceError ?? null,
              projectedError,
              eligible,
            });
            if (curved) {
              expect(detail?.geometry).toBeDefined();
              expect(detail?.geometry).not.toBe(canonical);
              expect(candidateTriangles).toBeGreaterThan(0);
              expect(candidateTriangles).toBeLessThan(fullTriangles);
            }
            expect(simplify).toHaveBeenCalledOnce();
            expect(simplify.mock.calls[0]?.[9]).toEqual(['LockBorder', 'Permissive']);
            expect(positions).toEqual(originalPositions);
            expect(normals).toEqual(originalNormals);
            expect(canonical.index?.array).toEqual(originalCanonicalIndices);
            expect(canonical.getAttribute('position').array).toEqual(originalCanonicalPositions);
            expect(canonical.getAttribute('normal').array).toEqual(originalCanonicalNormals);
            expect(lineArrays).toEqual(lineCopies);
            expect({
              color: [...material.getBaseColorFactor()],
              metallic: material.getMetallicFactor(),
              roughness: material.getRoughnessFactor(),
              doubleSided: material.getDoubleSided(),
            }).toEqual(originalMaterial);
          } finally {
            simplify.mockRestore();
            detail?.geometry.dispose();
            canonical.dispose();
          }
        }
        expect(observations.filter(({ curved }) => curved)).toHaveLength(1);
        const assets = [published.root, ...Object.values(published.partRecords), variant.glb];
        const closureDigests: string[] = [];
        for (const asset of assets) {
          // eslint-disable-next-line no-await-in-loop -- Inspect every actual immutable checked closure byte, not an imagined denominator.
          const actual = await producer.fileSystem.readFile(asset.path);
          // eslint-disable-next-line no-await-in-loop -- Each closure digest belongs to its actual ordered bytes.
          const digest = await digestContent({ bytes: actual });
          expect(digest).toBe(asset.digest);
          if ('byteLength' in asset) {
            expect(actual.byteLength).toBe(asset.byteLength);
          }
          closureDigests.push(digest);
        }
        expect(closureDigests).toHaveLength(3);
        expect(await digestContent({ bytes: await published.admitted.readAsset(variant.glb.digest) })).toBe(
          variant.glb.digest,
        );
        const rootBytes = await producer.fileSystem.readFile(published.root.path);
        await producer.fileSystem.unlink('scale/parts/p0000.js');
        await producer.fileSystem.unlink(fixture.entryPath);
        expect(await producer.fileSystem.exists('scale/parts/p0000.js')).toBe(false);
        expect(await producer.fileSystem.exists(fixture.entryPath)).toBe(false);
        expect(await published.admitted.readAsset(variant.glb.digest)).toEqual(bytes);
        expect(await producer.fileSystem.readFile(published.root.path)).toEqual(rootBytes);
        for (const observation of observations.filter(({ projectedError }) => projectedError !== null)) {
          expect(Number.isFinite(observation.projectedError)).toBe(true);
          expect(observation.projectedError).toBeLessThanOrEqual(
            policy.screenSpace.maxApproximatePixelError * policy.screenSpace.enterDetailRatio,
          );
          expect(observation.eligible).toBe(true);
        }
        expect(observations.reduce((sum, observation) => sum + observation.selectedTriangles, 0)).toBeLessThan(
          observations.reduce((sum, observation) => sum + observation.fullTriangles, 0),
        );
      } finally {
        await client.shutdown();
      }
    } finally {
      authority.dispose();
    }
  } finally {
    producer.dispose();
  }
}, 60_000);
