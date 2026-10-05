// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assimpTranscoder } from '@taucad/assimp';
import { esbuildBundler } from '@taucad/esbuild';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { createNodeIo, flattenAdmittedAssemblyGlb } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { jscadKernel } from '@taucad/jscad';
import { picovoxelKernel } from '@taucad/picovoxel';
import { replicadKernel } from '@taucad/replicad';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { defineKernel } from '@taucad/runtime';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { publishedPartRecordSchema, tauCadTopologyExtension } from '@taucad/runtime/types';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type { AssemblyDisplayProjector, PublishedPartReference, PublishAssemblyOutcome } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';
import { readCoordinateEvidence } from '@taucad/runtime-testing';
import { computeStats } from '#benchmarks/benchmark-runner.js';
import { noRendererAdapter, readContention } from '#benchmarks/measurement-tags.js';

const renderRestores: Array<() => void> = [];
afterEach(() => {
  for (const restore of renderRestores.splice(0).reverse()) {
    restore();
  }
});
const spyOnRender = (producer: { readonly render?: unknown }) => {
  const descriptor = Object.getOwnPropertyDescriptor(producer, 'render');
  const render: unknown = descriptor?.value;
  if (typeof render !== 'function' || descriptor?.configurable !== true) {
    throw new TypeError('Selected producer has no replaceable own render hook.');
  }
  const spy = vi.fn(function (this: unknown, ...args: unknown[]): unknown {
    return render.apply(this, args);
  });
  Object.defineProperty(producer, 'render', { ...descriptor, value: spy });
  renderRestores.push(() => Object.defineProperty(producer, 'render', descriptor));
  return spy;
};

const encoder = new TextEncoder();
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const storedRootClosurePaths = async (
  root: { path: string; digest: string; byteLength: number },
  read: (path: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<Set<string>> => {
  const checked = async (asset: { path: string; digest: string; byteLength: number }) => {
    const bytes = await read(asset.path);
    if (bytes.byteLength !== asset.byteLength || `sha256:${digest(bytes)}` !== asset.digest) {
      throw new Error('Stored root closure differs from its pinned length or digest.');
    }
    return bytes;
  };
  const decode = (bytes: Uint8Array<ArrayBuffer>): unknown =>
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const rootBytes = await checked(root);
  const pointer = decode(rootBytes) as {
    schemaVersion: number;
    generation: number;
    manifest: { path: string; digest: string; byteLength: number };
  };
  const parent = root.path.slice(0, root.path.lastIndexOf('/') + 1);
  const storagePath = (hash: string, extension: string): string =>
    `${parent}roots/sha256/${hash.slice('sha256:'.length)}.${extension}`;
  if (
    rootBytes.byteLength > 4096 ||
    pointer.schemaVersion !== 2 ||
    !Number.isSafeInteger(pointer.generation) ||
    pointer.generation < 1 ||
    pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
    pointer.manifest.byteLength < 1 ||
    pointer.manifest.byteLength > 1_048_576
  ) {
    throw new Error('Stored scene is not a bounded v2 pointer.');
  }
  const manifest = decode(await checked(pointer.manifest)) as {
    schemaVersion: number;
    content: { digest: string; byteLength: number };
    chunks: Array<{ path: string; digest: string; byteLength: number }>;
  };
  if (
    manifest.schemaVersion !== 1 ||
    !Number.isSafeInteger(manifest.content.byteLength) ||
    manifest.content.byteLength < 1 ||
    manifest.content.byteLength > 32 * 1_048_576 ||
    manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
  ) {
    throw new Error('Stored scene manifest is not a bounded ordered closure.');
  }
  const content = new Uint8Array(manifest.content.byteLength);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const length = Math.min(1_048_576, content.byteLength - offset);
    if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== length) {
      throw new Error('Stored scene chunk path or order changed.');
    }
    // oxlint-disable-next-line no-await-in-loop -- Check each ordered immutable chunk before following the next.
    content.set(await checked(chunk), offset);
    offset += length;
  }
  if (`sha256:${digest(content)}` !== manifest.content.digest) {
    throw new Error('Stored scene logical bytes changed.');
  }
  const logical = decode(content) as { schemaVersion: number; generation: number };
  if (logical.schemaVersion !== 1 || logical.generation !== pointer.generation) {
    throw new Error('Stored scene logical generation changed.');
  }
  return new Set([root.path, pointer.manifest.path, ...manifest.chunks.map(({ path }) => path)]);
};
const admitAssemblyDisplay: AssemblyDisplayProjector = async ({ records, occurrences, readAsset }) => {
  const flattened = await flattenAdmittedAssemblyGlb({
    parts: records,
    occurrences,
    readAsset,
  });
  return flattened.geometry.content;
};

const project = async () => {
  const registry = new ProviderRegistry();
  const scope = {
    backend: 'memory',
    storageRootKey: `memory:mixed-${randomUUID()}`,
  } as const;
  const provider = await registry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: registry.resolveStorageRootKey(scope),
  });
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  const rooted = service.createRootedFileSystem('/');
  return {
    rooted,
    service,
    fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(rooted)),
  };
};

const authored = (upstream?: PublishedPartReference): string =>
  JSON.stringify({
    schemaVersion: 1,
    parts: upstream
      ? {
          upstream: { publishedPart: upstream },
          downstream: { source: { path: 'main.ts' } },
        }
      : { upstream: { source: { path: 'upstream.ts' } } },
    occurrences: upstream
      ? [
          {
            id: 'assembly',
            transform: identity,
            children: [
              { id: 'source-mesh', part: 'upstream', transform: identity },
              { id: 'mount', part: 'downstream', transform: identity },
            ],
          },
        ]
      : [{ id: 'source-mesh', part: 'upstream', transform: identity }],
  });

for (const family of ['jscad', 'picovoxel'] as const) {
  describe(`${family} part reused by an editable Replicad assembly`, () => {
    it('should preserve upstream work and digests across warm/cold downstream edits and portable reopening', async () => {
      const managedRootPath = (authoredPath: string) =>
        `.tau/artifacts/reusable-parts/${digest(encoder.encode(authoredPath))}/scene.json`;
      const upstreamRootPath = managedRootPath('upstream.json');
      const sceneRootPath = managedRootPath('assembly.json');
      const packagedRootPath = managedRootPath('packaged-assembly.json');
      const original = await project();
      const portable = await project();
      const example = new URL(`../../../libs/tau-examples/src/kernels/replicad/${family}-part-reuse/`, import.meta.url);
      const {
        plugin: upstreamPlugin,
        builds,
        meshes,
        restores,
      } = await (async () => {
        if (family === 'jscad') {
          const plugin = jscadKernel();
          const producer = await resolveRuntimePluginDefinition('kernel', plugin);
          const builds = vi.spyOn(producer, 'evaluate');
          const meshes = spyOnRender(producer);
          const restores = vi.spyOn(producer, 'deserializeHandle');
          // The public carrier captures these real hooks for every worker definition load.
          const observed = defineKernel({ ...producer, id: plugin.id, extensions: plugin.extensions })();
          return { plugin: observed, builds, meshes, restores };
        }
        const plugin = picovoxelKernel({ wasm: 'serial' });
        const producer = await resolveRuntimePluginDefinition('kernel', plugin);
        const builds = vi.spyOn(producer, 'evaluate');
        const meshes = spyOnRender(producer);
        const restores = vi.spyOn(producer, 'deserializeHandle');
        const observed = defineKernel({ ...producer, id: plugin.id, extensions: plugin.extensions })({
          wasm: 'serial',
        });
        return { plugin: observed, builds, meshes, restores };
      })();
      const upstreamRuntime = defineRuntime({
        kernels: [upstreamPlugin],
        bundlers: [esbuildBundler()],
        transcoders: family === 'jscad' ? [assimpTranscoder({ backend: 'wasm' })] : [],
      });
      const mixedAcquisition = process.env['TAU_E2E_MIXED_ACQUISITION'] === 'true';
      const resourceRoot = new URL(
        '../../../apps/ui/public/assets/engines/replicad/density-single-v1/',
        import.meta.url,
      );
      const customWasm = {
        wasmUrl: new URL('replicad_single.wasm', resourceRoot).href,
        wasmBindingsUrl: new URL('replicad_single.mjs', resourceRoot).href,
      };
      const downstreamPlugin = replicadKernel({ wasm: mixedAcquisition ? customWasm : 'single' });
      const downstream = await resolveRuntimePluginDefinition('kernel', downstreamPlugin);
      if (!('render' in downstream) || typeof downstream.render !== 'function') {
        throw new TypeError('Selected downstream producer has no render hook.');
      }
      const downstreamBuilds = vi.spyOn(downstream, 'evaluate');
      const downstreamMeshes = mixedAcquisition ? spyOnRender(downstream) : undefined;
      const downstreamRestores = mixedAcquisition ? vi.spyOn(downstream, 'deserializeHandle') : undefined;
      const observedDownstream = defineKernel({
        ...downstream,
        id: downstreamPlugin.id,
        extensions: downstreamPlugin.extensions,
      })({ wasm: mixedAcquisition ? customWasm : 'single' });
      const downstreamRuntime = defineRuntime({
        kernels: [observedDownstream],
        bundlers: [esbuildBundler()],
      });
      const upstreamClient = createRuntimeClient({
        transport: inProcessTransport({
          runtime: upstreamRuntime,
          fileSystem: original.fileSystem,
          publicationFileSystem: original.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      const downstreamClient = createRuntimeClient({
        transport: inProcessTransport({
          runtime: downstreamRuntime,
          fileSystem: original.fileSystem,
          publicationFileSystem: original.fileSystem,
          admitAssemblyDisplay,
        }),
      });
      try {
        const delivered = mixedAcquisition
          ? await Promise.all(
              [
                {
                  name: 'replicad_single.wasm',
                  digest: '9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9',
                },
                {
                  name: 'replicad_single.mjs',
                  digest: 'cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27',
                },
              ].map(async (asset) => {
                const bytes = new Uint8Array(await readFile(new URL(asset.name, resourceRoot)));
                expect(digest(bytes)).toBe(asset.digest);
                return { ...asset, byteLength: bytes.byteLength };
              }),
            )
          : undefined;
        const acquisitionDirectory = new URL(
          '../../../out/reports/benchmarks/runtime-e2e/mixed-published-reuse/',
          import.meta.url,
        );
        for (const path of ['main.ts', 'upstream.ts', 'upstream.settings.ts', 'downstream.settings.ts']) {
          // oxlint-disable-next-line no-await-in-loop -- Seed the authored files before either producer operates.
          await original.rooted.writeFile(path, new Uint8Array(await readFile(fileURLToPath(new URL(path, example)))));
        }
        await original.rooted.writeFile('upstream.json', encoder.encode(authored()));
        const first = await upstreamClient.publishAssembly({
          authoredPath: 'upstream.json',
          publicationPath: upstreamRootPath,
        });
        if (first.status !== 'published') {
          throw new Error(`Upstream publication failed: ${JSON.stringify(first)}`);
        }
        const upstream = first.partRecords['upstream']!;
        const upstreamGlb = first.admitted.publication.parts['upstream']!.variants['default']!.glb;
        expect(first.admitted.publication.parts['upstream']!.variants['default']!.exact).toBeUndefined();
        const upstreamClosure = new Map<string, Uint8Array<ArrayBuffer>>();
        for (const path of [upstream.path, upstreamGlb.path]) {
          // oxlint-disable-next-line no-await-in-loop -- Retain the checked upstream closure before the changed-input control.
          upstreamClosure.set(path, await original.rooted.readFile(path));
        }
        const upstreamDocument = upstreamClient.open({ source: { path: 'upstream.ts' }, watch: false });
        const stl = await upstreamDocument.export('stl').finally(() => {
          upstreamDocument.close();
        });
        if (!stl.success) {
          throw new Error(`Upstream STL export failed: ${JSON.stringify(stl.issues)}`);
        }
        const stlBytes = stl.files[0].bytes;
        const stlDigest = digest(stlBytes);
        const stlPath = `assets/${stlDigest}.stl`;
        await original.rooted.writeFile(stlPath, stlBytes);
        await original.rooted.writeFile(
          'upstream-asset.ts',
          encoder.encode(`import bytes from './${stlPath}' with { type: 'bytes' };\nexport const stlBytes = bytes;\n`),
        );
        await original.rooted.writeFile('assembly.json', encoder.encode(authored(upstream)));
        const scene = await downstreamClient.publishAssembly({
          authoredPath: 'assembly.json',
          publicationPath: sceneRootPath,
        });
        if (scene.status !== 'published') {
          throw new Error(`Mixed publication failed: ${JSON.stringify(scene)}`);
        }
        const initialSceneClosure = new Map<string, Uint8Array<ArrayBuffer>>();
        const initialRootPaths = await storedRootClosurePaths(scene.root, async (path) =>
          original.rooted.readFile(path),
        );
        const initialScenePaths = new Set(initialRootPaths);
        for (const [part, record] of Object.entries(scene.admitted.publication.parts)) {
          initialScenePaths.add(scene.partRecords[part]!.path);
          for (const variant of Object.values(record.variants)) {
            initialScenePaths.add(variant.glb.path);
            if (variant.exact) {
              initialScenePaths.add(variant.exact.asset.path);
            }
          }
        }
        for (const path of initialScenePaths) {
          // oxlint-disable-next-line no-await-in-loop -- Retain the initial root closure before downstream edits.
          initialSceneClosure.set(path, await original.rooted.readFile(path));
        }
        const baseline = {
          builds: builds.mock.calls.length,
          meshes: meshes.mock.calls.length,
          restores: restores.mock.calls.length,
        };
        expect(baseline.builds).toBeGreaterThan(0);
        expect(baseline.meshes).toBeGreaterThan(0);
        if (mixedAcquisition && delivered && downstreamMeshes && downstreamRestores) {
          expect(await original.rooted.readFile('downstream.settings.ts')).toEqual(
            encoder.encode('export const mountWidth = 24;\n'),
          );
          const sourcePaths = [
            'main.ts',
            'upstream.ts',
            'upstream.settings.ts',
            'downstream.settings.ts',
            'assembly.json',
            'upstream-asset.ts',
            stlPath,
          ];
          const inputs = await Promise.all(
            sourcePaths.map(async (path) => {
              const bytes = await original.rooted.readFile(path);
              return { path, digest: digest(bytes), byteLength: bytes.byteLength };
            }),
          );
          const assets = [...initialSceneClosure]
            .filter(([path]) => path !== scene.root.path)
            .map(([path, bytes]) => ({
              path,
              digest: digest(bytes),
              byteLength: bytes.byteLength,
            }));
          const samples: Array<{
            kind: 'fresh-client' | 'warmup' | 'warm';
            /** Milliseconds; only publishAssembly including admission, excluding setup/checks/cleanup. */
            duration: number;
            upstream: typeof baseline;
            downstreamWork: typeof baseline;
            root: typeof scene.root;
            contention: ReturnType<typeof readContention>;
          }> = [];
          // Each fresh client shares the already populated project/runtime/module cache; neither arm edits width24.
          for (let sample = 0; sample < 28; sample += 1) {
            const fresh = sample < 5;
            let kind: 'fresh-client' | 'warmup' | 'warm' = 'warm';
            if (fresh) {
              kind = 'fresh-client';
            } else if (sample < 13) {
              kind = 'warmup';
            }
            const client = fresh
              ? createRuntimeClient({
                  transport: inProcessTransport({
                    runtime: downstreamRuntime,
                    fileSystem: original.fileSystem,
                    publicationFileSystem: original.fileSystem,
                    admitAssemblyDisplay,
                  }),
                })
              : downstreamClient;
            // oxlint-disable-next-line no-await-in-loop -- Settle the complete sample before shutting down its client or starting another sample.
            const [result] = await Promise.allSettled([
              (async () => {
                const before = {
                  builds: downstreamBuilds.mock.calls.length,
                  meshes: downstreamMeshes.mock.calls.length,
                  restores: downstreamRestores.mock.calls.length,
                };
                const contention = readContention({
                  loadAverage1m: loadavg()[0] ?? 0,
                  cpuCount: cpus().length,
                  operatorTag: process.env['TAU_MEASUREMENT_CONTENTION'],
                });
                const startedAt = performance.now();
                const publication = await client.publishAssembly({
                  authoredPath: 'assembly.json',
                  publicationPath: sceneRootPath,
                });
                const duration = performance.now() - startedAt;
                if (publication.status !== 'published') {
                  throw new Error(`Mixed acquisition publication failed: ${JSON.stringify(publication)}`);
                }
                expect(Number.isFinite(duration) && duration >= 0).toBe(true);
                expect(publication.partRecords).toEqual(scene.partRecords);
                expect(publication.admitted.publication.parts).toEqual(scene.admitted.publication.parts);
                expect(publication.admitted.publication.occurrences).toEqual(scene.admitted.publication.occurrences);
                expect(
                  await Promise.all(
                    sourcePaths.map(async (path) => {
                      const bytes = await original.rooted.readFile(path);
                      return { path, digest: digest(bytes), byteLength: bytes.byteLength };
                    }),
                  ),
                ).toEqual(inputs);
                expect(
                  await Promise.all(
                    assets.map(async ({ path }) => {
                      const bytes = await original.rooted.readFile(path);
                      return { path, digest: digest(bytes), byteLength: bytes.byteLength };
                    }),
                  ),
                ).toEqual(assets);
                const upstreamWork = {
                  builds: builds.mock.calls.length,
                  meshes: meshes.mock.calls.length,
                  restores: restores.mock.calls.length,
                };
                expect(upstreamWork).toEqual(baseline);
                samples.push({
                  kind,
                  duration,
                  upstream: upstreamWork,
                  downstreamWork: {
                    builds: downstreamBuilds.mock.calls.length - before.builds,
                    meshes: downstreamMeshes.mock.calls.length - before.meshes,
                    restores: downstreamRestores.mock.calls.length - before.restores,
                  },
                  root: publication.root,
                  contention,
                });
              })(),
            ]);
            // oxlint-disable-next-line no-await-in-loop -- Shutdown follows settled sample work; never race cleanup with publication or byte checks.
            const [cleanup] = fresh ? await Promise.allSettled([client.shutdown()]) : [];
            if (result.status === 'rejected') {
              const error: unknown = result.reason;
              throw error;
            }
            if (cleanup?.status === 'rejected') {
              const error: unknown = cleanup.reason;
              throw error;
            }
          }
          const freshTimings = samples.filter(({ kind }) => kind === 'fresh-client').map(({ duration }) => duration);
          const warmupRows = samples.filter(({ kind }) => kind === 'warmup');
          const warmTimings = samples.filter(({ kind }) => kind === 'warm').map(({ duration }) => duration);
          expect(freshTimings).toHaveLength(5);
          expect(warmupRows).toHaveLength(8);
          expect(warmTimings).toHaveLength(15);
          expect(
            await Promise.all(
              delivered.map(async ({ name }) => digest(new Uint8Array(await readFile(new URL(name, resourceRoot))))),
            ),
          ).toEqual(delivered.map(({ digest }) => digest));
          await mkdir(acquisitionDirectory, { recursive: true });
          await writeFile(
            new URL(`${family}-cached-publication.json`, acquisitionDirectory),
            JSON.stringify(
              {
                status:
                  'raw acquisition only; independent quiet/device/variance review required; no GPU or regression acceptance',
                family,
                workload: { mountWidth: 24, definitions: 2, leafOccurrences: 2, groupOccurrences: 1 },
                coldKind:
                  'fresh downstream clients sharing populated persistent in-memory project, runtime and warm Node module cache; not cold-process or first-ever source compilation',
                warmKind:
                  'unchanged cached publication using the original initialized downstream client; eight fully checked warmups precede fifteen measured warm calls',
                interval:
                  'publishAssembly call through publication/admission only; excludes setup, byte checks and shutdown; no phase split',
                measurement: {
                  build: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
                  wasmVariant: customWasm.wasmUrl,
                  adapter: noRendererAdapter,
                  kernelProcess: { kind: 'in-process', role: 'runtime-e2e mixed acquisition', pid: process.pid },
                  crossOriginIsolated: false,
                  device: {
                    platform: process.platform,
                    arch: process.arch,
                    node: process.version,
                    cpu: cpus()[0]?.model,
                    cpuCount: cpus().length,
                  },
                },
                selectedConfiguration: { variant: 'custom', ...customWasm, assets: delivered },
                upstreamVariant: family === 'picovoxel' ? 'serial' : 'jscad default',
                inputs,
                assets,
                initialParts: scene.admitted.publication.parts,
                upstreamBaseline: baseline,
                samples,
                warmupRows,
                warmupCount: warmupRows.length,
                freshClient: { timings: freshTimings, ...computeStats(freshTimings) },
                warm: { timings: warmTimings, ...computeStats(warmTimings) },
              },
              undefined,
              2,
            ),
          );
        }
        const firstDownstream = scene.admitted.publication.parts['downstream']!.variants['default']!.glb.digest;
        await original.rooted.writeFile('downstream.settings.ts', encoder.encode('export const mountWidth = 30;\n'));
        const editBefore =
          mixedAcquisition && downstreamMeshes && downstreamRestores
            ? {
                builds: downstreamBuilds.mock.calls.length,
                meshes: downstreamMeshes.mock.calls.length,
                restores: downstreamRestores.mock.calls.length,
              }
            : undefined;
        const editStartedAt = mixedAcquisition ? performance.now() : 0;
        const warm = await downstreamClient.publishAssembly({
          authoredPath: 'assembly.json',
          publicationPath: sceneRootPath,
        });
        const editDuration = mixedAcquisition ? performance.now() - editStartedAt : 0;
        if (warm.status !== 'published') {
          throw new Error(`Warm mixed publication failed: ${JSON.stringify(warm)}`);
        }
        if (editBefore && delivered && downstreamMeshes && downstreamRestores) {
          expect(Number.isFinite(editDuration) && editDuration >= 0).toBe(true);
          const editInputs = await Promise.all(
            [
              'main.ts',
              'upstream.ts',
              'upstream.settings.ts',
              'downstream.settings.ts',
              'assembly.json',
              'upstream-asset.ts',
              stlPath,
            ].map(async (path) => {
              const bytes = await original.rooted.readFile(path);
              return { path, digest: digest(bytes), byteLength: bytes.byteLength };
            }),
          );
          const deliveredAfter = await Promise.all(
            delivered.map(async ({ name }) => {
              const bytes = new Uint8Array(await readFile(new URL(name, resourceRoot)));
              return { name, digest: digest(bytes), byteLength: bytes.byteLength };
            }),
          );
          expect(deliveredAfter).toEqual(delivered);
          await writeFile(
            new URL(`${family}-width30-edit.json`, acquisitionDirectory),
            JSON.stringify(
              {
                status:
                  'single-sample changed-geometry diagnostic; widths30/36 are distinct outputs, not comparable arms or a golden',
                family,
                mountWidth: 30,
                kind: 'warm-edit',
                duration: editDuration,
                inputs: editInputs,
                deliveredAfter,
                interval:
                  'milliseconds; publishAssembly including admission only, excluding source edit/checks/cleanup',
                selectedConfiguration: { variant: 'custom', ...customWasm, assets: delivered },
                downstreamWork: {
                  builds: downstreamBuilds.mock.calls.length - editBefore.builds,
                  meshes: downstreamMeshes.mock.calls.length - editBefore.meshes,
                  restores: downstreamRestores.mock.calls.length - editBefore.restores,
                },
                upstream: {
                  builds: builds.mock.calls.length,
                  meshes: meshes.mock.calls.length,
                  restores: restores.mock.calls.length,
                },
                downstreamGlb: warm.admitted.publication.parts['downstream']!.variants['default']!.glb,
                root: warm.root,
              },
              undefined,
              2,
            ),
          );
        }
        expect(warm.admitted.publication.parts['downstream']!.variants['default']!.glb.digest).not.toBe(
          firstDownstream,
        );
        expect(warm.partRecords['upstream']).toEqual(upstream);
        expect(warm.admitted.publication.parts['upstream']!.variants['default']!.glb.digest).toBe(upstreamGlb.digest);
        expect(digest(await original.rooted.readFile(stlPath))).toBe(stlDigest);
        expect({
          builds: builds.mock.calls.length,
          meshes: meshes.mock.calls.length,
          restores: restores.mock.calls.length,
        }).toEqual(baseline);
        await downstreamClient.shutdown();
        await upstreamClient.shutdown();

        const cold = createRuntimeClient({
          transport: inProcessTransport({
            runtime: downstreamRuntime,
            fileSystem: original.fileSystem,
            publicationFileSystem: original.fileSystem,
            admitAssemblyDisplay,
          }),
        });
        let finalScene: Extract<PublishAssemblyOutcome, { status: 'published' }> | undefined;
        try {
          await original.rooted.writeFile('downstream.settings.ts', encoder.encode('export const mountWidth = 36;\n'));
          const editBefore =
            mixedAcquisition && downstreamMeshes && downstreamRestores
              ? {
                  builds: downstreamBuilds.mock.calls.length,
                  meshes: downstreamMeshes.mock.calls.length,
                  restores: downstreamRestores.mock.calls.length,
                }
              : undefined;
          const editStartedAt = mixedAcquisition ? performance.now() : 0;
          const publication = await cold.publishAssembly({
            authoredPath: 'assembly.json',
            publicationPath: sceneRootPath,
          });
          const editDuration = mixedAcquisition ? performance.now() - editStartedAt : 0;
          if (publication.status !== 'published') {
            throw new Error(`Cold mixed publication failed: ${JSON.stringify(publication)}`);
          }
          if (editBefore && delivered && downstreamMeshes && downstreamRestores) {
            expect(Number.isFinite(editDuration) && editDuration >= 0).toBe(true);
            const editInputs = await Promise.all(
              [
                'main.ts',
                'upstream.ts',
                'upstream.settings.ts',
                'downstream.settings.ts',
                'assembly.json',
                'upstream-asset.ts',
                stlPath,
              ].map(async (path) => {
                const bytes = await original.rooted.readFile(path);
                return { path, digest: digest(bytes), byteLength: bytes.byteLength };
              }),
            );
            const deliveredAfter = await Promise.all(
              delivered.map(async ({ name }) => {
                const bytes = new Uint8Array(await readFile(new URL(name, resourceRoot)));
                return { name, digest: digest(bytes), byteLength: bytes.byteLength };
              }),
            );
            expect(deliveredAfter).toEqual(delivered);
            await writeFile(
              new URL(`${family}-width36-edit.json`, acquisitionDirectory),
              JSON.stringify(
                {
                  status:
                    'single-sample changed-geometry diagnostic; widths30/36 are distinct outputs, not comparable arms or a golden',
                  family,
                  mountWidth: 36,
                  kind: 'fresh-client-edit',
                  duration: editDuration,
                  inputs: editInputs,
                  deliveredAfter,
                  interval:
                    'milliseconds; publishAssembly including admission only, excluding source edit/checks/cleanup',
                  selectedConfiguration: { variant: 'custom', ...customWasm, assets: delivered },
                  downstreamWork: {
                    builds: downstreamBuilds.mock.calls.length - editBefore.builds,
                    meshes: downstreamMeshes.mock.calls.length - editBefore.meshes,
                    restores: downstreamRestores.mock.calls.length - editBefore.restores,
                  },
                  upstream: {
                    builds: builds.mock.calls.length,
                    meshes: meshes.mock.calls.length,
                    restores: restores.mock.calls.length,
                  },
                  downstreamGlb: publication.admitted.publication.parts['downstream']!.variants['default']!.glb,
                  root: publication.root,
                },
                undefined,
                2,
              ),
            );
          }
          finalScene = publication;
          expect(finalScene.partRecords['upstream']).toEqual(upstream);
          expect(finalScene.admitted.publication.parts['upstream']!.variants['default']!.glb.digest).toBe(
            upstreamGlb.digest,
          );
          expect(finalScene.admitted.publication.parts['downstream']!.variants['default']!.glb.digest).not.toBe(
            warm.admitted.publication.parts['downstream']!.variants['default']!.glb.digest,
          );
          expect(digest(await original.rooted.readFile(stlPath))).toBe(stlDigest);
          expect({
            builds: builds.mock.calls.length,
            meshes: meshes.mock.calls.length,
            restores: restores.mock.calls.length,
          }).toEqual(baseline);
          const paths = await storedRootClosurePaths(finalScene.root, async (path) => original.rooted.readFile(path));
          for (const [part, record] of Object.entries(finalScene.admitted.publication.parts)) {
            paths.add(finalScene.partRecords[part]!.path);
            for (const variant of Object.values(record.variants)) {
              paths.add(variant.glb.path);
              if (variant.exact) {
                paths.add(variant.exact.asset.path);
              }
            }
          }
          for (const path of paths) {
            // oxlint-disable-next-line no-await-in-loop -- Copy only the checked publication closure to an empty project.
            await portable.rooted.writeFile(path, await original.rooted.readFile(path));
          }
        } finally {
          await cold.shutdown();
        }
        const downstreamBeforeOpen = downstreamBuilds.mock.calls.length;
        const consumer = createRuntimeClient({
          transport: inProcessTransport({
            runtime: downstreamRuntime,
            fileSystem: portable.fileSystem,
            publicationFileSystem: portable.fileSystem,
            admitAssemblyDisplay,
          }),
        });
        try {
          expect(await portable.rooted.exists('main.ts')).toBe(false);
          expect(await portable.rooted.exists('upstream.ts')).toBe(false);
          expect(await portable.rooted.exists('.tau/cache')).toBe(false);
          const opened = await consumer.openAssembly({ root: finalScene.root });
          expect(opened.admitted.publication).toEqual(finalScene.admitted.publication);
          expect(downstreamBuilds.mock.calls.length).toBe(downstreamBeforeOpen);
          const exact = await opened.exportPublished({ format: 'step', publishedAssembly: { root: finalScene.root } });
          expect(exact.success).toBe(false);
          expect(downstreamBuilds.mock.calls.length).toBe(downstreamBeforeOpen);
          const bytes = await opened.admitted.readAsset(
            opened.admitted.publication.parts['downstream']!.variants['default']!.glb.digest,
          );
          const io = await createNodeIo();
          const document = await io.readBinary(bytes);
          const topology = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload() as
            | TauCadTopologyPayload
            | undefined;
          expect(topology?.components.find(({ name }) => name === 'Imported mesh insert')?.capabilities).toMatchObject({
            hasPreciseTopology: false,
            exports: [
              { fidelity: 'mesh', available: true },
              { fidelity: 'brep', available: false },
            ],
          });
          expect(topology?.components.find(({ name }) => name === 'Replicad mount')?.capabilities).toMatchObject({
            hasPreciseTopology: true,
          });
          const evidence = await readCoordinateEvidence({ bytes });
          const mount = evidence.filter(({ nodeName, meshName }) => [nodeName, meshName].includes('Replicad mount'));
          expect(mount.length).toBeGreaterThan(0);
          const mountX = mount.flatMap(({ positions }) => positions.map(([x]) => x));
          expect(Math.min(...mountX)).toBeCloseTo(-0.018, 6);
          expect(Math.max(...mountX)).toBeCloseTo(0.018, 6);
          expect({
            builds: builds.mock.calls.length,
            meshes: meshes.mock.calls.length,
            restores: restores.mock.calls.length,
          }).toEqual(baseline);
        } finally {
          await consumer.shutdown();
        }

        const changed = createRuntimeClient({
          transport: inProcessTransport({
            runtime: upstreamRuntime,
            fileSystem: original.fileSystem,
            publicationFileSystem: original.fileSystem,
            admitAssemblyDisplay,
          }),
        });
        try {
          await original.rooted.writeFile('upstream.settings.ts', encoder.encode('export const upstreamSize = 10;\n'));
          const changedPart = await changed.publishAssembly({
            authoredPath: 'upstream.json',
            publicationPath: upstreamRootPath,
          });
          if (changedPart.status !== 'published') {
            throw new Error(`Changed upstream publication failed: ${JSON.stringify(changedPart)}`);
          }
          expect(changedPart.admitted.publication.parts['upstream']!.variants['default']!.glb.digest).not.toBe(
            upstreamGlb.digest,
          );
          const changedDocument = changed.open({ source: { path: 'upstream.ts' }, watch: false });
          const changedStl = await changedDocument.export('stl').finally(() => {
            changedDocument.close();
          });
          if (!changedStl.success) {
            throw new Error(`Changed STL export failed: ${JSON.stringify(changedStl.issues)}`);
          }
          expect(digest(changedStl.files[0].bytes)).not.toBe(stlDigest);
          expect(builds.mock.calls.length).toBeGreaterThan(baseline.builds);
          expect(meshes.mock.calls.length).toBeGreaterThan(baseline.meshes);
          // The package entry is a fresh, source-free publication of the checked immutable records.
          // Let the runtime write its pointer, manifest and ordered chunks; never hand-author scene.json.
          const fixtureRootClosure = new Map<string, Uint8Array<ArrayBuffer>>();
          const packaging = await project();
          try {
            for (const [path, bytes] of initialSceneClosure) {
              if (initialRootPaths.has(path)) {
                continue;
              }
              const recordPath = Object.values(scene.partRecords).some((pin) => pin.path === path);
              const destination = recordPath ? `assets/${path}` : path;
              // oxlint-disable-next-line no-await-in-loop -- Copy each checked immutable asset before source-free publication.
              await packaging.rooted.mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
              // oxlint-disable-next-line no-await-in-loop -- Copy each checked immutable asset before source-free publication.
              await packaging.rooted.writeFile(destination, bytes);
            }
            const packagedParts = Object.fromEntries(
              Object.entries(scene.partRecords).map(([name, pin]) => [
                name,
                { publishedPart: { ...pin, path: `assets/${pin.path}` } },
              ]),
            );
            await packaging.rooted.writeFile(
              'assembly.json',
              encoder.encode(
                JSON.stringify({
                  schemaVersion: 1,
                  parts: packagedParts,
                  occurrences: scene.admitted.publication.occurrences,
                }),
              ),
            );
            expect(await packaging.rooted.exists('main.ts')).toBe(false);
            expect(await packaging.rooted.exists('upstream.ts')).toBe(false);
            expect(await packaging.rooted.exists('.tau/cache')).toBe(false);
            const counts = { upstream: builds.mock.calls.length, downstream: downstreamBuilds.mock.calls.length };
            const fixtureClient = createRuntimeClient({
              transport: inProcessTransport({
                runtime: downstreamRuntime,
                fileSystem: packaging.fileSystem,
                publicationFileSystem: packaging.fileSystem,
                admitAssemblyDisplay,
              }),
            });
            try {
              const published = await fixtureClient.publishAssembly({
                authoredPath: 'assembly.json',
                publicationPath: 'scene.json',
              });
              if (published.status !== 'published') {
                throw new Error(`Source-free packaged scene publication failed: ${JSON.stringify(published)}`);
              }
              expect(published.admitted.publication).toEqual(scene.admitted.publication);
              expect(published.partRecords).toEqual(
                Object.fromEntries(
                  Object.entries(scene.partRecords).map(([name, pin]) => [
                    name,
                    { ...pin, path: `assets/${pin.path}` },
                  ]),
                ),
              );
              const paths = await storedRootClosurePaths(published.root, async (path) =>
                packaging.rooted.readFile(path),
              );
              for (const path of paths) {
                // oxlint-disable-next-line no-await-in-loop -- Retain the actual source-free pointer closure before shutdown.
                fixtureRootClosure.set(path, await packaging.rooted.readFile(path));
              }
              expect({ upstream: builds.mock.calls.length, downstream: downstreamBuilds.mock.calls.length }).toEqual(
                counts,
              );
            } finally {
              await fixtureClient.shutdown();
            }
          } finally {
            packaging.service.dispose();
          }
          const fixture = new URL(
            `../../../out/research/parts-assemblies-execution/2026-09-30/s08-runtime/mixed/${family}/`,
            import.meta.url,
          );
          await mkdir(new URL('assets/', fixture), { recursive: true });
          await writeFile(new URL(stlPath, fixture), stlBytes);
          await writeFile(
            new URL('assembly.json', fixture),
            authored({ ...upstream, path: `assets/${upstream.path}` }),
          );
          for (const [path, bytes] of upstreamClosure) {
            const asset = new URL(path === upstream.path ? `assets/${path}` : path, fixture);
            // oxlint-disable-next-line no-await-in-loop -- Emit the verified immutable producer closure for packaging.
            await mkdir(new URL('.', asset), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Emit the verified immutable producer closure for packaging.
            await writeFile(asset, bytes);
          }
          for (const [path, bytes] of initialSceneClosure) {
            const asset = new URL(`scene/${path}`, fixture);
            // oxlint-disable-next-line no-await-in-loop -- Emit the initial full pinned scene closure as lane evidence.
            await mkdir(new URL('.', asset), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Emit the initial full pinned scene closure as lane evidence.
            await writeFile(asset, bytes);
          }
          for (const [path, bytes] of initialSceneClosure) {
            if (initialRootPaths.has(path)) {
              continue;
            }
            const recordPath = Object.values(scene.partRecords).some((pin) => pin.path === path);
            const asset = new URL(recordPath ? `assets/${path}` : path, fixture);
            // oxlint-disable-next-line no-await-in-loop -- Preserve the verified full scene closure for the product entry.
            await mkdir(new URL('.', asset), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Preserve the verified full scene closure for the product entry.
            await writeFile(asset, bytes);
          }
          for (const [path, bytes] of fixtureRootClosure) {
            const asset = new URL(path, fixture);
            // oxlint-disable-next-line no-await-in-loop -- Emit only the runtime's checked source-free pointer closure.
            await mkdir(new URL('.', asset), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Emit only the runtime's checked source-free pointer closure.
            await writeFile(asset, bytes);
          }
          await writeFile(
            new URL('upstream-asset.ts', fixture),
            `import bytes from './${stlPath}' with { type: 'bytes' };\nexport const stlBytes = bytes;\n`,
          );
          await writeFile(
            new URL('assets.d.ts', fixture),
            `declare module '*${stlDigest}.stl' {\n  const bytes: Uint8Array<ArrayBuffer>;\n  export default bytes;\n}\n`,
          );
          await writeFile(
            new URL('producer.json', fixture),
            JSON.stringify(
              {
                family,
                producerInputs: ['upstream.ts', 'upstream.settings.ts'],
                inputs: Object.fromEntries(
                  await Promise.all(
                    ['upstream.ts', 'upstream.settings.ts'].map(
                      async (path) =>
                        [path, digest(new Uint8Array(await readFile(fileURLToPath(new URL(path, example)))))] as const,
                    ),
                  ),
                ),
                stlDigest,
                upstreamGlbDigest: upstreamGlb.digest,
                baseline,
              },
              null,
              2,
            ),
          );
          const packagedClient = createRuntimeClient({
            transport: inProcessTransport({
              runtime: downstreamRuntime,
              fileSystem: original.fileSystem,
              publicationFileSystem: original.fileSystem,
              admitAssemblyDisplay,
            }),
          });
          try {
            const packagedAuthored = new Uint8Array(await readFile(fileURLToPath(new URL('assembly.json', example))));
            const packagedPin = (
              JSON.parse(new TextDecoder().decode(packagedAuthored)) as {
                parts: { upstream: { publishedPart: PublishedPartReference } };
              }
            ).parts.upstream.publishedPart;
            const packagedRecordBytes = new Uint8Array(await readFile(new URL(packagedPin.path, example)));
            expect(`sha256:${digest(packagedRecordBytes)}`).toBe(packagedPin.digest);
            const packagedRecord = publishedPartRecordSchema.parse(
              JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packagedRecordBytes)),
            );
            const packagedGlb = packagedRecord.variants['default']!.glb;
            const packagedGlbBytes = new Uint8Array(await readFile(new URL(packagedGlb.path, example)));
            expect(`sha256:${digest(packagedGlbBytes)}`).toBe(packagedGlb.digest);
            expect(packagedGlbBytes.byteLength).toBe(packagedGlb.byteLength);
            await original.rooted.writeFile(packagedPin.path, packagedRecordBytes);
            await original.rooted.writeFile(packagedGlb.path, packagedGlbBytes);
            await original.rooted.writeFile('packaged-assembly.json', packagedAuthored);
            expect(new Uint8Array(await readFile(fileURLToPath(new URL(stlPath, example))))).toEqual(stlBytes);
            const packagedScene = await packagedClient.publishAssembly({
              authoredPath: 'packaged-assembly.json',
              publicationPath: packagedRootPath,
            });
            if (packagedScene.status !== 'published') {
              throw new Error(`Packaged mixed publication failed: ${JSON.stringify(packagedScene)}`);
            }
            expect(packagedScene.partRecords['upstream']).toEqual(packagedPin);
            expect(packagedScene.admitted.publication.parts['upstream']).toEqual(packagedRecord);
            expect(packagedScene.admitted.publication.parts['upstream']!.variants['default']!.glb.digest).toBe(
              packagedGlb.digest,
            );
            expect(await original.rooted.readFile(packagedGlb.path)).toEqual(packagedGlbBytes);
          } finally {
            await packagedClient.shutdown();
          }
        } finally {
          await changed.shutdown();
        }
      } finally {
        await downstreamClient.shutdown();
        await upstreamClient.shutdown();
        original.service.dispose();
        portable.service.dispose();
        vi.restoreAllMocks();
      }
    }, 300_000);
  });
}
