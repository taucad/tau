/**
 * `hashFiles` on the node provider leg: the host digests beside the bytes and
 * the client receives digests only.
 *
 * Both halves run in this process over a real `MessageChannel`, the same
 * structured-clone wire the Electron `MessagePortMain` uses; the client's end is
 * tapped so the test counts the requests and body bytes that cross it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import type { NodeFsPort } from '#backend/node/port.js';
import { tauPathPolicy } from '#path-registry.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Cleanup order is deliberately last-in, first-out.
    await cleanup();
  }
});

const sha256 = (content: string | Uint8Array<ArrayBuffer>): string =>
  createHash('sha256').update(content).digest('hex');

/** Body bytes anywhere inside one frame. */
const bodyBytes = (value: unknown): number => {
  if (value instanceof Uint8Array) {
    return value.byteLength;
  }
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  return Object.values(value).reduce<number>((total, entry) => total + bodyBytes(entry), 0);
};

const connect = () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-hash-'));
  const root = join(sandbox, 'root');
  mkdirSync(root);
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
  }).close;
  const tap = { ops: [] as string[], repliedBodyBytes: 0 };
  const tapped: NodeFsPort = {
    postMessage(message) {
      tap.ops.push(String((message as { op?: unknown }).op));
      port1.postMessage(message);
    },
    addEventListener(type, listener) {
      port1.addEventListener(type as 'message', (event: MessageEvent) => {
        tap.repliedBodyBytes += bodyBytes(event.data);
        listener(event);
      });
    },
    start: () => {
      port1.start();
    },
    close: () => {
      port1.close();
    },
  };
  const channel = new NodeFsChannel(tapped);
  cleanups.push(async () => {
    channel.close();
    await stop();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return { root, provider: new NodeFsProviderClient(channel, root), tap };
};

describe('hashFiles over the node provider leg', () => {
  it('digests a 300-file closure in one request with no body bytes', async () => {
    const { root, provider, tap } = connect();
    mkdirSync(join(root, 'lib'));
    const paths = Array.from({ length: 300 }, (_, index) => `lib/part-${index}.ts`);
    for (const [index, path] of paths.entries()) {
      writeFileSync(join(root, path), `part ${index}`);
    }

    const digests = await provider.hashFiles([...paths, 'gone.ts']);

    expect(tap.ops).toEqual(['hashFiles']);
    expect(tap.repliedBodyBytes).toBe(0);
    expect(digests['lib/part-7.ts']).toBe(sha256('part 7'));
    expect(digests['gone.ts']).toBe('missing');
    expect(Object.keys(digests)).toHaveLength(301);
  });

  it('streams a large asset through the digest and still ships no body', async () => {
    const { root, provider, tap } = connect();
    const asset = new Uint8Array(3 * 1024 * 1024 + 17).map((_, index) => index % 251);
    writeFileSync(join(root, 'mesh.bin'), asset);

    await expect(provider.hashFiles(['mesh.bin'])).resolves.toEqual({ 'mesh.bin': sha256(asset) });
    expect(tap.repliedBodyBytes).toBe(0);
  });

  it('detects a same-length rewrite that keeps the mtime', async () => {
    const { root, provider } = connect();
    const file = join(root, 'main.ts');
    const tick = new Date(1_700_000_000_000);
    writeFileSync(file, 'v1');
    utimesSync(file, tick, tick);
    const stamp = statSync(file);
    const before = await provider.hashFiles(['main.ts']);

    writeFileSync(file, 'v2');
    utimesSync(file, tick, tick);

    expect([statSync(file).size, statSync(file).mtimeMs]).toEqual([stamp.size, stamp.mtimeMs]);
    expect(await provider.hashFiles(['main.ts'])).not.toEqual(before);
  });

  it('refuses a path outside the root before the host reads it', async () => {
    const { provider, tap } = connect();
    await expect(provider.hashFiles(['../escape.ts'])).rejects.toThrow();
    expect(tap.ops).toEqual([]);
  });
});
