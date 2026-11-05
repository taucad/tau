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
import type { RevisionHttpClient } from '#http-client.js';
import { coldOpenFromCatalogue, parseHeadListing } from '#object-store/cold-open.js';
import type { CatalogueFamily } from '#object-store/cold-open.js';
import { createObjectStore, gitFilesOf, PackCeilingError } from '#object-store/object-store.js';
import type { ObjectStore } from '#object-store/object-store.js';
import { coalesceRanges, maximumRangeBytes } from '#object-store/remote-pack.js';
import { readPackIndex } from '#pack-reader/pack-index.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { profileChainDepth } from '#test/chain-depth-profile.js';

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
type Hosted = Readonly<{
  directory: string;
  git: (...args: string[]) => string;
  pack: Uint8Array<ArrayBuffer>;
  index: Uint8Array<ArrayBuffer>;
  packName: string;
  main: string;
  parent: string;
  tag: string;
  tagged: string;
  ops: string;
  chat: string;
  /* Objects only the ops or chat refs reach. */
  opsOnly: readonly string[];
  chatOnly: readonly string[];
  listing: Uint8Array<ArrayBuffer>;
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
  git('repack', '-adfq');
  const packDirectory = join(directory, '.git', 'objects', 'pack');
  const packFiles = await readdir(packDirectory);
  const packFile = packFiles.find((name) => name.endsWith('.pack'))!;
  const pack = new Uint8Array(await readFile(join(packDirectory, packFile)));
  const index = new Uint8Array(await readFile(join(packDirectory, packFile.replace(/\.pack$/u, '.idx'))));
  const checksum = Buffer.from(pack.subarray(-20)).toString('hex');
  const only = (ref: string): string[] =>
    lines(git('rev-list', '--objects', ref, '--not', 'refs/heads/main', 'refs/tags/v1')).map(
      (line) => line.split(' ')[0]!,
    );
  const listed = lines(git('ls-tree', '-r', '-l', main)).map((line) => {
    const [meta = '', path = ''] = line.split('\t');
    const [mode = '', , oid = '', size = ''] = meta.split(/\s+/u);
    return `${mode}\t${oid}\t${size}\t\t\t${path}`;
  });
  const listing = new Uint8Array(
    gzipSync(`${[`tau-head-listing\t1\t${main}\t${git('rev-parse', `${main}^{tree}`)}`, ...listed].join('\n')}\n`),
  );
  return {
    directory,
    git,
    pack,
    index,
    packName: `pack-${checksum}-${nonce}`,
    main,
    parent,
    tag,
    tagged,
    ops,
    chat,
    opsOnly: only('refs/tau/ops/session'),
    chatOnly: only('refs/tau/chats/c1'),
    listing,
  };
};

const familyReferences = (hosted: Hosted): Record<CatalogueFamily, ReadonlyArray<Record<string, string>>> => ({
  heads: [{ ref: 'refs/heads/main', oid: hosted.main }],
  tags: [{ ref: 'refs/tags/v1', oid: hosted.tag, peeled: hosted.tagged }],
  chats: [{ ref: 'refs/tau/chats/c1', oid: hosted.chat }],
});

/* The API's catalogue and the files host, as the fetches the client makes. */
const serve = (
  hosted: Hosted,
  behaviour: Readonly<{ catalogueStatus?: number; ignoreRange?: boolean }> = {},
): Served => {
  const catalogueQueries: string[] = [];
  const ranges: Array<readonly [number, number]> = [];
  let wholePackReads = 0;
  const packHref = `${filesOrigin}/packs/${hosted.packName}.pack`;
  const indexHref = `${filesOrigin}/packs/${hosted.packName}.idx`;
  const listingHref = `${filesOrigin}/listings/${hosted.main}.tsv.gz`;
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
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
        listings: [{ commit: hosted.main, href: listingHref, bytes: hosted.listing.byteLength }],
        packs: [
          {
            key: `packs/${hosted.packName}.pack`,
            bytes: hosted.pack.byteLength,
            index: { href: indexHref, bytes: hosted.index.byteLength },
            pack: { href: packHref, bytes: hosted.pack.byteLength },
          },
        ],
        complete: true,
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      });
    }
    if (url.href === indexHref) {
      return new Response(hosted.index, { status: 200 });
    }
    if (url.href === listingHref) {
      return new Response(hosted.listing, { status: 200 });
    }
    if (url.href === packHref) {
      const range = new Headers(init?.headers).get('range');
      const match = /^bytes=(\d+)-(\d+)$/u.exec(range ?? '');
      if (match === null || behaviour.ignoreRange === true) {
        wholePackReads += 1;
        return new Response(hosted.pack, { status: 200 });
      }
      const start = Number(match[1]);
      const end = Number(match[2]) + 1;
      ranges.push([start, end]);
      return new Response(hosted.pack.slice(start, end), { status: 206 });
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
