/**
 * A batch write that names a large object by its id (EQ13, W11.3).
 *
 * The provider resolves the id against the store its authority gave the root,
 * clones (or copies) the object into the write's temp sibling, syncs and
 * hashes the sibling through its own handle before renaming it, and answers
 * the id it verified. A root
 * with no store, an object the store lacks, or one of the wrong size is
 * refused before anything is written.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeFsProvider } from '#backend/node/provider.js';
import { applyChangesetToProvider } from '#changeset-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { nodeFsRequestSchema, nodeFsProtocolVersion } from '#backend/node/protocol.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

/*
 * The permission bits a writable file reports. Windows keeps no POSIX bits,
 * only a read-only attribute: Node reports every writable file as 0o666 and a
 * read-only one as 0o444, whatever mode or umask it was created under.
 */
const writable = (posix: number): number => (process.platform === 'win32' ? 0o666 : posix);

const content = new Uint8Array(64 * 1024).map((_, index) => index % 251);
const oid = createHash('sha256').update(content).digest('hex');

/** A checkout root and a store holding one object. */
const arrange = async (): Promise<Readonly<{ root: string; store: string }>> => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-large-object-')));
  roots.push(base);
  const root = join(base, 'checkout');
  const store = join(base, 'store');
  await fs.mkdir(join(store, oid.slice(0, 2), oid.slice(2, 4)), { recursive: true });
  await fs.mkdir(root);
  await fs.writeFile(join(store, oid.slice(0, 2), oid.slice(2, 4), oid), content);
  return { root, store };
};

describe('NodeFsProvider large-object writes (EQ13)', () => {
  it('should clone the object into place and answer the id it verified', async () => {
    const { root, store } = await arrange();
    const provider = new NodeFsProvider(root, { largeObjectStore: store });
    expect(provider.capabilities.largeObjectSources).toBe(true);

    const [receipt] = await provider.applyBatch([
      { op: 'write', path: 'models/part.step', data: { largeObject: oid, size: content.byteLength }, create: true },
    ]);

    expect(receipt).toMatchObject({
      outcome: 'applied',
      created: true,
      largeObject: { largeObject: oid, size: content.byteLength },
    });
    const landed = await fs.readFile(join(root, 'models', 'part.step'));
    const stats = await fs.stat(join(root, 'models', 'part.step'));
    const names = await fs.readdir(join(root, 'models'));
    expect(new Uint8Array(landed)).toStrictEqual(content);
    expect(stats.mode % 0o1000).toBe(writable(0o644));
    expect(names.filter((name) => name.endsWith('.tmp'))).toStrictEqual([]);
  });

  it('should replace an existing file, keeping its mode', async () => {
    const { root, store } = await arrange();
    await fs.writeFile(join(root, 'run.bin'), 'pointer');
    await fs.chmod(join(root, 'run.bin'), 0o755);
    const provider = new NodeFsProvider(root, { largeObjectStore: () => store });

    const [receipt] = await provider.applyBatch([
      { op: 'write', path: 'run.bin', data: { largeObject: oid, size: content.byteLength } },
    ]);

    expect(receipt?.outcome).toBe('applied');
    const landed = await fs.readFile(join(root, 'run.bin'));
    const stats = await fs.stat(join(root, 'run.bin'));
    expect(new Uint8Array(landed)).toStrictEqual(content);
    expect(stats.mode % 0o1000).toBe(writable(0o755));
  });

  it('should refuse, writing nothing, an object the store lacks or of another size, or a root with no store', async () => {
    const { root, store } = await arrange();
    const missing = 'f'.repeat(64);
    const provider = new NodeFsProvider(root, { largeObjectStore: store });
    const storeless = new NodeFsProvider(root, { largeObjectStore: () => undefined });

    const receipts = await provider.applyBatch([
      { op: 'write', path: 'a.bin', data: { largeObject: missing, size: 1 } },
      { op: 'write', path: 'b.bin', data: { largeObject: oid, size: content.byteLength + 1 } },
      { op: 'write', path: 'c.bin', data: { largeObject: '../../etc', size: 1 } },
    ]);
    const [unstored] = await storeless.applyBatch([
      { op: 'write', path: 'd.bin', data: { largeObject: oid, size: content.byteLength } },
    ]);

    expect(receipts.map(({ outcome }) => outcome)).toStrictEqual(['failed', 'failed', 'failed']);
    expect(receipts.map(({ error }) => (error as { code?: string }).code)).toStrictEqual([
      'ENOENT',
      'EINVAL',
      'EINVAL',
    ]);
    expect(unstored).toMatchObject({ outcome: 'failed', error: { code: 'EINVAL' } });
    expect(await fs.readdir(root)).toStrictEqual([]);
  });

  it('should refuse a stored object that does not hash to its id before the rename, leaving the file as it was', async () => {
    const { root, store } = await arrange();
    await fs.writeFile(join(store, oid.slice(0, 2), oid.slice(2, 4), oid), new Uint8Array(content.byteLength));
    await fs.writeFile(join(root, 'x.bin'), 'the pointer the checkout holds\n');
    const provider = new NodeFsProvider(root, { largeObjectStore: store });

    const [receipt] = await provider.applyBatch([
      { op: 'write', path: 'x.bin', data: { largeObject: oid, size: content.byteLength } },
    ]);

    expect(receipt).toMatchObject({ outcome: 'failed', error: { code: 'EINVAL' } });
    expect(receipt?.largeObject).toBeUndefined();
    expect(await fs.readFile(join(root, 'x.bin'), 'utf8')).toBe('the pointer the checkout holds\n');
    expect(await fs.readdir(root)).toStrictEqual(['x.bin']);
  });

  it('should answer uncertain, never applied, when the published entry is not the file it hashed', async () => {
    const { root, store } = await arrange();
    const provider = new NodeFsProvider(root, { largeObjectStore: store });
    const rename = fs.rename.bind(fs);
    let refusal: string | undefined;
    /* Another writer's entry lands at the path between this rename and its check. */
    const renamed = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(to).endsWith('swapped.bin')) {
        await fs.writeFile(join(root, 'other.tmp'), content);
        try {
          await rename(join(root, 'other.tmp'), to);
        } catch (error) {
          /* Windows: the provider holds the published file open for its flush, and refuses a rename over a held entry. */
          refusal = (error as NodeJS.ErrnoException).code;
          await fs.rm(join(root, 'other.tmp'));
        }
      }
    });
    try {
      const [receipt] = await provider.applyBatch([
        { op: 'write', path: 'swapped.bin', data: { largeObject: oid, size: content.byteLength }, create: true },
      ]);

      if (process.platform === 'win32') {
        /* The other writer never published, so the entry is the one hashed, and its id is answered. */
        expect(refusal).toBe('EPERM');
        expect(receipt).toMatchObject({
          outcome: 'applied',
          largeObject: { largeObject: oid, size: content.byteLength },
        });
      } else {
        expect(refusal).toBeUndefined();
        expect(receipt).toMatchObject({ outcome: 'uncertain', error: { code: 'WRITE_VERIFICATION_FAILED' } });
        expect(receipt?.largeObject).toBeUndefined();
      }
    } finally {
      renamed.mockRestore();
    }
  });

  it("should give a new file the umask's default mode, never the stored object's", async () => {
    const { root, store } = await arrange();
    await fs.chmod(join(store, oid.slice(0, 2), oid.slice(2, 4), oid), 0o444);
    const provider = new NodeFsProvider(root, { largeObjectStore: store });
    const previous = process.umask(0o077);
    let receipts: Awaited<ReturnType<typeof provider.applyBatch>>;
    try {
      receipts = await provider.applyBatch([
        { op: 'write', path: 'private.bin', data: { largeObject: oid, size: content.byteLength }, create: true },
      ]);
    } finally {
      process.umask(previous);
    }
    const [defaulted] = await provider.applyBatch([
      { op: 'write', path: 'shared.bin', data: { largeObject: oid, size: content.byteLength }, create: true },
    ]);

    expect(receipts[0]?.outcome).toBe('applied');
    expect(defaulted?.outcome).toBe('applied');
    const [privateStats, sharedStats, storedStats] = await Promise.all([
      fs.stat(join(root, 'private.bin')),
      fs.stat(join(root, 'shared.bin')),
      fs.stat(join(store, oid.slice(0, 2), oid.slice(2, 4), oid)),
    ]);
    expect(privateStats.mode % 0o1000).toBe(writable(0o600));
    // oxlint-disable-next-line eslint/no-bitwise -- a mode is a bit set.
    expect(sharedStats.mode % 0o1000).toBe(writable(0o666 & ~previous));
    expect(new Uint8Array(await fs.readFile(join(root, 'shared.bin')))).toStrictEqual(content);
    /* Git LFS stores objects read-only; the store's copy is never made writable. */
    expect(storedStats.mode % 0o1000).toBe(0o444);
  });

  it('should be refused before any I/O by a provider without the capability', async () => {
    const memory = new MemoryProvider();
    const { root } = await arrange();
    const plain = new NodeFsProvider(root);
    expect(plain.capabilities.largeObjectSources).toBeUndefined();

    await expect(
      applyChangesetToProvider(memory, {
        entries: [{ op: 'write', path: 'a.bin', data: { largeObject: oid, size: 1 } }],
      }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
    const [refused] = await memory.applyBatch([{ op: 'write', path: 'a.bin', data: { largeObject: oid, size: 1 } }]);
    expect(refused).toMatchObject({ outcome: 'failed', error: { code: 'EINVAL' } });
    expect(await memory.exists('a.bin')).toBe(false);
  });

  it('should carry the source and its verified receipt across the wire from protocol 11', () => {
    /* Introduced at 11; 12 (W7.4) adds host-side import and keeps it. */
    expect(nodeFsProtocolVersion).toBeGreaterThanOrEqual(11);
    const parsed = nodeFsRequestSchema.safeParse({
      v: nodeFsProtocolVersion,
      id: 1,
      root: '/r',
      op: 'applyBatch',
      entries: [{ op: 'write', path: 'a.bin', data: { largeObject: oid, size: 3 } }],
    });
    expect(parsed.success).toBe(true);
    const path = nodeFsRequestSchema.safeParse({
      v: nodeFsProtocolVersion,
      id: 1,
      root: '/r',
      op: 'applyBatch',
      entries: [{ op: 'write', path: 'a.bin', data: { largeObject: '.git/lfs/objects/x', size: 3 } }],
    });
    expect(path.success).toBe(false);
  });
});
