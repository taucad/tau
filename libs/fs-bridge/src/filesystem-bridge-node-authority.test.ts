import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { NodeFsPort } from '@taucad/filesystem/backend';
import { wrapMessagePort } from '@taucad/rpc';
import type { WatchEvent } from '@taucad/filesystem';
import { createFileSystemBridgeProxy, serveFileSystemBridgePort } from '#filesystem-bridge.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Authority resources close in reverse ownership order.
    await cleanup();
  }
});

type DelayedWatchPort = {
  readonly port: NodeFsPort;
  readonly acknowledgementHeld: Promise<void>;
  readonly unwatchCount: () => number;
  releaseAcknowledgement(): void;
};

const delayFirstWatchAcknowledgement = (rawPort: MessagePort): DelayedWatchPort => {
  const basePort = rawPort as unknown as NodeFsPort;
  let watchedId: number | undefined;
  let heldDelivery: (() => void) | undefined;
  let released = false;
  let unwatchCount = 0;
  let markHeld!: () => void;
  const acknowledgementHeld = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  return {
    port: {
      postMessage(message) {
        const frame = message as { id?: unknown; op?: unknown };
        if (frame.op === 'watch' && watchedId === undefined && typeof frame.id === 'number') {
          watchedId = frame.id;
        }
        if (frame.op === 'unwatch') {
          unwatchCount += 1;
        }
        basePort.postMessage(message);
      },
      addEventListener(type, listener) {
        basePort.addEventListener(type, (event) => {
          const frame = event.data as { id?: unknown; type?: unknown } | undefined;
          if (!released && type === 'message' && frame?.id === watchedId && frame?.type === 'result') {
            heldDelivery = () => {
              listener(event);
            };
            markHeld();
            return;
          }
          listener(event);
        });
      },
      start: () => {
        basePort.start?.();
      },
      close: () => {
        basePort.close?.();
      },
    },
    acknowledgementHeld,
    unwatchCount: () => unwatchCount,
    releaseAcknowledgement() {
      released = true;
      heldDelivery?.();
      heldDelivery = undefined;
    },
  };
};

const createAuthorityBridge = (admitted = true) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-fs-bridge-node-authority-'));
  const root = join(sandbox, 'root');
  const authorityDirectory = join(sandbox, 'authority');
  mkdirSync(root);
  mkdirSync(authorityDirectory);
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityDirectory,
    authorityIdentity: () => 'fs-bridge-test-host',
  });
  const nodeBoundary = new MessageChannel();
  const delayed = delayFirstWatchAcknowledgement(nodeBoundary.port1);
  const stopNodeServer = serveNodeFsProvider(nodeBoundary.port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => admitted && candidate === root,
    authority,
  });
  const nodeChannel = new NodeFsChannel(delayed.port);
  const provider = new NodeFsProviderClient(nodeChannel, root);
  const bridgeBoundary = new MessageChannel();
  const bridgeServer = serveFileSystemBridgePort(
    provider,
    wrapMessagePort(bridgeBoundary.port1, { label: 'fs-bridge-node-authority-server' }),
  );
  const proxy = createFileSystemBridgeProxy({
    port: wrapMessagePort(bridgeBoundary.port2, { label: 'fs-bridge-node-authority-client' }),
    dispose: () => {
      bridgeBoundary.port2.close();
    },
  });
  cleanups.push(async () => {
    proxy.dispose();
    bridgeServer.dispose();
    nodeChannel.close();
    await stopNodeServer();
    nodeBoundary.port2.close();
    bridgeBoundary.port1.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return { root, delayed, proxy };
};

describe('filesystem bridge over the shared Node filesystem authority', () => {
  it('waits for the remote watch acknowledgement before ready and preserves exact event order', async () => {
    const { root, delayed, proxy } = createAuthorityBridge();
    const events: WatchEvent[] = [];
    await proxy.ready;
    const subscription = proxy.watchReady({ paths: [''], recursive: true }, (event) => {
      events.push(event);
    });
    await delayed.acknowledgementHeld;
    writeFileSync(join(root, 'before-ready.txt'), 'first');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    const pendingMarker = Symbol('pending');
    expect(await Promise.race([subscription.ready, Promise.resolve(pendingMarker)])).toBe(pendingMarker);
    expect(events).toEqual([]);

    delayed.releaseAcknowledgement();
    await subscription.ready;
    await vi.waitFor(
      () => {
        expect(events).toContainEqual({ type: 'change', path: 'before-ready.txt', kind: 'file' });
      },
      { timeout: 10_000 },
    );
    writeFileSync(join(root, 'after-ready.txt'), 'second');
    await vi.waitFor(
      () => {
        expect(events).toContainEqual({ type: 'change', path: 'after-ready.txt', kind: 'file' });
      },
      { timeout: 10_000 },
    );
    expect([...new Set(events.filter((event) => event.type === 'change').map((event) => event.path))]).toEqual([
      'before-ready.txt',
      'after-ready.txt',
    ]);

    const closed = expect(subscription.closed).rejects.toThrow(/aborted/u);
    subscription.unsubscribe();
    await closed;
  }, 30_000);

  it('cancels before the delayed acknowledgement without a late ready or event and releases the remote watch', async () => {
    const { root, delayed, proxy } = createAuthorityBridge();
    const handler = vi.fn();
    await proxy.ready;
    const subscription = proxy.watchReady({ paths: [''], recursive: true }, handler);

    await delayed.acknowledgementHeld;
    const ready = expect(subscription.ready).rejects.toThrow(/aborted|closed before registration/u);
    const closed = expect(subscription.closed).rejects.toThrow(/aborted/u);
    subscription.unsubscribe();
    await ready;
    writeFileSync(join(root, 'while-cancelled.txt'), 'ignored');
    delayed.releaseAcknowledgement();
    await closed;
    await vi.waitFor(() => {
      expect(delayed.unwatchCount()).toBe(1);
    });
    writeFileSync(join(root, 'after-unwatch.txt'), 'ignored');
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    expect(handler).not.toHaveBeenCalled();
  }, 30_000);

  it('preserves a rejected remote root admission as a typed watch failure', async () => {
    const { proxy } = createAuthorityBridge(false);
    await proxy.ready;
    const subscription = proxy.watchReady({ paths: [''] }, vi.fn());

    await expect(subscription.ready).rejects.toMatchObject({ code: 'EACCES' });
    await expect(subscription.closed).rejects.toMatchObject({ code: 'EACCES' });
  });
});
