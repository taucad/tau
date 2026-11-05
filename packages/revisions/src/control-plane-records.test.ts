/**
 * A control-plane record is replaced whole on a provider that will not rename
 * over a file (OPFS, the File System Access provider, the memory provider):
 * a host that dies at any step leaves a record a reader reads as the old text
 * or the new one (W2 review 5), and a reader racing a live writer never takes
 * its sibling from it (W2 re-review 1).
 */
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it } from 'vitest';
import { controlRecordGrace, jsonRecord, readControlRecord, writeControlRecord } from '#control-plane-records.js';
import type { ControlPlaneFiles, ControlRecordReading } from '#control-plane-records.js';

const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const path = '.git/sync-pending';

/* A record is whole when it ends its line, as every record here does. */
const wholeLine = (text: string): boolean => text.endsWith('\n');
/* A reader now. */
const now: ControlRecordReading = { accepts: wholeLine };
/* A reader long after every writer has stopped. */
const later: ControlRecordReading = { accepts: wholeLine, now: () => Date.now() + controlRecordGrace * 5 };

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
const racedBy = (provider: MemoryProvider, reading: ControlRecordReading, seen: Array<string | undefined>) => {
  const files = filesOf(provider);
  return {
    ...files,
    writeFile: async (target: string, data: string | Uint8Array<ArrayBuffer>) => {
      await files.writeFile(target, data);
      if (target.endsWith('.writing')) {
        seen.push(await readControlRecord(files, path, reading));
      }
    },
  } satisfies ControlPlaneFiles;
};

describe('control-plane records', () => {
  it('refuses to rename over a file on this provider, as the browser providers do', async () => {
    const provider = await memory();
    await provider.writeFile('.git/a', 'a');
    await provider.writeFile('.git/b', 'b');
    await expect(provider.rename('.git/a', '.git/b')).rejects.toMatchObject({ code: 'EEXIST' });
  });

  /* Write the temporary sibling, try the rename, unlink the record, rename into place: four steps. */
  it.each([1, 2, 3, 4, 5])('reads the old record or the new one when the host dies at step %i', async (stop) => {
    const provider = await memory();
    const files = filesOf(provider);
    await writeControlRecord(files, path, 'old\n');

    await writeControlRecord(dying(provider, stop), path, 'new\n').catch(() => undefined);

    /* Straight away the stopped writer's whole sibling answers; it is promoted only once its grace is over. */
    const read = await readControlRecord(files, path, now);
    expect(read).toBe(stop >= 4 ? 'new\n' : 'old\n');
    await expect(readControlRecord(files, path, later)).resolves.toBe(read);
    /* Once read late, the record is in place and no leftover sibling stands beside a missing record. */
    expect(await provider.readFile(path, 'utf8')).toBe(read);
  });

  it('answers a first write from its sibling to a reader between the write and the rename, and lands it', async () => {
    const provider = await memory();
    const seen: Array<string | undefined> = [];

    await writeControlRecord(racedBy(provider, now, seen), path, 'first\n');

    expect(seen).toStrictEqual(['first\n']);
    expect(await provider.readFile(path, 'utf8')).toBe('first\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('keeps the write when a reader promotes its sibling before its own rename', async () => {
    const provider = await memory();
    const seen: Array<string | undefined> = [];

    /* A reader whose clock says the sibling's writer stopped long ago takes it; the writer's rename finds it gone. */
    await writeControlRecord(racedBy(provider, later, seen), path, 'first\n');

    expect(seen).toStrictEqual(['first\n']);
    expect(await provider.readFile(path, 'utf8')).toBe('first\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('writes again when the record a reader promoted is not its own', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    let raced = false;
    const racing: ControlPlaneFiles = {
      ...files,
      rename: async (from, to) => {
        if (!raced) {
          raced = true;
          /* Another writer's text lands, and this writer's sibling is gone. */
          await files.unlink(from);
          await files.writeFile(to, 'theirs\n');
        }
        await files.rename(from, to);
      },
    };

    await writeControlRecord(racing, path, 'mine\n');

    expect(await provider.readFile(path, 'utf8')).toBe('mine\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });

  it('never promotes or answers a half-written sibling, however old', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    const reading: ControlRecordReading = {
      accepts: jsonRecord((value) => typeof value === 'object' && value !== null),
      now: later.now,
    };
    await provider.writeFile('.git/ops-devices.json.one.writing', '{"version":1,"devi');

    await expect(readControlRecord(files, '.git/ops-devices.json', reading)).resolves.toBeUndefined();
    expect(await provider.readdir('.git')).toStrictEqual(['ops-devices.json.one.writing']);

    /* A whole sibling older than a torn one is the one answered and promoted. */
    await provider.unlink('.git/ops-devices.json.one.writing');
    await provider.writeFile('.git/ops-devices.json.zero.writing', '{"version":1,"devices":{}}\n');
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await provider.writeFile('.git/ops-devices.json.one.writing', '{"version":1,"devi');
    await expect(readControlRecord(files, '.git/ops-devices.json', reading)).resolves.toBe(
      '{"version":1,"devices":{}}\n',
    );
    expect(await provider.readFile('.git/ops-devices.json', 'utf8')).toBe('{"version":1,"devices":{}}\n');
  });

  it('leaves a sibling within its grace where it is', async () => {
    const provider = await memory();
    const files = filesOf(provider);
    await provider.writeFile(`${path}.live.writing`, 'pending\n');

    await expect(readControlRecord(files, path, now)).resolves.toBe('pending\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending.live.writing']);
  });

  it('promotes the newest whole sibling of a missing record and removes the older ones', async () => {
    const provider = await memory();
    await provider.writeFile(`${path}.one.writing`, 'older\n');
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await provider.writeFile(`${path}.two.writing`, 'newer\n');

    await expect(readControlRecord(filesOf(provider), path, later)).resolves.toBe('newer\n');
    const left = await provider.readdir('.git');
    expect(left.toSorted()).toStrictEqual(['sync-pending']);
  });

  it('answers undefined when there is no record and no sibling', async () => {
    const provider = await memory();
    await expect(readControlRecord(filesOf(provider), path, now)).resolves.toBeUndefined();
    await expect(readControlRecord(filesOf(provider), '.git/missing/record', now)).resolves.toBeUndefined();
  });

  it('replaces a record on a provider that renames over a file, leaving no sibling', async () => {
    const provider = await memory();
    const renamingOver: ControlPlaneFiles = {
      ...filesOf(provider),
      rename: async (from, to) => {
        await provider.unlink(to).catch(() => undefined);
        await provider.rename(from, to);
      },
    };
    await writeControlRecord(renamingOver, path, 'one\n');
    await writeControlRecord(renamingOver, path, 'two\n');
    await expect(readControlRecord(renamingOver, path, now)).resolves.toBe('two\n');
    expect(await provider.readdir('.git')).toStrictEqual(['sync-pending']);
  });
});
