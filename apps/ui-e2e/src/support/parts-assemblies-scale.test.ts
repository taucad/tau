// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFileSystemBridge, createFileSystemBridgePort } from '@taucad/runtime/filesystem';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { jscadKernel } from '@taucad/jscad';
import { esbuildBundler } from '@taucad/esbuild';
import { validateAdmittedAssemblyGlb, flattenAdmittedAssemblyGlb, readGltfSceneBounds } from '@taucad/geometry-core';
import type { PublishedPartAsset, PublishAssemblyOutcome } from '@taucad/runtime/types';
import { sha256String } from '@taucad/utils/hash';
/* oxlint-disable no-restricted-imports -- The Node-only control target does not load browser path aliases. */
/* oxlint-disable import/extensions -- The Node-only control target resolves the helper through its emitted `.js` name. */
import {
  summarizeScaleRasterDifference,
  collectPublishedScaleClosure,
  summarizeScaleClosureBytes,
  collectCommittedScaleClosure,
  importPublishedScaleClosure,
  scrubScaleProducerSources,
} from './parts-assemblies-scale.js';
/* oxlint-enable no-restricted-imports */
/* oxlint-enable import/extensions */

const encoder = new TextEncoder();
const sources = {
  'scale/parts/p0000.js': {
    content: encoder.encode(
      "import { primitives } from '@jscad/modeling';\nexport default function main() { return primitives.cuboid({ size: [20,16,12] }); }\n",
    ),
  },
  'scale/assembly.json': {
    content: encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        parts: { p0000: { source: { path: 'scale/parts/p0000.js' } } },
        occurrences: [
          { id: 'o000000', part: 'p0000', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          { id: 'o000001', part: 'p0000', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.04, 0, 0, 1] },
        ],
      }),
    ),
  },
};
const createOwnedProject = async (seed: typeof sources | Record<string, never> = {}) => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:scale-test' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: scope.storageRootKey });
  const service = new WorkspaceFileService({
    providerRegistry,
    mountTable,
    eventBus: new ChangeEventBus(),
    resourceQueue: new ResourceQueue(),
  });
  const fileSystem = service.createRootedFileSystem('/');
  for (const [path, file] of Object.entries(seed)) {
    // eslint-disable-next-line no-await-in-loop -- Seed only the owned project before publishing through its real checked owner.
    await fileSystem.writeFile(path, file.content);
  }
  return {
    fileSystem,
    runtimeFileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(fileSystem)),
    dispose: () => {
      service.dispose();
    },
  };
};
const runtime = defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] });
let producer: Awaited<ReturnType<typeof createOwnedProject>>;
let client: ReturnType<typeof createRuntimeClient<typeof runtime>>;
let published: Extract<PublishAssemblyOutcome, { status: 'published' }>;
let closure: Awaited<ReturnType<typeof collectPublishedScaleClosure>>;

beforeAll(async () => {
  producer = await createOwnedProject(sources);
  client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: producer.runtimeFileSystem,
      publicationFileSystem: producer.runtimeFileSystem,
      admitAssemblyDisplay: async ({ purpose, records, occurrences, readAsset }) => {
        if (purpose === 'admission') {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
          return;
        }
        const projection = await flattenAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        return projection.geometry.content;
      },
    }),
  });
  const parent = await sha256String('scale/assembly.json');
  const outcome = await client.publishAssembly({
    authoredPath: 'scale/assembly.json',
    publicationPath: `.tau/artifacts/reusable-parts/${parent}/scene.json`,
  });
  if (outcome.status !== 'published') {
    throw new Error(`Actual JSCAD publication failed: ${outcome.status}`);
  }
  published = outcome;
  closure = await collectPublishedScaleClosure(published, async (path) => producer.fileSystem.readFile(path));
});
afterAll(async () => {
  await client.shutdown();
  producer.dispose();
});

describe('actual published scale closure controls', () => {
  it('measures emitted JSCAD millimeters and placed world-meter spacing from actual admitted GLBs', async () => {
    const glb = published.admitted.publication.parts['p0000']?.variants['default']?.glb;
    if (!glb) {
      throw new Error('Actual emitted JSCAD GLB is unavailable.');
    }
    const bytes = await published.admitted.readAsset(glb.digest);
    const targetWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
    const sourceBounds = await readGltfSceneBounds({ bytes, targetWorld });
    for (const [axis, size] of [
      [0, 0.02],
      [1, 0.012],
      [2, 0.016],
    ] as const) {
      expect(sourceBounds.max[axis] - sourceBounds.min[axis]).toBeCloseTo(size, 7);
    }
    const projection = await flattenAdmittedAssemblyGlb({
      parts: published.admitted.publication.parts,
      occurrences: published.admitted.publication.occurrences,
      readAsset: async (_part, asset) => published.admitted.readAsset(asset.digest),
    });
    const placedBounds = await readGltfSceneBounds({ bytes: projection.geometry.content, targetWorld });
    expect(placedBounds.min[0]).toBeCloseTo(-0.01, 7);
    expect(placedBounds.max[0]).toBeCloseTo(0.05, 7);
    expect(placedBounds.max[0] - placedBounds.min[0]).toBeCloseTo(0.06, 7);
    expect(published.admitted.publication.occurrences[1]?.transform[12]).toBe(0.04);
  });
  it('retains the real root/record/GLB bytes and reopens them without producer source', async () => {
    expect(closure.files).toHaveLength(3);
    expect(published.admitted.publication.parts['p0000']?.variants['default']?.exact).toBeUndefined();
    const consumerProject = await createOwnedProject();
    const consumerFs = consumerProject.fileSystem;
    const consumer = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem: consumerProject.runtimeFileSystem,
        admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        },
      }),
    });
    try {
      const admitted = await importPublishedScaleClosure(
        closure,
        async (files) => {
          for (const [path, file] of Object.entries(files)) {
            // eslint-disable-next-line no-await-in-loop -- The test writes only its captured closure before consumer admission.
            await consumerFs.writeFile(path, file.content);
          }
        },
        async (root) => (await consumer.openAssembly({ root })).admitted,
      );
      expect(admitted.publication).toEqual(published.admitted.publication);
      expect(await consumerFs.exists('scale/parts/p0000.js')).toBe(false);
      expect(await consumerFs.exists('scale/assembly.json')).toBe(false);
    } finally {
      await consumer.shutdown();
      consumerProject.dispose();
    }
  });

  it('denies changed immutable bytes and cross-parent targets before the first import write', async () => {
    const commit = vi.fn(async () => undefined);
    const open = vi.fn(async (root: PublishedPartAsset) => (await client.openAssembly({ root })).admitted);
    const changed = closure.files.map((file, index) => ({
      ...file,
      bytes: new Uint8Array(file.bytes),
      ...(index === 1
        ? {
            path: '.tau/artifacts/reusable-parts/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/other.json',
          }
        : {}),
    }));
    await expect(importPublishedScaleClosure({ ...closure, files: changed }, commit, open)).rejects.toThrow(/changed/u);
    const tampered = closure.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) }));
    tampered[0]!.bytes[0] = 0;
    await expect(importPublishedScaleClosure({ ...closure, files: tampered }, commit, open)).rejects.toThrow(
      /changed/u,
    );
    expect(commit).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('denies an incomplete immutable closure before the first consumer write', async () => {
    const commit = vi.fn(async () => undefined);
    const open = vi.fn(async (root: PublishedPartAsset) => (await client.openAssembly({ root })).admitted);
    const leaf = Object.values(published.admitted.publication.parts['p0000']!.variants)[0]!.glb;
    await expect(
      importPublishedScaleClosure(
        { ...closure, files: closure.files.filter((file) => file.path !== leaf.path) },
        commit,
        open,
      ),
    ).rejects.toThrow(/missing/u);
    expect(commit).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('collects only the current real admitted display and fences before and after awaited reads', async () => {
    let current = true;
    const capture = {
      assemblyDisplay: { root: published.root, admitted: published.admitted },
      isCurrent: () => current,
      readRawBytes: async (path: string) => producer.fileSystem.readFile(path),
    };
    const collected = await collectCommittedScaleClosure(capture);
    expect(collected.files).toEqual(closure.files);
    expect(collected.publication).toBe(published.admitted.publication);
    current = false;
    const absentRead = vi.fn(capture.readRawBytes);
    await expect(collectCommittedScaleClosure({ ...capture, readRawBytes: absentRead })).rejects.toThrow(
      /unavailable/u,
    );
    expect(absentRead).not.toHaveBeenCalled();
    current = true;
    const changedRead = vi.fn(async (path: string) => {
      const bytes = await producer.fileSystem.readFile(path);
      current = false;
      return bytes;
    });
    await expect(collectCommittedScaleClosure({ ...capture, readRawBytes: changedRead })).rejects.toThrow(/during/u);
    expect(changedRead).toHaveBeenCalledTimes(1);
  });

  it('requires the actual complete admitted part set during collection', async () => {
    const read = vi.fn(async (path: string) => producer.fileSystem.readFile(path));
    await expect(collectPublishedScaleClosure({ ...published, partRecords: {} }, read)).rejects.toThrow(/complete/u);
    expect(read).not.toHaveBeenCalled();
  });

  it('preflights every owned source before scrub and preserves the immutable publication', async () => {
    const remove = vi.fn(async (_path: string) => undefined);
    const changed = { ...sources, 'scale/parts/p0001.js': { content: encoder.encode('changed') } };
    await expect(
      scrubScaleProducerSources(changed, {
        admitted: published.admitted,
        readRawBytes: async (path) =>
          path.endsWith('p0001.js') ? encoder.encode('outside edit') : producer.fileSystem.readFile(path),
        removeSource: remove,
      }),
    ).rejects.toThrow(/changed/u);
    expect(remove).not.toHaveBeenCalled();
    await scrubScaleProducerSources(sources, {
      admitted: published.admitted,
      readRawBytes: async (path) => producer.fileSystem.readFile(path),
      removeSource: remove,
    });
    expect(remove.mock.calls.map(([path]) => path)).toEqual(Object.keys(sources));
    const reopened = await client.openAssembly({ root: published.root });
    expect(reopened.admitted.publication).toEqual(published.admitted.publication);
  });
});

describe('actual scale closure byte denominators', () => {
  it('keeps the complete checked closure denominator separate from memory allocation', () => {
    const result = summarizeScaleClosureBytes(closure);
    expect(result.completeClosureBytes).toBe(closure.files.reduce((sum, file) => sum + file.bytes.byteLength, 0));
    expect(result.completeClosureBytes).toBe(
      result.rootBytes + result.partRecordBytes + result.allVariantGlbBytes + result.allVariantExactBytes,
    );
    expect(result.assets.map(({ digest, byteLength }) => ({ digest, byteLength }))).toEqual(
      closure.files.map(({ digest, bytes }) => ({ digest, byteLength: bytes.byteLength })),
    );
    expect(result.occurrences).toBe(closure.publication.occurrences.length);
    expect(result.definitions).toBe(Object.keys(closure.publication.parts).length);
  });
});

describe('full-resolution scale calibration pixels', () => {
  it('should record real channel and luminance changes without requiring a nonzero LOD raster error', () => {
    const first = { width: 2, height: 1, data: Uint8ClampedArray.from([0, 0, 0, 255, 100, 100, 100, 255]) };
    expect(summarizeScaleRasterDifference(first, first)).toMatchObject({
      pixels: 2,
      changedPixels: 0,
      meanLuminanceDifference: 0,
      differingPixelRatioOver12: 0,
    });
    const second = { ...first, data: Uint8ClampedArray.from([0, 0, 0, 255, 120, 120, 120, 255]) };
    expect(summarizeScaleRasterDifference(first, second)).toMatchObject({
      pixels: 2,
      changedPixels: 1,
      differingPixelRatioOver12: 0.5,
      maxChannelDifference: 20,
    });
    expect(summarizeScaleRasterDifference(first, second).meanLuminanceDifference).toBeCloseTo(10, 12);
  });
  it('should deny cropped, missing and nonfinite pixel buffers rather than comparing different camera footprints', () => {
    const first = { width: 1, height: 1, data: [20, 20, 20, 255] };
    expect(() => summarizeScaleRasterDifference(first, { ...first, width: 2 })).toThrow(RangeError);
    expect(() => summarizeScaleRasterDifference(first, { ...first, data: [20, 20, 20] })).toThrow(RangeError);
    expect(() => summarizeScaleRasterDifference(first, { ...first, data: [20, Number.NaN, 20, 255] })).toThrow(
      RangeError,
    );
  });
});
