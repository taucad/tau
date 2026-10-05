// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { z } from 'zod';
import { decode, encode } from '@msgpack/msgpack';
import { contentDigest, digestContent } from '@taucad/cache-core';
import { NodeIO } from '@gltf-transform/core';
import { validateAdmittedAssemblyGlb, registerTauGltfExtensions } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createRuntimeClient } from '@taucad/runtime/client';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createFileSystemBridgePort, fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineKernel } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { readCoordinateEvidence } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '#replicad.kernel.js';

// The app-delivered immutable repair pair; absent or changed bytes must fail, never select a package fallback.
const deliveredWasm = {
  wasmUrl: new URL(
    '../../../../apps/ui/public/assets/engines/replicad/density-single-v1/replicad_single.wasm',
    import.meta.url,
  ).href,
  wasmBindingsUrl: new URL(
    '../../../../apps/ui/public/assets/engines/replicad/density-single-v1/replicad_single.mjs',
    import.meta.url,
  ).href,
};
const deliveredAssets = async () =>
  Promise.all(
    [deliveredWasm.wasmUrl, deliveredWasm.wasmBindingsUrl].map(async (url) =>
      digestContent({ bytes: new Uint8Array(await readFile(new URL(url))) }),
    ),
  );

// These fixture PRODUCT identities are plain ASCII without STEP escape directives.
// Follow OCCT cleanText: remove CR/LF only and preserve every space in both identity fields.
const stepProductIdentities = (bytes: Uint8Array<ArrayBuffer>): Array<{ id: string; name: string }> =>
  [...new TextDecoder().decode(bytes).matchAll(/PRODUCT\(\s*'([^']*)'\s*,\s*'([^']*)'/gu)].map((match) => ({
    id: match[1]!.replaceAll(/[\r\n]/gu, ''),
    name: match[2]!.replaceAll(/[\r\n]/gu, ''),
  }));

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
type BridgeProvider = Parameters<typeof createFileSystemBridgePort>[0];
const checkedProject = (seed: Record<string, string>) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const files = new Map(Object.entries(seed).map(([path, text]) => [path, encoder.encode(text)]));
  const directories = new Set(['']);
  const ensureParents = (path: string): void => {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index++) {
      directories.add(parts.slice(0, index).join('/'));
    }
  };
  for (const path of files.keys()) {
    ensureParents(path);
  }
  const missing = (path: string) => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const readBytes = (path: string): Uint8Array<ArrayBuffer> => {
    const bytes = files.get(path);
    if (!bytes) {
      throw missing(path);
    }
    return new Uint8Array(bytes);
  };
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const bytes = readBytes(path);
    return encoding === 'utf8' ? decoder.decode(bytes) : bytes;
  }
  const writeFile = async (path: string, data: string | Uint8Array<ArrayBuffer>): Promise<void> => {
    ensureParents(path);
    files.set(path, typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data));
  };
  const stat: BridgeProvider['stat'] = async (path) => {
    if (directories.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: 0 };
    }
    return { type: 'file', size: readBytes(path).length, mtimeMs: 0, contentKind: 'binary' };
  };
  const provider: BridgeProvider = {
    id: 'replicad-publication-test',
    capabilities: { persistent: true, writable: true, quotaBased: false, durability: 'transactional-rewrite' },
    readFile,
    writeFile,
    async writeFileChecked(input) {
      for (const precondition of input.preconditions) {
        const actual = files.get(precondition.path) ?? null;
        const expected =
          typeof precondition.expected === 'string' ? encoder.encode(precondition.expected) : precondition.expected;
        if (
          actual === null
            ? expected !== null
            : expected === null ||
              actual.length !== expected.length ||
              actual.some((byte, index) => byte !== expected[index])
        ) {
          return { status: 'conflict', conflicts: [{ path: precondition.path, actual }] };
        }
      }
      await writeFile(input.path, input.data);
      return { status: 'applied', content: readBytes(input.path) };
    },
    async readdir(path: string) {
      if (!directories.has(path)) {
        throw missing(path);
      }
      const prefix = path === '' ? '' : `${path}/`;
      return [
        ...new Set(
          [...files.keys(), ...directories]
            .filter((entry) => entry.startsWith(prefix) && entry !== path)
            .map((entry) => entry.slice(prefix.length).split('/')[0]!),
        ),
      ];
    },
    stat,
    lstat: stat,
    async mkdir(path: string) {
      ensureParents(`${path}/child`);
    },
    async unlink(path: string) {
      files.delete(path);
    },
    async rmdir(path: string) {
      directories.delete(path);
    },
    async rename(from: string, to: string) {
      const bytes = readBytes(from);
      await writeFile(to, bytes);
      files.delete(from);
    },
    async exists(path: string) {
      return files.has(path) || directories.has(path);
    },
    dispose: () => undefined,
  };
  return {
    readBytes,
    fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(provider)),
    removeFile: (path: string) => {
      files.delete(path);
    },
    replaceFile: (path: string, bytes: Uint8Array<ArrayBuffer>) => {
      files.set(path, bytes);
    },
  };
};
const model = (density: number): string => `
  import { makeBox } from 'replicad';
  export default function main() {
    return { shapes: [{ shape: makeBox([0, 0, 0], [20, 20, 31.2]), density: ${density}, name: 'Part' }] };
  }
`;
const assembly = (parts: Record<string, { source: { path: string } }>) =>
  JSON.stringify({
    schemaVersion: 1,
    parts,
    occurrences: Object.keys(parts).map((part) => ({ id: part, part, transform: identity })),
  });
const physicalFromGlb = async (bytes: Uint8Array<ArrayBuffer>) => {
  const document = await registerTauGltfExtensions(new NodeIO()).readBinary(bytes);
  const topology = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload() as
    | TauCadTopologyPayload
    | undefined;
  if (!topology?.components[0]?.physical) {
    throw new Error('Published GLB omitted physical component facts.');
  }
  return topology.components[0].physical;
};

const clients: Array<Pick<RuntimeClient, 'shutdown'>> = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => client.shutdown()));
  vi.restoreAllMocks();
  const definition = await resolveRuntimePluginDefinition('kernel', replicadKernel({ wasm: deliveredWasm }));
  Object.defineProperty(definition, 'version', { value: '1.4.4', configurable: true });
});

describe('Replicad completed-part physical and exact publication', () => {
  it.each(['flat', 'nested'] as const)(
    'should restore a %s codec-v1 snapshot and deny its explicit pose without source creation',
    async (layout) => {
      // A Y-up quarter turn with a nonzero translation on every axis exposes an omitted basis conjugation.
      const transform = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.1, 0.2, 0.3, 1];
      const project = checkedProject({
        'part.ts': `
        import { makeBox } from 'replicad';
        export default function main() {
          return { shapes: [{ shape: makeBox([0, 0, 0], [20, 30, 40]), density: 1.55, name: 'Part' }] };
        }
      `,
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: { part: { source: { path: 'part.ts' } } },
          occurrences:
            layout === 'nested'
              ? [{ id: 'group', transform: identity, children: [{ id: 'rotated', part: 'part', transform }] }]
              : [{ id: 'rotated', part: 'part', transform }],
        }),
      });
      const currentKernel = replicadKernel({ wasm: deliveredWasm });
      const definition = await resolveRuntimePluginDefinition('kernel', currentKernel);
      const creates = vi.spyOn(definition, 'evaluate');
      const restores = vi.spyOn(definition, 'deserializeHandle');
      const compositions = vi.spyOn(definition, 'composeHandles');
      expect(definition.version).toBe('1.4.4');
      const serialize = definition.serializeHandle!;
      // Preserve real serialized BReps and the historical codec-v1 envelope, which had no stored component identity.
      const legacySerializer = vi.spyOn(definition, 'serializeHandle').mockImplementation((...args) => {
        const serialized = serialize(...args);
        if (!serialized) {
          return serialized;
        }
        const { componentIdentityVersion: _version, ...legacy } = serialized;
        return {
          ...legacy,
          shapes: legacy.shapes.map((entry) => {
            const { sourceComponentId: _id, ...metadata } = entry.metadata;
            return { ...entry, metadata };
          }),
        };
      });
      const observedKernel = defineKernel({
        ...definition,
        id: currentKernel.id,
        extensions: currentKernel.extensions,
      })({ wasm: deliveredWasm });
      const makeClient = () =>
        createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({ kernels: [observedKernel], bundlers: [esbuildBundler()] }),
            fileSystem: project.fileSystem,
            admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
              await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
            },
          }),
        });
      const producer = makeClient();
      clients.push(producer);
      const publication = await producer.publishAssembly({
        authoredPath: 'assembly.json',
        publicationPath: 'published.json',
      });
      expect(publication.status, publication.status === 'published' ? undefined : JSON.stringify(publication)).toBe(
        'published',
      );
      if (publication.status !== 'published') {
        throw new Error('Expected a pinned assembly root.');
      }
      expect(creates).toHaveBeenCalledOnce();
      expect(legacySerializer).toHaveBeenCalled();
      const record = publication.admitted.publication.parts['part']!;
      const { glb, exact } = record.variants['default']!;
      if (!exact) {
        throw new Error('Prior native registration omitted its exact snapshot.');
      }
      const providerIdentity = JSON.parse(exact.providerVersion) as {
        kernelVersion: string;
        producer: string;
        wasmVariant: string;
        assets: readonly unknown[];
      };
      expect(providerIdentity).toMatchObject({ kernelVersion: '1.4.1' });
      expect(exact.codecVersion).toBe('1');
      const glbBytes = await publication.admitted.readAsset(glb.digest);
      const coordinateEvidence = await readCoordinateEvidence({ bytes: glbBytes });
      const positions = coordinateEvidence.flatMap((primitive) => primitive.positions);
      const bounds = (points: ReadonlyArray<readonly number[]>) =>
        [0, 1, 2].map((axis) => [
          Math.min(...points.map((point) => point[axis]!)),
          Math.max(...points.map((point) => point[axis]!)),
        ]);
      expect(bounds(positions)).toEqual([
        [0, 0.02],
        [0, 0.04],
        [-0.03, 0],
      ]);
      const placedGlbBounds = bounds(positions.map(([x, y, z]) => [z + 0.1, y + 0.2, 0.3 - x]));
      for (const [axis, interval] of [
        [0.07, 0.1],
        [0.2, 0.24],
        [0.28, 0.3],
      ].entries()) {
        for (const [endpoint, value] of interval.entries()) {
          expect(placedGlbBounds[axis]![endpoint]).toBeCloseTo(value, 7);
        }
      }
      await producer.shutdown();
      legacySerializer.mockRestore();
      clients.splice(clients.indexOf(producer), 1);
      project.removeFile('part.ts');

      const before = { creates: creates.mock.calls.length, restores: restores.mock.calls.length };
      const consumer = makeClient();
      clients.push(consumer);
      const pinnedDocument = await consumer.openAssembly({ root: publication.root });
      const result = await pinnedDocument.exportPublished({
        format: 'step',
        publishedAssembly: { root: publication.root },
      });
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error(`Pinned STEP export failed: ${JSON.stringify(result.issues)}`);
      }
      expect(creates.mock.calls.length).toBe(before.creates);
      expect(restores.mock.calls.length).toBeGreaterThan(before.restores);
      expect(compositions).toHaveBeenCalledOnce();
      const expectedOccurrencePath = layout === 'nested' ? ['group', 'rotated'] : ['rotated'];
      expect(compositions.mock.calls[0]![0].occurrences.map(({ occurrencePath }) => occurrencePath)).toEqual([
        expectedOccurrencePath,
      ]);
      const composition = compositions.mock.results[0];
      if (composition?.type !== 'return') {
        throw new Error('Pinned composition did not return a native handle.');
      }
      const composed = await composition.value;
      expect(composed.shapes.map(({ publishedOccurrencePath }) => publishedOccurrencePath)).toEqual([
        expectedOccurrencePath,
      ]);
      const restoredBeforeOverlay = restores.mock.calls.length;
      const deniedOverlay = await pinnedDocument.exportPublished({
        format: 'step',
        publishedAssembly: { root: publication.root, placements: [] },
      });
      expect(deniedOverlay.success).toBe(false);
      expect(deniedOverlay.issues.some(({ message }) => /codec|identity|pose/u.test(message))).toBe(true);
      expect(restores.mock.calls.length).toBe(restoredBeforeOverlay);
      const step = new TextDecoder().decode(result.files[0].bytes);
      expect(step).toContain('rotated/Part');
      if (layout === 'nested') {
        const usages = [
          ...step
            .replaceAll(/\r?\n/g, '')
            .matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('[^']*','([^']*)','[^']*',\s*(#\d+)\s*,\s*(#\d+)\s*,[^)]*\)/g),
        ];
        expect(usages).toHaveLength(2);
        const parent = usages.find((usage) => usage[1] === 'group');
        const leaf = usages.find((usage) => usage[1] === 'group/rotated/Part');
        expect(parent).toBeDefined();
        expect(leaf).toBeDefined();
        expect(leaf?.[2]).toBe(parent?.[3]);
        expect(leaf?.[2]).not.toBe(parent?.[2]);
      }
      const { importSTEP: importStep, isShape3D } = await import('replicad');
      const imported = await importStep(new Blob([result.files[0].bytes], { type: 'application/step' }));
      expect(isShape3D(imported)).toBe(true);
      if (!isShape3D(imported)) {
        throw new Error('Pinned STEP did not re-import as native solid geometry.');
      }
      const expectedBounds = [
        [70, -300, 200],
        [100, -280, 240],
      ];
      for (const [corner, expected] of expectedBounds.entries()) {
        for (const [axis, value] of expected.entries()) {
          expect(imported.boundingBox.bounds[corner]![axis]).toBeCloseTo(value, 5);
        }
      }
      const nativeBounds = imported.boundingBox.bounds;
      const stepDisplayBounds = [
        [nativeBounds[0][0] / 1000, nativeBounds[1][0] / 1000],
        [nativeBounds[0][2] / 1000, nativeBounds[1][2] / 1000],
        [-nativeBounds[1][1] / 1000, -nativeBounds[0][1] / 1000],
      ];
      for (const [axis, interval] of placedGlbBounds.entries()) {
        for (const [endpoint, value] of interval.entries()) {
          expect(stepDisplayBounds[axis]![endpoint]).toBeCloseTo(value, 7);
        }
      }
      imported.delete();
      const restored = restores.mock.calls.length;
      for (const [name, incompatible] of [
        [
          'assets',
          { ...exact, providerVersion: JSON.stringify({ ...providerIdentity, assets: ['sha256:' + '0'.repeat(64)] }) },
        ],
        ['codec', { ...exact, codecVersion: 'incompatible' }],
      ] as const) {
        const bytes = new TextEncoder().encode(
          JSON.stringify({
            ...record,
            variants: { default: { ...record.variants['default'], exact: incompatible } },
          }),
        );
        const path = `incompatible-${name}.json`;
        project.replaceFile(path, bytes);
        // oxlint-disable-next-line no-await-in-loop -- Qualify incompatible descriptors independently against the same checked native bytes.
        const digest = await digestContent({ bytes });
        // oxlint-disable-next-line no-await-in-loop -- Qualify incompatible descriptors independently against the same checked native bytes.
        await expect(
          pinnedDocument.exportPublished({ format: 'step', publishedPart: { reference: { path, digest } } }),
        ).rejects.toThrow("Published export must use this document's admitted root.");
        expect(restores.mock.calls.length).toBe(restored);
        expect(creates.mock.calls.length).toBe(before.creates);
        // oxlint-disable-next-line no-await-in-loop -- Read each incompatible part through its current client authority, outside the assembly facade.
        const refused = await consumer.exportPublished({
          format: 'step',
          publishedPart: { reference: { path, digest } },
        });
        expect(refused.success).toBe(false);
        expect(refused.issues.some((issue) => /provider|codec|compatible|snapshot/u.test(issue.message))).toBe(true);
        expect(restores.mock.calls.length).toBe(restored);
        expect(creates.mock.calls.length).toBe(before.creates);
      }
    },
    120_000,
  );

  it.each([
    'unit',
    'linearToleranceMm',
    'angularToleranceRad',
    'payload-marker',
    'missing-shapes',
    'nonarray-shapes',
    'null-entry',
  ] as const)(
    'qualified-native-descriptor-boundaries deny %s before restoring or evaluating source',
    async (boundary) => {
      const project = checkedProject({
        'part.ts': model(1.55),
        'assembly.json': JSON.stringify({
          schemaVersion: 1,
          parts: { part: { source: { path: 'part.ts' } } },
          occurrences: [{ id: 'part', part: 'part', transform: identity }],
        }),
      });
      const kernel = replicadKernel({ wasm: deliveredWasm });
      const definition = await resolveRuntimePluginDefinition('kernel', kernel);
      const creates = vi.spyOn(definition, 'evaluate');
      const restores = vi.spyOn(definition, 'deserializeHandle');
      const observedKernel = defineKernel({ ...definition, id: kernel.id, extensions: kernel.extensions })({
        wasm: deliveredWasm,
      });
      const makeClient = () =>
        createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({ kernels: [observedKernel], bundlers: [esbuildBundler()] }),
            fileSystem: project.fileSystem,
            admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
              await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
            },
          }),
        });
      const producer = makeClient();
      clients.push(producer);
      const publication = await producer.publishAssembly({
        authoredPath: 'assembly.json',
        publicationPath: 'published.json',
      });
      expect(publication.status).toBe('published');
      if (publication.status !== 'published') {
        throw new Error('Expected a qualified native publication.');
      }
      const record = publication.admitted.publication.parts['part']!;
      const variant = record.variants['default']!;
      const { exact } = variant;
      if (!exact) {
        throw new Error('Expected a qualified exact snapshot.');
      }
      expect(exact).toMatchObject({
        codecVersion: '2',
        unit: 'millimeter',
        linearToleranceMm: 0,
        angularToleranceRad: 0,
      });
      const rootBytes = project.readBytes(publication.root.path);
      const glbBytes = await publication.admitted.readAsset(variant.glb.digest);
      const nativeBytes = await publication.admitted.readAsset(exact.asset.digest);
      await producer.shutdown();
      clients.splice(clients.indexOf(producer), 1);
      project.removeFile('part.ts');
      const before = { creates: creates.mock.calls.length, restores: restores.mock.calls.length };
      let incompatible = { ...exact };
      const structural = boundary === 'missing-shapes' || boundary === 'nonarray-shapes' || boundary === 'null-entry';
      if (boundary === 'payload-marker' || structural) {
        const snapshot: unknown = decode(nativeBytes);
        if (typeof snapshot !== 'object' || snapshot === null || !Reflect.has(snapshot, 'componentIdentityVersion')) {
          throw new Error('Expected the actual bound native payload marker.');
        }
        expect(Reflect.get(snapshot, 'componentIdentityVersion')).toBe(1);
        switch (boundary) {
          case 'missing-shapes': {
            Reflect.deleteProperty(snapshot, 'shapes');
            break;
          }
          case 'nonarray-shapes': {
            Reflect.set(snapshot, 'shapes', {});
            break;
          }
          case 'null-entry': {
            const shapes: unknown = Reflect.get(snapshot, 'shapes');
            if (!Array.isArray(shapes) || shapes.length === 0) {
              throw new Error('Expected actual native shape entries.');
            }
            expect(shapes).toHaveLength(1);
            Reflect.set(snapshot, 'shapes', [null]);
            break;
          }
          default: {
            Reflect.set(snapshot, 'componentIdentityVersion', 2);
          }
        }
        const bytes = new Uint8Array(encode(snapshot));
        const digest = await digestContent({ bytes });
        const path = 'boundary-native.msgpack';
        project.replaceFile(path, bytes);
        incompatible = { ...exact, asset: { path, digest, byteLength: bytes.byteLength } };
      } else if (boundary === 'unit') {
        incompatible = { ...exact, unit: 'meter' };
      } else {
        incompatible = { ...exact, [boundary]: 0.001 };
      }
      const bytes = new TextEncoder().encode(
        JSON.stringify({ ...record, variants: { default: { ...variant, exact: incompatible } } }),
      );
      const digest = await digestContent({ bytes });
      const path = `boundary-${boundary}.json`;
      project.replaceFile(path, bytes);
      const consumer = makeClient();
      clients.push(consumer);
      const refused = await consumer.exportPublished({
        format: 'step',
        publishedPart: { reference: { path, digest } },
      });
      expect(refused.success).toBe(false);
      expect(
        refused.issues.some(({ code }) => code === (structural ? 'INVALID_REFERENCE' : 'REPRESENTATION_UNSUPPORTED')),
      ).toBe(true);
      expect(creates.mock.calls.length).toBe(before.creates);
      expect(restores.mock.calls.length).toBe(before.restores);
      expect(project.readBytes(publication.root.path)).toEqual(rootBytes);
      expect(project.readBytes(variant.glb.path)).toEqual(glbBytes);
      expect(project.readBytes(exact.asset.path)).toEqual(nativeBytes);
    },
    120_000,
  );

  it('should export two poses and repeat each on one pin without rebaking intrinsic placement or solving source', async () => {
    const project = checkedProject({
      'part.ts': `import { makeBox } from 'replicad'; export default function main() {
        return { shapes: [{ shape: makeBox([10, 0, 0], [12, 3, 4]), name: 'Body' }] };
      }`,
      'assembly.json': JSON.stringify({
        schemaVersion: 1,
        parts: { part: { source: { path: 'part.ts' } } },
        occurrences: [{ id: 'part', part: 'part', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.03, 0, 0, 1] }],
      }),
    });
    const kernel = replicadKernel({ wasm: deliveredWasm });
    const definition = await resolveRuntimePluginDefinition('kernel', kernel);
    const creates = vi.spyOn(definition, 'evaluate');
    const observedKernel = defineKernel({ ...definition, id: kernel.id, extensions: kernel.extensions })({
      wasm: deliveredWasm,
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({ kernels: [observedKernel], bundlers: [esbuildBundler()] }),
        fileSystem: project.fileSystem,
        admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        },
      }),
    });
    clients.push(client);
    const publication = await client.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published.json',
    });
    expect(publication.status).toBe('published');
    if (publication.status !== 'published') {
      throw new Error('Expected a bound publication.');
    }
    expect(creates).toHaveBeenCalledOnce();
    const exact = publication.admitted.publication.parts['part']!.variants['default']!.exact!;
    expect(exact.codecVersion).toBe('2');
    expect(JSON.parse(exact.providerVersion)).toMatchObject({ kernelVersion: '1.4.2' });
    const metadata = await validateAdmittedAssemblyGlb({
      parts: publication.admitted.publication.parts,
      occurrences: publication.admitted.publication.occurrences,
      readAsset: async (_part, asset) => publication.admitted.readAsset(asset.digest),
    });
    const componentId = metadata.components.find(({ sourceComponentId }) => sourceComponentId === 'component:body')!
      .component.id;
    project.removeFile('part.ts');
    const createsBeforeExport = creates.mock.calls.length;
    const pose = (x: number) => [
      { componentId, worldTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1] as const },
    ];
    const first = await client.exportPublished({
      format: 'step',
      publishedAssembly: { root: publication.root, placements: pose(0.032) },
    });
    const second = await client.exportPublished({
      format: 'step',
      publishedAssembly: { root: publication.root, placements: pose(0.052) },
    });
    const repeated = await client.exportPublished({
      format: 'step',
      publishedAssembly: { root: publication.root, placements: pose(0.032) },
    });
    const repeatedSecond = await client.exportPublished({
      format: 'step',
      publishedAssembly: { root: publication.root, placements: pose(0.052) },
    });
    const asBuilt = await client.exportPublished({ format: 'step', publishedAssembly: { root: publication.root } });
    const { importSTEP: importStep, isShape3D } = await import('replicad');
    for (const [result, x, name] of [
      [first, 42, componentId],
      [second, 62, componentId],
      [repeated, 42, componentId],
      [repeatedSecond, 62, componentId],
      [asBuilt, 40, 'part/Body'],
    ] as const) {
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error(JSON.stringify(result.issues));
      }
      expect(stepProductIdentities(result.files[0].bytes)).toContainEqual({ id: name, name });
      // oxlint-disable-next-line no-await-in-loop -- Independently re-import each pose result before releasing its native allocation.
      const shape = await importStep(new Blob([result.files[0].bytes], { type: 'application/step' }));
      if (!isShape3D(shape)) {
        throw new Error('Expected a native solid result.');
      }
      expect(shape.boundingBox.bounds[0][0]).toBeCloseTo(x, 5);
      expect(shape.boundingBox.bounds[1][0]).toBeCloseTo(x + 2, 5);
      shape.delete();
    }
    expect(creates.mock.calls.length).toBe(createsBeforeExport);
    if (!first.success || !second.success) {
      throw new Error('Expected both distinct pose exports to succeed before comparing their bytes.');
    }
    expect(first.files[0].bytes).not.toEqual(second.files[0].bytes);
  }, 120_000);

  it('pins qualified BRep envelopes across a moved source and a density-only change', async () => {
    const project = checkedProject({
      'first.ts': model(1.55),
      'moved.ts': model(1.55),
      'density.ts': model(2.7),
      'assembly.json': assembly({
        first: { source: { path: 'first.ts' } },
        moved: { source: { path: 'moved.ts' } },
        density: { source: { path: 'density.ts' } },
      }),
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({ kernels: [replicadKernel({ wasm: deliveredWasm })], bundlers: [esbuildBundler()] }),
        fileSystem: project.fileSystem,
        admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        },
      }),
    });
    clients.push(client);
    const result = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'published.json' });
    expect(result.status).toBe('published');
    if (result.status !== 'published') {
      throw new Error('Expected an admitted assembly.');
    }
    const first = result.admitted.publication.parts['first']!.variants['default']!;
    const moved = result.admitted.publication.parts['moved']!.variants['default']!;
    const changedDensity = result.admitted.publication.parts['density']!.variants['default']!;
    expect(first.source.entry).toBe('first.ts');
    expect(moved.source.entry).toBe('moved.ts');
    expect(first.source.files).not.toEqual(moved.source.files);
    const firstExact = first.exact!;
    const movedExact = moved.exact!;
    const densityExact = changedDensity.exact!;
    expect(firstExact).toMatchObject({
      provider: '@taucad/replicad',
      codec: 'replicad.native-handle-msgpack',
      codecVersion: '2',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    });
    const assets = await deliveredAssets();
    expect(assets).toEqual([
      'sha256:9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9',
      'sha256:cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27',
    ]);
    expect(JSON.parse(firstExact.providerVersion)).toMatchObject({
      kernelVersion: '1.4.2',
      wasmVariant: 'custom',
      assets,
    });
    expect(firstExact.providerVersion).toBe(movedExact.providerVersion);
    expect(firstExact.providerVersion).toBe(densityExact.providerVersion);
    expect(firstExact.asset.digest).toBe(movedExact.asset.digest);
    expect(firstExact.asset.digest).not.toBe(densityExact.asset.digest);
    const firstSnapshot = decode(await result.admitted.readAsset(firstExact.asset.digest)) as {
      shapes: Array<{ kind: string; brep: string; metadata: { density: number } }>;
    };
    const movedSnapshot = decode(await result.admitted.readAsset(movedExact.asset.digest)) as typeof firstSnapshot;
    const densitySnapshot = decode(await result.admitted.readAsset(densityExact.asset.digest)) as typeof firstSnapshot;
    expect(firstSnapshot.shapes[0]).toMatchObject({ kind: 'brep', metadata: { density: 1.55 } });
    expect(firstSnapshot.shapes[0]!.brep).toBe(movedSnapshot.shapes[0]!.brep);
    expect(firstSnapshot).toEqual(movedSnapshot);
    expect(firstSnapshot.shapes[0]!.brep).toBe(densitySnapshot.shapes[0]!.brep);
    expect(densitySnapshot.shapes[0]!.metadata.density).toBe(2.7);
    const firstPhysical = await physicalFromGlb(await result.admitted.readAsset(first.glb.digest));
    const movedPhysical = await physicalFromGlb(await result.admitted.readAsset(moved.glb.digest));
    const densityPhysical = await physicalFromGlb(await result.admitted.readAsset(changedDensity.glb.digest));
    expect(firstPhysical.volume).toMatchObject({ state: 'measured', valueMm3: 12_480 });
    expect(movedPhysical.volume).toMatchObject({ state: 'measured', valueMm3: 12_480 });
    expect(densityPhysical.volume).toMatchObject({ state: 'measured', valueMm3: 12_480 });
    expect(firstPhysical.density?.valueGPerCm3).toBe(1.55);
    expect(movedPhysical.density?.valueGPerCm3).toBe(1.55);
    expect(densityPhysical.density?.valueGPerCm3).toBe(2.7);
    await expect(result.admitted.readAsset(contentDigest({ value: `sha256:${'0'.repeat(64)}` }))).rejects.toThrow(
      /outside|digest/u,
    );
    project.replaceFile(firstExact.asset.path, new Uint8Array([1, 2, 3]));
    const corruptExport = await client.exportPublished({ format: 'step', publishedAssembly: { root: result.root } });
    expect(corruptExport.success).toBe(false);
    expect(corruptExport.issues.some((issue) => /digest|asset|content/u.test(issue.message))).toBe(true);
  }, 120_000);

  it('retains installed-default ordinary source STEP without claiming the repaired app physical descriptor', async () => {
    const project = checkedProject({
      'part.ts':
        "import { makeBox } from 'replicad'; export default function main() { return makeBox([0,0,0],[20,30,40]); }",
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
        fileSystem: project.fileSystem,
      }),
    });
    clients.push(client);
    const document = client.open({ source: { path: 'part.ts' } });
    const renderedOutcome = await document.view('model').rendering();
    expect(renderedOutcome.superseded).toBe(false);
    if (renderedOutcome.superseded) {
      throw new Error('Unexpected superseded rendering.');
    }
    const rendered = renderedOutcome.rendering;
    expect(rendered.success).toBe(true);
    const exported = await document.export('step');
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error(JSON.stringify(exported.issues));
    }
    const { importSTEP: importStep, isShape3D } = await import('replicad');
    const shape = await importStep(new Blob([exported.files[0].bytes], { type: 'application/step' }));
    if (!isShape3D(shape)) {
      throw new Error('Expected installed-default ordinary STEP to restore a native solid.');
    }
    try {
      // OCCT Bnd_Box includes its 1e-7 mm confusion gap; use the existing native bounds precision.
      for (const [corner, expected] of [
        [0, 0, 0],
        [20, 30, 40],
      ].entries()) {
        for (const [axis, value] of expected.entries()) {
          expect(shape.boundingBox.bounds[corner]![axis]).toBeCloseTo(value, 5);
        }
      }
    } finally {
      shape.delete();
    }
  }, 120_000);

  it('should retain an installed-default source-free pin with native millimeter bounds and measured physical facts', async () => {
    const project = checkedProject({
      'part.ts': `
        import { makeBox } from 'replicad';
        export default function main() {
          return { shapes: [{ shape: makeBox([0, 0, 0], [20, 30, 40]), density: 1.55, name: 'Part' }] };
        }
      `,
      'assembly.json': assembly({ part: { source: { path: 'part.ts' } } }),
    });
    // Omission is the installed builtin asset-derived default; explicit off is a separate control below.
    const kernel = replicadKernel({ wasm: 'single' });
    const definition = await resolveRuntimePluginDefinition('kernel', kernel);
    const creates = vi.spyOn(definition, 'evaluate');
    const restores = vi.spyOn(definition, 'deserializeHandle');
    const makeClient = () =>
      createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({
            kernels: [
              defineKernel({ ...definition, id: kernel.id, extensions: kernel.extensions })({ wasm: 'single' }),
            ],
            bundlers: [esbuildBundler()],
          }),
          fileSystem: project.fileSystem,
          admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
            await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
          },
        }),
      });
    const producer = makeClient();
    clients.push(producer);
    const publication = await producer.publishAssembly({
      authoredPath: 'assembly.json',
      publicationPath: 'published.json',
    });
    expect(publication.status).toBe('published');
    if (publication.status !== 'published') {
      throw new Error('Expected an installed-default native publication.');
    }
    expect(creates).toHaveBeenCalledOnce();
    const variant = publication.admitted.publication.parts['part']!.variants['default']!;
    const { exact } = variant;
    expect(exact).toBeDefined();
    if (!exact) {
      throw new Error('Installed-default publication omitted its native snapshot.');
    }
    expect(exact).toMatchObject({
      provider: '@taucad/replicad',
      codec: 'replicad.native-handle-msgpack',
      codecVersion: '2',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    });
    const builtinDigest = await digestContent({
      bytes: new Uint8Array(await readFile(new URL(import.meta.resolve('replicad-opencascadejs/wasm')))),
    });
    expect(JSON.parse(exact.providerVersion)).toMatchObject({
      kernelVersion: '1.4.2',
      wasmVariant: 'single',
      assets: [builtinDigest],
    });
    const glbBytes = await publication.admitted.readAsset(variant.glb.digest);
    const exactBytes = await publication.admitted.readAsset(exact.asset.digest);
    expect(await digestContent({ bytes: exactBytes })).toBe(exact.asset.digest);
    const physical = await physicalFromGlb(glbBytes);
    expect(physical.volume).toMatchObject({
      state: 'measured',
      valueMm3: 24_000,
      method: 'occt-solid-volume',
      validity: 'closed-solid',
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Assert the published physical schema's exact valueGPerCm3 unit field.
    expect(physical.density).toEqual({ valueGPerCm3: 1.55, provenance: 'authored-shape-config' });
    const root = { ...publication.root };
    const assets = [root, publication.partRecords['part']!, variant.glb, exact.asset];
    const snapshots = await Promise.all(
      assets.map(async (asset) => {
        const bytes = project.readBytes(asset.path);
        if ('byteLength' in asset) {
          expect(bytes.byteLength).toBe(asset.byteLength);
        }
        expect(await digestContent({ bytes })).toBe(asset.digest);
        return { asset, bytes };
      }),
    );
    await producer.shutdown();
    clients.splice(clients.indexOf(producer), 1);
    project.removeFile('part.ts');
    project.removeFile('assembly.json');
    expect(() => project.readBytes('part.ts')).toThrow(/ENOENT/u);
    expect(() => project.readBytes('assembly.json')).toThrow(/ENOENT/u);
    creates.mockClear();
    restores.mockClear();

    const consumer = makeClient();
    clients.push(consumer);
    const document = await consumer.openAssembly({ root });
    expect(await document.admitted.readAsset(variant.glb.digest)).toEqual(glbBytes);
    expect(await document.admitted.readAsset(exact.asset.digest)).toEqual(exactBytes);
    const exported = await document.exportPublished({ format: 'step', publishedAssembly: { root } });
    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error('Installed-default source-free STEP export failed.');
    }
    expect(creates).not.toHaveBeenCalled();
    expect(restores).toHaveBeenCalled();
    const { importSTEP: importStep, isShape3D, measureVolume } = await import('replicad');
    const shape = await importStep(new Blob([exported.files[0].bytes], { type: 'application/step' }));
    if (!isShape3D(shape)) {
      throw new Error('Expected source-free installed-default STEP to restore native solid geometry.');
    }
    try {
      // Native OCCT bounds, independently of GLB display metres, include the existing confusion gap.
      for (const [corner, expected] of [
        [0, 0, 0],
        [20, 30, 40],
      ].entries()) {
        for (const [axis, value] of expected.entries()) {
          expect(shape.boundingBox.bounds[corner]![axis]).toBeCloseTo(value, 5);
        }
      }
      expect(measureVolume(shape)).toBeCloseTo(24_000, 5);
    } finally {
      shape.delete();
    }
    expect(creates).not.toHaveBeenCalled();
    expect(publication.root).toEqual(root);
    for (const { asset, bytes } of snapshots) {
      expect(project.readBytes(asset.path)).toEqual(bytes);
    }
  }, 120_000);

  it('leaves the installed-default library render display-only when its implementation assets are not identified', async () => {
    const project = checkedProject({
      'part.ts': model(1.55),
      'assembly.json': assembly({ part: { source: { path: 'part.ts' } } }),
    });
    const kernel = replicadKernel({ wasm: 'single', computeReuse: false });
    const definition = await resolveRuntimePluginDefinition('kernel', kernel);
    const creates = vi.spyOn(definition, 'evaluate');
    const restores = vi.spyOn(definition, 'deserializeHandle');
    const observedKernel = defineKernel({ ...definition, id: kernel.id, extensions: kernel.extensions })({
      wasm: 'single',
      computeReuse: false,
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({
          kernels: [observedKernel],
          bundlers: [esbuildBundler()],
        }),
        fileSystem: project.fileSystem,
        admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        },
      }),
    });
    clients.push(client);
    const result = await client.publishAssembly({ authoredPath: 'assembly.json', publicationPath: 'published.json' });
    expect(result.status).toBe('published');
    if (result.status !== 'published') {
      throw new Error('Expected an admitted display-only assembly.');
    }
    const variant = result.admitted.publication.parts['part']!.variants['default']!;
    expect(variant.exact).toBeUndefined();
    const glbBytes = await result.admitted.readAsset(variant.glb.digest);
    const physical = await physicalFromGlb(glbBytes);
    expect(physical.density?.valueGPerCm3).toBe(1.55);
    expect(await digestContent({ bytes: glbBytes })).toBe(variant.glb.digest);
    const root = { ...result.root };
    const rootBytes = project.readBytes(root.path);
    expect(await digestContent({ bytes: rootBytes })).toBe(root.digest);
    const before = { creates: creates.mock.calls.length, restores: restores.mock.calls.length };
    project.removeFile('part.ts');
    expect(() => project.readBytes('part.ts')).toThrow(/ENOENT/u);
    const denied = await client.exportPublished({ format: 'step', publishedAssembly: { root } });
    expect(denied.success).toBe(false);
    expect(denied.issues).toContainEqual(
      expect.objectContaining({
        code: 'REPRESENTATION_UNSUPPORTED',
        message: 'Assembly occurrence part has no qualified exact native snapshot for step.',
      }),
    );
    expect(creates.mock.calls.length).toBe(before.creates);
    expect(restores.mock.calls.length).toBe(before.restores);
    expect(result.root).toEqual(root);
    expect(project.readBytes(root.path)).toEqual(rootBytes);
    expect(await result.admitted.readAsset(variant.glb.digest)).toEqual(glbBytes);
  }, 120_000);
});

// This explicit product gate consumes captured browser/Electron downloads, never a substitute producer.
it.skipIf(process.env['TAU_E2E_PRODUCT_PHYSICAL'] !== 'true')(
  process.env['TAU_E2E_PACKAGED_PHYSICAL_STEP'] === undefined
    ? 'should independently read the actual browser and Electron physical STEP downloads in millimeters without source solves'
    : 'should independently read the actual packaged Electron physical STEP download in millimeters without source solves',
  async () => {
    const requiredPath = (name: string): string => {
      const path = process.env[name];
      if (!path?.startsWith('/')) {
        throw new Error(`Explicit product gate requires absolute ${name}; no replacement artifact is permitted.`);
      }
      return path;
    };
    const closurePath = requiredPath('TAU_E2E_BROWSER_PHYSICAL_CLOSURE');
    const packagedOnly = process.env['TAU_E2E_PACKAGED_PHYSICAL_STEP'] !== undefined;
    const stepPaths = packagedOnly
      ? ([['electron-packaged-product', requiredPath('TAU_E2E_PACKAGED_PHYSICAL_STEP')]] as const)
      : ([
          ['browser', requiredPath('TAU_E2E_BROWSER_PHYSICAL_STEP_BASE64')],
          ['electron-writable-product', requiredPath('TAU_E2E_ELECTRON_PHYSICAL_STEP')],
          ['electron-missing-publication-writer', requiredPath('TAU_E2E_ELECTRON_MISSING_WRITER_PHYSICAL_STEP')],
        ] as const);
    // A private input decoder only. The actual runtime below admits the durable records and their complete assets.
    const closure = z
      .object({
        root: z.object({ path: z.string(), digest: z.string(), byteLength: z.number().int().nonnegative() }),
        files: z.array(
          z.object({
            path: z.string(),
            digest: z.string(),
            byteLength: z.number().int().nonnegative(),
            base64: z.string(),
          }),
        ),
        servedAssets: z.array(
          z.object({ name: z.string(), digest: z.string(), byteLength: z.number().int().nonnegative() }),
        ),
        sourceFree: z.object({ removed: z.array(z.string()) }),
      })
      .parse(JSON.parse(await readFile(closurePath, 'utf8')));
    expect(closure.sourceFree.removed).toEqual(['public/models/physical-inspection.js', 'physical/assembly.json']);
    const parent = closure.root.path.slice(0, closure.root.path.lastIndexOf('/') + 1);
    expect(parent).toMatch(/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u);
    const project = checkedProject({});
    const seen = new Set<string>();
    for (const file of closure.files) {
      expect(file.path.startsWith(parent)).toBe(true);
      expect(seen.has(file.path)).toBe(false);
      seen.add(file.path);
      const bytes = new Uint8Array(Buffer.from(file.base64, 'base64'));
      expect(bytes.byteLength).toBe(file.byteLength);
      // oxlint-disable-next-line no-await-in-loop -- Preflight each transported file before any native consumer operation.
      expect(await digestContent({ bytes })).toBe(file.digest);
      project.replaceFile(file.path, bytes);
    }
    expect(seen.has(closure.root.path)).toBe(true);
    expect(closure.servedAssets.map(({ name }) => name)).toEqual(['replicad_single.wasm', 'replicad_single.mjs']);
    const assets = await deliveredAssets();
    expect(closure.servedAssets.map(({ digest }) => digest)).toEqual(assets);
    for (const [index, url] of [deliveredWasm.wasmUrl, deliveredWasm.wasmBindingsUrl].entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Ordered implementation asset lengths qualify the actual captured product descriptor.
      const bytes = await readFile(new URL(url));
      expect(bytes.byteLength).toBe(closure.servedAssets[index]!.byteLength);
    }
    const kernel = replicadKernel({ wasm: deliveredWasm });
    const definition = await resolveRuntimePluginDefinition('kernel', kernel);
    const creates = vi.spyOn(definition, 'evaluate');
    const observedKernel = defineKernel({ ...definition, id: kernel.id, extensions: kernel.extensions })({
      wasm: deliveredWasm,
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({ kernels: [observedKernel], bundlers: [esbuildBundler()] }),
        fileSystem: project.fileSystem,
        admitAssemblyDisplay: async ({ records, occurrences, readAsset }) => {
          await validateAdmittedAssemblyGlb({ parts: records, occurrences, readAsset });
        },
      }),
    });
    clients.push(client);
    const root = { ...closure.root, digest: contentDigest({ value: closure.root.digest }) };
    const admitted = await client.openAssembly({ root });
    const exact = admitted.admitted.publication.parts['inspection']?.variants['default']?.exact;
    expect(exact?.unit).toBe('millimeter');
    if (!exact) {
      throw new Error('Actual browser physical pin omitted native evidence.');
    }
    expect(JSON.parse(exact.providerVersion)).toMatchObject({ kernelVersion: '1.4.2', wasmVariant: 'custom', assets });
    // Restoring this real pin initializes the same delivered native owner; it does not supply the reader oracle bytes.
    const initialized = await client.exportPublished({ format: 'step', publishedAssembly: { root } });
    expect(initialized.success).toBe(true);
    if (!initialized.success) {
      throw new Error(JSON.stringify(initialized.issues));
    }
    const stepInputs = await Promise.all(
      stepPaths.map(
        async ([host, path]) =>
          [
            host,
            new Uint8Array(
              host === 'browser' ? Buffer.from(await readFile(path, 'utf8'), 'base64') : await readFile(path),
            ),
          ] as const,
      ),
    );
    const { importSTEP: importStep, iterTopo, cast, isShape3D, measureVolume } = await import('replicad');
    const measured: Array<{
      host: string;
      digest: string;
      byteLength: number;
      solids: Array<{ volumeMm3: number; boundsMm: number[][] }>;
      boundsMm: number[][];
      density: {
        value: number;
        massExponent: number;
        lengthExponent: number;
        massUnit: string;
        lengthUnit: string;
        product: { id: string; name: string };
        references: string[];
      };
    }> = [];
    for (const [host, bytes] of stepInputs) {
      // OCCT converts the STEP unit into its native millimeter reader frame; the independent dimensions catch a wrong scale.
      const stepText = new TextDecoder().decode(bytes);
      expect(stepText).toMatch(/SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/u);
      // Resolve the actual interchange density graph independently of producer metadata and native volume.
      const entities = new Map(
        [...stepText.matchAll(/#(\d+)\s*=\s*([^;]+);/gu)].map((match) => [match[1]!, match[2]!]),
      );
      const measures = [...entities.entries()].filter(([, body]) =>
        /MEASURE_REPRESENTATION_ITEM\(\s*'g\/cm3'/u.test(body),
      );
      expect(measures).toHaveLength(1);
      const [measureId, measureBody] = measures[0]!;
      const measure = /POSITIVE_RATIO_MEASURE\(([^)]+)\),\s*#(\d+)\)/u.exec(measureBody);
      if (!measure) {
        throw new Error(`${host} STEP density has no independently resolvable measure/unit reference.`);
      }
      // Follow the density's actual property owner; a disconnected measure or density on another part must fail.
      const representations = [...entities.entries()].filter(
        ([, body]) => /^REPRESENTATION\(\s*'density'\s*,\s*\(\s*#(\d+)\s*\)/u.exec(body)?.[1] === measureId,
      );
      expect(representations).toHaveLength(1);
      const [representationId] = representations[0]!;
      const propertyRepresentations = [...entities.entries()].filter(
        ([, body]) =>
          /^PROPERTY_DEFINITION_REPRESENTATION\(\s*#\d+\s*,\s*#(\d+)\s*\)/u.exec(body)?.[1] === representationId,
      );
      expect(propertyRepresentations).toHaveLength(1);
      const [propertyRepresentationId, propertyRepresentationBody] = propertyRepresentations[0]!;
      const propertyId = /^PROPERTY_DEFINITION_REPRESENTATION\(\s*#(\d+)/u.exec(propertyRepresentationBody)?.[1];
      const productDefinitionId =
        /^PROPERTY_DEFINITION\(\s*'material property'\s*,\s*'density'\s*,\s*#(\d+)\s*\)/u.exec(
          entities.get(propertyId ?? '') ?? '',
        )?.[1];
      const formationId = /^PRODUCT_DEFINITION\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*#(\d+)\s*,/u.exec(
        entities.get(productDefinitionId ?? '') ?? '',
      )?.[1];
      const productId = /^PRODUCT_DEFINITION_FORMATION\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*#(\d+)\s*\)/u.exec(
        entities.get(formationId ?? '') ?? '',
      )?.[1];
      if (!propertyId || !productDefinitionId || !formationId || !productId) {
        throw new Error(`${host} STEP density property has no complete PRODUCT ownership chain.`);
      }
      const products = stepProductIdentities(new TextEncoder().encode(entities.get(productId) ?? ''));
      expect(products).toEqual([{ id: 'inspection/Known%20housing', name: 'inspection/Known%20housing' }]);
      const product = products[0]!;
      const references = [
        measureId,
        representationId,
        propertyRepresentationId,
        propertyId,
        productDefinitionId,
        formationId,
        productId,
      ];
      const densityValue = Number(measure[1]);
      expect(densityValue).toBe(1.55);
      const derivedUnit = entities.get(measure[2]!) ?? '';
      expect(derivedUnit).toMatch(/^DERIVED_UNIT\(/u);
      const elementIds = [...derivedUnit.matchAll(/#(\d+)/gu)].map((match) => match[1]!);
      expect(elementIds).toHaveLength(2);
      const elements = elementIds.map((id) => {
        const element = /DERIVED_UNIT_ELEMENT\(\s*#(\d+),\s*(-?\d+(?:\.\d*)?)\s*\)/u.exec(entities.get(id) ?? '');
        if (!element) {
          throw new Error(`${host} STEP density derived element is unresolved.`);
        }
        return { exponent: Number(element[2]), base: entities.get(element[1]!) ?? '' };
      });
      const mass = elements.find(({ base }) => base.includes('MASS_UNIT()'));
      const length = elements.find(({ base }) => base.includes('LENGTH_UNIT()'));
      if (!mass || !length) {
        throw new Error(`${host} STEP density does not resolve mass and length base units.`);
      }
      expect(mass.exponent).toBe(1);
      expect(length.exponent).toBe(-3);
      expect(mass.base).toMatch(/SI_UNIT\(\s*\$\s*,\s*\.GRAM\.\s*\)/u);
      expect(length.base).toMatch(/SI_UNIT\(\s*\.CENTI\.\s*,\s*\.METRE\.\s*\)/u);
      const density = {
        value: densityValue,
        massExponent: mass.exponent,
        lengthExponent: length.exponent,
        massUnit: 'gram',
        lengthUnit: 'centimetre',
        product,
        references,
      };
      // oxlint-disable-next-line no-await-in-loop -- Read the selected actual product files serially and release all native allocations.
      const imported = await importStep(new Blob([bytes], { type: 'application/step' }));
      const nativeSolids: Array<Parameters<typeof cast>[0]> = [];
      try {
        for (const native of iterTopo(imported.wrapped, 'solid')) {
          nativeSolids.push(native);
        }
        const solids = nativeSolids
          .map((native) => {
            const solid = cast(native);
            let measurement: { volumeMm3: number; boundsMm: number[][] };
            try {
              if (!isShape3D(solid)) {
                throw new Error(`${host} STEP reader returned a non-solid SOLID entry.`);
              }
              const box = solid.boundingBox;
              try {
                measurement = { volumeMm3: measureVolume(solid), boundsMm: box.bounds.map((point) => [...point]) };
              } finally {
                box.delete();
              }
            } finally {
              solid.delete();
            }
            return measurement;
          })
          .sort((left, right) => left.volumeMm3 - right.volumeMm3);
        expect(solids).toHaveLength(2);
        // Numeric fixture sets qualify geometry only; no component identity is inferred from volume or traversal order.
        for (const [index, expected] of [
          {
            volumeMm3: 480,
            boundsMm: [
              [35, -4, 0],
              [45, 4, 6],
            ],
          },
          {
            volumeMm3: 12_480,
            boundsMm: [
              [-13, -10, 0],
              [13, 10, 24],
            ],
          },
        ].entries()) {
          expect(solids[index]!.volumeMm3).toBeCloseTo(expected.volumeMm3, 5);
          for (const [corner, point] of expected.boundsMm.entries()) {
            for (const [axis, value] of point.entries()) {
              // Existing 1e-5 mm native bound precision includes OCCT's 1e-7 mm Bnd_Box gap.
              expect(Math.abs(solids[index]!.boundsMm[corner]![axis]! - value)).toBeLessThanOrEqual(1e-5);
            }
          }
        }
        expect((solids[1]!.volumeMm3 / 1000) * density.value).toBeCloseTo(19.344, 6);
        const box = imported.boundingBox;
        try {
          const boundsMm = box.bounds.map((point) => [...point]);
          for (const [corner, point] of [
            [-13, -10, 0],
            [45, 44, 24],
          ].entries()) {
            for (const [axis, value] of point.entries()) {
              expect(Math.abs(boundsMm[corner]![axis]! - value)).toBeLessThanOrEqual(1e-5);
            }
          }
          // oxlint-disable-next-line no-await-in-loop -- Record the exact downloaded identity next to its independent native measurements.
          const digest = await digestContent({ bytes });
          measured.push({
            host,
            digest,
            byteLength: bytes.byteLength,
            solids,
            boundsMm,
            density,
          });
        } finally {
          box.delete();
        }
      } finally {
        for (const native of nativeSolids) {
          native.delete();
        }
        imported.delete();
      }
    }
    expect(creates).not.toHaveBeenCalled();
    expect(measured).toHaveLength(packagedOnly ? 1 : 3);
    const output = new URL(
      '../../../../out/research/parts-assemblies-execution/2026-09-30/s08-runtime/',
      import.meta.url,
    );
    await mkdir(output, { recursive: true });
    await writeFile(
      new URL(
        packagedOnly
          ? 'packaged-product-downloaded-step-reader-r5-result.json'
          : 'product-downloaded-step-reader-r4-result.json',
        output,
      ),
      JSON.stringify(
        {
          root,
          assets,
          sourceCreateCalls: creates.mock.calls.length,
          inputCount: measured.length,
          measured,
          unit: 'millimeter',
          boundsToleranceMm: 1e-5,
        },
        null,
        2,
      ),
    );
  },
  120_000,
);
