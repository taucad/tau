import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { projectManifestSchemaUrl, serializeProjectManifest } from '@taucad/project-core';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { lfsPointerFor } from '#lfs.js';
import { readEntryClosure } from '#open/entry-closure.js';
import type { ReadTreeOptions, RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath, nativeHarness } from '#test/native-git-harness.js';
import { recordedBy } from '#test/identity.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = { source: 'user', ...recordedBy('entry-closure-test'), createdAt: 1_756_742_400_000 } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const manifest = (main: Readonly<{ entryPath: string; thumbnail?: string }>): Uint8Array<ArrayBuffer> =>
  serializeProjectManifest({
    $schema: projectManifestSchemaUrl,
    name: 'Bracket',
    description: '',
    tags: [],
    assets: { main },
  });

/* A store holding one revision, and every tree read it is asked for, with the paths each named. */
const store = async (
  files: Readonly<Record<string, Uint8Array<ArrayBuffer> | string>>,
): Promise<Readonly<{ port: RevisionPort; head: RevisionId; reads: Array<ReadTreeOptions | undefined> }>> => {
  const filesystem = new MemoryProvider();
  providers.push(filesystem);
  const inner = createIsomorphicGitRevisionPort({ filesystem });
  await inner.init({ author });
  const receipt = await inner.writeRevision({
    parents: [],
    tree: new ImmutableRevisionTree(Object.entries(files)),
    provenance,
    summary: { generated: 'First' },
  });
  const reads: Array<ReadTreeOptions | undefined> = [];
  const port: RevisionPort = {
    ...inner,
    readTree: async (id, options) => {
      reads.push(options);
      return inner.readTree(id, options);
    },
  };
  return { port, head: revisionId(receipt.commitId), reads };
};

describe('a revision’s tree listing (D10)', () => {
  it('lists every file by path, oid and mode without a tree read of its blobs', async () => {
    const { port, head, reads } = await store({ 'main.scad': 'cube(1);\n', 'lib/part.scad': 'sphere(1);\n' });
    const listing = await port.listTree?.(head);
    expect(listing?.map(({ path, mode }) => [path, mode])).toStrictEqual([
      ['lib/part.scad', '100644'],
      ['main.scad', '100644'],
    ]);
    expect(listing?.every(({ oid }) => /^[\da-f]{40}$/u.test(oid))).toBe(true);
    expect(reads).toStrictEqual([]);
    expect(await port.listTree?.(revisionId('0'.repeat(40)))).toBeUndefined();
  });
});

describe.runIf(gitToolchainOnPath)('a revision’s tree listing on native git (D10)', () => {
  it('lists each file with the size git reads from its object header', async () => {
    const harness = await nativeHarness('project-1', 'tau-listing-');
    try {
      await harness.port.init({ author });
      const receipt = await harness.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([
          ['main.scad', 'cube(1);\n'],
          ['lib/part.scad', 'sphere(10);\n', '100755'],
        ]),
        provenance,
        summary: { generated: 'First' },
      });
      const listing = await harness.port.listTree?.(revisionId(receipt.commitId));
      expect(listing?.map(({ path, mode, size }) => [path, mode, size])).toStrictEqual([
        ['lib/part.scad', '100755', 12],
        ['main.scad', '100644', 9],
      ]);
    } finally {
      await harness.dispose();
    }
  });
});

describe('the entry closure (D10)', () => {
  it('reads tau.json, then only the files it names, by the oids the listing gives', async () => {
    const step = encoder.encode('solid part\n');
    const { port, head, reads } = await store({
      'tau.json': manifest({ entryPath: 'main.scad', thumbnail: 'thumb.png' }),
      'main.scad': 'import("models/part.step");\n',
      'models/part.step': lfsPointerFor(step).bytes,
      'other.scad': 'cube(2);\n',
    });
    const closure = await readEntryClosure(port, head);
    expect(closure?.files.map(({ path }) => path)).toStrictEqual(['tau.json', 'main.scad']);
    expect(closure?.missing).toStrictEqual(['thumb.png']);
    expect(decoder.decode(closure?.files[1]?.content)).toBe('import("models/part.step");\n');
    const listing = await port.listTree?.(head);
    expect(closure?.files[1]?.oid).toBe(listing?.find(({ path }) => path === 'main.scad')?.oid);
    expect(reads.map((options) => options?.paths)).toStrictEqual([['tau.json'], ['main.scad']]);
    expect(reads.every((options) => options?.largeObjects === 'local')).toBe(true);
  });

  it('names a large-object entry as pending, for the fill', async () => {
    const step = encoder.encode('solid part\n');
    const { pointer, bytes } = lfsPointerFor(step);
    const { port, head } = await store({ 'tau.json': manifest({ entryPath: 'part.step' }), 'part.step': bytes });
    const closure = await readEntryClosure(port, head);
    expect(closure?.files[1]?.pending).toMatchObject({ oid: pointer.oid, size: step.byteLength });
  });

  it('is tau.json alone, or nothing, when the manifest names nothing it can read', async () => {
    const unnamed = await store({ 'tau.json': '{}', 'main.scad': 'cube(1);\n' });
    const named = await readEntryClosure(unnamed.port, unnamed.head);
    expect(named?.files.map(({ path }) => path)).toStrictEqual(['tau.json']);
    const bare = await store({ 'main.scad': 'cube(1);\n' });
    expect(await readEntryClosure(bare.port, bare.head)).toStrictEqual({ files: [], missing: ['tau.json'] });
  });
});
