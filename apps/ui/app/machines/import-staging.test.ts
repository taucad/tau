// @vitest-environment node
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import {
  createInlineImportDecoder,
  createInlineImportMeasurer,
  importStagingDirectory,
  importStagingStaleMilliseconds,
  planImport,
  readStagedImport,
  stageImport,
  zipImportSource,
} from '@taucad/filesystem/importer';
import type {
  HostImportCopyReceipt,
  HostImportSourcePort,
  ImportDecoder,
  ImportStagingPort,
} from '@taucad/filesystem/importer';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { BatchEntry } from '@taucad/filesystem';
import {
  ImportChannelError,
  createFromStagedImport,
  downloadInterrupted,
  downloadRefusal,
  holdLease,
  importCommitHeader,
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

  describe('a repository archive', () => {
    const archiveUrl = 'https://api.tau.test/v1/repositories/archive?owner=o&repo=r';
    const answering = (response: Response) => {
      const fetched = vi.fn(async (_url: URL, _init?: RequestInit) => response);
      vi.stubGlobal('fetch', fetched);
      return fetched;
    };

    it('downloads it in the worker with no credential, and plans only the folder asked for', async () => {
      const zip = await zipOf({
        'r-abc/README.md': 'r',
        'r-abc/public/kcl-samples/gear/main.kcl': 'gear',
        'r-abc/rust/ops.snap': 's',
      });
      const fetched = answering(new Response(zip, { status: 200, headers: { 'content-length': String(zip.size) } }));
      const downloads: number[] = [];
      const session = connect(new MemoryProvider());

      const listing = await session.plan(
        { kind: 'archive', url: archiveUrl, name: 'o/r', headers: { accept: 'application/zip' } },
        {
          root: 'public/kcl-samples',
          onDownload: ({ loaded }) => {
            downloads.push(loaded);
          },
        },
      );

      expect(listing.files).toStrictEqual([{ path: 'gear/main.kcl', size: 4 }]);
      expect(listing.name).toBe('o/r');
      expect(downloads.at(-1)).toBe(zip.size);
      expect(fetched.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', headers: { accept: 'application/zip' } });

      /* What it planned stages like any other source. */
      const staged = await session.stage('req_archive', scope, { target: 'gear' });
      expect(staged.files).toBe(1);
    });

    /* What a call settled with, kept as a value so the test can look later. */
    const outcome = async (work: Promise<unknown>): Promise<unknown> => {
      try {
        return await work;
      } catch (error) {
        return error;
      }
    };

    /* An archive whose bytes arrive only when the test sends them; the download's abort errors it, as fetch does. */
    const heldArchive = () => {
      let controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;
      let signal: AbortSignal | undefined;
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(held) {
          controller = held;
        },
      });
      return {
        respond: (init?: RequestInit) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => {
            controller?.error(signal?.reason);
          });
          return new Response(stream, { status: 200 });
        },
        signal: () => signal,
        send: async (zip: Blob) => {
          try {
            controller?.enqueue(new Uint8Array(await zip.arrayBuffer()));
            controller?.close();
          } catch {
            /* Already errored by the abort. */
          }
        },
      };
    };

    it('never lets an earlier plan that finishes later replace a newer one', async () => {
      const first = heldArchive();
      const zipB = await zipOf({ 'b-abc/b.kcl': 'b' });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL, init?: RequestInit) =>
          String(url).includes('repo=a') ? first.respond(init) : new Response(zipB, { status: 200 }),
        ),
      );
      const session = connect(new MemoryProvider());

      const planA = outcome(session.plan({ kind: 'archive', url: `${archiveUrl}&repo=a`, name: 'o/a' }));
      await vi.waitFor(() => {
        expect(first.signal()).toBeDefined();
      });
      const planB = await session.plan({ kind: 'archive', url: `${archiveUrl}&repo=b`, name: 'o/b' });
      await first.send(await zipOf({ 'a-abc/a1.kcl': 'a', 'a-abc/a2.kcl': 'a' }));

      expect(planB.files).toStrictEqual([{ path: 'b.kcl', size: 1 }]);
      expect(await planA).toBeInstanceOf(ImportChannelError);
      expect(first.signal()?.aborted).toBe(true);
      /* The plan the review shows is the one that stages. */
      const staged = await session.stage('req_b', scope, { target: 'b' });
      expect(staged.files).toBe(1);
    });

    it('stops a cancelled download in the worker, and it never becomes the plan', async () => {
      const first = heldArchive();
      const zipB = await zipOf({ 'b-abc/b.kcl': 'b' });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL, init?: RequestInit) =>
          String(url).includes('repo=a') ? first.respond(init) : new Response(zipB, { status: 200 }),
        ),
      );
      const session = connect(new MemoryProvider());
      const cancel = new AbortController();

      const planA = outcome(
        session.plan({ kind: 'archive', url: `${archiveUrl}&repo=a`, name: 'o/a' }, { signal: cancel.signal }),
      );
      await vi.waitFor(() => {
        expect(first.signal()).toBeDefined();
      });
      cancel.abort();

      expect(await planA).toBeInstanceOf(ImportChannelError);
      await vi.waitFor(() => {
        expect(first.signal()?.aborted).toBe(true);
      });
      await first.send(await zipOf({ 'a-abc/a1.kcl': 'a', 'a-abc/a2.kcl': 'a' }));
      /* Nothing is planned until the next import asks. */
      await expect(session.stage('req_a', scope, { target: 'a' })).rejects.toThrow('Nothing is planned to stage.');

      await session.plan({ kind: 'archive', url: `${archiveUrl}&repo=b`, name: 'o/b' });
      const staged = await session.stage('req_b', scope, { target: 'b' });
      expect(staged.files).toBe(1);
    });

    it('refuses a download that ends before its declared length as corrupt', async () => {
      const zip = await zipOf({ 'r-abc/main.kcl': 'm' });
      answering(
        new Response(zip.slice(0, zip.size - 10), { status: 200, headers: { 'content-length': String(zip.size) } }),
      );
      const session = connect(new MemoryProvider());

      const refused = await session
        .plan({ kind: 'archive', url: archiveUrl, name: 'o/r' })
        .catch((error: unknown) => error);

      expect((refused as ImportChannelError).reason).toBe('corrupt');
    });

    it.each([
      ['the commit the gateway names', { [importCommitHeader]: 'B'.repeat(40) }, 'b'.repeat(40)],
      ["the top folder's short sha when it names none", {}, 'abc1234'],
      ["the top folder's short sha when what it names is no commit", { [importCommitHeader]: 'main' }, 'abc1234'],
    ])('pins a GitHub archive at %s', async (_, headers: Record<string, string>, revision) => {
      const provider = new MemoryProvider();
      answering(new Response(await zipOf({ 'o-r-abc1234/main.kcl': 'm' }), { status: 200, headers }));
      const session = connect(provider);

      await session.plan({ kind: 'archive', url: archiveUrl, name: 'o/r', provider: 'github' });
      await session.stage('req_pinned', scope, { target: 'r' });

      const staged = await readStagedImport(provider, 'req_pinned');
      expect(staged?.pin.revision).toBe(revision);
    });

    it('pins an archive from elsewhere at no revision when no commit is named, whatever its top folder says', async () => {
      const provider = new MemoryProvider();
      answering(new Response(await zipOf({ 'o-r-abc1234/main.kcl': 'm' }), { status: 200 }));
      const session = connect(provider);

      await session.plan({ kind: 'archive', url: archiveUrl, name: 'o/r' });
      await session.stage('req_unpinned', scope, { target: 'r' });

      const staged = await readStagedImport(provider, 'req_unpinned');
      expect(staged?.pin.revision).toBeUndefined();
    });

    it('says a download that failed partway may be rate limited, not damaged', async () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull(controller) {
          if (sent) {
            controller.error(new TypeError('network error'));
            return;
          }
          sent = true;
          controller.enqueue(new Uint8Array(1024));
        },
      });
      answering(new Response(body, { status: 200 }));
      const session = connect(new MemoryProvider());

      const refused = await outcome(session.plan({ kind: 'archive', url: archiveUrl, name: 'o/r' }));

      expect(refused).toBeInstanceOf(ImportChannelError);
      expect((refused as ImportChannelError).message).toBe(downloadInterrupted);
      expect((refused as ImportChannelError).reason).toBeUndefined();
    });

    it("refuses the gateway's 413 and a declared size past the limit as too large", async () => {
      answering(new Response('The repository archive exceeds the import size limit.', { status: 413 }));
      const session = connect(new MemoryProvider());

      const refused = await session
        .plan({ kind: 'archive', url: archiveUrl, name: 'o/r' })
        .catch((error: unknown) => error);

      expect((refused as ImportChannelError).reason).toBe('archiveTooLarge');

      answering(new Response('zip', { status: 200, headers: { 'content-length': String(1024 * 1024 * 1024 + 1) } }));
      const declared = await session
        .plan({ kind: 'archive', url: archiveUrl, name: 'o/r' })
        .catch((error: unknown) => error);

      expect((declared as ImportChannelError).reason).toBe('archiveTooLarge');
    });

    it("says why another refusal failed, in the server's words, with no reason", async () => {
      answering(new Response('The repository provider could not be reached.', { status: 502 }));
      const session = connect(new MemoryProvider());

      const refused = await session
        .plan({ kind: 'archive', url: archiveUrl, name: 'o/r' })
        .catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(ImportChannelError);
      expect((refused as ImportChannelError).message).toBe('The repository provider could not be reached.');
      expect((refused as ImportChannelError).reason).toBeUndefined();
    });

    it('downloads over HTTP only', async () => {
      const fetched = answering(new Response('x'));
      const session = connect(new MemoryProvider());

      await expect(session.plan({ kind: 'archive', url: 'file:///etc/passwd', name: 'x' })).rejects.toThrow(
        'An archive downloads over HTTP only',
      );
      expect(fetched).not.toHaveBeenCalled();
    });

    it.each([
      [
        'an API refusal',
        new Response(JSON.stringify({ error: 'Too many GitHub imports.', code: 'REPOSITORY_RATE_LIMITED' }), {
          status: 429,
        }),
        'Too many GitHub imports.',
      ],
      [
        "the archive gateway's sentence",
        new Response('The repository archive could not be fetched.', { status: 404 }),
        'The repository archive could not be fetched.',
      ],
      [
        'an empty body',
        new Response('', { status: 502, statusText: 'Bad Gateway' }),
        'Download failed: 502 Bad Gateway',
      ],
    ])('says why a refused download failed for %s', async (_case, response, sentence) => {
      await expect(downloadRefusal(response)).resolves.toBe(sentence);
    });
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

describe('a source chosen on the desktop host', () => {
  /* A host that holds one granted folder: it lists and previews by grant, and copies into the staging itself. */
  const hostFolder: Record<string, string> = { 'main.scad': 'cube(1);', 'lib/gear.scad': 'module g() {}' };
  const encoder = new TextEncoder();
  const sources: HostImportSourcePort = {
    list: async (grant, path) => {
      expect(grant).toBe('grant-bracket');
      const prefix = path === '' ? '' : `${path}/`;
      const names = new Map<string, 'file' | 'dir'>();
      for (const file of Object.keys(hostFolder)) {
        if (file.startsWith(prefix)) {
          const [name, ...rest] = file.slice(prefix.length).split('/');
          names.set(name!, rest.length > 0 ? 'dir' : 'file');
        }
      }
      const rows = [...names].map(([name, kind]) => ({
        name,
        kind,
        size: kind === 'file' ? encoder.encode(hostFolder[`${prefix}${name}`]).byteLength : 0,
        mtimeMs: 1,
      }));
      return { rows, more: false };
    },
    read: async (_grant, path, maximumBytes) => encoder.encode(hostFolder[path]).slice(0, maximumBytes),
  };

  const connectHost = (provider: MemoryProvider, hostSources?: () => Promise<HostImportSourcePort | undefined>) => {
    const measure = createInlineImportMeasurer();
    const copied: string[] = [];
    const port: ImportStagingPort = {
      ...portOf(provider),
      copyHost: async (_grant, entries) =>
        Promise.all(
          entries.map(async ({ from, path }) => {
            const bytes = encoder.encode(hostFolder[from]);
            copied.push(from);
            await provider.writeFile(path, bytes);
            const { size: _, ...facts } = await measure(bytes, bytes.byteLength);
            const applied: HostImportCopyReceipt = { outcome: 'applied', facts };
            return applied;
          }),
        ),
    };
    const session = openImportSession({
      postMessage: (message: { port: MessagePort }) => {
        serveImportChannel(message.port, {
          importStaging: async () => port,
          decode: vi.fn(createInlineImportDecoder()),
          policy: tauPathPolicy,
          ...(hostSources === undefined ? {} : { hostSources }),
        });
      },
    } as unknown as Pick<Worker, 'postMessage'>);
    sessions.push(session);
    return { session, copied };
  };

  it('plans by grant, previews through the host, and stages what the host copied', async () => {
    const provider = new MemoryProvider();
    const { session, copied } = connectHost(provider, async () => sources);
    const listing = await session.plan({
      kind: 'host',
      grants: [{ grant: 'grant-bracket', name: 'Bracket', kind: 'directory' }],
    });
    expect(listing.name).toBe('Bracket');
    expect(listing.files.map(({ path }) => path).toSorted()).toEqual(['lib/gear.scad', 'main.scad']);
    const preview = await session.preview(['main.scad'], 1024);
    expect(new TextDecoder().decode(preview['main.scad']!.content)).toBe('cube(1);');
    const staged = await session.stage('req_host', scope, { target: 'Bracket' });
    expect(staged.files).toBe(2);
    expect(copied.toSorted()).toEqual(['lib/gear.scad', 'main.scad']);
    expect(new TextDecoder().decode(await provider.readFile('Bracket/main.scad'))).toBe('cube(1);');
  });

  it('refuses a host source where no host holds one', async () => {
    const { session } = connectHost(new MemoryProvider());
    await expect(
      session.plan({ kind: 'host', grants: [{ grant: 'grant-bracket', name: 'Bracket', kind: 'directory' }] }),
    ).rejects.toThrow(/cannot import a folder/u);
  });
});
