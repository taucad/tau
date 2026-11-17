/**
 * What a node filesystem host reports about its own disk (protocol 13 `describe`).
 *
 * A host's `process.platform` is faked, so the Windows answer is proven on every
 * runner: a client in another process than the host must take the host's word,
 * never its own platform.
 */

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import { tauPathPolicy } from '#path-registry.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Cleanup order is deliberately last-in, first-out.
    await cleanup();
  }
});

/** Serve one admitted root over an in-process port pair. */
const connect = (): {
  readonly root: string;
  readonly channel: NodeFsChannel;
} => {
  const root = mkdtempSync(join(tmpdir(), 'tau-node-describe-'));
  mkdirSync(join(root, 'nested'));
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
  }).close;
  const channel = new NodeFsChannel(port1);
  cleanups.push(async () => {
    channel.close();
    await stop();
    port2.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, channel };
};

/** Report `platform` from `process` until this test's cleanup, as a host process on that disk would. */
const fakePlatform = (platform: NodeJS.Platform): void => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  if (original === undefined) {
    throw new Error('process.platform has no descriptor to fake.');
  }
  Object.defineProperty(process, 'platform', { ...original, value: platform });
  cleanups.push(() => {
    Object.defineProperty(process, 'platform', original);
  });
};

describe('node filesystem host description', () => {
  it("should describe a Windows host's disk as keeping no file mode, and refuse a mode request", async () => {
    fakePlatform('win32');
    const { root, channel } = connect();

    await expect(channel.describeHost()).resolves.toEqual({ fileModes: false });
    const provider = new NodeFsProviderClient(channel, root, {
      fileModes: false,
    });
    expect(provider.getFileMode).toBeUndefined();
    expect(provider.setFileMode).toBeUndefined();
    // A client that asks anyway gets a refusal, never a made-up `100644`.
    await provider.writeFile('run.sh', '#!/bin/sh\n');
    await expect(channel.request({ root, op: 'getFileMode', path: 'run.sh' })).rejects.toMatchObject({
      code: 'ENOTSUP',
    });
    await expect(
      channel.request({
        root,
        op: 'setFileMode',
        path: 'run.sh',
        mode: '100755',
      }),
    ).rejects.toMatchObject({ code: 'ENOTSUP' });
  });

  it('should describe a POSIX host as keeping file modes', async () => {
    fakePlatform('linux');
    const { root, channel } = connect();

    await expect(channel.describeHost()).resolves.toEqual({ fileModes: true });
    const provider = new NodeFsProviderClient(channel, root, {
      fileModes: true,
    });
    expect(provider.getFileMode).toBeTypeOf('function');
    expect(provider.setFileMode).toBeTypeOf('function');
  });

  it("should default an in-process client to its own process's disk", () => {
    fakePlatform('win32');
    const { root, channel } = connect();

    const provider = new NodeFsProviderClient(channel, root);
    expect(provider.getFileMode).toBeUndefined();
    expect(provider.setFileMode).toBeUndefined();
  });
});
