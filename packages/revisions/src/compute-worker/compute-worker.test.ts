import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { MessageChannel } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it } from 'vitest';
import {
  connectComputeWorker,
  createInlineCompute,
  openComputeConnection,
  serveComputeWorker,
} from '#compute-worker/compute-worker.js';
import type { ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { readPackIndex } from '#pack-reader/pack-index.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import { buildPack, indexBuiltPack } from '#object-store/pack-writer.js';
import { digestHex } from '#object-hash.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const channels: MessageChannel[] = [];

const roots: string[] = [];
const providers: MemoryProvider[] = [];

afterEach(async () => {
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
const git = (cwd: string, args: readonly string[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(execFileSync('git', args, { cwd, env: gitEnvironment }));

/* Node's ports speak `on('message')`; the seam takes the DOM shape. */
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

/* The store's side of a seam served over a real message channel. */
const remoteCompute = (): ComputeWorker => {
  const channel = new MessageChannel();
  channels.push(channel);
  serveComputeWorker(domPort(channel.port2));
  return connectComputeWorker(domPort(channel.port1));
};

/* Copy a store's packs into a bare repository native git can check. */
const verifiedByGit = async (provider: MemoryProvider): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-compute-seam-'));
  roots.push(root);
  git(root, ['init', '-q', '--bare']);
  for (const name of await provider.readdir('.git/objects/pack')) {
    if (name.endsWith('.pack') || name.endsWith('.idx')) {
      // oxlint-disable-next-line no-await-in-loop -- a pack and its index.
      await writeFile(join(root, 'objects', 'pack', name), await provider.readFile(`.git/objects/pack/${name}`));
    }
  }
  return root;
};

describe.runIf(gitToolchainOnPath)('packs written through the compute seam', { timeout: 30_000 }, () => {
  /*
   * W2 review p3: the seam transferred the caller's own buffer, so a pack
   * writer that deflated an object and then read it again found it detached
   * and wrote a corrupt pack. A copy is transferred now; the caller's bytes
   * stay whole.
   */
  it('writes packs git verifies, and leaves every input whole for its next use', async () => {
    const compute = remoteCompute();
    const data = encoder.encode('hello world\n');
    const oid = digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(data.byteLength)}\0`), ...data]));

    const built = await buildPack([{ oid, type: 'blob', data }], compute);
    expect(data.byteLength).toBe(12);
    const again = await buildPack([{ oid, type: 'blob', data }], compute);
    expect(again.checksum).toBe(built.checksum);

    const provider = new MemoryProvider();
    providers.push(provider);
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.pack`, built.pack);
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.idx`, await indexBuiltPack(built, compute));
    const root = await verifiedByGit(provider);
    expect(decoder.decode(git(root, ['verify-pack', join('objects', 'pack', `pack-${built.checksum}.idx`)]))).toBe('');
    expect(git(root, ['cat-file', 'blob', oid])).toStrictEqual(data);
  });

  it('writes loose objects and repacks them through the seam into a pack git verifies', async () => {
    const compute = remoteCompute();
    const provider = new MemoryProvider();
    providers.push(provider);
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: 'seam',
    });
    const blobs = Array.from({ length: 24 }, (_, index) => encoder.encode(`part ${String(index)}\n`.repeat(index + 1)));

    const oids = await store.writeLoose(blobs.map((data) => ({ type: 'blob', data })));
    /* The same inputs again: whole, and already held. */
    expect(blobs.every((data, index) => data.byteLength === `part ${String(index)}\n`.length * (index + 1))).toBe(true);
    await expect(store.writeLoose(blobs.map((data) => ({ type: 'blob', data })))).resolves.toStrictEqual(oids);
    expect(await store.repack(true)).toBe(true);

    const root = await verifiedByGit(provider);
    const listed = await provider.readdir('.git/objects/pack');
    const packIndex = listed.find((name) => name.endsWith('.idx'))!;
    expect(decoder.decode(git(root, ['verify-pack', join('objects', 'pack', packIndex)]))).toBe('');
    const reader = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: 'seam-reader',
    });
    for (const [index, oid] of oids.entries()) {
      expect(git(root, ['cat-file', 'blob', oid])).toStrictEqual(blobs[index]);
      // oxlint-disable-next-line no-await-in-loop -- every object read back in turn.
      await expect(reader.read(oid)).resolves.toStrictEqual({ type: 'blob', data: blobs[index] });
    }
  });
});

describe('the compute worker seam', () => {
  it('answers inflate, deflate, SHA-1 and pack indexing across a port, as it does inline', async () => {
    const channel = new MessageChannel();
    channels.push(channel);
    serveComputeWorker(domPort(channel.port2));
    const remote = connectComputeWorker(domPort(channel.port1));
    const inline = createInlineCompute();
    const body = encoder.encode('cube(1);\n'.repeat(64));

    /* Each call hands its buffer over, so each gets its own copy. */
    const deflated = await remote.deflate(new Uint8Array(body));
    expect(new Uint8Array(inflateSync(deflated))).toStrictEqual(body);
    expect(await remote.inflate(new Uint8Array(deflated))).toStrictEqual(body);
    expect(await remote.sha1(new Uint8Array(body))).toBe(digestHex('sha1', body));
    expect(await inline.sha1(body)).toBe(digestHex('sha1', body));

    const oid = digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(body.byteLength)}\0`), ...body]));
    const built = await buildPack([{ oid, type: 'blob', data: body }], inline);
    const packIndex = readPackIndex(await remote.indexPack(new Uint8Array(built.pack)));
    expect(packIndex.packChecksum).toBe(built.checksum);
    expect(packIndex.offsetOf(built.entries[0]!.oid)).toBe(12);
  });

  it('carries a failure back as a rejection', async () => {
    const channel = new MessageChannel();
    channels.push(channel);
    serveComputeWorker(domPort(channel.port2));
    const remote = connectComputeWorker(domPort(channel.port1));

    await expect(remote.inflate(encoder.encode('not zlib'))).rejects.toThrow();
  });

  it('waits for nothing when a call cannot be posted', async () => {
    const connection = openComputeConnection({
      postMessage: () => {
        throw new Error('This argument could not be cloned.');
      },
      addEventListener: () => undefined,
    });

    await expect(connection.compute.sha1(encoder.encode('body'))).rejects.toThrow(/could not be cloned/u);
    expect(connection.pending()).toBe(0);
  });
});
