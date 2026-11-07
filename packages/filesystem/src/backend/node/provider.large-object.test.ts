/**
 * A batch write that names a large object by its id (EQ13, W11.3).
 *
 * The provider resolves the id against the store its authority gave the root,
 * clones (or copies) the object into the write's temp sibling, syncs and
 * renames it, and answers the id it verified by one hashed read-back. A root
 * with no store, an object the store lacks, or one of the wrong size is
 * refused before anything is written.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '#backend/node/provider.js';
import { applyChangesetToProvider } from '#changeset-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { nodeFsRequestSchema, nodeFsProtocolVersion } from '#backend/node/protocol.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

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
    expect(stats.mode % 0o1000).toBe(0o644);
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
    expect(stats.mode % 0o1000).toBe(0o755);
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

  it('should fail verification when the stored bytes are not the object their name says', async () => {
    const { root, store } = await arrange();
    await fs.writeFile(join(store, oid.slice(0, 2), oid.slice(2, 4), oid), new Uint8Array(content.byteLength));
    const provider = new NodeFsProvider(root, { largeObjectStore: store });

    const [receipt] = await provider.applyBatch([
      { op: 'write', path: 'x.bin', data: { largeObject: oid, size: content.byteLength } },
    ]);

    expect(receipt?.outcome).not.toBe('applied');
    expect(receipt?.largeObject).toBeUndefined();
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

  it('should carry the source and its verified receipt across the wire at protocol 11', () => {
    expect(nodeFsProtocolVersion).toBe(11);
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
