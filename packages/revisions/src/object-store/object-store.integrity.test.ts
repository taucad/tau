/**
 * The object store under the W2 review's findings: packs a repack writes are
 * checked by native git through the inline compute and the worker seam (p2,
 * p3), a repack aborts on any object it cannot read or hash, holds at most its
 * byte bound of resolved objects and one raw object at a time, replaces a
 * short file a dead writer left, sweeps what dead writers left, and does not
 * repack again for the same packs and writes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectComputeWorker, createInlineCompute, serveComputeWorker } from '#compute-worker/compute-worker.js';
import type { ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { digest, digestHex } from '#object-hash.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import type { GitFiles, ObjectStore, RepackOptions } from '#object-store/object-store.js';
import { buildPack } from '#object-store/pack-writer.js';
import { encodePackIndex, readPackIndex } from '#pack-reader/pack-index.js';
import type { GitObjectKind } from '#pack-reader/pack-reader.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const roots: string[] = [];
const providers: MemoryProvider[] = [];
const channels: MessageChannel[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
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
const git = (cwd: string, args: readonly string[], input?: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(execFileSync('git', args, { cwd, env: gitEnvironment, input, maxBuffer: 2 ** 28 }));

const temporary = async (prefix: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
};

const memory = (): MemoryProvider => {
  const provider = new MemoryProvider();
  providers.push(provider);
  return provider;
};

/* The store's files over a memory provider, with a range read the way OPFS reads one: a slice per call. */
const rangedFiles = (provider: MemoryProvider): GitFiles => ({
  ...gitFilesOf(provider, '.git'),
  readRange: async (path, offset, length) => {
    const whole = await provider.readFile(path);
    return whole.slice(offset, offset + length);
  },
});

const storeOver = (
  files: GitFiles,
  options: Readonly<{
    compute?: ComputeWorker;
    repack?: Partial<RepackOptions>;
    now?: () => number;
    name?: string;
  }> = {},
): ObjectStore =>
  createObjectStore({
    files,
    gitdir: '.git',
    compute: options.compute ?? createInlineCompute(),
    fenceName: options.name ?? 'integrity',
    repack: { retention: 60_000, ...options.repack },
    ...(options.now === undefined ? {} : { now: options.now }),
  });

const domPort = (port: MessageChannel['port1']): ComputePort => ({
  postMessage: (message, transfer) => {
    port.postMessage(message, transfer as unknown as readonly NodeTransferable[]);
  },
  addEventListener: (_type, listener) => {
    port.on('message', (data: unknown) => {
      listener({ data } as MessageEvent);
    });
  },
});

const remoteCompute = (): ComputeWorker => {
  const channel = new MessageChannel();
  channels.push(channel);
  serveComputeWorker(domPort(channel.port2));
  return connectComputeWorker(domPort(channel.port1));
};

const computes: ReadonlyArray<readonly [string, () => ComputeWorker]> = [
  ['the inline compute', createInlineCompute],
  ['the compute worker seam', remoteCompute],
];

const oidOf = (type: GitObjectKind, data: Uint8Array<ArrayBuffer>): string =>
  digestHex('sha1', new Uint8Array([...encoder.encode(`${type} ${String(data.byteLength)}\0`), ...data]));

/* Distinct bytes that do not compress away, so a byte bound means what it says. */
const noise = (seed: number, size: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(size);
  let state = seed * 2_654_435_761 + 1;
  for (let index = 0; index < size; index += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    bytes[index] = state % 256;
  }
  return bytes;
};

/* Copy a store's packs to a bare repository and have git verify each one but those named. */
const verifyWithGit = async (provider: MemoryProvider, except: ReadonlySet<string> = new Set()): Promise<string> => {
  const root = await temporary('tau-integrity-verify-');
  git(root, ['init', '-q', '--bare']);
  const names = await provider.readdir('.git/objects/pack');
  for (const name of names) {
    if (name.endsWith('.pack') || name.endsWith('.idx')) {
      // oxlint-disable-next-line no-await-in-loop -- a few files.
      await writeFile(join(root, 'objects', 'pack', name), await provider.readFile(`.git/objects/pack/${name}`));
    }
  }
  for (const name of names.filter((entry) => entry.endsWith('.idx') && !except.has(entry))) {
    expect(decoder.decode(git(root, ['verify-pack', join('objects', 'pack', name)]))).toBe('');
  }
  return root;
};

type Blob = Readonly<{ type: 'blob'; data: Uint8Array<ArrayBuffer> }>;

type NativeObject = Readonly<{ oid: string; type: GitObjectKind; data: Uint8Array<ArrayBuffer> }>;

const objectsOf = (root: string): NativeObject[] =>
  decoder
    .decode(git(root, ['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)']))
    .trim()
    .split('\n')
    .map((line) => line.split(' ') as [string, GitObjectKind])
    .map(([oid, type]) => ({ oid, type, data: git(root, ['cat-file', type, oid]) }));

/* A history of near-identical files, so a pack of it is mostly deltas. */
const history = async (): Promise<string> => {
  const root = await temporary('tau-integrity-repo-');
  git(root, ['init', '-q', '-b', 'main']);
  const lines = Array.from({ length: 300 }, (_, index) => `line ${String(index)} of a model parameter file\n`);
  for (let revision = 0; revision < 6; revision += 1) {
    lines[revision * 11] = `edited in revision ${String(revision)}\n`;
    // oxlint-disable-next-line no-await-in-loop -- one commit after another.
    await writeFile(join(root, 'model.scad'), lines.join(''));
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(join(root, `notes-${String(revision)}.md`), lines.slice(0, 40 + revision).join(''));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', `revision ${String(revision)}`]);
  }
  return root;
};

const expectEveryObject = async (store: ObjectStore, expected: readonly NativeObject[]): Promise<void> => {
  for (const object of expected) {
    // oxlint-disable-next-line no-await-in-loop -- one object at a time.
    const read = await store.read(object.oid);
    expect(read?.type).toBe(object.type);
    expect(read?.data).toStrictEqual(object.data);
  }
};

describe.runIf(gitToolchainOnPath)('a repack git verifies (W2 review p2)', { timeout: 30_000 }, () => {
  it.each(computes)('folds a pack of deep offset deltas git wrote, through %s', async (_, makeCompute) => {
    const root = await history();
    git(root, ['repack', '-adf', '-q', '--window=10', '--depth=50']);
    const provider = memory();
    const directory = join(root, '.git', 'objects', 'pack');
    for (const name of await readdir(directory)) {
      if (name.endsWith('.pack') || name.endsWith('.idx')) {
        // oxlint-disable-next-line no-await-in-loop -- a pack and its index.
        await provider.writeFile(`.git/objects/pack/${name}`, new Uint8Array(await readFile(join(directory, name))));
      }
    }
    const compute = makeCompute();
    const store = storeOver(rangedFiles(provider), { compute });
    const expected = objectsOf(root);
    await expectEveryObject(store, expected);
    const [extra] = await store.writeLoose([{ type: 'blob', data: encoder.encode('one more\n') }]);

    expect(await store.repack(true)).toBe(true);

    const verified = await verifyWithGit(provider);
    expect(git(verified, ['cat-file', 'blob', extra!])).toStrictEqual(encoder.encode('one more\n'));
    await expectEveryObject(storeOver(rangedFiles(provider), { compute, name: 'reader' }), expected);
  });

  it.each(computes)('reads a thin pack through loose bases and folds both, through %s', async (_, makeCompute) => {
    const root = await history();
    const thin = git(root, ['pack-objects', '--thin', '--revs', '--stdout', '-q'], 'HEAD\n^HEAD~2\n');
    /* Index the thin pack's own entries: git indexes it with its bases appended, which leaves their offsets as they are. */
    const fixed = decoder
      .decode(git(root, ['index-pack', '--stdin', '--fix-thin'], thin))
      .trim()
      .split('\t')
      .at(-1)!;
    const fixedIndex = join(root, '.git', 'objects', 'pack', `pack-${fixed}.idx`);
    const shown = decoder.decode(git(root, ['show-index'], new Uint8Array(await readFile(fixedIndex))));
    const entries = shown
      .trim()
      .split('\n')
      .map((line) => line.split(' ') as [string, string, string])
      .map(([offset, oid, crc]) => ({ oid, offset: Number(offset), crc32: Number.parseInt(crc.slice(1, -1), 16) }))
      .filter((entry) => entry.offset < thin.byteLength - 20);
    const checksum = [...thin.subarray(-20)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const provider = memory();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/pack-${checksum}.pack`, thin);
    await provider.writeFile(
      `.git/objects/pack/pack-${checksum}.idx`,
      await encodePackIndex(entries, checksum, createInlineCompute().sha1),
    );
    const compute = makeCompute();
    const store = storeOver(rangedFiles(provider), { compute });
    const all = objectsOf(root);
    const inThin = new Set(entries.map((entry) => entry.oid));
    const bases = all.filter((object) => !inThin.has(object.oid));
    /* Without its bases a thin entry that is a delta cannot be read. */
    const failing = await Promise.all(
      entries.map(async (entry) =>
        store.read(entry.oid).then(
          () => 0,
          () => 1,
        ),
      ),
    );
    expect(failing.reduce<number>((total, one) => total + one, 0)).toBeGreaterThan(0);

    await store.writeLoose(bases.map(({ type, data }) => ({ type, data })));
    await expectEveryObject(storeOver(rangedFiles(provider), { compute, name: 'with-bases' }), all);
    expect(await store.repack(true)).toBe(true);

    /* The thin pack stays for the window and git cannot verify a thin pack alone; the one the repack wrote it can. */
    const verified = await verifyWithGit(provider, new Set([`pack-${checksum}.idx`]));
    for (const object of all) {
      expect(git(verified, ['cat-file', object.type, object.oid])).toStrictEqual(object.data);
    }
    await expectEveryObject(storeOver(rangedFiles(provider), { compute, name: 'after' }), all);
  });
});

describe('a repack that cannot trust an object', () => {
  it.each([
    [
      'an object whose bytes hash to another id',
      async (compute: ComputeWorker) => compute.deflate(encoder.encode('blob 5\0evil\n')),
      /another object's bytes/u,
    ],
    ['an object that is not zlib', async () => encoder.encode('not zlib at all'), undefined],
  ])('writes and retires nothing over %s', async (_, corrupt, message) => {
    const provider = memory();
    const store = storeOver(rangedFiles(provider));
    const oids = await store.writeLoose(['a\n', 'b\n'].map((text) => ({ type: 'blob', data: encoder.encode(text) })));
    const good = encoder.encode('good\n');
    const victim = oidOf('blob', good);
    await provider.mkdir(`.git/objects/${victim.slice(0, 2)}`, { recursive: true });
    await provider.writeFile(
      `.git/objects/${victim.slice(0, 2)}/${victim.slice(2)}`,
      await corrupt(createInlineCompute()),
    );

    await expect(store.repack(true)).rejects.toThrow(message);

    expect(await provider.exists('.git/objects/pack')).toBe(false);
    expect(await provider.exists('.git/objects/tau-retired.json')).toBe(false);
    await expect(store.read(oids[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('a\n') });
  });

  it('leaves a write that asked for the repack standing, and the store as it was', async () => {
    const provider = memory();
    const store = storeOver(rangedFiles(provider), { repack: { maxLoose: 2 } });
    const victim = oidOf('blob', encoder.encode('good\n'));
    await provider.mkdir(`.git/objects/${victim.slice(0, 2)}`, { recursive: true });
    await provider.writeFile(`.git/objects/${victim.slice(0, 2)}/${victim.slice(2)}`, encoder.encode('not zlib'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await store.writeLoose(['a\n', 'b\n'].map((text) => ({ type: 'blob', data: encoder.encode(text) })));

    await expect(store.repackIfDue()).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('A repack was abandoned'));
    expect(await provider.exists('.git/objects/pack')).toBe(false);
  });
});

describe('the repack bound (charter D7)', () => {
  /* Count the raw bytes the compute holds at once: everything a repack hands it to deflate. */
  const measured = (): Readonly<{
    compute: ComputeWorker;
    peak: () => number;
    deflates: () => number;
    reset: () => void;
  }> => {
    const inline = createInlineCompute();
    let resident = 0;
    let peak = 0;
    let deflates = 0;
    return {
      compute: {
        ...inline,
        deflate: async (raw) => {
          deflates += 1;
          resident += raw.byteLength;
          peak = Math.max(peak, resident);
          try {
            return await inline.deflate(raw);
          } finally {
            resident -= raw.byteLength;
          }
        },
      },
      peak: () => peak,
      deflates: () => deflates,
      reset: () => {
        peak = 0;
        deflates = 0;
      },
    };
  };

  it('folds at most its bound of resolved bytes, one raw object at a time, and leaves the rest loose', async () => {
    const provider = memory();
    const { compute, peak, reset } = measured();
    const store = storeOver(rangedFiles(provider), { compute, repack: { maxPackBytes: 5000 } });
    const blobs = Array.from({ length: 12 }, (_, index) => noise(index + 1, 1000));
    const oids = await store.writeLoose(blobs.map((data) => ({ type: 'blob', data })));
    reset();

    expect(await store.repack(true)).toBe(true);

    expect(peak()).toBeLessThanOrEqual(1000);
    const listed = await provider.readdir('.git/objects/pack');
    const packIndex = listed.find((name) => name.endsWith('.idx'));
    const folded = readPackIndex(await provider.readFile(`.git/objects/pack/${packIndex!}`));
    expect(folded.count).toBe(5);
    const record = JSON.parse(await provider.readFile('.git/objects/tau-retired.json', 'utf8')) as {
      retired: Array<{ path: string }>;
    };
    expect(record.retired).toHaveLength(5);
    /* Every object still reads: five from the pack, seven loose that wait for the next repack. */
    for (const [index, oid] of oids.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- in turn.
      await expect(store.read(oid)).resolves.toStrictEqual({ type: 'blob', data: blobs[index] });
    }
  });

  it('takes a pack whole or not at all, and copies its whole entries without deflating them again', async () => {
    const provider = memory();
    const { compute, deflates, reset } = measured();
    const store = storeOver(rangedFiles(provider), { compute, repack: { maxPackBytes: 2500 } });
    const groups = [0, 1, 2].map((group) =>
      [0, 1].map((index): Blob => ({ type: 'blob', data: noise(group * 10 + index + 1, 600) })),
    );
    for (const group of groups) {
      // oxlint-disable-next-line no-await-in-loop -- one pack after another.
      const built = await buildPack(
        group.map((object) => ({ oid: oidOf(object.type, object.data), ...object })),
        compute,
      );
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await store.addPack(built.pack);
    }
    reset();

    expect(await store.repack(true)).toBe(true);

    /* Two packs of 1200 bytes fit 2500; the third would pass it and is left whole. */
    expect(deflates()).toBe(0);
    const names = await provider.readdir('.git/objects/pack');
    const counts = await Promise.all(
      names
        .filter((name) => name.endsWith('.idx'))
        .map(async (name) => readPackIndex(await provider.readFile(`.git/objects/pack/${name}`)).count),
    );
    expect(counts.toSorted((left, right) => left - right)).toStrictEqual([2, 2, 2, 4]);
    for (const object of groups.flat()) {
      // oxlint-disable-next-line no-await-in-loop -- in turn.
      await expect(store.read(oidOf(object.type, object.data))).resolves.toStrictEqual(object);
    }
  });
});

describe('the files a dead writer leaves', () => {
  it('replaces a short pack under the name a repack writes', async () => {
    const objects = ['first\n', 'second\n'].map((text): Blob => ({ type: 'blob', data: encoder.encode(text) }));
    const written = memory();
    const writer = storeOver(rangedFiles(written));
    await writer.writeLoose(objects);
    await writer.repack(true);
    const writtenNames = await written.readdir('.git/objects/pack');
    const name = writtenNames.find((entry) => entry.endsWith('.pack'));
    const whole = await written.readFile(`.git/objects/pack/${name!}`);

    const provider = memory();
    const store = storeOver(rangedFiles(provider));
    await store.writeLoose(objects);
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/${name!}`, whole.slice(0, 30));

    expect(await store.repack(true)).toBe(true);

    expect(await provider.readFile(`.git/objects/pack/${name!}`)).toStrictEqual(whole);
    const reader = storeOver(rangedFiles(provider), { name: 'reader' });
    await expect(reader.read(oidOf('blob', objects[0]!.data))).resolves.toStrictEqual(objects[0]);
  });

  it.each([
    ['inside the window', 0, true],
    ['past the window', 61_000, false],
  ])('sweeps partial writes and packs without an index only %s', async (_, ahead, kept) => {
    const provider = memory();
    const store = storeOver(rangedFiles(provider), { now: () => Date.now() + ahead });
    const [oid] = await store.writeLoose([{ type: 'blob', data: encoder.encode('kept\n') }]);
    const leftovers = [
      `.git/objects/pack/pack-${'d'.repeat(40)}.pack`,
      `.git/objects/pack/pack-${'e'.repeat(40)}.idx.0f.partial`,
      `.git/objects/${oid!.slice(0, 2)}/${'f'.repeat(38)}.0f.partial`,
    ];
    await provider.mkdir('.git/objects/pack', { recursive: true });
    for (const path of leftovers) {
      // oxlint-disable-next-line no-await-in-loop -- a few files.
      await provider.writeFile(path, encoder.encode('left by a dead writer'));
    }

    await store.repack(false);

    for (const path of leftovers) {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      expect(await provider.exists(path)).toBe(kept);
    }
    await expect(store.read(oid!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('kept\n') });
  });
});

describe('repack decisions', () => {
  const retiredReads = (provider: MemoryProvider): (() => number) => {
    const read = vi.spyOn(provider, 'readFile');
    return () => read.mock.calls.filter(([path]) => path === '.git/objects/tau-retired.json').length;
  };

  it('does not repack again for loose writes another store already folded', async () => {
    const provider = memory();
    const writer = storeOver(rangedFiles(provider), { repack: { maxLoose: 2 } });
    const other = storeOver(rangedFiles(provider), { name: 'integrity-other' });
    await writer.writeLoose(['a\n', 'b\n', 'c\n'].map((text) => ({ type: 'blob', data: encoder.encode(text) })));
    await other.repack(true);
    const reads = retiredReads(provider);

    await expect(writer.repackIfDue()).resolves.toBe(false);
    const decided = reads();
    await expect(writer.repackIfDue()).resolves.toBe(false);

    expect(decided).toBeGreaterThan(0);
    expect(reads()).toBe(decided);
  });

  it('counts only live packs, not the ones a repack retired that wait out the window', async () => {
    const provider = memory();
    const store = storeOver(rangedFiles(provider), { repack: { maxPacks: 2 } });
    const compute = createInlineCompute();
    for (const text of ['a\n', 'b\n', 'c\n']) {
      const data = encoder.encode(text);
      // oxlint-disable-next-line no-await-in-loop -- one pack after another.
      const built = await buildPack([{ oid: oidOf('blob', data), type: 'blob', data }], compute);
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await store.addPack(built.pack);
    }
    await expect(store.repackIfDue()).resolves.toBe(true);
    /* A miss relists the directory, where the three retired packs still sit beside the new one. */
    await store.read('0'.repeat(40));
    const listed = await provider.readdir('.git/objects/pack');
    expect(listed.filter((name) => name.endsWith('.idx'))).toHaveLength(4);
    const reads = retiredReads(provider);

    await expect(store.repackIfDue()).resolves.toBe(false);

    expect(reads()).toBe(0);
  });

  it('drops a pack it read whole once no read has touched it for two seconds', async () => {
    const provider = memory();
    const writer = storeOver(gitFilesOf(provider, '.git'));
    const oids = await writer.writeLoose(['a\n', 'b\n'].map((text) => ({ type: 'blob', data: encoder.encode(text) })));
    await writer.repack(true);
    const reader = storeOver(gitFilesOf(provider, '.git'), { name: 'whole' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await reader.read(oids[0]!);
    await reader.read(oids[1]!);
    expect(reader.counters.wholePackLoads).toBe(1);
    vi.advanceTimersByTime(1500);
    await reader.read(oids[0]!);
    expect(reader.counters.wholePackLoads).toBe(1);
    vi.advanceTimersByTime(2001);
    await reader.read(oids[1]!);

    expect(reader.counters.wholePackLoads).toBe(2);
  });
});

describe('a corrupt pack (W2 re-review 2)', () => {
  it('is left out with one warning, while loose and other objects read and writes land', async () => {
    const provider = memory();
    const writer = storeOver(gitFilesOf(provider, '.git'));
    /* A pack as a fetch brings it: its objects are nowhere else. */
    const fetched = ['a\n', 'b\n'].map((text): Blob => ({ type: 'blob', data: encoder.encode(text) }));
    const packed = fetched.map(({ type, data }) => oidOf(type, data));
    const built = await buildPack(
      fetched.map((object, index) => ({ oid: packed[index]!, ...object })),
      createInlineCompute(),
    );
    await writer.addPack(built.pack);
    await expect(writer.read(packed[0]!)).resolves.toStrictEqual(fetched[0]);
    const [unrelated] = await writer.writeLoose([{ type: 'blob', data: encoder.encode('unrelated\n') }]);
    const listed = await provider.readdir('.git/objects/pack');
    const packIndex = `.git/objects/pack/${listed.find((name) => name.endsWith('.idx'))!}`;
    const flipped = new Uint8Array(await provider.readFile(packIndex));
    flipped[8 + 256 * 4 + 5] = 255 - flipped[8 + 256 * 4 + 5]!;
    await provider.writeFile(packIndex, flipped);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const store = storeOver(gitFilesOf(provider, '.git'), { name: 'corrupt' });

    await expect(store.read(unrelated!)).resolves.toStrictEqual({
      type: 'blob',
      data: encoder.encode('unrelated\n'),
    });
    await expect(store.has(unrelated!)).resolves.toBe(true);
    /* The corrupt pack's objects are simply not held, so a fetch that brings them again lands them. */
    await expect(store.read(packed[0]!)).resolves.toBeUndefined();
    await expect(store.has(packed[1]!)).resolves.toBe(false);
    const [fresh] = await store.writeLoose([{ type: 'blob', data: encoder.encode('fresh\n') }]);
    await expect(store.read(fresh!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('fresh\n') });
    await expect(store.writeLoose([{ type: 'blob', data: encoder.encode('a\n') }])).resolves.toStrictEqual([packed[0]]);
    await expect(store.read(packed[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('a\n') });

    const warned = warn.mock.calls.filter(([message]) => String(message).includes('left unread'));
    expect(warned).toHaveLength(1);
    expect(String(warned[0]![0])).toMatch(/checksum/u);
  });
});

describe('a repack and a loose object larger than its bound (W2 re-review 3)', () => {
  it('passes over the large object and still folds the small ones after it', async () => {
    const provider = memory();
    const store = storeOver(rangedFiles(provider), { repack: { maxPackBytes: 3000 } });
    const large = noise(99, 5000);
    const small = Array.from({ length: 6 }, (_, index) => noise(index + 1, 300));
    const [largeOid] = await store.writeLoose([{ type: 'blob', data: large }]);
    await store.writeLoose(small.map((data) => ({ type: 'blob', data })));

    expect(await store.repack(true)).toBe(true);

    const listed = await provider.readdir('.git/objects/pack');
    const packIndex = listed.find((name) => name.endsWith('.idx'));
    const folded = readPackIndex(await provider.readFile(`.git/objects/pack/${packIndex!}`));
    expect(folded.count).toBe(6);
    expect(folded.offsetOf(largeOid!)).toBeUndefined();
    await expect(store.read(largeOid!)).resolves.toStrictEqual({ type: 'blob', data: large });
  });
});

describe('a loose object that is missing for a moment (W2 re-review 4)', () => {
  it('is read again once before the store answers that it does not hold it', async () => {
    const provider = memory();
    const writer = storeOver(gitFilesOf(provider, '.git'));
    const [oid] = await writer.writeLoose([{ type: 'blob', data: encoder.encode('briefly gone\n') }]);
    const files = gitFilesOf(provider, '.git');
    let misses = 0;
    const flickering: GitFiles = {
      ...files,
      readFile: (async (path: string, encoding?: 'utf8') => {
        if (path.endsWith(oid!.slice(2)) && misses === 0) {
          misses += 1;
          throw Object.assign(new Error('gone for a moment'), { code: 'ENOENT' });
        }
        return encoding === 'utf8' ? files.readFile(path, 'utf8') : files.readFile(path);
      }) as GitFiles['readFile'],
    };

    await expect(storeOver(flickering, { name: 'flicker' }).read(oid!)).resolves.toStrictEqual({
      type: 'blob',
      data: encoder.encode('briefly gone\n'),
    });
    expect(misses).toBe(1);
  });
});

describe('pack index checks (W2 re-review 5)', () => {
  it('hashes an index once per path, size and time in this document, on the compute worker', async () => {
    const provider = memory();
    const writer = storeOver(gitFilesOf(provider, '.git'));
    const [oid] = await writer.writeLoose([{ type: 'blob', data: encoder.encode('indexed\n') }]);
    await writer.repack(true);
    const listed = await provider.readdir('.git/objects/pack');
    const packIndex = `.git/objects/pack/${listed.find((name) => name.endsWith('.idx'))!}`;
    const stored = await provider.readFile(packIndex);
    const inline = createInlineCompute();
    let indexHashes = 0;
    const counting: ComputeWorker = {
      ...inline,
      sha1: async (bytes) => {
        if (bytes.byteLength === stored.byteLength - 20) {
          indexHashes += 1;
        }
        return inline.sha1(bytes);
      },
    };
    const open = async (name: string): Promise<void> => {
      const store = storeOver(gitFilesOf(provider, '.git'), { compute: counting, name });
      await expect(store.read(oid!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('indexed\n') });
    };

    await open('first');
    await open('second');
    expect(indexHashes).toBe(1);

    /* The same bytes written again are a new file: checked afresh. */
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await provider.writeFile(packIndex, stored);
    await open('third');
    expect(indexHashes).toBe(2);
  });
});

describe('a pack whose index is whole but whose bytes are not (W2 PR review)', () => {
  /* Two packs as fetches bring them, and one loose object: what each store below starts from. */
  const seeded = async (): Promise<
    Readonly<{
      provider: MemoryProvider;
      corrupted: string;
      corruptBytes: Uint8Array<ArrayBuffer>;
      inCorrupt: string[];
      inOther: string;
      loose: string;
    }>
  > => {
    const provider = memory();
    const writer = storeOver(rangedFiles(provider));
    const fetch = async (
      texts: readonly string[],
    ): Promise<Readonly<{ name: string; oids: string[]; pack: Uint8Array<ArrayBuffer> }>> => {
      const objects = texts.map((text): Blob => ({ type: 'blob', data: encoder.encode(text) }));
      const oids = objects.map(({ type, data }) => oidOf(type, data));
      const built = await buildPack(
        objects.map((object, index) => ({ oid: oids[index]!, ...object })),
        createInlineCompute(),
      );
      return { name: await writer.addPack(new Uint8Array(built.pack)), oids, pack: built.pack };
    };
    const corrupt = await fetch(['a\n', 'b\n']);
    const other = await fetch(['c\n']);
    const [loose] = await writer.writeLoose([{ type: 'blob', data: encoder.encode('unrelated\n') }]);
    return {
      provider,
      corrupted: corrupt.name,
      corruptBytes: corrupt.pack,
      inCorrupt: corrupt.oids,
      inOther: other.oids[0]!,
      loose: loose!,
    };
  };

  /* Damage a pack's bytes and leave its index valid: its last trailer byte, or an entry re-signed so only it is wrong. */
  const damage = async (provider: MemoryProvider, name: string, where: 'trailer' | 'entry'): Promise<void> => {
    const packPath = `.git/objects/pack/${name}.pack`;
    const pack = new Uint8Array(await provider.readFile(packPath));
    if (where === 'trailer') {
      pack[pack.byteLength - 1] = 255 - pack[pack.byteLength - 1]!;
      await provider.writeFile(packPath, pack);
      return;
    }
    /* The first entry's zlib stream, two bytes past its header, then the pack and index signed again. */
    pack[14] = 255 - pack[14]!;
    const trailer = digest('sha1', pack.subarray(0, pack.byteLength - 20));
    pack.set(trailer, pack.byteLength - 20);
    await provider.writeFile(packPath, pack);
    const indexPath = `.git/objects/pack/${name}.idx`;
    const stored = new Uint8Array(await provider.readFile(indexPath));
    stored.set(trailer, stored.byteLength - 40);
    stored.set(digest('sha1', stored.subarray(0, stored.byteLength - 20)), stored.byteLength - 20);
    await provider.writeFile(indexPath, stored);
  };

  it.each(['trailer', 'entry'] as const)(
    'drops the pack on its first bad read (%s), so other objects read and its own are fetched again',
    async (where) => {
      const { provider, corrupted, inCorrupt, inOther, loose } = await seeded();
      await damage(provider, corrupted, where);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = storeOver(rangedFiles(provider), { name: `bytes-${where}` });
      await expect(store.has(inCorrupt[0]!)).resolves.toBe(true);

      await expect(store.read(loose)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('unrelated\n') });
      await expect(store.read(inOther)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('c\n') });
      await expect(store.read(inCorrupt[0]!)).resolves.toBeUndefined();

      /* No longer held, so a fetch wants them again and a write lands them. */
      await expect(store.has(inCorrupt[0]!)).resolves.toBe(false);
      await expect(store.has(inCorrupt[1]!)).resolves.toBe(false);
      await expect(store.has(inOther)).resolves.toBe(true);
      await expect(store.writeLoose([{ type: 'blob', data: encoder.encode('a\n') }])).resolves.toStrictEqual([
        inCorrupt[0],
      ]);
      await expect(store.read(inCorrupt[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('a\n') });
      const dropped = warn.mock.calls.filter(([message]) =>
        String(message).includes(`${corrupted}.pack is left unread`),
      );
      expect(dropped).toHaveLength(1);
    },
  );

  it.each(['trailer', 'entry'] as const)(
    'heals a dropped pack (%s) when the same pack arrives again under the same name and size',
    async (where) => {
      const { provider, corrupted, corruptBytes, inCorrupt } = await seeded();
      await damage(provider, corrupted, where);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = storeOver(rangedFiles(provider), { name: `heal-${where}` });
      await expect(store.read(inCorrupt[0]!)).resolves.toBeUndefined();

      await expect(store.addPack(new Uint8Array(corruptBytes))).resolves.toBe(corrupted);

      expect(await provider.readFile(`.git/objects/pack/${corrupted}.pack`)).toStrictEqual(corruptBytes);
      await expect(store.has(inCorrupt[1]!)).resolves.toBe(true);
      await expect(store.read(inCorrupt[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('a\n') });
      await expect(store.read(inCorrupt[1]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('b\n') });
      const fresh = storeOver(rangedFiles(provider), { name: `healed-${where}` });
      await expect(fresh.read(inCorrupt[1]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('b\n') });
    },
  );

  it('heals a pack refused for a bad index when the same pack arrives again under the same name and size', async () => {
    const { provider, corrupted, corruptBytes, inCorrupt } = await seeded();
    const indexPath = `.git/objects/pack/${corrupted}.idx`;
    const whole = await provider.readFile(indexPath);
    const flipped = new Uint8Array(whole);
    flipped[8 + 256 * 4 + 5] = 255 - flipped[8 + 256 * 4 + 5]!;
    await provider.writeFile(indexPath, flipped);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = storeOver(rangedFiles(provider), { name: 'heal-index' });
    await expect(store.has(inCorrupt[0]!)).resolves.toBe(false);

    await expect(store.addPack(new Uint8Array(corruptBytes))).resolves.toBe(corrupted);

    expect(await provider.readFile(indexPath)).toStrictEqual(whole);
    await expect(store.read(inCorrupt[0]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('a\n') });
    const fresh = storeOver(rangedFiles(provider), { name: 'healed-index' });
    await expect(fresh.read(inCorrupt[1]!)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('b\n') });
  });

  it('repacks around a pack it finds corrupt, folding the rest and retiring nothing of it', async () => {
    const { provider, corrupted, inOther, loose } = await seeded();
    await damage(provider, corrupted, 'entry');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = storeOver(rangedFiles(provider), { name: 'bytes-repack' });

    expect(await store.repack(true)).toBe(true);

    const record = JSON.parse(await provider.readFile('.git/objects/tau-retired.json', 'utf8')) as {
      retired: Array<{ path: string }>;
    };
    const retired = record.retired.map((entry) => entry.path);
    expect(retired.some((path) => path.includes(corrupted))).toBe(false);
    expect(retired).toContain(`.git/objects/${loose.slice(0, 2)}/${loose.slice(2)}`);
    await expect(store.read(inOther)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('c\n') });
    await expect(store.read(loose)).resolves.toStrictEqual({ type: 'blob', data: encoder.encode('unrelated\n') });
  });
});
