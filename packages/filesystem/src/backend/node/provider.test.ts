import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '#backend/node/provider.js';

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
