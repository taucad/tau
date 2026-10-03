import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider, drainNodeFsProviderWatchClosures } from '#backend/node/provider.js';
import parcelWatcher from '@parcel/watcher';

const roots: string[] = [];

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-node-atomic-'));
  roots.push(root);
  writeFileSync(join(root, 'target.txt'), 'old');
  return root;
};

const temporaryFiles = (root: string): string[] => readdirSync(root).filter((name) => name.endsWith('.tmp'));

type FailureStage = 'temp-write' | 'file-fsync' | 'rename' | 'directory-fsync' | 'read-back';

const injectFailureAfter = (stage: FailureStage): void => {
  const failure = new Error(`injected ${stage} failure`);
  if (stage === 'rename') {
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      throw failure;
    });
    return;
  }
  if (stage === 'read-back') {
    const readFile = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      await readFile(...args);
      throw failure;
    });
    return;
  }

  const open = fs.open.bind(fs);
  vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
    const handle = await open(path, flags, mode);
    if (flags === 'wx' && stage === 'temp-write') {
      const writeFile = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'writeFile').mockImplementation(async (...args) => {
        await writeFile(...args);
        throw failure;
      });
    } else if (flags === 'wx' && stage === 'file-fsync') {
      const sync = handle.sync.bind(handle);
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        await sync();
        throw failure;
      });
    } else if (flags === 'r' && stage === 'directory-fsync') {
      const sync = handle.sync.bind(handle);
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        await sync();
        throw failure;
      });
    }
    return handle;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('NodeFsProvider atomic writes', () => {
  it('cancels observation before the optional backend import finishes', async () => {
    const provider = new NodeFsProvider(createRoot());
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe');
    const opening = provider.watch({ paths: [''], recursive: true }, () => undefined);
    provider.dispose();
    await expect(opening).rejects.toThrow('cancelled during admission');
    await drainNodeFsProviderWatchClosures(provider);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('closes a native subscription admitted after provider disposal', async () => {
    const root = createRoot();
    const admission = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const close = vi.fn(async () => undefined);
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockReturnValue(admission.promise);
    const provider = new NodeFsProvider(root);
    const events: unknown[] = [];
    try {
      const opening = provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      provider.dispose();
      admission.resolve({ unsubscribe: close });
      await expect(opening).rejects.toThrow('cancelled during admission');
      await drainNodeFsProviderWatchClosures(provider);
      expect(close).toHaveBeenCalledOnce();
      expect(events).toEqual([]);
    } finally {
      admission.resolve({ unsubscribe: close });
      subscribe.mockRestore();
    }
  });

  it('reports native stream loss as a whole-subscription reset', async () => {
    const provider = new NodeFsProvider(createRoot());
    const close = vi.fn(async () => undefined);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: close };
    });
    const events: unknown[] = [];
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    onEvents?.(new Error('native stream lost'), []);
    expect(events).toEqual([{ type: 'reset' }]);
    stop();
    await drainNodeFsProviderWatchClosures(provider);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects admission when the native stream fails before readiness', async () => {
    const provider = new NodeFsProvider(createRoot());
    const close = vi.fn(async () => undefined);
    const lost = new Error('native stream lost during admission');
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      callback(lost, []);
      return { unsubscribe: close };
    });
    const events: unknown[] = [];
    await expect(provider.watch({ paths: [''], recursive: true }, (event) => events.push(event))).rejects.toBe(lost);
    await drainNodeFsProviderWatchClosures(provider);
    expect(close).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it('revalidates a missing parent created during native admission before acknowledging', async () => {
    const root = createRoot();
    const first = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const replacement = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const firstClose = vi.fn(async () => undefined);
    const replacementClose = vi.fn(async () => undefined);
    const subscribe = vi
      .spyOn(parcelWatcher, 'subscribe')
      .mockImplementation(async () => (subscribe.mock.calls.length === 1 ? first.promise : replacement.promise));
    const provider = new NodeFsProvider(root);
    const events: unknown[] = [];
    const opening = provider.watch({ paths: ['absent/deep.txt'], recursive: false }, (event) => events.push(event));
    try {
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(1);
      });
      mkdirSync(join(root, 'absent'));
      first.resolve({ unsubscribe: firstClose });
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(2);
      });
      replacement.resolve({ unsubscribe: replacementClose });
      const stop = await opening;
      expect(events).toContainEqual({ type: 'reset' });
      stop();
      await drainNodeFsProviderWatchClosures(provider);
      expect(firstClose).toHaveBeenCalledOnce();
      expect(replacementClose).toHaveBeenCalledOnce();
    } finally {
      first.resolve({ unsubscribe: firstClose });
      replacement.resolve({ unsubscribe: replacementClose });
      provider.dispose();
      await opening.catch(() => undefined);
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it.each(['temp-write', 'file-fsync', 'rename', 'directory-fsync', 'read-back'] as const)(
    'should leave old or new bytes and no temporary file after a %s failure',
    async (stage) => {
      const root = createRoot();
      const provider = new NodeFsProvider(root);
      injectFailureAfter(stage);

      await expect(provider.writeFile('target.txt', 'new')).rejects.toBeInstanceOf(Error);

      expect(['old', 'new']).toContain(readFileSync(join(root, 'target.txt'), 'utf8'));
      expect(temporaryFiles(root)).toEqual([]);
    },
  );

  it('should refuse to replace a symbolic link without changing its target', async () => {
    const root = createRoot();
    writeFileSync(join(root, 'linked.txt'), 'linked');
    symlinkSync('linked.txt', join(root, 'alias.txt'));
    const provider = new NodeFsProvider(root);

    await expect(provider.writeFile('alias.txt', 'new')).rejects.toMatchObject({ code: 'ELOOP' });

    expect(readFileSync(join(root, 'linked.txt'), 'utf8')).toBe('linked');
    expect(lstatSync(join(root, 'alias.txt')).isSymbolicLink()).toBe(true);
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('should refuse a changed parent and remove the temporary file', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const realpath = fs.realpath.bind(fs);
    let rootResolutions = 0;
    vi.spyOn(fs, 'realpath').mockImplementation(async (candidate, options) => {
      const resolved = await realpath(candidate, options);
      if (String(candidate) === root && ++rootResolutions === 3) {
        return join(String(resolved), 'replacement-parent');
      }
      return resolved;
    });

    await expect(provider.writeFile('target.txt', 'new')).rejects.toMatchObject({ code: 'ELOOP' });

    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('should report WRITE_VERIFICATION_FAILED when committed bytes do not verify', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const readFile = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      await readFile(...args);
      return Buffer.from('corrupt');
    });

    await expect(provider.writeFile('target.txt', 'new')).rejects.toMatchObject({ code: 'WRITE_VERIFICATION_FAILED' });

    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('new');
    expect(temporaryFiles(root)).toEqual([]);
  });
});

describe('NodeFsProvider head listing', () => {
  it('avoids full reads and leaves exact counts fresh after a same-size external edit', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const file = join(root, 'large.txt');
    writeFileSync(file, `${'a'.repeat(1024)}\nend`);
    const fullRead = vi.spyOn(fs, 'readFile');

    const headRows = await provider.readdirWithStats('', { content: 'head' });
    expect(headRows.find(({ name }) => name === 'large.txt')).toMatchObject({
      contentKind: 'text',
      size: 1028,
    });
    expect(fullRead).not.toHaveBeenCalled();
    writeFileSync(file, `${'a'.repeat(1024)}-end`);
    expect(await provider.stat('large.txt')).toMatchObject({ contentKind: 'text', lineCount: 1 });
    const exactRows = await provider.readdirWithStats('');
    expect(exactRows.find(({ name }) => name === 'large.txt')).toMatchObject({
      lineCount: 1,
    });
  });
});
