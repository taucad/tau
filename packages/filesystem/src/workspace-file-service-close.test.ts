/**
 * Closing a service before its root is removed (D17).
 *
 * A Project Index snapshot write the persist quiet period started can still be
 * running when a host tears the service down. On Windows a write landing in
 * `<root>/.tau/index` while the root is removed fails the removal with
 * `ENOTEMPTY`, so `close` waits until no write the service began can touch the disk.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeFsProvider } from '#backend/node/provider.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- torn down in the reverse of the order they were made.
    await cleanup();
  }
});

/* One node root behind a real service, whose snapshot directory waits at `mkdir` until the test lets it go. */
const gatedRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-service-close-'));
  cleanups.push(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'main.ts'), 'main');
  const provider = new NodeFsProvider(root);
  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  const mkdir = provider.mkdir.bind(provider);
  vi.spyOn(provider, 'mkdir').mockImplementation(async (path, options) => {
    if (path.startsWith('.tau/index')) {
      reached.resolve();
      await gate.promise;
    }
    return mkdir(path, options);
  });
  const writeFileSpy = vi.spyOn(provider, 'writeFile');
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'node', storageRootKey: `node:${root}` });
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    mountTable,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
  });
  cleanups.push(async () => service.close());
  const snapshotWrites = (): number =>
    writeFileSpy.mock.calls.filter(([path]) => String(path).startsWith('.tau/index')).length;
  return { root, service, gate, reached: reached.promise, snapshotWrites };
};

describe('WorkspaceFileService close', () => {
  it('should stop a snapshot write in flight and resolve only once it has, so removing the root leaves no .tau/index', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { root, service, gate, reached, snapshotWrites } = await gatedRoot();
    await service.createRootedFileSystem('/').statTree!('');
    /* The persist quiet period ends and the snapshot write reaches its directory. */
    await vi.advanceTimersByTimeAsync(2000);
    await reached;

    let closed = false;
    const closing = (async () => {
      await service.close();
      closed = true;
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toBe(false);

    gate.resolve();
    await closing;
    expect(snapshotWrites()).toBe(0);

    await rm(root, { recursive: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(existsSync(root)).toBe(false);
    expect(snapshotWrites()).toBe(0);
  });

  it('should start no snapshot write once disposed, though the quiet period had begun', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { root, service, snapshotWrites } = await gatedRoot();
    await service.createRootedFileSystem('/').statTree!('');

    service.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    await service.close();

    expect(snapshotWrites()).toBe(0);
    expect(existsSync(join(root, '.tau'))).toBe(false);
  });
});
