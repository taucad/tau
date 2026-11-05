import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryProvider } from '@taucad/filesystem/backend';
import type { FileReadStreamOptions } from '@taucad/filesystem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import type { ObjectStore } from '#object-store/object-store.js';
import { digestHex } from '#object-hash.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const encoder = new TextEncoder();
const roots: string[] = [];
const providers: MemoryProvider[] = [];

afterEach(async () => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const gitEnvironment: NodeJS.ProcessEnv = { ...process.env };
gitEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
gitEnvironment['GIT_CONFIG_NOSYSTEM'] = '1';
gitEnvironment['GIT_AUTHOR_NAME'] = 'Tau';
gitEnvironment['GIT_AUTHOR_EMAIL'] = 'noreply@tau.new';
gitEnvironment['GIT_COMMITTER_NAME'] = 'Tau';
gitEnvironment['GIT_COMMITTER_EMAIL'] = 'noreply@tau.new';

const git = (cwd: string, args: readonly string[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(execFileSync('git', args, { cwd, env: gitEnvironment }));
const decoder = new TextDecoder();

/**
 * A memory provider that reads ranges the way OPFS does — a slice per call —
 * with every whole-file read of a pack recorded.
 */
const rangedProvider = () => {
  const provider = new MemoryProvider();
  providers.push(provider);
  const whole = provider.readFile.bind(provider) as (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  const packReads: string[] = [];
  const ranges: string[] = [];
  vi.spyOn(provider, 'readFile').mockImplementation((async (path: string, encoding?: 'utf8') => {
    if (path.endsWith('.pack')) {
      packReads.push(path);
    }
    const bytes = await whole(path);
    return encoding === 'utf8' ? decoder.decode(bytes) : bytes;
  }) as MemoryProvider['readFile']);
  Object.assign(provider, {
    readFileStream: (path: string, options?: FileReadStreamOptions) => {
      ranges.push(path);
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start: async (controller) => {
          const content = await whole(path);
          const start = options?.position ?? 0;
          controller.enqueue(content.slice(start, start + (options?.length ?? content.byteLength)));
          controller.close();
        },
      });
    },
  });
  return { provider, packReads, ranges };
};

const storeOver = (provider: MemoryProvider, options?: { now?: () => number; retention?: number }): ObjectStore =>
  createObjectStore({
    files: gitFilesOf(provider, '.git'),
    gitdir: '.git',
    compute: createInlineCompute(),
    fenceName: `test:${provider.id}`,
    ...(options?.now === undefined ? {} : { now: options.now }),
    repack: { retention: options?.retention ?? 60_000 },
  });

/** Every object of a repository, as git reports it. */
const objectsOf = (root: string): Array<{ oid: string; type: string; data: Uint8Array<ArrayBuffer> }> => {
  const listed = decoder
    .decode(git(root, ['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)']))
    .trim()
    .split('\n')
    .map((line) => line.split(' ') as [string, string]);
  return listed.map(([oid, type]) => ({ oid, type, data: git(root, ['cat-file', type, oid]) }));
};

/** A history of near-identical files, repacked so most objects are deltas. */
const deltaRepository = async (deltaBaseOffset: boolean): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-object-store-'));
  roots.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  const lines = Array.from({ length: 400 }, (_, index) => `line ${String(index)} of a model parameter file\n`);
  for (let revision = 0; revision < 6; revision += 1) {
    lines[revision * 7] = `edited in revision ${String(revision)}\n`;
    // oxlint-disable-next-line no-await-in-loop -- one commit after another.
    await writeFile(join(root, 'model.scad'), lines.join(''));
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(join(root, `notes-${String(revision)}.md`), lines.slice(0, 50 + revision).join(''));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', `revision ${String(revision)}`]);
  }
  git(root, [
    '-c',
    `repack.useDeltaBaseOffset=${String(deltaBaseOffset)}`,
    'repack',
    '-adf',
    '-q',
    '--window=10',
    '--depth=50',
  ]);
  return root;
};

const copyPacks = async (root: string, provider: MemoryProvider): Promise<void> => {
  const directory = join(root, '.git', 'objects', 'pack');
  for (const name of await readdir(directory)) {
    if (name.endsWith('.pack') || name.endsWith('.idx')) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of files.
      await provider.writeFile(`.git/objects/pack/${name}`, new Uint8Array(await readFile(join(directory, name))));
    }
  }
};

describe.runIf(gitToolchainOnPath)('the object store over a pack git wrote', () => {
  it.each([
    ['offset deltas', true],
    ['ref deltas', false],
  ])('reads every object byte for byte through %s, one table lookup and one range read per entry', async (_, base) => {
    const root = await deltaRepository(base);
    const { provider, packReads, ranges } = rangedProvider();
    await copyPacks(root, provider);
    const store = storeOver(provider);
    const expected = objectsOf(root);

    for (const object of expected) {
      // oxlint-disable-next-line no-await-in-loop -- counted one object at a time.
      const read = await store.read(object.oid);
      expect(read?.type).toBe(object.type);
      expect(read?.data).toStrictEqual(object.data);
    }

    const { counters } = store;
    expect(counters.lookups).toBe(expected.length);
    /* One range per object, plus one per delta base that was not already cached. */
    expect(counters.rangeReads).toBe(expected.length + counters.deltaHops);
    expect(counters.deltaHops).toBeGreaterThan(0);
    /* And the pack's trailer, compared with its index once. */
    expect(counters.packChecks).toBe(1);
    expect(ranges).toHaveLength(counters.rangeReads + counters.packChecks);
    expect(counters.wholePackLoads).toBe(0);
    expect(counters.looseReads).toBe(0);
    expect(packReads).toStrictEqual([]);
  });

  it('writes a pack and index git itself verifies', async () => {
    const { provider } = rangedProvider();
    const store = storeOver(provider);
    const blobs = Array.from({ length: 40 }, (_, index) => encoder.encode(`part ${String(index)}\n`.repeat(index + 1)));
    const oids = await store.writeLoose(blobs.map((data) => ({ type: 'blob', data })));

    expect(await store.repack(true)).toBe(true);

    const root = await mkdtemp(join(tmpdir(), 'tau-object-store-verify-'));
    roots.push(root);
    git(root, ['init', '-q', '--bare']);
    await mkdir(join(root, 'objects', 'pack'), { recursive: true });
    for (const name of await provider.readdir('.git/objects/pack')) {
      // oxlint-disable-next-line no-await-in-loop -- one pack and its index.
      await writeFile(join(root, 'objects', 'pack', name), await provider.readFile(`.git/objects/pack/${name}`));
    }
    const written = await readdir(join(root, 'objects', 'pack'));
    const packIndex = written.find((name) => name.endsWith('.idx'));
    expect(decoder.decode(git(root, ['verify-pack', join('objects', 'pack', packIndex!)]))).toBe('');
    expect(git(root, ['cat-file', 'blob', oids[7]!])).toStrictEqual(blobs[7]);
  });
});

describe('the object store', () => {
  it('hashes a loose object once, as git does, and stores it where git would', async () => {
    const { provider } = rangedProvider();
    const store = storeOver(provider);
    const data = encoder.encode('cube(1);\n');

    const [oid] = await store.writeLoose([{ type: 'blob', data }]);

    expect(oid).toBe(digestHex('sha1', encoder.encode(`blob ${String(data.byteLength)}\0cube(1);\n`)));
    expect(await provider.exists(`.git/objects/${oid!.slice(0, 2)}/${oid!.slice(2)}`)).toBe(true);
    expect(await store.has(oid!)).toBe(true);
    const read = await store.read(oid!);
    expect(read?.data).toStrictEqual(data);
    expect(await store.read('0'.repeat(40))).toBeUndefined();
  });

  it('costs one table lookup and one range read for a packed object, and never reads the pack whole', async () => {
    const { provider, packReads } = rangedProvider();
    const writer = storeOver(provider);
    const [oid] = await writer.writeLoose([{ type: 'blob', data: encoder.encode('solid a\n') }]);
    await writer.writeLoose([{ type: 'blob', data: encoder.encode('solid b\n') }]);
    await writer.repack(true);
    const reader = storeOver(provider);

    await reader.read(oid!);

    expect(reader.counters).toStrictEqual({
      lookups: 1,
      rangeReads: 1,
      deltaHops: 0,
      cacheHits: 0,
      looseReads: 0,
      wholePackLoads: 0,
      packChecks: 1,
    });
    expect(packReads).toStrictEqual([]);
  });

  it('reads a pack whole, once, only over files that cannot read a range', async () => {
    const provider = new MemoryProvider();
    providers.push(provider);
    const writer = storeOver(provider);
    const oids = await writer.writeLoose(
      ['a', 'b', 'c'].map((name) => ({ type: 'blob', data: encoder.encode(`${name}\n`) })),
    );
    await writer.repack(true);
    const reader = storeOver(provider);

    for (const oid of oids) {
      // oxlint-disable-next-line no-await-in-loop -- counted in order.
      await reader.read(oid);
    }

    expect(reader.counters.wholePackLoads).toBe(1);
    expect(reader.counters.rangeReads).toBe(3);
  });

  /*
   * D7: a repack keeps what it replaced for a retention window, so a reader in
   * another tab that located an object in a replaced pack still reads it there;
   * once the window has passed and the old pack is gone, that reader re-lists
   * the packs once and reads the object from the new one.
   */
  it("keeps a peer tab's reader working while a repack replaces the pack it located", async () => {
    const { provider } = rangedProvider();
    let clock = 1000;
    const now = (): number => clock;
    const thisTab = storeOver(provider, { now, retention: 60_000 });
    const peerTab = storeOver(provider, { now, retention: 60_000 });
    const first = await thisTab.writeLoose([{ type: 'blob', data: encoder.encode('first\n') }]);
    await thisTab.repack(true);
    const located = await peerTab.read(first[0]!);
    expect(located?.data).toStrictEqual(encoder.encode('first\n'));
    const before = await provider.readdir('.git/objects/pack');

    /* The peer keeps reading while this tab folds the pack it located and a new object into another one. */
    const second = await thisTab.writeLoose([{ type: 'blob', data: encoder.encode('second\n') }]);
    const reads = Array.from({ length: 20 }, async () => peerTab.read(first[0]!));
    const [repacked, ...answers] = await Promise.all([thisTab.repack(true), ...reads]);

    expect(repacked).toBe(true);
    expect(answers.every((answer) => answer?.type === 'blob')).toBe(true);
    /* Inside the window both packs are there: nothing a reader located was removed. */
    const during = await provider.readdir('.git/objects/pack');
    expect(during).toHaveLength(before.length + 2);
    await expect(peerTab.read(first[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('first\n') });
    await expect(peerTab.read(second[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('second\n') });

    /* Past the window, the next repack removes the old pack and the folded loose object. */
    clock += 60_000;
    await thisTab.repack(false);
    const after = await provider.readdir('.git/objects/pack');
    expect(after.some((name) => before.includes(name))).toBe(false);
    expect(await provider.exists(`.git/objects/${second[0]!.slice(0, 2)}/${second[0]!.slice(2)}`)).toBe(false);
    /* The peer's tables still name the removed pack: its read misses there, re-lists once, and finds the new one. */
    await expect(peerTab.read(first[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('first\n') });
    await expect(peerTab.read(second[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('second\n') });
  });

  it('runs one repack at a time across stores of one fence', async () => {
    const { provider } = rangedProvider();
    const first = storeOver(provider);
    const second = storeOver(provider);
    await first.writeLoose(['a', 'b'].map((name) => ({ type: 'blob', data: encoder.encode(`${name}\n`) })));

    const ran = await Promise.all([first.repack(true), second.repack(true)]);

    /* The second, queued behind the first, finds one pack and nothing loose left to fold. */
    expect(ran).toStrictEqual([true, false]);
    const written = await provider.readdir('.git/objects/pack');
    expect(written.filter((name) => name.endsWith('.pack'))).toHaveLength(1);
  });
});
