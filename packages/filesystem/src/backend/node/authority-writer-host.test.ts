import fs, { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '#backend/node/host.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import { tauPathPolicy } from '#path-registry.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Close ports and release ownership before removing storage.
    await cleanup();
  }
});

const connect = (root: string, authorityRoot: string): { client: NodeFsProviderClient; close: () => Promise<void> } => {
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityRoot,
    authorityIdentity: (canonicalRoot) => canonicalRoot,
  });
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority,
  });
  const channel = new NodeFsChannel(port1);
  const close = async (): Promise<void> => {
    channel.close();
    await server.close();
    port2.close();
  };
  cleanups.push(close);
  return { client: new NodeFsProviderClient(channel, root), close };
};

describe.runIf(['darwin', 'linux', 'win32'].includes(process.platform))('native filesystem authority mutations', () => {
  it('should durably replace a file through the native provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-native-write-'));
    cleanups.push(async () => rm(root, { force: true, recursive: true }));
    await writeFile(join(root, 'model.txt'), 'initial');
    if (process.platform === 'win32') {
      // Record the former POSIX-only durability primitive's native behavior without treating it as supported.
      try {
        const directory = await fs.open(root, 'r');
        try {
          await directory.sync();
          console.info('Windows read-only directory sync probe: supported');
        } finally {
          await directory.close();
        }
      } catch (error) {
        console.info('Windows read-only directory sync probe:', error);
      }
    }
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    try {
      await provider.writeFile('model.txt', 'saved');
    } catch (error) {
      // The port intentionally hides internal causes; this native test preserves the real syscall failure.
      console.error('Native provider atomic-write cause', error instanceof Error ? error.cause : error);
      throw error;
    }
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('saved');
  });

  it.each(['before-replace', 'after-replace', ...(process.platform === 'win32' ? ['close'] : [])] as const)(
    'should refuse checked-write acknowledgement when durability fails %s',
    async (stage) => {
      const sandbox = await mkdtemp(join(tmpdir(), 'tau-authority-flush-'));
      cleanups.push(async () => rm(sandbox, { force: true, recursive: true }));
      const root = join(sandbox, 'content');
      const authorityRoot = join(sandbox, 'authority');
      await mkdir(root);
      await mkdir(authorityRoot);
      await writeFile(join(root, 'model.txt'), 'initial');
      const owner = connect(root, authorityRoot);
      const open = fs.open.bind(fs);
      vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
        const handle = await open(path, flags, mode);
        const beforeReplace = stage === 'before-replace';
        const failureFlags = beforeReplace || process.platform === 'win32' ? 'wx' : 'r';
        if (stage === 'close' && flags === 'wx') {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            await close();
            throw Object.assign(new Error('Injected close failure'), { code: 'EIO' });
          });
          return handle;
        }
        if (flags === failureFlags) {
          const sync = handle.sync.bind(handle);
          let calls = 0;
          vi.spyOn(handle, 'sync').mockImplementation(async () => {
            await sync();
            calls += 1;
            if (calls === (!beforeReplace && process.platform === 'win32' ? 2 : 1)) {
              throw Object.assign(new Error('Injected durability failure'), { code: 'EIO' });
            }
          });
        }
        return handle;
      });
      await expect(
        owner.client.writeFileChecked({
          path: 'model.txt',
          data: 'saved',
          preconditions: [{ path: 'model.txt', expected: 'initial' }],
        }),
      ).rejects.toMatchObject({
        code: stage === 'before-replace' ? 'EIO' : 'CHECKED_WRITE_POTENTIALLY_APPLIED',
        applicationState: stage === 'before-replace' ? 'known-not-applied' : 'potentially-applied',
      });
      expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe(stage === 'before-replace' ? 'initial' : 'saved');
      const entries = await fs.readdir(root);
      expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual([]);
    },
  );

  it('should reject a competing writer before starting asynchronous resource admission', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-authority-admission-'));
    cleanups.push(async () => rm(sandbox, { force: true, recursive: true }));
    const root = join(sandbox, 'content');
    const authorityRoot = join(sandbox, 'authority');
    await mkdir(root);
    await mkdir(authorityRoot);
    await writeFile(join(root, 'model.txt'), 'initial');
    const owner = await acquireNodeAuthorityWriter({ authorityRoot });
    cleanups.push(async () => owner.release());
    const contender = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: (canonicalRoot) => canonicalRoot,
    });
    cleanups.push(contender.attach());
    const resourceAdmission = vi.mocked(lstat);
    resourceAdmission.mockClear();
    const mutation = vi.fn(async () => undefined);

    await expect(contender.run({ root, paths: ['model.txt'] }, mutation)).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    // A rejected acquisition must be awaited before filesystem IO can leave its rejection unobserved.
    expect(resourceAdmission).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('initial');
  });

  it('should persist checked mutations, refuse a second host, and transfer ownership after port disposal', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-authority-mutation-'));
    cleanups.push(async () => rm(sandbox, { force: true, recursive: true }));
    const root = join(sandbox, 'content');
    const authorityRoot = join(sandbox, 'authority');
    await mkdir(root);
    await mkdir(authorityRoot);
    await writeFile(join(root, 'model.txt'), 'initial');
    const first = connect(root, authorityRoot);
    const second = connect(root, authorityRoot);

    expect(
      await first.client.writeFileChecked({
        path: 'model.txt',
        data: 'saved',
        preconditions: [{ path: 'model.txt', expected: 'initial' }],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('saved');

    const replacement = {
      path: 'model.txt',
      data: 'replacement',
      preconditions: [{ path: 'model.txt', expected: 'saved' }],
    };
    await expect(second.client.writeFileChecked(replacement)).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('saved');

    await first.close();
    expect(await second.client.writeFileChecked(replacement)).toMatchObject({ status: 'applied' });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('replacement');
  });
});
