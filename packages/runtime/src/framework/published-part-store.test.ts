import { describe, expect, it, vi } from 'vitest';
import { contentDigest, digestContent } from '@taucad/cache-core';
import { emptyGlb, testGlb } from '#framework/published-part-test-fixture.js';
import { canonicalJson } from '@taucad/utils/hash';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import {
  admitPublishedPart,
  preparePublishedPart,
  preparePublishedPartVariants,
  readCompatiblePublishedPartExact,
  readPublishedPartAsset,
  readPublishedGlbSourceComponentIds,
} from '#framework/published-part-store.js';
import type { PublishedPartRecord } from '#types/runtime-assembly.types.js';

const createFilesystem = (): KernelFileSystem => {
  const handle = _fromMemoryFsHandle();
  if (handle.kind !== 'inline') {
    throw new Error('Expected an inline memory filesystem.');
  }
  return createRuntimeFileSystem(handle.create());
};

const source = async (entry: string) => ({
  entry,
  files: { [entry]: await digestContent({ bytes: new TextEncoder().encode('cube') }) },
});

describe('completed part publication groundwork', () => {
  it('projects active mesh source IDs and refuses ambiguous binding without including inactive or grouping nodes', () => {
    // Identity projection only: semantic GLB admission remains the host callback prerequisite.
    const document = {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      meshes: [{ primitives: [] }],
      nodes: [
        { extras: { tauComponentId: 'group' }, children: [1, 2] },
        { mesh: 0, extras: { tauComponentId: 'body-a' } },
        { mesh: 0, extras: { tauComponentId: 'body-b' } },
        { mesh: 0, extras: { tauComponentId: 'inactive' } },
      ],
    };
    expect(readPublishedGlbSourceComponentIds(testGlb(document))).toEqual(['body-a', 'body-b']);
    expect(() =>
      readPublishedGlbSourceComponentIds(
        testGlb({
          ...document,
          nodes: [document.nodes[0], document.nodes[1], { mesh: 0, extras: { tauComponentId: 'body-a' } }],
        }),
      ),
    ).toThrow('duplicated');
    expect(() =>
      readPublishedGlbSourceComponentIds(
        testGlb({ ...document, nodes: [document.nodes[0], document.nodes[1], { mesh: 0 }] }),
      ),
    ).toThrow();
    expect(() => readPublishedGlbSourceComponentIds(testGlb({ ...document, nodes: [{ children: [0] }] }))).toThrow(
      'ambiguous',
    );
  });

  it('persists content before its immutable record and admits it across store instances', async () => {
    const filesystem = createFilesystem();
    const writes: string[] = [];
    const write = filesystem.writeFile.bind(filesystem);
    vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, bytes) => {
      writes.push(path);
      await write(path, bytes);
    });
    const glb = emptyGlb();
    const first = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('a/screw.py'),
      glb,
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatch(/\.glb$/u);
    expect(writes[1]).toBe(first.reference.path);
    expect(await admitPublishedPart(filesystem, first.reference)).toEqual(first.record);

    const second = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('a/screw.py'),
      glb,
    });
    expect(second.reference).toEqual(first.reference);
    expect(writes).toHaveLength(2);
    const { readFile } = filesystem;
    const providerBuffers: ArrayBuffer[] = [];
    function observedReadFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function observedReadFile(path: string, encoding: 'utf8'): Promise<string>;
    async function observedReadFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      if (encoding === 'utf8') {
        return readFile(path, encoding);
      }
      const bytes = await readFile(path);
      if (path === first.record.variants['default']!.glb.path) {
        providerBuffers.push(bytes.buffer);
      }
      return bytes;
    }
    const asset = await readPublishedPartAsset(
      { ...filesystem, readFile: observedReadFile },
      first.reference,
      first.record.variants['default']!.glb.digest,
    );
    expect(asset).toEqual(glb);
    expect(providerBuffers.length).toBeGreaterThan(0);
    expect(asset.buffer).not.toBe(providerBuffers.at(-1));
    expect(asset.byteLength).toBe(glb.byteLength);
    asset[0] = 0;
    expect(
      await readPublishedPartAsset(filesystem, first.reference, first.record.variants['default']!.glb.digest),
    ).toEqual(glb);
  });

  it('verifies all variants serially, rejects a corrupt non-selected variant, and retains owned-copy isolation', async () => {
    const filesystem = createFilesystem();
    const glb = emptyGlb();
    const alternate = testGlb({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [] }],
      extras: { variant: 'alternate' },
    });
    const prepared = await preparePublishedPartVariants({
      filesystem,
      directory: 'published',
      variants: {
        default: { source: await source('part.ts'), glb },
        secondary: { source: await source('part.ts'), glb: alternate },
      },
    });
    const firstPath = prepared.record.variants['default']!.glb.path;
    const secondPath = prepared.record.variants['secondary']!.glb.path;
    const read = filesystem.readFile.bind(filesystem);
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let outstanding = 0;
    let highWater = 0;
    const paths: string[] = [];
    const readSpy = vi.spyOn(filesystem, 'readFile').mockImplementation(async (...args) => {
      const [path] = args;
      const isGlb = path === firstPath || path === secondPath;
      if (isGlb) {
        paths.push(path);
        outstanding += 1;
        highWater = Math.max(highWater, outstanding);
      }
      try {
        if (path === firstPath) {
          await firstPending;
        }
        return await read(...args);
      } finally {
        if (isGlb) {
          outstanding -= 1;
        }
      }
    });
    const admission = admitPublishedPart(filesystem, prepared.reference);
    try {
      await vi.waitFor(() => {
        expect(paths).toEqual([firstPath]);
      });
      expect(outstanding).toBe(1);
      releaseFirst?.();
      await expect(admission).resolves.toEqual(prepared.record);
      expect(paths).toEqual([firstPath, secondPath]);
      expect(highWater).toBe(1);
      expect(outstanding).toBe(0);
    } finally {
      releaseFirst?.();
      await Promise.allSettled([admission]);
      readSpy.mockRestore();
    }
    const assetReads = vi.spyOn(filesystem, 'readFile');
    const owned = await readPublishedPartAsset(
      filesystem,
      prepared.reference,
      prepared.record.variants['default']!.glb.digest,
    );
    expect(assetReads.mock.calls.map(([path]) => path)).toEqual([
      prepared.reference.path,
      firstPath,
      secondPath,
      firstPath,
    ]);
    assetReads.mockClear();
    expect(
      await readPublishedPartAsset(filesystem, prepared.reference, prepared.record.variants['secondary']!.glb.digest),
    ).toEqual(alternate);
    expect(assetReads.mock.calls.map(([path]) => path)).toEqual([prepared.reference.path, firstPath, secondPath]);
    assetReads.mockRestore();
    owned[0] = 0;
    expect(
      await readPublishedPartAsset(filesystem, prepared.reference, prepared.record.variants['default']!.glb.digest),
    ).toEqual(glb);
    await filesystem.writeFile(secondPath, new Uint8Array([1, 2, 3]));
    await expect(
      readPublishedPartAsset(filesystem, prepared.reference, prepared.record.variants['default']!.glb.digest),
    ).rejects.toThrow(/pinned digest/u);
  });

  it.each([2, 4, 8])(
    'should read each of %i distinct default-only assets without rereading its verified GLB',
    async (count) => {
      const filesystem = createFilesystem();
      const prepared = await Promise.all(
        Array.from({ length: count }, async (_, index) =>
          preparePublishedPart({
            filesystem,
            directory: 'published',
            source: await source(`part-${index}.ts`),
            glb: testGlb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], extras: { index } }),
          }),
        ),
      );
      const read = vi.spyOn(filesystem, 'readFile');
      for (const part of prepared) {
        // oxlint-disable-next-line no-await-in-loop -- Mirror the serialized viewport asset reads.
        const bytes = await readPublishedPartAsset(
          filesystem,
          part.reference,
          part.record.variants['default']!.glb.digest,
        );
        expect(bytes.byteLength).toBe(part.record.variants['default']!.glb.byteLength);
      }
      const paths = read.mock.calls.map(([path]) => path);
      for (const part of prepared) {
        expect(paths.filter((path) => path === part.reference.path)).toHaveLength(1);
        expect(paths.filter((path) => path === part.record.variants['default']!.glb.path)).toHaveLength(1);
      }
    },
  );

  it('keeps equivalent source text at another entry distinct while sharing content bytes', async () => {
    const filesystem = createFilesystem();
    const glb = emptyGlb();
    const first = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('a/screw.py'),
      glb,
    });
    const second = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('b/screw.py'),
      glb,
    });
    expect(second.reference.digest).not.toBe(first.reference.digest);
    expect(second.record.variants['default']!.glb.digest).toBe(first.record.variants['default']!.glb.digest);
  });

  it('persists qualified exact bytes before a record and checks them on explicit read', async () => {
    const filesystem = createFilesystem();
    const writes: string[] = [];
    const write = filesystem.writeFile.bind(filesystem);
    vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, bytes) => {
      writes.push(path);
      await write(path, bytes);
    });
    const bytes = new TextEncoder().encode('native snapshot');
    const prepared = await preparePublishedPartVariants({
      filesystem,
      directory: 'published',
      variants: {
        default: {
          source: await source('screw.py'),
          glb: emptyGlb(),
          exact: {
            bytes,
            provider: 'test-kernel',
            kernelId: 'mock-kernel',
            providerVersion: 'identified-test-build',
            codec: 'test.native-handle-msgpack',
            codecVersion: '1',
            unit: 'millimeter',
            linearToleranceMm: 0,
            angularToleranceRad: 0,
          },
        },
      },
    });
    const exact = prepared.record.variants['default']!.exact!;
    const { asset: _asset, ...descriptor } = exact;
    expect(writes).toEqual([prepared.record.variants['default']!.glb.path, exact.asset.path, prepared.reference.path]);
    await expect(admitPublishedPart(filesystem, prepared.reference)).resolves.toEqual(prepared.record);
    await expect(readPublishedPartAsset(filesystem, prepared.reference, exact.asset.digest)).resolves.toEqual(bytes);
    await expect(
      readCompatiblePublishedPartExact(filesystem, {
        reference: prepared.reference,
        variantName: 'default',
        expected: descriptor,
      }),
    ).resolves.toEqual(bytes);
    await expect(
      readCompatiblePublishedPartExact(filesystem, {
        reference: prepared.reference,
        variantName: 'default',
        expected: {
          ...descriptor,
          providerVersion: 'other-implementation-assets',
        },
      }),
    ).rejects.toThrow(/incompatible: providerVersion/u);
    await expect(
      readCompatiblePublishedPartExact(filesystem, {
        reference: prepared.reference,
        variantName: 'default',
        expected: {
          ...descriptor,
          unit: 'meter',
        },
      }),
    ).rejects.toThrow(/incompatible: unit/u);
    await filesystem.writeFile(exact.asset.path, new Uint8Array([1, 2, 3]));
    await expect(readPublishedPartAsset(filesystem, prepared.reference, exact.asset.digest)).rejects.toThrow(
      /pinned digest/u,
    );
    await expect(
      readCompatiblePublishedPartExact(filesystem, {
        reference: prepared.reference,
        variantName: 'default',
        expected: descriptor,
      }),
    ).rejects.toThrow(/pinned digest/u);
  });

  it('rechecks content after concurrent same-digest writes before returning either receipt', async () => {
    const filesystem = createFilesystem();
    const input = { filesystem, directory: 'published', source: await source('screw.py'), glb: emptyGlb() };
    const [first, second] = await Promise.all([preparePublishedPart(input), preparePublishedPart(input)]);
    expect(second.reference).toEqual(first.reference);
    await expect(admitPublishedPart(filesystem, first.reference)).resolves.toEqual(first.record);
  });

  it('rejects missing and digest-mismatched required display bytes', async () => {
    const filesystem = createFilesystem();
    const prepared = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('screw.py'),
      glb: emptyGlb(),
    });
    const glbPath = prepared.record.variants['default']!.glb.path;
    await filesystem.writeFile(glbPath, new Uint8Array([1, 2, 3]));
    await expect(admitPublishedPart(filesystem, prepared.reference)).rejects.toThrow(/pinned digest/u);
    await filesystem.unlink(glbPath);
    await expect(admitPublishedPart(filesystem, prepared.reference)).rejects.toThrow();
  });

  it('rejects unresolved source dependencies and invalid GLB before writing a record', async () => {
    const filesystem = createFilesystem();
    const complete = await source('screw.py');
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: { ...complete, files: { ...complete.files, 'missing.py': 'missing' } },
        glb: emptyGlb(),
      }),
    ).rejects.toThrow(/complete resolved source closure/u);
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow();
    await expect(filesystem.exists('published/parts/sha256')).resolves.toBe(false);
  });

  it('retains privately classified optional absence in immutable identity and admits it without source reads', async () => {
    const filesystem = createFilesystem();
    const complete = await source('screw.py');
    const sidecar = '.tau/parameters/screw.py.json';
    await filesystem.writeFile(complete.entry, new TextEncoder().encode('cube'));
    const absent = await preparePublishedPartVariants({
      filesystem,
      directory: 'published',
      variants: {
        default: {
          source: { ...complete, files: { ...complete.files, [sidecar]: 'missing' } },
          glb: emptyGlb(),
          optionalAbsentPaths: new Set([sidecar]),
        },
      },
    });
    expect(absent.record.variants['default']?.source.files[sidecar]).toBe('missing');
    const present = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: { ...complete, files: { ...complete.files, [sidecar]: complete.files[complete.entry]! } },
      glb: emptyGlb(),
    });
    expect(present.reference.digest).not.toBe(absent.reference.digest);
    expect(present.record.variants['default']?.glb).toEqual(absent.record.variants['default']?.glb);
    await filesystem.unlink(complete.entry);
    const read = vi.spyOn(filesystem, 'readFile');
    expect(await admitPublishedPart(filesystem, absent.reference)).toEqual(absent.record);
    expect(read).not.toHaveBeenCalledWith(complete.entry);
    expect(read).not.toHaveBeenCalledWith(sidecar);
    const persisted = JSON.parse(
      new TextDecoder().decode(await filesystem.readFile(absent.reference.path)),
    ) as PublishedPartRecord;
    expect(persisted).toEqual(absent.record);
    expect(persisted.variants['default']).not.toHaveProperty('optionalAbsentPaths');
  });

  it.each(['absent', 'missing'] as const)(
    'rejects a %s required entry even with a private absence classification',
    async (state) => {
      const filesystem = createFilesystem();
      const complete = await source('screw.py');
      await expect(
        preparePublishedPartVariants({
          filesystem,
          directory: 'published',
          variants: {
            default: {
              source: { entry: complete.entry, files: state === 'missing' ? { [complete.entry]: 'missing' } : {} },
              glb: emptyGlb(),
              optionalAbsentPaths: new Set([complete.entry]),
            },
          },
        }),
      ).rejects.toThrow('complete resolved source closure');
      expect(await filesystem.exists('published')).toBe(false);
    },
  );

  it('rejects a private absence classification that does not match the source fact', async () => {
    const filesystem = createFilesystem();
    await expect(
      preparePublishedPartVariants({
        filesystem,
        directory: 'published',
        variants: {
          default: {
            source: await source('screw.py'),
            glb: emptyGlb(),
            optionalAbsentPaths: new Set(['not-selected.py']),
          },
        },
      }),
    ).rejects.toThrow('complete resolved source closure');
    expect(await filesystem.exists('published')).toBe(false);
  });

  it('rejects a source-free record whose required entry is marked missing', async () => {
    const filesystem = createFilesystem();
    const prepared = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('screw.py'),
      glb: emptyGlb(),
    });
    const record = {
      ...prepared.record,
      variants: {
        default: {
          ...prepared.record.variants['default']!,
          source: { entry: 'screw.py', files: { 'screw.py': 'missing' } },
        },
      },
    };
    const bytes = new TextEncoder().encode(canonicalJson(record));
    const reference = { path: 'published/invalid-entry.json', digest: await digestContent({ bytes }) };
    await filesystem.writeFile(reference.path, bytes);
    await expect(admitPublishedPart(filesystem, reference)).rejects.toThrow('unresolved source dependency');
  });

  it('admits embedded data URIs and rejects external buffer or image dependencies', async () => {
    const filesystem = createFilesystem();
    const complete = await source('screw.py');
    const asset = { version: '2.0' };
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: testGlb({ asset, buffers: [{ byteLength: 1, uri: 'data:application/octet-stream;base64,AA==' }] }),
      }),
    ).resolves.toBeDefined();
    await Promise.all(
      [
        { asset, buffers: [{ byteLength: 1, uri: 'missing.bin' }] },
        { asset, images: [{ uri: 'https://example.test/missing.png' }] },
      ].map(async (document) =>
        expect(
          preparePublishedPart({
            filesystem,
            directory: 'published',
            source: complete,
            glb: testGlb(document),
          }),
        ).rejects.toThrow(/external (buffer|image)/u),
      ),
    );
  });

  it('rejects BIN-backed buffers and views outside their embedded bounds', async () => {
    const filesystem = createFilesystem();
    const complete = await source('screw.py');
    const asset = { version: '2.0' };
    await Promise.all(
      [
        { asset, buffers: [{ byteLength: 8 }] },
        { asset, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 2, byteLength: 4 }] },
      ].map(async (document) =>
        expect(
          preparePublishedPart({
            filesystem,
            directory: 'published',
            source: complete,
            glb: testGlb(document, new Uint8Array(4)),
          }),
        ).rejects.toThrow(/buffer/u),
      ),
    );
  });

  it('rejects a second BIN chunk masking a short first BIN and short embedded data URIs', async () => {
    const filesystem = createFilesystem();
    const complete = await source('screw.py');
    const first = testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 8 }] }, new Uint8Array(4));
    const withSecondBin = new Uint8Array(first.byteLength + 12);
    withSecondBin.set(first);
    const view = new DataView(withSecondBin.buffer);
    view.setUint32(8, withSecondBin.byteLength, true);
    view.setUint32(first.byteLength, 4, true);
    view.setUint32(first.byteLength + 4, 0x00_4e_49_42, true);
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: withSecondBin,
      }),
    ).rejects.toThrow(/multiple BIN/u);
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: testGlb({
          asset: { version: '2.0' },
          buffers: [{ byteLength: 8, uri: 'data:application/octet-stream;base64,AA==' }],
        }),
      }),
    ).rejects.toThrow(/embedded data URI/u);
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: testGlb({
          asset: { version: '2.0' },
          buffers: [{ byteLength: 3, uri: 'data:application/octet-stream,%00%01' }],
        }),
      }),
    ).rejects.toThrow(/embedded data URI/u);
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: complete,
        glb: testGlb({
          asset: { version: '2.0' },
          buffers: [{ byteLength: 5, uri: 'data:application/octet-stream,😀' }],
        }),
      }),
    ).rejects.toThrow(/embedded data URI/u);
  });

  it('rejects an externally referenced GLB even when its pinned record and byte digests match', async () => {
    const filesystem = createFilesystem();
    const prepared = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('screw.py'),
      glb: emptyGlb(),
    });
    const glb = testGlb({ asset: { version: '2.0' }, images: [{ uri: 'texture.png' }] });
    const glbDigest = await digestContent({ bytes: glb });
    const glbPath = `published/assets/sha256/${glbDigest.slice('sha256:'.length)}.glb`;
    await filesystem.writeFile(glbPath, glb);
    const record: PublishedPartRecord = {
      ...prepared.record,
      variants: {
        default: {
          source: prepared.record.variants['default']!.source,
          glb: { path: glbPath, digest: glbDigest, byteLength: glb.byteLength },
        },
      },
    };
    const bytes = new TextEncoder().encode(canonicalJson(record));
    const digest = await digestContent({ bytes });
    const reference = { path: `published/parts/sha256/${digest.slice('sha256:'.length)}.json`, digest };
    await filesystem.writeFile(reference.path, bytes);
    await expect(admitPublishedPart(filesystem, reference)).rejects.toThrow(/external image/u);
  });

  it('does not write a record after an interrupted immutable content write', async () => {
    const filesystem = createFilesystem();
    const write = filesystem.writeFile.bind(filesystem);
    vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, bytes) => {
      if (path.endsWith('.glb')) {
        await write(path, new Uint8Array([1, 2, 3]));
        throw new Error('interrupted write');
      }
      await write(path, bytes);
    });
    await expect(
      preparePublishedPart({
        filesystem,
        directory: 'published',
        source: await source('screw.py'),
        glb: emptyGlb(),
      }),
    ).rejects.toThrow(/interrupted write/u);
    await expect(filesystem.exists('published/parts/sha256')).resolves.toBe(false);
  });

  it('admits a valid display when optional native bytes are missing, then fails exact reading explicitly', async () => {
    const filesystem = createFilesystem();
    const prepared = await preparePublishedPart({
      filesystem,
      directory: 'published',
      source: await source('screw.py'),
      glb: emptyGlb(),
    });
    const exactDigest = contentDigest({ value: `sha256:${'f'.repeat(64)}` });
    const record: PublishedPartRecord = {
      ...prepared.record,
      variants: {
        default: {
          ...prepared.record.variants['default']!,
          exact: {
            asset: { path: 'published/native/missing.brep', digest: exactDigest, byteLength: 1 },
            kernelId: 'unknown-kernel',
            provider: 'unknown-provider',
            providerVersion: '1',
            codec: 'unknown-codec',
            codecVersion: '1',
            unit: 'millimeter',
            linearToleranceMm: 0.01,
            angularToleranceRad: 0.001,
          },
        },
      },
    };
    const bytes = new TextEncoder().encode(canonicalJson(record));
    const digest = await digestContent({ bytes });
    const reference = { path: `published/parts/sha256/${digest.slice('sha256:'.length)}.json`, digest };
    await filesystem.writeFile(reference.path, bytes);
    await expect(admitPublishedPart(filesystem, reference)).resolves.toEqual(record);
    await expect(readPublishedPartAsset(filesystem, reference, exactDigest)).rejects.toThrow();
  });
});
