import { describe, expect, it, vi } from 'vitest';
import { digestContent } from '@taucad/cache-core';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { preparePublishedPartVariants } from '#framework/published-part-store.js';
import {
  assertLocalTrsTransform,
  normalizeExactComponentPlacement,
  occurrenceTupleId,
  placedOccurrenceBounds,
  readAuthoredAssembly,
  resolveAuthoredAssembly,
  resolvePinnedAssembly,
} from '#framework/published-assembly-graph.js';
import { emptyGlb, testGlb } from '#framework/published-part-test-fixture.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import type { AuthoredAssemblySource, AuthoredAssembly } from '#types/runtime-assembly.types.js';

const matrix = (x = 0, y = 0, z = 0) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

const fixture = async () => {
  const handle = _fromMemoryFsHandle();
  if (handle.kind !== 'inline') {
    throw new Error('Expected inline fixture filesystem.');
  }
  const filesystem = createRuntimeFileSystem(handle.create());
  const source = async (entry: string) => ({
    entry,
    files: { [entry]: await digestContent({ bytes: new TextEncoder().encode(entry) }) },
  });
  const prepared = await preparePublishedPartVariants({
    filesystem,
    directory: 'published',
    variants: {
      default: { source: await source('parts/default.py'), glb: emptyGlb() },
      red: {
        source: await source('parts/red.py'),
        glb: testGlb({ asset: { version: '2.0' }, materials: [{ name: 'red' }] }),
      },
    },
  });
  const authored: AuthoredAssembly = {
    schemaVersion: 1,
    parts: { screw: { publishedPart: prepared.reference } },
    occurrences: [
      {
        id: 'arm:α',
        transform: matrix(1, 0, 0),
        children: [
          { id: 'pin', part: 'screw', transform: matrix(0, 2, 0) },
          { id: 'pin:2', part: 'screw', variant: 'red', transform: matrix(0, -2, 0) },
        ],
      },
    ],
  };
  return { filesystem, prepared, authored };
};

describe('pinned assembly graph admission', () => {
  it('admits proper-rigid exact placement only and normalizes signed zero for semantic cache identity', () => {
    const placed = matrix(0.032);
    placed[1] = -0;
    const normalized = normalizeExactComponentPlacement(placed);
    expect(normalized[12]).toBe(0.032);
    expect(Object.is(normalized[1], -0)).toBe(false);
    const reflected = matrix();
    reflected[0] = -1;
    const scaled = matrix();
    scaled[0] = 2;
    const sheared = matrix();
    sheared[4] = 0.2;
    const invalid = matrix();
    invalid[12] = Infinity;
    const projective = matrix(1e12);
    projective[3] = 1e-9;
    const projectiveUnit = matrix(1e12);
    projectiveUnit[15] = 1 + 1e-9;
    for (const value of [reflected, scaled, sheared, invalid, projective, projectiveUnit, matrix().slice(1)]) {
      expect(() => normalizeExactComponentPlacement(value)).toThrow();
    }
  });

  it('reuses a host-issued record without producer work and keeps variants and ancestry distinct', async () => {
    const { filesystem, prepared, authored } = await fixture();
    const producer = vi.fn();
    const resolved = await resolvePinnedAssembly(filesystem, authored);
    expect(producer).not.toHaveBeenCalled();
    expect(resolved.records['screw']).toEqual(prepared.record);
    expect(resolved.records['screw']!.variants['default']!.source.entry).toBe('parts/default.py');
    expect(resolved.records['screw']!.variants['red']!.source.entry).toBe('parts/red.py');
    expect(resolved.records['screw']!.variants['default']!.glb.digest).not.toBe(
      resolved.records['screw']!.variants['red']!.glb.digest,
    );
    const group = occurrenceTupleId('occurrence', ['arm:α']);
    const leaf = occurrenceTupleId('occurrence', ['arm:α', 'pin']);
    expect(resolved.identities[leaf]).toMatchObject({
      parent: group,
      path: ['arm:α', 'pin'],
      part: 'screw',
      variant: 'default',
    });
    expect(resolved.identities[leaf]!.worldTransform[12]).toBe(1);
    expect(resolved.identities[leaf]!.worldTransform[13]).toBe(2);
    expect(resolved.identities[occurrenceTupleId('occurrence', ['arm:α', 'pin:2'])]?.variant).toBe('red');
    expect(occurrenceTupleId('occurrence', ['a:b', 'c'])).not.toBe(occurrenceTupleId('occurrence', ['a', 'b:c']));
    expect(occurrenceTupleId('component', ['arm:α', 'pin'], 'x')).not.toBe(
      occurrenceTupleId('occurrence', ['arm:α', 'pin', 'x']),
    );
    expect(
      placedOccurrenceBounds({ min: [0, 0, 0], max: [1, 1, 1] }, resolved.identities[leaf]!.worldTransform),
    ).toEqual({ min: [1, 2, 0], max: [2, 3, 1] });
  });

  it('rejects duplicate siblings, bad variants, non-finite matrices and changed pins', async () => {
    const { filesystem, prepared, authored } = await fixture();
    const group = authored.occurrences[0]!;
    if (!group.children) {
      throw new Error('Expected group.');
    }
    const firstLeaf = group.children[0]!;
    if (!firstLeaf.part) {
      throw new Error('Expected leaf.');
    }
    const duplicate = { ...authored, occurrences: [{ ...group, children: [group.children[0]!, group.children[0]!] }] };
    await expect(resolvePinnedAssembly(filesystem, duplicate)).rejects.toThrow(/Duplicate sibling/u);
    const badVariant = {
      ...authored,
      occurrences: [
        {
          ...group,
          children: [
            {
              id: firstLeaf.id,
              part: firstLeaf.part,
              transform: firstLeaf.transform,
              variant: 'missing',
            },
          ],
        },
      ],
    };
    await expect(resolvePinnedAssembly(filesystem, badVariant)).rejects.toThrow(/unknown variant/u);
    const nonFinite = { ...authored, occurrences: [{ ...group, transform: matrix(Infinity, 0, 0) }] };
    await expect(resolvePinnedAssembly(filesystem, nonFinite)).rejects.toThrow();
    const projective = {
      ...authored,
      occurrences: [{ ...group, transform: [1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    };
    await expect(resolvePinnedAssembly(filesystem, projective)).rejects.toThrow(/affine TRS/u);
    const almostProjective = {
      ...authored,
      occurrences: [{ ...group, transform: [1, 0, 0, 1e-13, 0, 1, 0, 0, 0, 0, 1, 0, 1e12, 0, 0, 1] }],
    };
    await expect(resolvePinnedAssembly(filesystem, almostProjective)).rejects.toThrow(/affine TRS/u);
    const sheared = {
      ...authored,
      occurrences: [{ ...group, transform: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    };
    await expect(resolvePinnedAssembly(filesystem, sheared)).rejects.toThrow(/contains shear/u);
    expect(() => {
      assertLocalTrsTransform([1e308, 0, 0, 0, 1e308, 1e308, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }).toThrow(/contains shear/u);
    const changedPin = {
      ...authored,
      parts: {
        screw: {
          publishedPart: {
            ...prepared.reference,
            digest: `sha256:${'f'.repeat(64)}` as typeof prepared.reference.digest,
          },
        },
      },
    };
    await expect(resolvePinnedAssembly(filesystem, changedPin)).rejects.toThrow(/pinned digest/u);
  });

  it('accepts mirrored nonuniform local scale and hierarchical world shear', async () => {
    const { filesystem, authored } = await fixture();
    const c = Math.SQRT1_2;
    const composed: AuthoredAssembly = {
      ...authored,
      occurrences: [
        {
          id: 'parent',
          transform: [-2 * c, -2 * c, 0, 0, -c, c, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1],
          children: [
            {
              id: 'child',
              part: 'screw',
              transform: [c, -c, 0, 0, c, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          ],
        },
      ],
    };
    const resolved = await resolvePinnedAssembly(filesystem, composed);
    const world = resolved.identities[occurrenceTupleId('occurrence', ['parent', 'child'])]!.worldTransform;
    const dot = world[0]! * world[4]! + world[1]! * world[5]! + world[2]! * world[6]!;
    expect(Math.abs(dot)).toBeGreaterThan(0.1);
  });

  it('reads only rooted authored files and produces source variants while retaining pinned reuse', async () => {
    const { filesystem, prepared } = await fixture();
    const authored: AuthoredAssembly = {
      schemaVersion: 1,
      parts: {
        reused: { publishedPart: prepared.reference },
        fresh: {
          source: { path: 'parts/fresh.py' },
          variants: { blue: { source: { path: 'parts/blue.py' } } },
        },
      },
      occurrences: [
        { id: 'old', part: 'reused', transform: matrix() },
        { id: 'new', part: 'fresh', variant: 'blue', transform: matrix(2) },
      ],
    };
    await filesystem.writeFile('assembly.json', new TextEncoder().encode(JSON.stringify(authored)));
    const loaded = await readAuthoredAssembly(filesystem, 'assembly.json');
    const pathOf = (source: AuthoredAssemblySource): string =>
      source.path ?? source.entry ?? Object.keys(source.files)[0]!;
    const producer = vi.fn(async (sources: Readonly<Record<string, AuthoredAssemblySource>>) =>
      preparePublishedPartVariants({
        filesystem,
        directory: 'published',
        variants: {
          default: {
            source: {
              entry: pathOf(sources['default']!),
              files: {
                [pathOf(sources['default']!)]: await digestContent({
                  bytes: new TextEncoder().encode(pathOf(sources['default']!)),
                }),
              },
            },
            glb: emptyGlb(),
          },
          blue: {
            source: {
              entry: pathOf(sources['blue']!),
              files: {
                [pathOf(sources['blue']!)]: await digestContent({
                  bytes: new TextEncoder().encode(pathOf(sources['blue']!)),
                }),
              },
            },
            glb: emptyGlb(),
          },
        },
      }),
    );
    const resolved = await resolveAuthoredAssembly(filesystem, loaded, { produce: producer });
    expect(producer).toHaveBeenCalledExactlyOnceWith({
      default: { path: 'parts/fresh.py' },
      blue: { path: 'parts/blue.py' },
    });
    expect(resolved.records['fresh']?.variants['blue']?.source.entry).toBe('parts/blue.py');
    expect(resolved.parts['reused']).toEqual(prepared.reference);
    await expect(readAuthoredAssembly(filesystem, '../escape.json')).rejects.toThrow();
    await expect(
      resolveAuthoredAssembly(
        filesystem,
        {
          ...authored,
          parts: {
            fresh: { source: { path: 'parts/fresh.py' }, variants: { default: { source: { path: 'parts/blue.py' } } } },
          },
        },
        { produce: producer },
      ),
    ).rejects.toThrow(/default variant twice/u);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('round-trips adversarial part and variant names without inherited lookup or prototype mutation', async () => {
    const { filesystem, prepared } = await fixture();
    const variants = Object.fromEntries([
      ['default', prepared.record.variants['default']!],
      ['constructor', prepared.record.variants['red']!],
      ['__proto__', prepared.record.variants['red']!],
    ]);
    const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, variants }));
    const digest = await digestContent({ bytes });
    const reference = { path: 'published/adversarial.json', digest };
    await filesystem.writeFile(reference.path, bytes);
    const parts = Object.fromEntries([
      ['__proto__', { publishedPart: reference }],
      ['constructor', { publishedPart: reference }],
    ]);
    const authored: AuthoredAssembly = {
      schemaVersion: 1,
      parts,
      occurrences: [
        { id: 'one', part: '__proto__', variant: 'constructor', transform: matrix() },
        { id: 'two', part: 'constructor', variant: '__proto__', transform: matrix() },
      ],
    };
    const resolved = await resolvePinnedAssembly(filesystem, authored);
    expect(Object.hasOwn(resolved.parts, '__proto__')).toBe(true);
    expect(Object.hasOwn(resolved.records, 'constructor')).toBe(true);
    expect(resolved.occurrences[0]).toMatchObject({ part: '__proto__', variant: 'constructor' });
    expect(resolved.occurrences[1]).toMatchObject({ part: 'constructor', variant: '__proto__' });
    await expect(
      resolvePinnedAssembly(filesystem, {
        ...authored,
        occurrences: [{ id: 'bad', part: '__proto__', variant: 'toString', transform: matrix() }],
      }),
    ).rejects.toThrow(/unknown variant/u);
    await expect(
      resolvePinnedAssembly(filesystem, {
        ...authored,
        occurrences: [{ id: 'bad', part: 'toString', transform: matrix() }],
      }),
    ).rejects.toThrow(/unknown part/u);
  });
});
