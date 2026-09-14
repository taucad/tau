/**
 * Client/host round trip for the node storage backend.
 *
 * Runs both halves in this process over a `MessageChannel` pair — the repo's
 * vitest cannot host a `.ts` `worker_threads` worker, and an in-process channel
 * exercises the same structured-clone wire the Electron `MessagePortMain` uses.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsChannel, NodeFsChannelClosedError, NodeFsProviderClient } from '#backend/node/client.js';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '#backend/node/host.js';
import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import type { NodeFsPort } from '#backend/node/port.js';
import { nodeFsProtocolVersion } from '#backend/node/protocol.js';
import type { NodeFsWatchEvent } from '#backend/node/protocol.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Cleanup order is deliberately last-in, first-out.
    await cleanup();
  }
});

type Connected = {
  readonly root: string;
  readonly outside: string;
  readonly provider: NodeFsProviderClient;
  readonly port: MessagePort;
};

const connect = (): Connected => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-port-'));
  const root = join(sandbox, 'root');
  const outside = join(sandbox, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root });
  const channel = new NodeFsChannel(port1);
  cleanups.push(async () => {
    channel.close();
    await stop();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return { root, outside, provider: new NodeFsProviderClient(channel, root), port: port1 };
};

/**
 * Arm a watch and hold it until the host proves it is live.
 *
 * Arming resolves as soon as the host has called `fs.watch`, but macOS FSEvents
 * needs a moment more before it delivers. A probe file is written in a loop
 * until its own event arrives, so a test's real mutation cannot be missed.
 */
const armLiveWatch = async (
  provider: NodeFsProviderClient,
  root: string,
  request: { recursive?: boolean; excludes?: string[] } = {},
): Promise<{ readonly events: NodeFsWatchEvent[] }> => {
  const events: NodeFsWatchEvent[] = [];
  const unsubscribe = await provider.watch(
    { paths: [''], recursive: request.recursive ?? true, ...(request.excludes ? { excludes: request.excludes } : {}) },
    (event) => {
      events.push(event);
    },
  );
  cleanups.push(unsubscribe);
  const probe = join(root, '.watch-probe');
  const deadline = Date.now() + 10_000;
  while (!events.some((event) => event.type !== 'reset' && event.path === '.watch-probe')) {
    if (Date.now() > deadline) {
      throw new Error('The host watcher never went live.');
    }
    writeFileSync(probe, String(Date.now()));
    // oxlint-disable-next-line no-await-in-loop -- Liveness is polled by design.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  unlinkSync(probe);
  events.length = 0;
  return { events };
};

/** Resolve once `events` contains a match, or reject at `timeoutMs`. */
const waitForEvent = async (
  events: readonly NodeFsWatchEvent[],
  predicate: (event: NodeFsWatchEvent) => boolean,
  timeoutMs = 10_000,
): Promise<NodeFsWatchEvent> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = events.find((event) => predicate(event));
    if (hit) {
      return hit;
    }
    if (Date.now() > deadline) {
      throw new Error(`No matching watch event arrived over the port; saw ${JSON.stringify(events)}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling an event buffer.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
};

/** Post a frame the typed client would never build, to reach the host directly. */
const rawRequest = async (port: MessagePort, frame: Record<string, unknown>): Promise<unknown> =>
  new Promise((resolve) => {
    const listener = (event: MessageEvent): void => {
      const data = event.data as { id?: unknown };
      if (data.id === frame['id']) {
        port.removeEventListener('message', listener);
        resolve(event.data);
      }
    };
    port.addEventListener('message', listener);
    port.postMessage({ v: nodeFsProtocolVersion, ...frame });
  });

/** Observe whether two spellings address one entry in this actual directory. */
const aliasesEntry = (root: string, probe: string, alias: string): boolean => {
  writeFileSync(join(root, probe), 'probe');
  const aliases = existsSync(join(root, alias));
  unlinkSync(join(root, probe));
  return aliases;
};

describe('node filesystem client/host round trip', () => {
  it('serializes checked writes across distinct ports and releases the OS owner after both dispose', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-checked-'));
    const root = join(sandbox, 'root');
    const alias = join(sandbox, 'alias');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    symlinkSync(root, alias);
    writeFileSync(join(root, 'target.txt'), 'old');
    writeFileSync(join(root, 'source.txt'), 'source-v1');
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const firstPorts = new MessageChannel();
    const secondPorts = new MessageChannel();
    const stopFirst = serveNodeFsProvider(firstPorts.port2, {
      allowRoot: (candidate) => candidate === root || candidate === alias,
      authority,
    });
    const stopSecond = serveNodeFsProvider(secondPorts.port2, {
      allowRoot: (candidate) => candidate === root || candidate === alias,
      authority,
    });
    const firstChannel = new NodeFsChannel(firstPorts.port1);
    const secondChannel = new NodeFsChannel(secondPorts.port1);
    const first = new NodeFsProviderClient(firstChannel, root);
    const second = new NodeFsProviderClient(secondChannel, alias);
    const input = {
      path: 'target.txt',
      preconditions: [
        { path: 'target.txt', expected: 'old' },
        { path: 'source.txt', expected: 'source-v1' },
      ],
    } as const;

    const [left, right] = await Promise.all([
      first.writeFileChecked({ ...input, data: 'first' }),
      second.writeFileChecked({ ...input, data: 'second' }),
    ]);

    expect([left.status, right.status].sort()).toEqual(['applied', 'conflict']);
    await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    firstChannel.close();
    secondChannel.close();
    const firstStop = stopFirst();
    expect(stopFirst()).toBe(firstStop);
    await firstStop;
    await stopSecond();
    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    await replacement.release();
    firstPorts.port2.close();
    secondPorts.port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('uses one supplied authority identity for overlapping admitted roots', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-overlap-'));
    const root = join(sandbox, 'root');
    const child = join(root, 'project');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(child, { recursive: true });
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const detach = authority.attach();
    const firstMayFinish = Promise.withResolvers<void>();
    const order: string[] = [];

    const first = authority.run({ root, paths: ['project/target.txt'] }, async () => {
      order.push('first-start');
      await firstMayFinish.promise;
      order.push('first-end');
    });
    await vi.waitFor(() => {
      expect(order).toEqual(['first-start']);
    });
    const second = authority.run({ root: child, paths: ['target.txt'] }, async () => {
      order.push('second');
    });
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    firstMayFinish.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second']);
    await detach();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('does not serialize unrelated physical resources under one authority identity', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-resources-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detach = authority.attach();
    const firstMayFinish = Promise.withResolvers<void>();
    const order: string[] = [];

    const first = authority.run({ root, paths: ['first.txt'] }, async () => {
      order.push('first-start');
      await firstMayFinish.promise;
      order.push('first-end');
    });
    await vi.waitFor(() => {
      expect(order).toEqual(['first-start']);
    });
    const unrelated = authority.run({ root, paths: ['second.txt'] }, async () => {
      order.push('unrelated');
    });
    const sameResource = authority.run({ root, paths: ['first.txt'] }, async () => {
      order.push('same-resource');
    });

    await vi.waitFor(() => {
      expect(order).toEqual(['first-start', 'unrelated']);
    });
    firstMayFinish.resolve();
    await Promise.all([first, unrelated, sameResource]);
    expect(order).toEqual(['first-start', 'unrelated', 'first-end', 'same-resource']);

    await detach();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('owns the requested root and path records before authority resolution waits', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-input-snapshot-'));
    const root = join(sandbox, 'root');
    const replacementRoot = join(sandbox, 'replacement-root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(replacementRoot);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detach = authority.attach();
    const holderMayFinish = Promise.withResolvers<void>();
    const holderEntered = Promise.withResolvers<void>();
    const holder = authority.run({ root, paths: ['target.txt'] }, async () => {
      holderEntered.resolve();
      await holderMayFinish.promise;
    });
    await holderEntered.promise;

    const input = { root, paths: ['target.txt'] };
    let contenderEntered = false;
    const contender = authority.run(input, async () => {
      contenderEntered = true;
    });
    input.root = replacementRoot;
    input.paths[0] = 'sibling.txt';
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    const enteredBeforeHolderReleased = contenderEntered;
    holderMayFinish.resolve();
    await Promise.all([holder, contender]);
    expect(enteredBeforeHolderReleased).toBe(false);
    expect(contenderEntered).toBe(true);
    await detach();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('holds ancestor mutations behind active descendant resources without blocking siblings', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-subtree-resources-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(join(root, 'tree'), { recursive: true });
    mkdirSync(join(root, 'other'), { recursive: true });
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detach = authority.attach();
    const descendantMayFinish = Promise.withResolvers<void>();
    const order: string[] = [];

    const descendant = authority.run({ root, paths: ['tree/file.txt'] }, async () => {
      order.push('descendant-start');
      await descendantMayFinish.promise;
      order.push('descendant-end');
    });
    await vi.waitFor(() => {
      expect(order).toEqual(['descendant-start']);
    });
    const ancestor = authority.run({ root, paths: ['tree'] }, async () => {
      order.push('ancestor');
    });
    const sibling = authority.run({ root, paths: ['other/file.txt'] }, async () => {
      order.push('sibling');
    });

    await vi.waitFor(() => {
      expect(order).toEqual(['descendant-start', 'sibling']);
    });
    descendantMayFinish.resolve();
    await Promise.all([descendant, ancestor, sibling]);
    expect(order).toEqual(['descendant-start', 'sibling', 'descendant-end', 'ancestor']);

    await detach();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it.each([
    {
      kind: 'case',
      leftPath: 'case-target.txt',
      probe: '.case-probe',
      probeAlias: '.CASE-PROBE',
      rightPath: 'CASE-TARGET.TXT',
    },
    {
      kind: 'normalization',
      leftPath: 'caf\u00E9-target.txt',
      probe: '.caf\u00E9-probe',
      probeAlias: '.cafe\u0301-probe',
      rightPath: 'cafe\u0301-target.txt',
    },
  ])(
    'serializes checked creates across absent physical $kind aliases',
    async ({ probe, probeAlias, leftPath, rightPath }) => {
      const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-physical-alias-'));
      const root = join(sandbox, 'root');
      const authorityRoot = join(sandbox, 'authority');
      mkdirSync(root);
      mkdirSync(authorityRoot);
      const physicalAliases = aliasesEntry(root, probe, probeAlias);
      if (!physicalAliases) {
        expect(physicalAliases).toBe(false);
        rmSync(sandbox, { recursive: true, force: true });
        return;
      }
      const authority = new NodeFsAuthorityHost({
        authorityDirectory: () => authorityRoot,
        authorityIdentity: () => 'host-owner',
      });
      const firstPorts = new MessageChannel();
      const secondPorts = new MessageChannel();
      const stopFirst = serveNodeFsProvider(firstPorts.port2, {
        allowRoot: (candidate) => candidate === root,
        authority,
      });
      const stopSecond = serveNodeFsProvider(secondPorts.port2, {
        allowRoot: (candidate) => candidate === root,
        authority,
      });
      const firstChannel = new NodeFsChannel(firstPorts.port1);
      const secondChannel = new NodeFsChannel(secondPorts.port1);
      const first = new NodeFsProviderClient(firstChannel, root);
      const second = new NodeFsProviderClient(secondChannel, root);

      try {
        const [left, right] = await Promise.all([
          first.writeFileChecked({
            path: leftPath,
            data: 'left',
            preconditions: [{ path: leftPath, expected: null }],
          }),
          second.writeFileChecked({
            path: rightPath,
            data: 'right',
            preconditions: [{ path: rightPath, expected: null }],
          }),
        ]);

        expect([left.status, right.status].sort()).toEqual(['applied', 'conflict']);
        expect(
          left.status === 'conflict'
            ? left.conflicts[0]?.path
            : right.status === 'conflict'
              ? right.conflicts[0]?.path
              : undefined,
        ).toBe(left.status === 'conflict' ? leftPath : rightPath);
      } finally {
        firstChannel.close();
        secondChannel.close();
        await Promise.all([stopFirst(), stopSecond()]);
        firstPorts.port2.close();
        secondPorts.port2.close();
        rmSync(sandbox, { recursive: true, force: true });
      }
    },
  );

  it('keeps existing case aliases and an absent-to-existing alias transition in one queue', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-alias-transition-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    if (!aliasesEntry(root, '.case-probe', '.CASE-PROBE')) {
      rmSync(sandbox, { recursive: true, force: true });
      return;
    }
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detach = authority.attach();
    const target = join(root, 'case-target.txt');

    try {
      writeFileSync(target, 'existing');
      const existingMayFinish = Promise.withResolvers<void>();
      const existingOrder: string[] = [];
      const existing = authority.run({ root, paths: ['case-target.txt'] }, async () => {
        existingOrder.push('existing-start');
        await existingMayFinish.promise;
        existingOrder.push('existing-end');
      });
      await vi.waitFor(() => {
        expect(existingOrder).toEqual(['existing-start']);
      });
      const existingAlias = authority.run({ root, paths: ['CASE-TARGET.TXT'] }, async () => {
        existingOrder.push('existing-alias');
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(existingOrder).toEqual(['existing-start']);
      existingMayFinish.resolve();
      await Promise.all([existing, existingAlias]);
      expect(existingOrder).toEqual(['existing-start', 'existing-end', 'existing-alias']);

      unlinkSync(target);
      const transitionMayFinish = Promise.withResolvers<void>();
      const transitionOrder: string[] = [];
      const absent = authority.run({ root, paths: ['case-target.txt'] }, async () => {
        transitionOrder.push('absent-start');
        writeFileSync(target, 'materialized');
        await transitionMayFinish.promise;
        transitionOrder.push('absent-end');
      });
      await vi.waitFor(() => {
        expect(transitionOrder).toEqual(['absent-start']);
      });
      const materializedAlias = authority.run({ root, paths: ['CASE-TARGET.TXT'] }, async () => {
        transitionOrder.push('materialized-alias');
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(transitionOrder).toEqual(['absent-start']);
      transitionMayFinish.resolve();
      await Promise.all([absent, materializedAlias]);
      expect(transitionOrder).toEqual(['absent-start', 'absent-end', 'materialized-alias']);
    } finally {
      await detach();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('keeps a non-ASCII fallback ancestor compatible with a folded existing descendant', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-non-ascii-fallback-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(join(root, 'UpperParent'), { recursive: true });
    mkdirSync(authorityRoot);
    writeFileSync(join(root, 'UpperParent', 'existing.txt'), 'existing');
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detach = authority.attach();
    const fallbackMayFinish = Promise.withResolvers<void>();
    const order: string[] = [];

    try {
      const fallback = authority.run({ root, paths: ['UpperParent/caf\u00E9.txt'] }, async () => {
        order.push('fallback-start');
        await fallbackMayFinish.promise;
        order.push('fallback-end');
      });
      await vi.waitFor(() => {
        expect(order).toEqual(['fallback-start']);
      });
      const existingDescendant = authority.run({ root, paths: ['UpperParent/existing.txt'] }, async () => {
        order.push('existing-descendant');
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(order).toEqual(['fallback-start']);
      fallbackMayFinish.resolve();
      await Promise.all([fallback, existingDescendant]);
      expect(order).toEqual(['fallback-start', 'fallback-end', 'existing-descendant']);
    } finally {
      await detach();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('cancels a watch while real provider admission is pending', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-watch-cancel-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root, authority });
    const frames: unknown[] = [];
    port1.addEventListener('message', ({ data }) => frames.push(data));
    port1.start();

    try {
      port1.postMessage({
        v: nodeFsProtocolVersion,
        id: 41,
        op: 'watch',
        root,
        request: { paths: [''], recursive: true },
      });
      port1.postMessage({ v: nodeFsProtocolVersion, id: 41, op: 'unwatch' });
      await vi.waitFor(() => {
        expect(frames).toContainEqual({ v: nodeFsProtocolVersion, id: 41, type: 'result', value: undefined });
      });

      writeFileSync(join(root, 'after-unwatch.txt'), 'must not be observed');
      await new Promise((resolve) => {
        setTimeout(resolve, 750);
      });
      expect(
        frames.filter(
          (frame) =>
            (frame as { id?: unknown; type?: unknown }).id === 41 && (frame as { type?: unknown }).type === 'watch',
        ),
      ).toEqual([]);
    } finally {
      await stop();
      port1.close();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('replaces a repeated pending watch id without leaking the older registration', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-watch-replace-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root, authority });
    const frames: unknown[] = [];
    port1.addEventListener('message', ({ data }) => frames.push(data));
    port1.start();
    const request = {
      v: nodeFsProtocolVersion,
      id: 42,
      op: 'watch',
      root,
      request: { paths: [''], recursive: true },
    } as const;

    try {
      port1.postMessage(request);
      port1.postMessage(request);
      await vi.waitFor(() => {
        expect(
          frames.filter(
            (frame) =>
              (frame as { id?: unknown; type?: unknown }).id === 42 && (frame as { type?: unknown }).type === 'result',
          ),
        ).toHaveLength(2);
      });
      port1.postMessage({ v: nodeFsProtocolVersion, id: 42, op: 'unwatch' });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      writeFileSync(join(root, 'after-replacement-unwatch.txt'), 'must not be observed');
      await new Promise((resolve) => {
        setTimeout(resolve, 750);
      });

      expect(
        frames.filter(
          (frame) =>
            (frame as { id?: unknown; type?: unknown }).id === 42 && (frame as { type?: unknown }).type === 'watch',
        ),
      ).toEqual([]);
    } finally {
      await stop();
      port1.close();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('shares disposer settlement and lets a reattached server wait for retirement', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-reattach-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const detachFirst = authority.attach();
    const firstMayFinish = Promise.withResolvers<void>();
    const first = authority.run({ root, paths: ['target.txt'] }, async () => {
      await firstMayFinish.promise;
    });
    const firstDisposal = detachFirst();

    expect(detachFirst()).toBe(firstDisposal);
    const detachSecond = authority.attach();
    let secondEntered = false;
    const second = authority.run({ root, paths: ['target.txt'] }, async () => {
      secondEntered = true;
    });
    await Promise.resolve();
    expect(secondEntered).toBe(false);
    firstMayFinish.resolve();
    await Promise.all([first, firstDisposal, second]);
    expect(secondEntered).toBe(true);
    await detachSecond();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('does not admit a reattached run after its last server detaches while ownership retires', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-retire-race-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const detachFirst = authority.attach();
    const firstMayFinish = Promise.withResolvers<void>();
    const firstStarted = Promise.withResolvers<void>();
    const first = authority.run({ root, paths: ['target.txt'] }, async () => {
      firstStarted.resolve();
      await firstMayFinish.promise;
    });
    await firstStarted.promise;
    const firstDisposal = detachFirst();
    const detachSecond = authority.attach();
    const second = authority.run({ root, paths: ['target.txt'] }, async () => 'orphaned');
    const secondRejection = expect(second).rejects.toMatchObject({ code: 'AUTHORITY_HOST_INACTIVE' });

    await detachSecond();
    firstMayFinish.resolve();
    await Promise.all([first, firstDisposal]);
    await secondRejection;
    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    await replacement.release();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('recovers after an authority acquisition rejection', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-recover-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const outsideOwner = await acquireNodeAuthorityWriter({ authorityRoot });
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const detach = authority.attach();

    await expect(authority.run({ root, paths: ['target.txt'] }, async () => undefined)).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    await outsideOwner.release();
    await expect(authority.run({ root, paths: ['target.txt'] }, async () => 'recovered')).resolves.toBe('recovered');

    await detach();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('fails checked writes closed when the host has no authority owner', async () => {
    const { provider } = connect();
    await expect(
      provider.writeFileChecked({
        path: 'target.txt',
        data: 'new',
        preconditions: [{ path: 'target.txt', expected: null }],
      }),
    ).rejects.toMatchObject({ code: 'CHECKED_WRITE_UNSUPPORTED' });
  });

  it('round-trips bytes through the port', async () => {
    const { provider } = connect();

    await provider.writeFile('nested/file.txt', 'hello');

    await expect(provider.readFile('nested/file.txt', 'utf8')).resolves.toBe('hello');
    await expect(provider.stat('nested/file.txt')).resolves.toMatchObject({
      type: 'file',
      size: 5,
      contentKind: 'text',
    });
  });

  it('hides an in-flight atomic-write temp file from directory listings', async () => {
    const { root, provider } = connect();
    // What `_atomicWrite` parks beside its target for a few milliseconds, plus
    // two dotfiles a listing must keep: a user dotfile and a user `.tmp`.
    writeFileSync(join(root, `.main.scad.json.${String(process.pid)}.1b4e28ba-2fa1-4d3b-9c6e-0f3a2b1c4d5e.tmp`), '');
    writeFileSync(join(root, '.keep'), '');
    writeFileSync(join(root, 'notes.tmp'), 'draft');

    const entries = await provider.readdir('');

    expect(entries).toContain('.keep');
    expect(entries).toContain('notes.tmp');
    expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual(['notes.tmp']);
  });

  it('carries errno codes across the port', async () => {
    const { provider } = connect();
    await provider.mkdir('directory');

    await expect(provider.unlink('directory')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(provider.readFile('absent.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('delivers a watch change event with its entry kind', async () => {
    const { root, provider } = connect();
    const { events } = await armLiveWatch(provider, root);

    writeFileSync(join(root, 'watched.txt'), 'external');

    await expect(
      waitForEvent(events, (event) => event.type === 'change' && event.path === 'watched.txt'),
    ).resolves.toEqual({ type: 'change', path: 'watched.txt', kind: 'file' });
  }, 30_000);

  it('classifies a removal as a delete rather than trusting the OS event type', async () => {
    const { root, provider } = connect();
    writeFileSync(join(root, 'doomed.txt'), 'external');
    const { events } = await armLiveWatch(provider, root);

    unlinkSync(join(root, 'doomed.txt'));

    await expect(
      waitForEvent(events, (event) => event.type === 'delete' && event.path === 'doomed.txt'),
    ).resolves.toEqual({ type: 'delete', path: 'doomed.txt' });
  }, 30_000);

  it('excludes cache paths from the event stream', async () => {
    const { root, provider } = connect();
    mkdirSync(join(root, '.tau', 'cache'), { recursive: true });
    const { events } = await armLiveWatch(provider, root, { excludes: ['.tau/cache/**'] });

    writeFileSync(join(root, '.tau', 'cache', 'burst.bin'), 'x');
    writeFileSync(join(root, 'after.txt'), 'x');
    await waitForEvent(events, (event) => event.type === 'change' && event.path === 'after.txt');

    expect(events.filter((event) => event.type !== 'reset' && event.path.startsWith('.tau/cache'))).toEqual([]);
  }, 30_000);

  it('refuses a traversal the typed client cannot express', async () => {
    const { root, outside, port } = connect();
    writeFileSync(join(outside, 'secret.txt'), 'private');

    const response = (await rawRequest(port, { id: 9001, root, op: 'readFile', path: '../outside/secret.txt' })) as {
      type: string;
      code?: string;
    };

    expect(response.type).toBe('error');
    expect(response.code).toBe('PATH_OUTSIDE_ROOT');
  });

  it('refuses a symlink that escapes the root', async () => {
    const { root, outside, provider } = connect();
    writeFileSync(join(outside, 'target.txt'), 'private');
    symlinkSync(join(outside, 'target.txt'), join(root, 'escape.txt'));

    // Containment answers first: the link resolves outside the admitted root.
    await expect(provider.writeFile('escape.txt', 'overwritten')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(provider.readFile('escape.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to replace a symlink inside the root instead of following it', async () => {
    const { root, provider } = connect();
    await provider.writeFile('real.txt', 'original');
    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'));

    await expect(provider.writeFile('alias.txt', 'overwritten')).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(provider.readFile('real.txt', 'utf8')).resolves.toBe('original');
  });

  it('refuses a root the host did not admit', async () => {
    const { port } = connect();

    const response = (await rawRequest(port, { id: 9002, root: '/', op: 'readdir', path: '' })) as {
      type: string;
      code?: string;
    };

    expect(response).toMatchObject({ type: 'error', code: 'EACCES' });
  });

  it('rejects a frame from a peer speaking another protocol version', async () => {
    const { root, port } = connect();

    const response = await new Promise((resolve) => {
      const listener = (event: MessageEvent): void => {
        port.removeEventListener('message', listener);
        resolve(event.data);
      };
      port.addEventListener('message', listener);
      port.postMessage({ v: 999, id: 9003, root, op: 'readdir', path: '' });
    });

    expect(response).toMatchObject({ type: 'error', code: 'NODE_FS_PROTOCOL_VERSION' });
  });
});

describe('node filesystem host hardening', () => {
  it('never turns a failed success reply into a known-not-applied checked error', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-reply-failure-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    writeFileSync(join(root, 'target.txt'), 'old');
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const { port1, port2 } = new MessageChannel();
    const wrappers = new Map<(event: { data: unknown }) => void, EventListener>();
    const hostPort: NodeFsPort = {
      postMessage: (message) => {
        if ((message as { type?: unknown }).type === 'result') {
          throw new Error('reply transport failed');
        }
        port2.postMessage(message);
      },
      addEventListener: (type, candidate) => {
        const wrapper: EventListener = (event) => {
          candidate({ data: (event as MessageEvent<unknown>).data });
        };
        wrappers.set(candidate, wrapper);
        port2.addEventListener(type, wrapper);
      },
      removeEventListener: (type, candidate) => {
        const wrapper = wrappers.get(candidate);
        if (wrapper !== undefined) {
          wrappers.delete(candidate);
          port2.removeEventListener(type, wrapper);
        }
      },
      start: () => {
        port2.start();
      },
      close: () => {
        port2.close();
      },
    };
    const stop = serveNodeFsProvider(hostPort, { allowRoot: (candidate) => candidate === root, authority });
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);

    try {
      await expect(
        provider.writeFileChecked({
          path: 'target.txt',
          data: 'new',
          preconditions: [{ path: 'target.txt', expected: 'old' }],
        }),
      ).rejects.toMatchObject({
        code: 'CHECKED_WRITE_POTENTIALLY_APPLIED',
        applicationState: 'potentially-applied',
      });
      expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('new');
      await stop();
    } finally {
      channel.close();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('rejects broad and aliased content roots before reads, listings, stats, watches, and checked writes', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-root-overlap-'));
    const root = join(sandbox, 'root');
    const alias = join(sandbox, 'alias');
    const authorityRoot = join(root, 'private-authority');
    mkdirSync(authorityRoot, { recursive: true });
    symlinkSync(root, alias);
    writeFileSync(join(root, 'target.txt'), 'old');
    writeFileSync(join(authorityRoot, 'metadata.txt'), 'private');
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, {
      allowRoot: (candidate) => candidate === root || candidate === alias,
      authority,
    });
    const channel = new NodeFsChannel(port1);
    const checked = {
      path: 'target.txt',
      data: 'new',
      preconditions: [{ path: 'target.txt', expected: 'old' }],
    } as const;

    try {
      await Promise.all(
        [root, alias].map(async (requestedRoot) => {
          const provider = new NodeFsProviderClient(channel, requestedRoot);
          await Promise.all([
            expect(provider.readFile('private-authority/metadata.txt')).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
            expect(provider.readdir('private-authority')).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP' }),
            expect(provider.stat('private-authority/metadata.txt')).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
            expect(provider.watch({ paths: ['private-authority'] }, () => undefined)).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
            expect(provider.writeFileChecked(checked)).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
              applicationState: 'known-not-applied',
            }),
          ]);
        }),
      );
      expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    } finally {
      channel.close();
      await stop();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('refuses checked replacement on a direct provider without authority ownership', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-direct-checked-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    writeFileSync(join(root, 'target.txt'), 'old');
    const provider = new NodeFsProvider(root);

    await expect(
      provider.writeFileChecked({
        path: 'target.txt',
        data: 'new',
        preconditions: [{ path: 'target.txt', expected: 'old' }],
      }),
    ).rejects.toMatchObject({ code: 'CHECKED_WRITE_UNSUPPORTED', applicationState: 'known-not-applied' });
    await expect(provider.readFile('target.txt', 'utf8')).resolves.toBe('old');
    expect('writeFileCheckedUnderAuthority' in provider).toBe(false);
    expect('_writeFileChecked' in provider).toBe(false);
    provider.dispose();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('settles cleanup failures together and still releases authority ownership', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-cleanup-'));
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => 'host-owner',
    });
    const watchFailure = new Error('watch cleanup failed');
    const providerFailure = new Error('provider cleanup failed');
    const watch = vi.spyOn(NodeFsProvider.prototype, 'watch').mockReturnValue(() => {
      throw watchFailure;
    });
    const dispose = vi.spyOn(NodeFsProvider.prototype, 'dispose').mockImplementation(() => {
      throw providerFailure;
    });
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root, authority });
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);

    try {
      await provider.writeFile('target.txt', 'value');
      await provider.watch({ paths: [''] }, () => undefined);
      const firstStop = stop();
      expect(stop()).toBe(firstStop);
      let failure: unknown;
      try {
        await firstStop;
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      const errors = (failure as AggregateError).errors as unknown[];
      expect(errors).toContain(watchFailure);
      expect(errors).toContain(providerFailure);
      const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
      await replacement.release();
    } finally {
      channel.close();
      port2.close();
      watch.mockRestore();
      dispose.mockRestore();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('refuses to remove its own root', async () => {
    const { provider, root } = connect();

    await expect(provider.rmdir('')).rejects.toMatchObject({ code: 'EINVAL' });
    // Still there — the guard is the only thing between an empty root and `fs.rmdir`.
    await expect(provider.readdir('')).resolves.toEqual([]);
    expect(existsSync(root)).toBe(true);
  });

  it('re-consults allowRoot on every request, so a narrowed allowlist takes effect', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-allow-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    let admitted = true;
    const stop = serveNodeFsProvider(port2, { allowRoot: () => admitted });
    const channel = new NodeFsChannel(port1);
    cleanups.push(async () => {
      channel.close();
      await stop();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    });
    const provider = new NodeFsProviderClient(channel, root);

    await expect(provider.readdir('')).resolves.toEqual([]);
    admitted = false;

    await expect(provider.readdir('')).rejects.toMatchObject({ code: 'EACCES' });
  });
});

describe('host death', () => {
  it('rejects in-flight and subsequent requests instead of hanging forever', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-death-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    // No host listening: the request goes out and nothing ever answers it —
    // exactly what a services-utility death looks like from the renderer.
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);
    cleanups.push(() => {
      channel.close();
      rmSync(sandbox, { recursive: true, force: true });
    });

    const inFlight = provider.readdir('');
    port2.close();

    await expect(inFlight).rejects.toBeInstanceOf(NodeFsChannelClosedError);
    // And the channel stays closed rather than silently swallowing the next call.
    await expect(provider.readdir('')).rejects.toBeInstanceOf(NodeFsChannelClosedError);
    expect(channel.closed).toBe(true);
  });

  it('resets every live watcher when the host dies, so observers resync', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-death-watch-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { allowRoot: () => true });
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);
    cleanups.push(async () => {
      channel.close();
      await stop();
      rmSync(sandbox, { recursive: true, force: true });
    });
    const events: NodeFsWatchEvent[] = [];
    await provider.watch({ paths: [''], recursive: true }, (event) => {
      events.push(event);
    });

    port2.close();
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'reset' });
    });
  });

  it('notifies close listeners exactly once', () => {
    const { port1, port2 } = new MessageChannel();
    const channel = new NodeFsChannel(port1);
    const closes: number[] = [];
    channel.onClose(() => closes.push(1));

    channel.close();
    channel.close();
    port2.close();

    expect(closes).toHaveLength(1);
  });
});
