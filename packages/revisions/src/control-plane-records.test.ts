/**
 * A control-plane record is replaced whole on a provider that will not rename
 * over a file (OPFS, the File System Access provider, the memory provider):
 * a host that dies at any step leaves a record a reader reads as the old text
 * or the new one (W2 review 5).
 */
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it } from 'vitest';
import { readControlRecord, writeControlRecord } from '#control-plane-records.js';
import type { ControlPlaneFiles } from '#control-plane-records.js';

const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const path = '.git/sync-pending';

const memory = async (): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  providers.push(provider);
  await provider.mkdir('.git', { recursive: true });
  return provider;
};

/*
 * The provider as a host that dies at its `stop`-th call: that call and every
 * one after it fails, and nothing more reaches the store.
 */
const dying = (provider: MemoryProvider, stop: number): ControlPlaneFiles => {
  let calls = 0;
  const step = async <Result>(run: () => Promise<Result>): Promise<Result> => {
    calls += 1;
    if (calls >= stop) {
      throw new Error('The host died.');
    }
    return run();
  };
  return {
    readFile: (async (target: string, encoding?: 'utf8') =>
      step(async () =>
        encoding === 'utf8' ? provider.readFile(target, 'utf8') : provider.readFile(target),
      )) as ControlPlaneFiles['readFile'],
    writeFile: async (target, data) => step(async () => provider.writeFile(target, data)),
    rename: async (from, to) => step(async () => provider.rename(from, to)),
    unlink: async (target) => step(async () => provider.unlink(target)),
    readdir: async (target) => step(async () => provider.readdir(target)),
    stat: (async (target: string) => step(async () => provider.stat(target))) as ControlPlaneFiles['stat'],
  };
};

describe('control-plane records', () => {
  it('refuses to rename over a file on this provider, as the browser providers do', async () => {
    const provider = await memory();
    await provider.writeFile('.git/a', 'a');
    await provider.writeFile('.git/b', 'b');
    await expect(provider.rename('.git/a', '.git/b')).rejects.toThrow();
  });

  /* Write the temporary sibling, try the rename, unlink the record, rename into place: four steps. */
  it.each([1, 2, 3, 4, 5])('reads the old record or the new one when the host dies at step %i', async (stop) => {
    const provider = await memory();
    await writeControlRecord(provider, path, 'old\n');

    await writeControlRecord(dying(provider, stop), path, 'new\n').catch(() => undefined);

    const read = await readControlRecord(provider, path);
    expect(['old\n', 'new\n']).toContain(read);
    /* A writer that got as far as unlinking the record has its whole replacement promoted. */
    expect(read).toBe(stop >= 4 ? 'new\n' : 'old\n');
    /* Once read, the record is in place and no leftover sibling stands beside a missing record. */
    expect(await provider.readFile(path, 'utf8')).toBe(read);
  });

  it('promotes the newest whole sibling of a missing record and removes the older ones', async () => {
    const provider = await memory();
    await provider.writeFile(`${path}.one.writing`, 'older\n');
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await provider.writeFile(`${path}.two.writing`, 'newer\n');

    await expect(readControlRecord(provider, path)).resolves.toBe('newer\n');
    const left = await provider.readdir('.git');
    expect(left.toSorted()).toStrictEqual(['sync-pending']);
  });

  it('answers undefined when there is no record and no sibling', async () => {
    const provider = await memory();
    await expect(readControlRecord(provider, path)).resolves.toBeUndefined();
    await expect(readControlRecord(provider, '.git/missing/record')).resolves.toBeUndefined();
  });

  it('replaces a record on a provider that renames over a file, leaving no sibling', async () => {
    const provider = await memory();
    const renamingOver: ControlPlaneFiles = {
      readFile: provider.readFile.bind(provider) as ControlPlaneFiles['readFile'],
      writeFile: async (target, data) => provider.writeFile(target, data),
      unlink: async (target) => provider.unlink(target),
      readdir: async (target) => provider.readdir(target),
      stat: provider.stat.bind(provider) as ControlPlaneFiles['stat'],
      rename: async (from, to) => {
        await provider.unlink(to).catch(() => undefined);
        await provider.rename(from, to);
      },
    };
    await writeControlRecord(renamingOver, path, 'one\n');
    await writeControlRecord(renamingOver, path, 'two\n');
    await expect(readControlRecord(renamingOver, path)).resolves.toBe('two\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });
});
