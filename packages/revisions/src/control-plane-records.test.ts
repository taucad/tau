/**
 * A control-plane record is replaced whole on a provider that will not rename
 * over a file (OPFS, the File System Access provider, the memory provider):
 * a host that dies at any step leaves a record a reader reads as the old text
 * or the new one (W2 review 5). A reader never moves a sibling, and a writer
 * overtaken by a newer write leaves that write standing (W2 re-reviews 1, G1
 * and G2).
 */
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonRecord, readControlRecord, writeControlRecord } from '#control-plane-records.js';
import type { ControlPlaneFiles, ControlRecordReading } from '#control-plane-records.js';

const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const path = '.git/sync-pending';

/* A record is whole when it ends its line, as every record here does. */
const reading: ControlRecordReading = { accepts: (text) => text.endsWith('\n') };

const memory = async (): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  providers.push(provider);
  await provider.mkdir('.git', { recursive: true });
  return provider;
};

const filesOf = (provider: MemoryProvider): ControlPlaneFiles => ({
  readFile: provider.readFile.bind(provider) as ControlPlaneFiles['readFile'],
  writeFile: async (target, data) => provider.writeFile(target, data),
  rename: async (from, to) => provider.rename(from, to),
  unlink: async (target) => provider.unlink(target),
  readdir: async (target) => provider.readdir(target),
  stat: provider.stat.bind(provider) as ControlPlaneFiles['stat'],
});

/* The node provider's way: a rename replaces whatever is at its target. */
const renamingOver = (provider: MemoryProvider): ControlPlaneFiles => ({
  ...filesOf(provider),
  rename: async (from, to) => {
    await provider.stat(from);
    await provider.unlink(to).catch(() => undefined);
    await provider.rename(from, to);
  },
});

const pause = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
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

/* The provider with a peer that reads the record as each `.writing` sibling is written, before its rename. */
const racedBy = (provider: MemoryProvider, seen: Array<string | undefined>): ControlPlaneFiles => {
  const files = filesOf(provider);
  return {
    ...files,
    writeFile: async (target, data) => {
      await files.writeFile(target, data);
      if (target.endsWith('.writing')) {
        seen.push(await readControlRecord(files, path, reading));
      }
    },
  };
};

describe('control-plane records', () => {
  it('refuses to rename over a file on this provider, as the browser providers do', async () => {
    const provider = await memory();
    await provider.writeFile('.git/a', 'a');
    await provider.writeFile('.git/b', 'b');
    await expect(provider.rename('.git/a', '.git/b')).rejects.toMatchObject({ code: 'EEXIST' });
  });

  /* Write the sibling, date it, try the rename, unlink the record, rename into place, sweep: six steps. */
  it.each([1, 2, 3, 4, 5, 6, 7])('reads the old record or the new one when the host dies at step %i', async (stop) => {
    const provider = await memory();
    const files = filesOf(provider);
    await writeControlRecord(files, path, 'old\n');

    await writeControlRecord(dying(provider, stop), path, 'new\n').catch(() => undefined);

    /* A writer that got as far as unlinking the record is answered from its whole sibling. */
    const read = await readControlRecord(files, path, reading);
    expect(read).toBe(stop >= 5 ? 'new\n' : 'old\n');
    await expect(readControlRecord(files, path, reading)).resolves.toBe(read);

    /* The next writer to land clears whatever the stopped one left. */
    await writeControlRecord(files, path, 'next\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
    expect(await provider.readFile(path, 'utf8')).toBe('next\n');
  });

  it('answers a first write from its sibling to a reader between the write and the rename, and lands it', async () => {
    const provider = await memory();
    const seen: Array<string | undefined> = [];

    await writeControlRecord(racedBy(provider, seen), path, 'first\n');

    expect(seen).toStrictEqual(['first\n']);
    expect(await provider.readFile(path, 'utf8')).toBe('first\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('never moves a stopped writer’s sibling over a record a live writer lands meanwhile (G1)', async () => {
    const provider = await memory();
    const files = renamingOver(provider);
    await provider.writeFile(`${path}.old.writing`, 'old\n');
    await pause();
    const racing: ControlPlaneFiles = {
      ...files,
      readdir: async (target) => {
        const listed = await files.readdir(target);
        await writeControlRecord(files, path, 'new\n');
        return listed;
      },
    };

    const answered = await readControlRecord(racing, path, reading);

    expect(['old\n', 'new\n']).toContain(answered);
    expect(await provider.readFile(path, 'utf8')).toBe('new\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('leaves a newer writer’s record standing when a stalled writer’s sibling is gone (G2)', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    const seen: Array<string | undefined> = [];
    let stalled = false;
    const older: ControlPlaneFiles = {
      ...files,
      rename: async (from, to) => {
        if (!stalled && from.endsWith('.writing')) {
          stalled = true;
          /* Frozen past any grace: a reader finds its sibling, and a newer writer lands and clears it. */
          seen.push(await readControlRecord(files, path, reading));
          await pause();
          await writeControlRecord(files, path, 'newer\n');
        }
        await files.rename(from, to);
      },
    };

    await writeControlRecord(older, path, 'older\n');

    expect(seen).toStrictEqual(['older\n']);
    expect(await provider.readFile(path, 'utf8')).toBe('newer\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('leaves a newer writer’s record standing when it lands between the unlink and the rename (G2)', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    await writeControlRecord(files, path, 'first\n');
    let raced = false;
    const older: ControlPlaneFiles = {
      ...files,
      unlink: async (target) => {
        await files.unlink(target);
        if (!raced && target === path) {
          raced = true;
          await writeControlRecord(files, path, 'newer\n');
        }
      },
    };

    await writeControlRecord(older, path, 'older\n');

    expect(await provider.readFile(path, 'utf8')).toBe('newer\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('writes again only when its sibling is gone and no record stands', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    let lost = false;
    const losing: ControlPlaneFiles = {
      ...files,
      rename: async (from, to) => {
        if (!lost) {
          lost = true;
          await files.unlink(from);
        }
        await files.rename(from, to);
      },
    };

    await writeControlRecord(losing, path, 'mine\n');

    expect(await provider.readFile(path, 'utf8')).toBe('mine\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('never answers a half-written sibling, and moves none', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    const devices: ControlRecordReading = {
      accepts: jsonRecord((value) => typeof value === 'object' && value !== null),
    };
    await provider.writeFile('.git/ops-devices.json.one.writing', '{"version":1,"devi');

    await expect(readControlRecord(files, '.git/ops-devices.json', devices)).resolves.toBeUndefined();

    /* A whole sibling older than a torn one is the one answered. */
    await provider.unlink('.git/ops-devices.json.one.writing');
    await provider.writeFile('.git/ops-devices.json.zero.writing', '{"version":1,"devices":{}}\n');
    await pause();
    await provider.writeFile('.git/ops-devices.json.one.writing', '{"version":1,"devi');
    await expect(readControlRecord(files, '.git/ops-devices.json', devices)).resolves.toBe(
      '{"version":1,"devices":{}}\n',
    );
    const left = await provider.readdir('.git');
    expect(left.toSorted()).toStrictEqual(['ops-devices.json.one.writing', 'ops-devices.json.zero.writing']);
  });

  it('answers the newest whole sibling of a missing record, and the next write removes them all', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    await provider.writeFile(`${path}.one.writing`, 'older\n');
    await pause();
    await provider.writeFile(`${path}.two.writing`, 'newer\n');

    await expect(readControlRecord(files, path, reading)).resolves.toBe('newer\n');
    expect(await provider.readdir('.git')).toHaveLength(2);

    await pause();
    await writeControlRecord(files, path, 'latest\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('answers undefined when there is no record and no sibling', async () => {
    const provider = await memory();
    await expect(readControlRecord(filesOf(provider), path, reading)).resolves.toBeUndefined();
    await expect(readControlRecord(filesOf(provider), '.git/missing/record', reading)).resolves.toBeUndefined();
  });

  it('replaces a record on a provider that renames over a file, leaving no sibling', async () => {
    const provider = await memory();
    const files = renamingOver(provider);
    await writeControlRecord(files, path, 'one\n');
    await writeControlRecord(files, path, 'two\n');
    await expect(readControlRecord(files, path, reading)).resolves.toBe('two\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });
});
