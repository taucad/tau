import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createMemoryProvider, MemoryProvider } from '@taucad/filesystem/backend';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { postService } from '#adapter-transport/adapter-transport.js';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createRevisionHttpClient } from '#http-client.js';
import type { RevisionHttpClient } from '#http-client.js';
import { revisionId } from '#algorithms/index.js';
import { coldOpenFromCatalogue, importReachableFromCatalogue, parseHeadListing } from '#object-store/cold-open.js';
import type { CatalogueFamily } from '#object-store/cold-open.js';
import { createObjectStore, gitFilesOf, PackCeilingError } from '#object-store/object-store.js';
import type { ObjectStore } from '#object-store/object-store.js';
import { coalesceRanges, maximumRangeBytes } from '#object-store/remote-pack.js';
import { readPackIndex } from '#pack-reader/pack-index.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { profileChainDepth } from '#test/chain-depth-profile.js';
import { mergeBaseHeads, mergeBaseOf } from '#revision-log-order.js';

const catalogueUrl = 'https://api.test/v1/projects/project-1/git/catalogue';
const filesOrigin = 'https://files.test/v1/git/owner-1/project-1';
const nonce = '0123456789abcdef';

describe('coalesceRanges', () => {
  it('merges ranges that touch, and never across a gap', () => {
    expect(
      coalesceRanges([
        [30, 40],
        [0, 10],
        [10, 20],
      ]),
    ).toEqual([
      [0, 20],
      [30, 40],
    ]);
  });

  it('never merges past the files host segment ceiling', () => {
    const half = maximumRangeBytes / 2;
    const merged = coalesceRanges([
      [0, half],
      [half, maximumRangeBytes],
      [maximumRangeBytes, maximumRangeBytes + 10],
    ]);
    expect(merged).toEqual([
      [0, maximumRangeBytes],
      [maximumRangeBytes, maximumRangeBytes + 10],
    ]);
    expect(merged.every(([start, end]) => end - start <= maximumRangeBytes)).toBe(true);
  });
});

describe('parseHeadListing', () => {
  it('reads entries, a submodule and an escaped path', () => {
    const listing = parseHeadListing(
      [
        `tau-head-listing\t1\t${'a'.repeat(40)}\t${'b'.repeat(40)}`,
        `100644\t${'c'.repeat(40)}\t12\t\t\ttab\\there`,
        `160000\t${'d'.repeat(40)}\t-\t\t\tvendor`,
        '',
      ].join('\n'),
    );
    expect(listing.entries).toEqual([
      { mode: '100644', oid: 'c'.repeat(40), size: 12, path: 'tab\there' },
      { mode: '160000', oid: 'd'.repeat(40), size: undefined, path: 'vendor' },
    ]);
    expect(() => parseHeadListing('something else\n')).toThrow(TypeError);
  });
});

describe('postService', () => {
  it('stops reading an upload-pack answer at its ceiling', async () => {
    let chunksRead = 0;
    const http: RevisionHttpClient = {
      request: async () => ({
        url: 'https://example.test/project.git/git-upload-pack',
        method: 'POST',
        headers: {},
        statusCode: 200,
        statusMessage: 'OK',
        body: (async function* answer(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
          for (let index = 0; index < 100; index += 1) {
            chunksRead += 1;
            yield new Uint8Array(1024);
          }
        })(),
      }),
    };
    await expect(
      postService(http, {
        url: 'https://example.test/project.git',
        service: 'git-upload-pack',
        body: new Uint8Array(1),
        maximumBytes: 4096,
      }),
    ).rejects.toBeInstanceOf(PackCeilingError);
    expect(chunksRead).toBe(5);
  });
});

/* A hosted repository: a pack, its index and a head listing, behind a fake API and files host. */
type Hosted = {
  readonly directory: string;
  readonly git: (...args: string[]) => string;
  readonly write: (path: string, content: string | Uint8Array<ArrayBuffer>) => Promise<void>;
  /* Repack and serve what the repository now holds. */
  readonly publish: () => Promise<void>;
  pack: Uint8Array<ArrayBuffer>;
  index: Uint8Array<ArrayBuffer>;
  packName: string;
  main: string;
  listing: Uint8Array<ArrayBuffer>;
} & Readonly<{
  parent: string;
  tag: string;
  tagged: string;
  ops: string;
  chat: string;
  /* Objects only the ops or chat refs reach. */
  opsOnly: readonly string[];
  chatOnly: readonly string[];
}>;

type Served = Readonly<{
  fetch: typeof globalThis.fetch;
  catalogueQueries: string[];
  ranges: Array<readonly [number, number]>;
  wholePackReads: () => number;
}>;

const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '');

const host = async (): Promise<Hosted> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-w5-cold-'));
  /* Git's own variable names, set by entry so no config of the host's leaks in. */
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of [
    ['GIT_AUTHOR_NAME', 'Tau'],
    ['GIT_AUTHOR_EMAIL', 'tau@example.com'],
    ['GIT_COMMITTER_NAME', 'Tau'],
    ['GIT_COMMITTER_EMAIL', 'tau@example.com'],
    ['GIT_CONFIG_NOSYSTEM', '1'],
    ['HOME', directory],
  ] as const) {
    environment[name] = value;
  }
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: directory, env: environment, encoding: 'utf8' }).trim();
  const run = (args: readonly string[], input: string): string =>
    execFileSync('git', args, { cwd: directory, env: environment, input, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  const body = Array.from({ length: 200 }, (_value, line) => `cube(${String(line)});`);
  /* Five commits that each change one line, so the pack holds delta chains. */
  for (let commit = 0; commit < 5; commit += 1) {
    body[commit * 10] = `sphere(${String(commit)});`;
    // oxlint-disable-next-line no-await-in-loop -- each commit's files are written before it is made.
    await mkdir(join(directory, 'parts', 'deep'), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- as above.
    await Promise.all([
      writeFile(join(directory, 'main.scad'), `${body.join('\n')}\n`),
      writeFile(join(directory, 'parts', 'b.scad'), `${body.toReversed().join('\n')}\n`),
      writeFile(join(directory, 'parts', 'deep', 'c.scad'), `// ${String(commit)}\n${body.join('\n')}\n`),
    ]);
    git('add', '-A');
    git('commit', '-q', '-m', `Commit ${String(commit)}`);
  }
  const main = git('rev-parse', 'refs/heads/main');
  const parent = git('rev-parse', 'refs/heads/main~1');
  const tagged = git('rev-parse', 'refs/heads/main~2');
  git('tag', '-a', 'v1', '-m', 'one', tagged);
  const tag = git('rev-parse', 'refs/tags/v1');
  /* Ops and chat records: unrelated, random content, so nothing on main is a delta of theirs. */
  const unrelated = (name: string): string => {
    const blob = run(['hash-object', '-w', '--stdin'], randomBytes(512).toString('hex'));
    const tree = run(['mktree'], `100644 blob ${blob}\t${name}.json\n`);
    return run(['commit-tree', tree, '-m', name], '');
  };
  const ops = unrelated('ops');
  const chat = unrelated('chat');
  git('update-ref', 'refs/tau/ops/session', ops);
  git('update-ref', 'refs/tau/chats/c1', chat);
  const only = (ref: string): string[] =>
    lines(git('rev-list', '--objects', ref, '--not', 'refs/heads/main', 'refs/tags/v1')).map(
      (line) => line.split(' ')[0]!,
    );
  const empty = new Uint8Array(0);
  const hosted: Hosted = {
    directory,
    git,
    write: async (path, content) => {
      await mkdir(join(directory, path, '..'), { recursive: true });
      await writeFile(join(directory, path), content);
    },
    publish: async () => {
      git('repack', '-adfq');
      const packDirectory = join(directory, '.git', 'objects', 'pack');
      const packFiles = await readdir(packDirectory);
      const packFile = packFiles.find((name) => name.endsWith('.pack'))!;
      hosted.pack = new Uint8Array(await readFile(join(packDirectory, packFile)));
      hosted.index = new Uint8Array(await readFile(join(packDirectory, packFile.replace(/\.pack$/u, '.idx'))));
      hosted.packName = `pack-${Buffer.from(hosted.pack.subarray(-20)).toString('hex')}-${nonce}`;
      hosted.main = git('rev-parse', 'refs/heads/main');
      const listed = lines(git('ls-tree', '-r', '-l', hosted.main)).map((line) => {
        const [meta = '', path = ''] = line.split('\t');
        const [mode = '', , oid = '', size = ''] = meta.split(/\s+/u);
        return `${mode}\t${oid}\t${size}\t\t\t${path}`;
      });
      const header = `tau-head-listing\t1\t${hosted.main}\t${git('rev-parse', `${hosted.main}^{tree}`)}`;
      hosted.listing = new Uint8Array(gzipSync(`${[header, ...listed].join('\n')}\n`));
    },
    pack: empty,
    index: empty,
    packName: '',
    main,
    listing: empty,
    parent,
    tag,
    tagged,
    ops,
    chat,
    opsOnly: only('refs/tau/ops/session'),
    chatOnly: only('refs/tau/chats/c1'),
  };
  await hosted.publish();
  return hosted;
};

const familyReferences = (hosted: Hosted): Record<CatalogueFamily, ReadonlyArray<Record<string, string>>> => ({
  heads: [{ ref: 'refs/heads/main', oid: hosted.main }],
  tags: [{ ref: 'refs/tags/v1', oid: hosted.tag, peeled: hosted.tagged }],
  chats: [{ ref: 'refs/tau/chats/c1', oid: hosted.chat }],
});

/* What the fake hosts do differently from the real ones. */
type Behaviour = Readonly<{
  catalogueStatus?: number;
  /* A files host that answers a Range read with the whole pack. */
  ignoreRange?: boolean;
  /* No head listing in the catalogue. */
  listings?: false;
  /* The commit the catalogue says its listing lists. */
  listingCommit?: string;
  expiresInSeconds?: number;
  /* Pack byte extents a Range read may not touch: one that does is refused, as a lapsed link is. */
  refuse?: ReadonlyArray<readonly [number, number]>;
}>;

/* The files Worker's own rule for a pack GET: one Range, shorter than the pack and at most 64 MiB, or 416. */
const packRangeRefused = (range: string | undefined, size: number): [number, number] | undefined => {
  const match = /^bytes=(\d+)-(\d+)$/u.exec(range ?? '');
  if (match === null) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]) + 1, size);
  const length = end - start;
  return length > maximumRangeBytes || length >= size || length <= 0 ? undefined : [start, end];
};

/* The API's catalogue and the files host, as the fetches the client makes. */
const serve = (hosted: Hosted, behaviour: Behaviour = {}): Served => {
  const catalogueQueries: string[] = [];
  const ranges: Array<readonly [number, number]> = [];
  let wholePackReads = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const packHref = `${filesOrigin}/packs/${hosted.packName}.pack`;
    const indexHref = `${filesOrigin}/packs/${hosted.packName}.idx`;
    const listingCommit = behaviour.listingCommit ?? hosted.main;
    const listingHref = `${filesOrigin}/listings/${listingCommit}.tsv.gz`;
    if (url.href.startsWith(catalogueUrl)) {
      catalogueQueries.push(url.search);
      if (behaviour.catalogueStatus !== undefined) {
        return new Response('Not Found', { status: behaviour.catalogueStatus });
      }
      const families = (url.searchParams.get('refs') ?? '').split(',') as CatalogueFamily[];
      const listed = families.flatMap((family) => familyReferences(hosted)[family]);
      return Response.json({
        format: 1,
        generation: 1,
        refs: listed,
        listings:
          behaviour.listings === false
            ? []
            : [{ commit: listingCommit, href: listingHref, bytes: hosted.listing.byteLength }],
        packs: [
          {
            key: `packs/${hosted.packName}.pack`,
            bytes: hosted.pack.byteLength,
            index: { href: indexHref, bytes: hosted.index.byteLength },
            pack: { href: packHref, bytes: hosted.pack.byteLength },
          },
        ],
        complete: true,
        expiresAt: Math.floor(Date.now() / 1000) + (behaviour.expiresInSeconds ?? 900),
      });
    }
    if (url.href === indexHref) {
      return new Response(hosted.index, { status: 200 });
    }
    if (url.href === listingHref) {
      return new Response(hosted.listing, { status: 200 });
    }
    if (url.href === packHref) {
      const allowed = packRangeRefused(new Headers(init?.headers).get('range') ?? undefined, hosted.pack.byteLength);
      if (allowed === undefined) {
        /* What the S1 gate counts: any ask for the whole pack, refused as the Worker refuses it. */
        wholePackReads += 1;
        return new Response('range', { status: 416 });
      }
      if (behaviour.ignoreRange === true) {
        wholePackReads += 1;
        return new Response(hosted.pack, { status: 200 });
      }
      if (behaviour.refuse?.some(([start, end]) => allowed[0] < end && start < allowed[1]) === true) {
        return new Response('Forbidden', { status: 403 });
      }
      ranges.push(allowed);
      return new Response(hosted.pack.slice(...allowed), { status: 206 });
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, catalogueQueries, ranges, wholePackReads: () => wholePackReads };
};

const countingCompute = (): ComputeWorker & { indexed: () => number } => {
  const inline = createInlineCompute();
  let indexed = 0;
  return {
    ...inline,
    indexPack: async (pack) => {
      indexed += 1;
      return inline.indexPack(pack);
    },
    indexed: () => indexed,
  };
};

const emptyStore = async (compute: ComputeWorker, name: string): Promise<ObjectStore> => {
  const provider = new MemoryProvider();
  await provider.mkdir('.git/objects/pack', { recursive: true });
  return createObjectStore({ files: gitFilesOf(provider, '.git'), gitdir: '.git', compute, fenceName: `cold-${name}` });
};

describe.runIf(gitToolchainOnPath)('the cold open from a hosted catalogue (D8)', () => {
  let hosted: Hosted;

  beforeAll(async () => {
    hosted = await host();
  });

  afterAll(async () => {
    await rm(hosted.directory, { recursive: true, force: true });
  });

  /* Byte ranges of objects in the hosted pack, by id. */
  const extentsOf = (oids: readonly string[]): Array<readonly [number, number]> => {
    const index = readPackIndex(hosted.index);
    return oids.map((oid) => {
      const offset = index.offsetOf(oid)!;
      return [offset, index.endOf(offset, hosted.pack.byteLength)] as const;
    });
  };
  const intersects = (left: readonly [number, number], right: readonly [number, number]): boolean =>
    left[0] < right[1] && right[0] < left[1];

  it('opens the heads with no upload-pack, no whole pack and no indexPack (S1)', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 's1');
    const served = serve(hosted);
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });
    expect(opened).toBeDefined();
    expect(served.wholePackReads()).toBe(0);
    expect(compute.indexed()).toBe(0);
    expect(opened!.refs).toEqual(
      new Map([
        ['refs/heads/main', hosted.main],
        ['refs/tags/v1', hosted.tag],
      ]),
    );
    const closure = [
      hosted.main,
      hosted.tag,
      hosted.tagged,
      hosted.git('rev-parse', `${hosted.main}^{tree}`),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.main)).map((line) => line.split(/\s+/u)[2]!),
    ];
    const held = await Promise.all(closure.map(async (oid) => store.has(oid)));
    expect(held.every(Boolean)).toBe(true);
    expect(opened!.report).toMatchObject({ catalogueReads: 1, indexReads: 1, listingReads: 1 });
    expect(opened!.report.imported).toBeGreaterThanOrEqual(closure.length);
    /* Coalesced: fewer Range requests than objects read. */
    expect(served.ranges.length).toBeLessThan(opened!.report.imported);
    expect(opened!.report.ranges.rangeRequests).toBe(served.ranges.length);
  });

  it('requests no byte of an ops or chat object when the sync policy names heads and tags', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'scope');
    const served = serve(hosted);
    await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });
    expect(served.catalogueQueries).toEqual(['?refs=heads,tags']);
    expect(hosted.opsOnly.length).toBeGreaterThan(0);
    expect(hosted.chatOnly.length).toBeGreaterThan(0);
    const outside = extentsOf([...hosted.opsOnly, ...hosted.chatOnly]);
    for (const requested of served.ranges) {
      expect(outside.some((extent) => intersects(requested, extent))).toBe(false);
    }
    expect(await store.has(hosted.ops)).toBe(false);
    expect(await store.has(hosted.chat)).toBe(false);
  });

  it('brings chats only when asked, and ops never', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'chats');
    const served = serve(hosted);
    const opened = await coldOpenFromCatalogue({
      catalogueUrl,
      families: ['heads', 'chats'],
      fetch: served.fetch,
      store,
      compute,
    });
    expect(served.catalogueQueries).toEqual(['?refs=heads,chats']);
    expect(opened!.refs.get('refs/tau/chats/c1')).toBe(hosted.chat);
    expect(await store.has(hosted.chat)).toBe(true);
    const opsExtents = extentsOf(hosted.opsOnly);
    for (const requested of served.ranges) {
      expect(opsExtents.some((extent) => intersects(requested, extent))).toBe(false);
    }
  });

  it('reads older history through by Range while the links last', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'history');
    const served = serve(hosted);
    await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });
    const before = served.ranges.length;
    const parent = await store.read(hosted.parent);
    expect(parent?.type).toBe('commit');
    expect(served.ranges.length).toBeGreaterThan(before);
    expect(served.wholePackReads()).toBe(0);
    /* Kept once read: the next read is local. */
    const after = served.ranges.length;
    await store.read(hosted.parent);
    expect(served.ranges.length).toBe(after);
  });

  it('streams a blob it imported, equal to a whole read', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'blob');
    const served = serve(hosted);
    await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });
    const blob = hosted.git('rev-parse', `${hosted.main}:main.scad`);
    const stream = await store.openBlob(blob);
    const streamed = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(streamed).toStrictEqual((await store.read(blob))!.data);
  });

  it.each([
    ['a 404 for the catalogue', { catalogueStatus: 404 }],
    ['a pack link that answers whole', { ignoreRange: true }],
  ] as const)('answers undefined, for smart HTTP, on %s', async (name, behaviour) => {
    const compute = countingCompute();
    const store = await emptyStore(compute, `fallback-${name}`);
    const served = serve(hosted, behaviour);
    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute })).toBeUndefined();
  });

  it('refuses a pack past the ceiling in addPack', async () => {
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute: createInlineCompute(),
      fenceName: 'cold-ceiling',
      packCeilingBytes: 1024,
    });
    await expect(store.addPack(hosted.pack)).rejects.toBeInstanceOf(PackCeilingError);
  });

  it('fetches a cold port from the catalogue with no smart HTTP request', async () => {
    const served = serve(hosted);
    const request = vi.fn<RevisionHttpClient['request']>(async () => {
      throw new Error('No smart HTTP on a cold open.');
    });
    const reports: unknown[] = [];
    const port = createIsomorphicGitRevisionPort({
      filesystem: await createMemoryProvider(),
      http: { request },
      catalogue: { url: () => catalogueUrl, fetch: served.fetch, onColdOpen: (report) => reports.push(report) },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: 'https://api.test/git/project-1.git' });
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
    expect(request).not.toHaveBeenCalled();
    expect(served.wholePackReads()).toBe(0);
    expect(reports).toHaveLength(1);
    expect(await port.readRef('refs/remotes/origin/main')).toBe(hosted.main);
  });

  it('sizes each object from the index when a head has no listing, so a batch never holds the repository', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'unlisted');
    const served = serve(hosted, { listings: false });
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute, batchBytes: 1 });
    expect(opened?.report.listingReads).toBe(0);
    /* One byte per batch: every object is known to be bigger, so each is a batch, and a pack, of its own. */
    expect(opened!.report.packsWritten).toBe(opened!.report.imported);
    const blob = hosted.git('rev-parse', `${hosted.main}:parts/deep/c.scad`);
    expect(await store.has(blob)).toBe(true);
  });

  it('bounds a batch by object count too', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'counted');
    const served = serve(hosted, { listings: false });
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute, batchObjects: 2 });
    expect(opened!.report.packsWritten).toBeGreaterThanOrEqual(Math.ceil(opened!.report.imported / 2));
  });

  it('refuses a listing that lists another commit than the catalogue names', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'mislisted');
    const served = serve(hosted, { listingCommit: hosted.parent });
    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute })).toBeUndefined();
  });

  it('records the cold commits as the shallow boundary, and a walk stops there once the links lapse', async () => {
    const served = serve(hosted, { expiresInSeconds: -1 });
    const filesystem = await createMemoryProvider();
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http: {
        request: async () => {
          throw new Error('No smart HTTP on a cold open.');
        },
      },
      catalogue: { url: () => catalogueUrl, fetch: served.fetch },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: 'https://api.test/git/project-1.git' });
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main', 'refs/tags/v1'] });
    const shallow = await filesystem.readFile('.git/shallow', 'utf8');
    expect(lines(String(shallow))).toEqual([hosted.main, hosted.tagged].toSorted());
    const log = await port.log({ heads: [revisionId(hosted.main)] });
    expect(log.map((entry) => entry.id)).toEqual([hosted.main]);
    expect(served.wholePackReads()).toBe(0);
    /* Only the walks stop at the boundary: a revision read keeps its real parents (conflict terms, undo restore). */
    const record = await port.readRevision(revisionId(hosted.main));
    expect(record?.parents).toEqual([hosted.parent]);
  });

  it('reads the boundary afresh for each walk: a failed read fails one walk, and another writer is seen', async () => {
    const filesystem = await createMemoryProvider();
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http: {
        request: async () => {
          throw new Error('No smart HTTP on a cold open.');
        },
      },
      catalogue: { url: () => catalogueUrl, fetch: serve(hosted).fetch },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: 'https://api.test/git/project-1.git' });
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main', 'refs/tags/v1'] });
    const main = revisionId(hosted.main);
    const walked = async (): Promise<readonly string[]> => {
      const log = await port.log({ heads: [main] });
      return log.map((entry) => entry.id);
    };
    const boundary = String(await filesystem.readFile('.git/shallow', 'utf8'));

    /* A read that fails once: that walk fails, and the next one reads the boundary again. */
    await filesystem.unlink('.git/shallow');
    await filesystem.mkdir('.git/shallow');
    await expect(walked()).rejects.toThrow();
    await filesystem.rmdir('.git/shallow');
    await filesystem.writeFile('.git/shallow', boundary);
    expect(await walked()).toEqual([hosted.main]);

    /* Another tab's settle took main off the boundary: this port walks on below it (read through). */
    await filesystem.writeFile('.git/shallow', `${hosted.tagged}\n`);
    expect(await walked()).toEqual([hosted.main, hosted.parent, hosted.tagged]);

    /* Between a writer's removal and its rename, the next file is the boundary. */
    await filesystem.unlink('.git/shallow');
    await filesystem.writeFile('.git/shallow.lock', `${hosted.main}\n`);
    expect(await walked()).toEqual([hosted.main]);
  });

  it('never counts a read-through object as held, so an import walks a tree it only read through', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'through');
    await coldOpenFromCatalogue({ catalogueUrl, fetch: serve(hosted).fetch, store, compute });
    /* Viewing an old revision reads its commit and tree through, but not every blob under it. */
    const oldTree = hosted.git('rev-parse', `${hosted.parent}^{tree}`);
    const [viewedCommit, viewedTree] = await Promise.all([store.read(hosted.parent), store.read(oldTree)]);
    expect(viewedCommit?.type).toBe('commit');
    expect(viewedTree?.type).toBe('tree');
    expect(await store.has(oldTree)).toBe(false);
    /* A new commit that shares that tree, taken object by object as a fetch past the ceiling takes it. */
    const reused = hosted.git('commit-tree', oldTree, '-p', hosted.main, '-m', 'Back to the old tree');
    hosted.git('update-ref', 'refs/heads/reuse', reused);
    await hosted.publish();
    const report = await importReachableFromCatalogue({
      catalogueUrl,
      fetch: serve(hosted, { expiresInSeconds: -1 }).fetch,
      store,
      compute,
      wants: [reused],
    });
    expect(report).toBeDefined();
    const blobs = lines(hosted.git('ls-tree', '-r', oldTree)).map((line) => line.split(/\s+/u)[2]!);
    const held = await Promise.all([oldTree, ...blobs].map(async (oid) => store.has(oid)));
    expect(held.every(Boolean)).toBe(true);
  });

  /* Every tree and blob under a commit, as git lists them. */
  const treeClosure = (commit: string): string[] => [
    hosted.git('rev-parse', `${commit}^{tree}`),
    ...lines(hosted.git('ls-tree', '-r', '-t', commit)).map((line) => line.split(/\s+/u)[2]!),
  ];
  const allHeld = async (store: ObjectStore, oids: readonly string[]): Promise<string[]> => {
    const held = await Promise.all(oids.map(async (oid) => store.has(oid)));
    return oids.filter((_oid, at) => !held[at]);
  };

  it('keeps nothing a failed import names short of, so a retry brings every blob', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'retry');
    /* The trees and the tips read; a blob's Range read is refused part-way, as a lapsed link is. */
    const blob = hosted.git('rev-parse', `${hosted.main}:parts/deep/c.scad`);
    const failing = serve(hosted, { listings: false, refuse: extentsOf([blob]) });
    expect(
      await coldOpenFromCatalogue({ catalogueUrl, fetch: failing.fetch, store, compute, batchObjects: 1 }),
    ).toBeUndefined();
    /* No tree or commit held without what it names: a retry's walk never stops at one. */
    const kept = await Promise.all(
      [hosted.main, hosted.tag, hosted.tagged, hosted.git('rev-parse', `${hosted.main}^{tree}`)].map(async (oid) =>
        store.has(oid),
      ),
    );
    expect(kept).toEqual([false, false, false, false]);

    const opened = await coldOpenFromCatalogue({
      catalogueUrl,
      fetch: serve(hosted, { listings: false }).fetch,
      store,
      compute,
    });
    expect(opened).toBeDefined();
    expect(await allHeld(store, [hosted.main, ...treeClosure(hosted.main)])).toEqual([]);
  });

  it('keeps the whole tree of a commit a tag peels to, readable once the links lapse', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'tagged');
    const opened = await coldOpenFromCatalogue({
      catalogueUrl,
      fetch: serve(hosted, { expiresInSeconds: -1 }).fetch,
      store,
      compute,
    });
    expect(opened?.shallow).toContain(hosted.tagged);
    expect(await allHeld(store, [hosted.tag, hosted.tagged, ...treeClosure(hosted.tagged)])).toEqual([]);
    /* Read with the links lapsed: from the store's own packs. */
    const tree = await store.read(hosted.git('rev-parse', `${hosted.tagged}^{tree}`));
    expect(tree?.type).toBe('tree');
  });

  it('profiles chain depth as git verify-pack counts it', async () => {
    const packDirectory = join(hosted.directory, '.git', 'objects', 'pack');
    const packFiles = await readdir(packDirectory);
    const packPath = join(packDirectory, packFiles.find((name) => name.endsWith('.idx'))!);
    const verified = lines(hosted.git('verify-pack', '-v', packPath))
      .map((line) => line.split(/\s+/u))
      .filter((fields) => /^[\da-f]{40}$/u.test(fields[0] ?? ''));
    const deepest = Math.max(0, ...verified.map((fields) => (fields.length >= 7 ? Number(fields[5]) : 0)));
    const profile = await profileChainDepth(
      readPackIndex(hosted.index),
      hosted.pack.byteLength,
      async (offset, length) => hosted.pack.slice(offset, offset + length),
    );
    expect(profile.objects).toBe(verified.length);
    expect(profile.maximum).toBe(deepest);
    expect(profile.maximum).toBeGreaterThan(0);
    expect(profile.whole).toBe(verified.filter((fields) => fields.length < 7).length);
  });
});

/* Records each request body, so a test can read what a fetch asked the remote. */
const recording = (inner: RevisionHttpClient, bodies: string[]): RevisionHttpClient => ({
  request: async (request) => {
    if (request.body === undefined) {
      return inner.request(request);
    }
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of request.body) {
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
    }
    bodies.push(Buffer.concat(chunks).toString('latin1'));
    return inner.request({
      ...request,
      body: (async function* replay(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
        yield* chunks;
      })() as typeof request.body,
    });
  },
});

/* Past the pack ceiling: random, so it compresses to more than 64 MiB on its own. */
const largeBytes = 65 * 1024 * 1024;

describe.runIf(gitToolchainOnPath)('after a cold open, over smart HTTP and past the ceiling', () => {
  let hosted: Hosted;
  let root: string;
  let remote: Awaited<ReturnType<typeof startGitHttpBackend>>;
  const pushed = (): void => {
    hosted.git('push', '-q', '--force', remote.repositoryPath, 'refs/heads/main:refs/heads/main');
  };
  const commit = async (path: string, content: string | Uint8Array<ArrayBuffer>, message: string): Promise<string> => {
    await hosted.write(path, content);
    hosted.git('add', '-A');
    hosted.git('commit', '-q', '-m', message);
    return hosted.git('rev-parse', 'refs/heads/main');
  };

  beforeAll(async () => {
    hosted = await host();
    root = await mkdtemp(join(tmpdir(), 'tau-w5-remote-'));
    remote = await startGitHttpBackend({ root });
    pushed();
  }, 120_000);

  afterAll(async () => {
    await remote.close();
    await rm(root, { recursive: true, force: true });
    await rm(hosted.directory, { recursive: true, force: true });
  });

  it('writes no tracking ref past a cold open that failed part-way: the fetch takes the tip whole', async () => {
    /* The catalogue's tips and trees read, then a blob's Range read refused: the fetch goes on over smart HTTP. */
    const blob = hosted.git('rev-parse', `${hosted.main}:parts/deep/c.scad`);
    const index = readPackIndex(hosted.index);
    const offset = index.offsetOf(blob)!;
    const failing = serve(hosted, {
      listings: false,
      refuse: [[offset, index.endOf(offset, hosted.pack.byteLength)]],
    });
    const filesystem = await createMemoryProvider();
    const bodies: string[] = [];
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http: recording(createRevisionHttpClient(), bodies),
      catalogue: { url: () => catalogueUrl, fetch: failing.fetch },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: remote.url });
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
    /* The tip was not held, so it was wanted: never dropped for a commit kept without its tree. */
    expect(bodies.some((body) => body.includes(`want ${hosted.main}`))).toBe(true);
    expect(await port.readRef('refs/remotes/origin/main')).toBe(hosted.main);
    const store = createObjectStore({
      files: gitFilesOf(filesystem, '.git'),
      gitdir: '.git',
      compute: createInlineCompute(),
      fenceName: 'cold-partial-check',
    });
    const closure = [
      hosted.main,
      hosted.git('rev-parse', `${hosted.main}^{tree}`),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.main)).map((line) => line.split(/\s+/u)[2]!),
    ];
    const held = await Promise.all(closure.map(async (oid) => store.has(oid)));
    expect(closure.filter((_oid, at) => !held[at])).toEqual([]);
  }, 120_000);

  it('tells the remote where a cold history stops, and takes a pack past the ceiling object by object', async () => {
    const served = serve(hosted);
    const bodies: string[] = [];
    const port = createIsomorphicGitRevisionPort({
      filesystem: await createMemoryProvider(),
      http: recording(createRevisionHttpClient(), bodies),
      catalogue: { url: () => catalogueUrl, fetch: served.fetch },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: remote.url });
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
    const cold = hosted.main;
    expect(bodies).toEqual([]);

    /* A small fetch over smart HTTP: the shallow boundary goes with it. */
    const small = await commit('notes.txt', 'one\n', 'Small');
    pushed();
    await hosted.publish();
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
    expect(bodies.some((body) => body.includes(`shallow ${cold}`))).toBe(true);
    expect(await port.readRef('refs/remotes/origin/main')).toBe(small);

    /* Past the ceiling: two commits, one with a large object, taken from the catalogue with their history. */
    const large = await commit('large.bin', new Uint8Array(randomBytes(largeBytes)), 'Large');
    const tip = await commit('notes.txt', 'two\n', 'Tip');
    pushed();
    await hosted.publish();
    const rangesBefore = served.ranges.length;
    await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
    expect(await port.readRef('refs/remotes/origin/main')).toBe(tip);
    const log = await port.log({ heads: [revisionId(tip)] });
    expect(log.map((entry) => entry.id)).toEqual([tip, large, small, cold]);
    const largeRanges = served.ranges.slice(rangesBefore);
    expect(largeRanges.every(([start, end]) => end - start <= maximumRangeBytes)).toBe(true);
    expect(largeRanges.some(([start, end]) => end - start === maximumRangeBytes)).toBe(true);
    expect(served.wholePackReads()).toBe(0);
  }, 240_000);
});

describe.runIf(gitToolchainOnPath)('a remote no catalogue serves', () => {
  it('reads an answer past the ceiling whole', async () => {
    const own = await host();
    const root = await mkdtemp(join(tmpdir(), 'tau-w5-plain-'));
    const remote = await startGitHttpBackend({ root });
    try {
      await own.write('large.bin', new Uint8Array(randomBytes(largeBytes)));
      own.git('add', '-A');
      own.git('commit', '-q', '-m', 'Large');
      own.git('push', '-q', '--force', remote.repositoryPath, 'refs/heads/main:refs/heads/main');
      const port = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      await port.setRemote({ name: 'origin', url: remote.url });
      await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
      expect(await port.readRef('refs/remotes/origin/main')).toBe(own.git('rev-parse', 'refs/heads/main'));
    } finally {
      await remote.close();
      await rm(root, { recursive: true, force: true });
      await rm(own.directory, { recursive: true, force: true });
    }
  }, 240_000);
});

describe.runIf(gitToolchainOnPath)('a shallow boundary whose history arrives', () => {
  it('drops the boundary once its parents are held, so divergence and the merge base reach below it', async () => {
    const own = await host();
    const root = await mkdtemp(join(tmpdir(), 'tau-w5-deepen-'));
    const remote = await startGitHttpBackend({ root });
    try {
      /* A branch from the cold tip's parent: fetching it brings the history below the boundary. */
      const fork = own.git('rev-parse', 'refs/heads/main~1');
      own.git('branch', 'feature', fork);
      own.git('checkout', '-q', 'feature');
      await own.write('feature.scad', 'cylinder(1);\n');
      own.git('add', '-A');
      own.git('commit', '-q', '-m', 'Feature');
      const feature = own.git('rev-parse', 'refs/heads/feature');
      own.git('checkout', '-q', 'main');
      own.git(
        'push',
        '-q',
        '--force',
        remote.repositoryPath,
        'refs/heads/main:refs/heads/main',
        'refs/heads/feature:refs/heads/feature',
      );
      await own.publish();
      const filesystem = await createMemoryProvider();
      const port = createIsomorphicGitRevisionPort({
        filesystem,
        http: createRevisionHttpClient(),
        catalogue: { url: () => catalogueUrl, fetch: serve(own).fetch },
      });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      await port.setRemote({ name: 'origin', url: remote.url });
      await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
      /* The catalogue brings the tag too: its commit is a boundary as well. */
      expect(lines(String(await filesystem.readFile('.git/shallow', 'utf8')))).toEqual(
        [own.main, own.tagged].toSorted(),
      );
      /* Load this port's copy of the boundary, then let another tab add a commit to the file behind it. */
      await port.log({ heads: [revisionId(own.main)] });
      const elsewhere = 'f'.repeat(40);
      await filesystem.writeFile('.git/shallow', `${own.main}\n${elsewhere}\n`);

      await port.fetch({ remote: 'origin', refs: ['refs/heads/feature'] });
      /* The cold tip's parent arrived: it is no longer shallow; the other tab's line is kept, read again under the lock. */
      expect(lines(String(await filesystem.readFile('.git/shallow', 'utf8')))).toEqual([elsewhere]);
      const main = revisionId(own.main);
      const tip = revisionId(feature);
      expect(await port.divergence({ head: main, base: tip })).toEqual({ ahead: 1, behind: 1 });
      expect(mergeBaseOf(await port.log({ heads: mergeBaseHeads(main, tip) }), main, tip)).toBe(fork);
    } finally {
      await remote.close();
      await rm(root, { recursive: true, force: true });
      await rm(own.directory, { recursive: true, force: true });
    }
  }, 120_000);
});
