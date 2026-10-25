/**
 * `hashFiles` is answered on the host's side of the bridge: digests, not bodies.
 */
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { sha256Bytes } from '@taucad/utils/hash';
import {
  createFileSystemBridgePort,
  createFileSystemBridgeProxy,
  createTransferredFileSystemBridgeProxy,
  exposeFileSystemForTesting,
  filesystemBridgeConnectMessageType,
} from '#filesystem-bridge.js';
import { fileSystemBridgeProtocolVersion } from '#filesystem-bridge-protocol.js';

const encoder = new TextEncoder();

const seededProvider = async (files: Record<string, string>): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture seeding is sequential.
    await provider.writeFile(path, content);
  }
  return provider;
};

/** Body bytes anywhere inside one value. */
const bodyBytes = (value: unknown): number => {
  if (value instanceof Uint8Array) {
    return value.byteLength;
  }
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  return Object.values(value).reduce<number>((total, entry) => total + bodyBytes(entry), 0);
};

describe('hashFiles over a runtime filesystem bridge', () => {
  it('answers every path in one call with the SHA-256 the kernel computes, and missing for absence', async () => {
    const provider = await seededProvider({ 'a.ts': 'alpha', 'lib/b.ts': 'beta' });
    const connection = createFileSystemBridgePort(provider);
    const replies: unknown[] = [];
    connection.port.addEventListener('message', (event: MessageEvent) => {
      replies.push(event.data);
    });
    const proxy = createFileSystemBridgeProxy(connection);
    try {
      await proxy.ready;
      expect(proxy.hello.payload).toMatchObject({ state: 'ready', hashable: true });
      replies.length = 0;

      const digests = await proxy.hashFiles(['a.ts', 'lib/b.ts', 'gone.ts']);

      expect(digests).toEqual({
        'a.ts': await sha256Bytes(encoder.encode('alpha')),
        'lib/b.ts': await sha256Bytes(encoder.encode('beta')),
        'gone.ts': 'missing',
      });
      expect(replies.reduce<number>((total, frame) => total + bodyBytes(frame), 0)).toBe(0);
    } finally {
      proxy.dispose();
    }
  });

  it('sees a same-length rewrite: bytes are digested, not stamps', async () => {
    const provider = await seededProvider({ 'a.ts': 'v1' });
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(provider));
    try {
      const before = await proxy.hashFiles(['a.ts']);
      await provider.writeFile('a.ts', 'v2');
      expect(await proxy.hashFiles(['a.ts'])).not.toEqual(before);
    } finally {
      proxy.dispose();
    }
  });

  it('keeps a host-supplied hashFiles instead of reading bodies', async () => {
    const provider = await seededProvider({ 'a.ts': 'alpha' });
    const digest = 'f'.repeat(64);
    const hashFiles = vi.fn(async (paths: readonly string[]) =>
      Object.fromEntries(paths.map((path) => [path, digest])),
    );
    const readFile = vi.spyOn(provider, 'readFile');
    const proxy = createFileSystemBridgeProxy(
      createFileSystemBridgePort(Object.assign(provider, { hashFiles }) as MemoryProvider),
    );
    try {
      await expect(proxy.hashFiles(['a.ts'])).resolves.toEqual({ 'a.ts': digest });
      expect(hashFiles).toHaveBeenCalledOnce();
      expect(readFile).not.toHaveBeenCalled();
    } finally {
      proxy.dispose();
    }
  });

  it('rejects when a read fails for a reason other than absence', async () => {
    const provider = await seededProvider({ 'a.ts': 'alpha' });
    vi.spyOn(provider, 'readFile').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(provider));
    try {
      await expect(proxy.hashFiles(['a.ts'])).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      proxy.dispose();
    }
  });

  it('refuses a non-canonical path before the host reads anything', async () => {
    const provider = await seededProvider({ 'a.ts': 'alpha' });
    const readFile = vi.spyOn(provider, 'readFile');
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(provider));
    try {
      await expect(proxy.hashFiles(['../escape.ts'])).rejects.toThrow();
      expect(readFile).not.toHaveBeenCalled();
    } finally {
      proxy.dispose();
    }
  });
});

describe('hashFiles over a rooted authority connection', () => {
  it("digests through the connection's own handler and advertises it in the hello", async () => {
    const provider = await seededProvider({ 'main.ts': 'model' });
    const messageSource = new EventTarget();
    const handle = exposeFileSystemForTesting(
      {},
      { policy: tauPathPolicy, messageSource, handlerForRoot: () => provider },
    );
    const channel = new MessageChannel();
    messageSource.dispatchEvent(
      new MessageEvent('message', {
        data: {
          v: fileSystemBridgeProtocolVersion,
          type: filesystemBridgeConnectMessageType,
          port: channel.port1,
          root: '/projects/p',
          consumer: 'working-copy',
        },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);
    try {
      await proxy.ready;
      expect(proxy.hello.payload).toMatchObject({ state: 'ready', hashable: true });
      await expect(proxy.hashFiles(['main.ts', 'other.ts'])).resolves.toEqual({
        'main.ts': await sha256Bytes(encoder.encode('model')),
        'other.ts': 'missing',
      });
    } finally {
      proxy.dispose();
      handle.cleanup();
      channel.port1.close();
    }
  });
});
