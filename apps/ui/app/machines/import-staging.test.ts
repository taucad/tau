// @vitest-environment node
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import {
  createInlineImportDecoder,
  importStagingDirectory,
  importStagingStaleMilliseconds,
  planImport,
  stageImport,
  zipImportSource,
} from '@taucad/filesystem/importer';
import type { ImportDecoder, ImportStagingPort } from '@taucad/filesystem/importer';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { BatchEntry } from '@taucad/filesystem';
import {
  ImportChannelError,
  createFromStagedImport,
  holdLease,
  importConnectMessageType,
  openImportSession,
  serveImportChannel,
} from '#machines/import-staging.js';
import type { ImportSession } from '#machines/import-staging.js';

const sessions: ImportSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.close();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const scope = { backend: 'indexeddb' } as const;

const zipOf = async (files: Record<string, string>): Promise<File> => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes as Uint8Array<ArrayBuffer>], 'gear.zip');
};

const removeTree = async (provider: MemoryProvider, path: string): Promise<void> => {
  const stat = await provider.stat(path);
  if (stat.type === 'dir') {
    for (const name of await provider.readdir(path)) {
      // oxlint-disable-next-line no-await-in-loop -- a test tree is removed depth first.
      await removeTree(provider, `${path}/${name}`);
    }
    await provider.rmdir(path);
    return;
  }
  await provider.unlink(path);
};

const settle = async (check: () => Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polled until the worker's half settles.
    if (await check()) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- a short pause between polls.
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error('The worker did not settle.');
};

const portOf = (provider: MemoryProvider): ImportStagingPort => ({
  provider,
  apply: async (entries: readonly BatchEntry[]): Promise<Array<{ outcome: 'applied' }>> => {
    for (const entry of entries) {
      if (entry.op === 'write') {
        // oxlint-disable-next-line no-await-in-loop -- a test port writes in order.
        await provider.writeFile(entry.path, entry.data as Uint8Array<ArrayBuffer>);
      } else if (entry.op === 'delete') {
        // oxlint-disable-next-line no-await-in-loop -- a test port removes in order.
        await removeTree(provider, entry.path);
      }
    }
    return entries.map(() => ({ outcome: 'applied' }));
  },
});

/* The worker's half served behind a fake worker, the page's half opened on it: one real message channel. */
const connect = (provider: MemoryProvider, decode: ImportDecoder = createInlineImportDecoder()): ImportSession => {
  const port = portOf(provider);
  const session = openImportSession({
    postMessage: (message: { type: string; port: MessagePort }) => {
      expect(message.type).toBe(importConnectMessageType);
      serveImportChannel(message.port, { importStaging: async () => port, decode, policy: tauPathPolicy });
    },
  } as unknown as Pick<Worker, 'postMessage'>);
  sessions.push(session);
  return session;
};

describe('the import channel', () => {
  it('plans a zip into paths and sizes, stages it, previews from it, and discards it', async () => {
    const provider = new MemoryProvider();
    const session = connect(provider);
    const file = await zipOf({ 'gear/main.scad': 'cube(1);', 'gear/.git/HEAD': 'ref' });

    const listing = await session.plan({ kind: 'zip', file });

    expect(listing).toStrictEqual({
      name: 'gear',
      files: [{ path: 'main.scad', size: 8 }],
      bytes: 8,
      skipped: { excluded: 1, reserved: 0, symlinks: 0 },
    });

    const progress: number[] = [];
    const staged = await session.stage('req_channel', scope, {
      target: 'gear',
      onProgress: ({ files }) => {
        progress.push(files);
      },
    });

    /* A memory root's rename is not declared free, so the files are written into the project folder itself. */
    expect(staged).toStrictEqual({ files: 1, bytes: 8, inPlace: true, target: 'gear' });
    expect(progress.at(-1)).toBe(1);
    expect(new TextDecoder().decode(await provider.readFile('gear/main.scad'))).toBe('cube(1);');

    const preview = await session.preview(['main.scad'], 1024);
    expect(new TextDecoder().decode(preview['main.scad']!.content)).toBe('cube(1);');
    expect(await session.preview(['main.scad'], 4)).toStrictEqual({});

    await session.discard('req_channel', scope);
    expect(await provider.exists(importStagingDirectory('req_channel'))).toBe(false);
    expect(await provider.exists('gear')).toBe(false);
  });

  it('spends the preview budget in the order asked, and never hashes a preview', async () => {
    const decode = vi.fn(createInlineImportDecoder());
    const session = connect(new MemoryProvider(), decode);
    await session.plan({ kind: 'zip', file: await zipOf({ 'a.scad': 'aaaa', 'b.scad': 'bbbb', 'c.scad': 'cccc' }) });

    const preview = await session.preview(['c.scad', 'a.scad', 'b.scad'], 8);

    expect(Object.keys(preview)).toStrictEqual(['c.scad', 'a.scad']);
    expect(decode).not.toHaveBeenCalled();
  });

  it('carries the policy reason of a refusal to the page', async () => {
    const session = connect(new MemoryProvider());
    const zip = new JSZip();
    zip.file('../../evil.sh', 'boom');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'x.zip');

    const refused = await session.plan({ kind: 'zip', file }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ImportChannelError);
    expect((refused as ImportChannelError).reason).toBe('unsafePath');
  });

  it('refuses to stage before anything is planned', async () => {
    const session = connect(new MemoryProvider());

    await expect(session.stage('req_none', scope, { target: 'none' })).rejects.toThrow('Nothing is planned');
  });

  it('removes a staging still running when the page closes the session (the route unmounts)', async () => {
    const provider = new MemoryProvider();
    const inline = createInlineImportDecoder();
    const started = Promise.withResolvers<void>();
    const decode: ImportDecoder = async (request, options) => {
      started.resolve();
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      return inline(request, options);
    };
    const session = connect(provider, decode);
    await session.plan({ kind: 'zip', file: await zipOf({ 'gear/main.scad': 'cube(1);' }) });
    const staging = (async (): Promise<unknown> => {
      try {
        return await session.stage('req_unmount', scope, { target: 'gear' });
      } catch (error) {
        return error;
      }
    })();
    await started.promise;
    expect(await provider.exists(importStagingDirectory('req_unmount'))).toBe(true);

    sessions.splice(sessions.indexOf(session), 1);
    session.close();

    expect(await staging).toBeInstanceOf(ImportChannelError);
    await settle(async () => !(await provider.exists(importStagingDirectory('req_unmount'))));
    expect(await provider.exists('gear')).toBe(false);
  });

  it('keeps a staging it handed off to a create when it closes', async () => {
    const provider = new MemoryProvider();
    const session = connect(provider);
    await session.plan({ kind: 'zip', file: await zipOf({ 'gear/main.scad': 'cube(1);' }) });
    await session.stage('req_kept', scope, { target: 'gear' });
    await session.handOff('req_kept');
    await session.stage('req_dropped', scope, { target: 'other' });

    sessions.splice(sessions.indexOf(session), 1);
    session.close();

    await settle(async () => !(await provider.exists(importStagingDirectory('req_dropped'))));
    expect(await provider.exists(importStagingDirectory('req_kept'))).toBe(true);
    expect(await provider.exists('gear/main.scad')).toBe(true);
    expect(await provider.exists('other')).toBe(false);
  });

  it('sweeps what no journal row or live session owns once it is still, and keeps a live staging', async () => {
    const provider = new MemoryProvider();
    const first = connect(provider);
    await first.plan({ kind: 'zip', file: await zipOf({ 'gear/main.scad': 'cube(1);' }) });
    await first.stage('req_crashed', scope, { target: 'crashed' });
    await first.handOff('req_crashed');
    await first.stage('req_journaled', scope, { target: 'journaled' });
    await first.handOff('req_journaled');
    /* Their creates are done: the one journaled, the other's tab gone before it could be. */
    await first.release('req_crashed');
    await first.release('req_journaled');
    await first.stage('req_live', scope, { target: 'live' });
    const second = connect(provider);

    expect(await second.sweep(scope, ['req_journaled'])).toStrictEqual([]);

    vi.useFakeTimers({ now: Date.now() + importStagingStaleMilliseconds + 1000, toFake: ['Date'] });

    expect(await second.sweep(scope, ['req_journaled'])).toStrictEqual(['req_crashed']);
    expect(await provider.exists('crashed')).toBe(false);
    expect(await provider.exists(importStagingDirectory('req_journaled'))).toBe(true);
    expect(await provider.exists(importStagingDirectory('req_live'))).toBe(true);
  });

  it('refuses at once what is asked after the session closed, instead of waiting on a closed port', async () => {
    const session = connect(new MemoryProvider());
    sessions.splice(sessions.indexOf(session), 1);
    session.close();

    await expect(session.discard('req_late', scope)).rejects.toThrow('The import was closed.');
  });

  it('counts a staging whose lease was refused as live nowhere, so a sweep may remove it', async () => {
    const provider = new MemoryProvider();
    vi.stubGlobal('navigator', {
      locks: {
        request: async () => {
          throw new Error('denied');
        },
        query: async () => ({ held: [], pending: [] }),
      },
    });

    await expect(holdLease('req_refused', async () => undefined)).rejects.toThrow('denied');

    /* The same operation's staging, left by a crash: nothing holds it now. */
    const judged = await planImport(zipImportSource(await zipOf({ 'a.scad': 'a' })), { policy: tauPathPolicy });
    await stageImport({
      port: portOf(provider),
      operationId: 'req_refused',
      plan: judged,
      decode: createInlineImportDecoder(),
    });
    vi.useFakeTimers({ now: Date.now() + importStagingStaleMilliseconds + 1000, toFake: ['Date'] });

    expect(await connect(provider).sweep(scope, [])).toStrictEqual(['req_refused']);
  });

  it('beats where no Web Locks exist, and stops before it is released', async () => {
    vi.stubGlobal('navigator', {});
    vi.useFakeTimers();
    const touch = vi.fn(async () => undefined);

    const release = await holdLease('req_beating', touch);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

    expect(touch).toHaveBeenCalledTimes(2);

    await release();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(touch).toHaveBeenCalledTimes(2);
  });

  describe('creating from a staged import', () => {
    const target = { location: 'home', scope, providerBasePath: 'gear', owned: [] as string[] };

    const planned = async (provider: MemoryProvider): Promise<ImportSession> => {
      const session = connect(provider);
      await session.plan({ kind: 'zip', file: await zipOf({ 'gear/main.scad': 'cube(1);' }) });
      return session;
    };

    it('holds the staging live until the create is done, so no sweep removes it before its journal row', async () => {
      const provider = new MemoryProvider();
      const sweeper = connect(provider);
      let swept: readonly string[] | undefined;

      await createFromStagedImport({
        session: await planned(provider),
        target,
        operationId: 'req_creating',
        create: async () => {
          /* Another tab sweeps, long after the staging went still, while this create has not journaled it. */
          vi.useFakeTimers({ now: Date.now() + importStagingStaleMilliseconds + 1000, toFake: ['Date'] });
          swept = await sweeper.sweep(scope, []);
          vi.useRealTimers();
          return { id: 'proj_1' };
        },
        owns: async () => true,
      });

      expect(swept).toStrictEqual([]);
      expect(await provider.exists('gear/main.scad')).toBe(true);
    });

    it('creates from the staging, telling the create where it was written in place', async () => {
      const provider = new MemoryProvider();
      const create = vi.fn(async () => ({ id: 'proj_1' }));

      await expect(
        createFromStagedImport({
          session: await planned(provider),
          target,
          operationId: 'req_ok',
          create,
          owns: async () => false,
        }),
      ).resolves.toStrictEqual({ id: 'proj_1' });

      expect(create).toHaveBeenCalledWith({ operationId: 'req_ok', providerBasePath: 'gear' });
    });

    it('discards the staging when the create fails before any journal row names it', async () => {
      const provider = new MemoryProvider();

      await expect(
        createFromStagedImport({
          session: await planned(provider),
          target,
          operationId: 'req_failed',
          create: async () => {
            throw new Error('quota');
          },
          owns: async () => false,
        }),
      ).rejects.toThrow('quota');

      expect(await provider.exists(importStagingDirectory('req_failed'))).toBe(false);
      expect(await provider.exists('gear')).toBe(false);
    });

    it('keeps the staging for its recovery when the create failed after journaling it', async () => {
      const provider = new MemoryProvider();

      await expect(
        createFromStagedImport({
          session: await planned(provider),
          target,
          operationId: 'req_journaled',
          create: async () => {
            throw new Error('commit failed');
          },
          owns: async (operationId) => operationId === 'req_journaled',
        }),
      ).rejects.toThrow('commit failed');

      expect(await provider.exists(importStagingDirectory('req_journaled'))).toBe(true);
    });

    it('creates into the next free folder when a plain folder holds the name', async () => {
      const provider = new MemoryProvider();
      await provider.writeFile('gear/existing.txt', 'mine');
      const create = vi.fn(async () => ({ id: 'proj_1' }));

      await createFromStagedImport({
        session: await planned(provider),
        target,
        operationId: 'req_suffixed',
        create,
        owns: async () => false,
      });

      expect(create).toHaveBeenCalledWith({ operationId: 'req_suffixed', providerBasePath: 'gear-2' });
      expect(await provider.readdir('gear')).toStrictEqual(['existing.txt']);
    });

    it('discards a staging that failed partway', async () => {
      const provider = new MemoryProvider();
      const session = connect(provider, async () => {
        throw new Error('decode failed');
      });
      await session.plan({ kind: 'zip', file: await zipOf({ 'gear/main.scad': 'cube(1);' }) });
      const create = vi.fn();

      await expect(
        createFromStagedImport({ session, target, operationId: 'req_refused', create, owns: async () => false }),
      ).rejects.toThrow('decode failed');

      expect(create).not.toHaveBeenCalled();
      expect(await provider.exists(importStagingDirectory('req_refused'))).toBe(false);
      expect(await provider.exists('gear')).toBe(false);
    });
  });
});
