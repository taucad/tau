import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createMemoryProvider, MemoryProvider } from '@taucad/filesystem/backend';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { postService } from '#adapter-transport/adapter-transport.js';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { CorruptBytesError } from '#compute-worker/errors.js';
import { createSupervisedComputeWorker } from '#compute-worker/supervisor.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createRevisionHttpClient } from '#http-client.js';
import type { RevisionHttpClient } from '#http-client.js';
import { revisionId } from '#algorithms/index.js';
import { digestHex } from '#object-hash.js';
import { frameObject } from '#git-objects.js';
import { coldOpenFromCatalogue, importReachableFromCatalogue, parseHeadListing } from '#object-store/cold-open.js';
import type { CatalogueFamily } from '#object-store/cold-open.js';
import { createObjectStore, gitFilesOf, PackCeilingError } from '#object-store/object-store.js';
import type { ObjectStore } from '#object-store/object-store.js';
import { coalesceRanges, maximumRangeBytes, openRemotePack } from '#object-store/remote-pack.js';
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
  rangeCacheModes: Array<RequestCache | undefined>;
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
  const rangeCacheModes: Array<RequestCache | undefined> = [];
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
      rangeCacheModes.push(init?.cache);
      return new Response(hosted.pack.slice(...allowed), { status: 206 });
    }
    return new Response('Not Found', { status: 404 });
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    catalogueQueries,
    ranges,
    rangeCacheModes,
    wholePackReads: () => wholePackReads,
  };
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

  it('looks up no loose object by its own path: a fan-out directory is listed once, and one not there is not read', async () => {
    // An object-by-object `exists` was the largest local cost of a cold open after its last pack byte (SP6-import):
    // three lookups per object, each a path resolution in the origin's private file system.
    const compute = countingCompute();
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    const files = gitFilesOf(provider, '.git');
    const asked: string[] = [];
    const listed: string[] = [];
    const store = createObjectStore({
      files: {
        ...files,
        exists: async (path) => {
          asked.push(path);
          return files.exists(path);
        },
        readdir: async (path) => {
          listed.push(path);
          return files.readdir(path);
        },
      },
      gitdir: '.git',
      compute,
      fenceName: 'cold-no-lookups',
    });
    /* A loose object already held is still found, so it is not imported again. */
    const scad = hosted.git('rev-parse', `${hosted.main}:main.scad`);
    const [held] = await store.writeLoose([
      { type: 'blob', data: new TextEncoder().encode(`${hosted.git('cat-file', 'blob', scad)}\n`) },
    ]);
    expect(held).toBe(scad);
    asked.length = 0;
    listed.length = 0;
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: serve(hosted).fetch, store, compute });
    expect(opened).toBeDefined();
    expect(asked.filter((path) => /\/objects\/[\da-f]{2}\/[\da-f]{38}$/u.test(path))).toEqual([]);
    /* No fan-out directory but the one that is there is listed, whatever the number of objects. */
    const fanouts = listed.filter((path) => /\/objects\/[\da-f]{2}$/u.test(path));
    expect(fanouts.filter((path) => path !== `.git/objects/${scad.slice(0, 2)}`)).toEqual([]);
    const packFiles = await provider.readdir('.git/objects/pack');
    const indexes = packFiles.filter((name) => name.endsWith('.idx'));
    expect(indexes.length).toBeGreaterThan(0);
    const written = await Promise.all(
      indexes.map(async (name) => readPackIndex(new Uint8Array(await provider.readFile(`.git/objects/pack/${name}`)))),
    );
    expect(written.some((index) => index.offsetOf(scad) !== undefined)).toBe(false);
    expect(written.some((index) => index.offsetOf(hosted.main) !== undefined)).toBe(true);
  });

  it('keeps a tree, commit or tag it read whole as the bytes it read, deflating only what it resolved from a delta', async () => {
    // The trees and tips waited in the stage by their bodies alone and were deflated again when kept: the last step
    // of the open, after every blob (SP6-import).
    const compute = countingCompute();
    let deflated = 0;
    const counting: ComputeWorker = {
      ...compute,
      deflate: async (raw) => {
        deflated += 1;
        return compute.deflate(raw);
      },
    };
    const store = await emptyStore(counting, 'kept-as-read');
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: serve(hosted).fetch, store, compute: counting });
    expect(opened).toBeDefined();
    const packDirectory = join(hosted.directory, '.git', 'objects', 'pack');
    const packFiles = await readdir(packDirectory);
    const indexFile = packFiles.find((name) => name.endsWith('.idx'))!;
    /* `verify-pack -v` gives a delta's line a depth and a base: seven fields. */
    const deltas = new Set(
      lines(hosted.git('verify-pack', '-v', join(packDirectory, indexFile)))
        .map((line) => line.split(/\s+/u))
        .filter((fields) => fields.length === 7)
        .map((fields) => fields[0]!),
    );
    const closure = new Set([
      hosted.main,
      hosted.tag,
      hosted.tagged,
      ...lines(hosted.git('rev-list', '--objects', '--no-walk', hosted.main, hosted.tagged)).map(
        (line) => line.split(' ')[0]!,
      ),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.main)).map((line) => line.split(/\s+/u)[2]!),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.tagged)).map((line) => line.split(/\s+/u)[2]!),
      hosted.git('rev-parse', `${hosted.main}^{tree}`),
      hosted.git('rev-parse', `${hosted.tagged}^{tree}`),
    ]);
    expect(deflated).toBe([...closure].filter((oid) => deltas.has(oid)).length);
  });

  it('imports and repacks through a compute that has no inflateObject, checking each object by its own hash', async () => {
    // `inflateObject` is optional on the exported contract: a compute built before it inflates and hashes in two
    // calls, and a repack never takes its absence for a corrupt pack (SP6-import review).
    const { inflateObject: _absent, ...older } = createInlineCompute();
    const compute: ComputeWorker = older;
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: 'cold-older',
    });
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: serve(hosted).fetch, store, compute });
    expect(opened).toBeDefined();
    expect(opened!.report.packsWritten).toBeGreaterThan(0);
    expect(await store.repack(true)).toBe(true);
    const closure = [
      hosted.main,
      hosted.git('rev-parse', `${hosted.main}^{tree}`),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.main)).map((line) => line.split(/\s+/u)[2]!),
    ];
    const reopened = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: 'cold-older-reopened',
    });
    for (const oid of closure) {
      // oxlint-disable-next-line no-await-in-loop -- one object at a time.
      const object = await reopened.read(oid);
      expect(object).toBeDefined();
      expect(digestHex('sha1', frameObject(object!.type, object!.data))).toBe(oid);
    }
  });

  it('imports and verifies through a supervised compute whose worker is dead and whose fallback lacks inflateObject', async () => {
    const { inflateObject: _absent, ...older } = createInlineCompute();
    const compute = createSupervisedComputeWorker({
      spawn: () => {
        throw new Error('Worker scripts are blocked here.');
      },
      maxRestarts: 0,
      fallback: older,
    });
    const store = await emptyStore(compute, 'supervised-older');
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: serve(hosted).fetch, store, compute });
    expect(opened).toBeDefined();
    const closure = [
      hosted.main,
      hosted.git('rev-parse', `${hosted.main}^{tree}`),
      ...lines(hosted.git('ls-tree', '-r', '-t', hosted.main)).map((line) => line.split(/\s+/u)[2]!),
    ];
    for (const oid of closure) {
      // oxlint-disable-next-line no-await-in-loop -- one object at a time.
      const object = await store.read(oid);
      expect(object).toBeDefined();
      expect(digestHex('sha1', frameObject(object!.type, object!.data))).toBe(oid);
    }
  });

  it('asks every pack Range past the HTTP cache, so parallel ranges of one pack are not serialised', async () => {
    // Chrome's HTTP cache holds one cache entry lock per URL, so parallel Range reads of one pack link waited on
    // each other: 10 in parallel took 2,057 ms against 230 ms uncached (speed phase SP0).
    const compute = countingCompute();
    const store = await emptyStore(compute, 'no-store');
    const served = serve(hosted);
    await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });
    expect(served.rangeCacheModes.length).toBeGreaterThan(0);
    expect(new Set(served.rangeCacheModes)).toEqual(new Set(['no-store']));
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
    /* D10: the head listing's sizes ride the tree listing, with no blob read for them. */
    const listing = await port.listTree?.(revisionId(hosted.main));
    const sized = lines(hosted.git('ls-tree', '-r', '-l', hosted.main)).map((line) => {
      const [meta = '', path = ''] = line.split('\t');
      return [path, Number(meta.split(/\s+/u)[3])];
    });
    expect(listing?.map(({ path, size }) => [path, size])).toStrictEqual(
      sized.toSorted(([left], [right]) => (String(left) < String(right) ? -1 : 1)),
    );
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

  it("reads a delta's bases ahead with it, so a read of it asks for nothing more", async () => {
    const packDirectory = join(hosted.directory, '.git', 'objects', 'pack');
    const packFiles = await readdir(packDirectory);
    const packPath = join(packDirectory, packFiles.find((name) => name.endsWith('.idx'))!);
    /* The deepest delta of the pack: its chain is more than one entry. */
    const [deepest] = lines(hosted.git('verify-pack', '-v', packPath))
      .map((line) => line.split(/\s+/u))
      .filter((fields) => /^[\da-f]{40}$/u.test(fields[0] ?? '') && fields.length >= 7)
      .toSorted((left, right) => Number(right[5]) - Number(left[5]));
    const depth = Number(deepest![5]);
    expect(depth).toBeGreaterThan(0);
    let requests = 0;
    const pack = await openRemotePack({
      name: hosted.packName,
      size: hosted.pack.byteLength,
      index: hosted.index,
      compute: createInlineCompute(),
      fetchRange: async (offset, length) => {
        requests += 1;
        return hosted.pack.slice(offset, offset + length);
      },
    });
    const ahead = pack.readAhead([deepest![0]!], { bytes: 1024 * 1024 });
    const read = await pack.readMany([deepest![0]!]);
    expect(read.get(deepest![0]!)?.type).toBe(hosted.git('cat-file', '-t', deepest![0]!));
    /* Read, it is dropped, and so are the bases only it named. */
    expect(pack.counters.aheadPeakBytes).toBeGreaterThan(0);
    expect(pack.counters.aheadHeldBytes).toBe(0);
    await ahead.release();
    /* A wave per link of the chain, every one the read-ahead's: the read itself sent none. */
    expect(pack.counters.waves).toBe(depth + 1);
    expect(requests).toBe(pack.counters.rangeRequests);
    const before = requests;
    /* Released, nothing is held: a read asks again. */
    await pack.readMany([deepest![0]!]);
    expect(requests).toBeGreaterThan(before);
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

/*
 * A pack the indexer refuses is not the end of a fetch (iPhone, staging, "The pack does not index."): where a
 * catalogue serves the remote, the fetch takes the wanted objects from it one by one, as it does past the ceiling.
 */
describe.runIf(gitToolchainOnPath)('a fetch whose pack does not index', () => {
  it('takes the objects from the catalogue, and the project opens', async () => {
    const own = await host();
    const root = await mkdtemp(join(tmpdir(), 'tau-pack-refused-'));
    const remote = await startGitHttpBackend({ root });
    try {
      own.git('push', '-q', '--force', remote.repositoryPath, 'refs/heads/main:refs/heads/main');
      const inline = createInlineCompute();
      let refuse = false;
      const compute: ComputeWorker = {
        ...inline,
        indexPack: async (pack) => {
          if (refuse) {
            throw new CorruptBytesError('The pack does not index.', { cause: new TypeError('a WebKit-only failure') });
          }
          return inline.indexPack(pack);
        },
      };
      const served = serve(own);
      const port = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
        compute,
        catalogue: { url: () => catalogueUrl, fetch: served.fetch },
      });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      await port.setRemote({ name: 'origin', url: remote.url });
      await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });

      /* A store that holds refs fetches over smart HTTP; this time the indexer refuses what arrives. */
      await own.write('notes.txt', 'one\n');
      own.git('add', '-A');
      own.git('commit', '-q', '-m', 'Next');
      const next = own.git('rev-parse', 'refs/heads/main');
      own.git('push', '-q', '--force', remote.repositoryPath, 'refs/heads/main:refs/heads/main');
      await own.publish();
      refuse = true;
      await port.fetch({ remote: 'origin', refs: ['refs/heads/main'] });

      expect(await port.readRef('refs/remotes/origin/main')).toBe(next);
      const log = await port.log({ heads: [revisionId(next)] });
      expect(log[0]?.id).toBe(next);
    } finally {
      await remote.close();
      await rm(root, { recursive: true, force: true });
      await rm(own.directory, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.runIf(gitToolchainOnPath)('an object-by-object import of a long, wide history', () => {
  it('holds at most one batch of trees, commits and tags with their bytes, and keeps every object', async () => {
    const own = await host();
    try {
      /* Thirty commits, each touching one file in one of twelve directories: many trees and commits to stage. */
      for (let commit = 0; commit < 30; commit += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each commit's file is written before it is made.
        await own.write(`dir-${String(commit % 12)}/sub/part-${String(commit)}.scad`, `cube(${String(commit)});\n`);
        own.git('add', '-A');
        own.git('commit', '-q', '-m', `Wide ${String(commit)}`);
      }
      own.git('tag', '-a', 'v2', '-m', 'two');
      await own.publish();
      const tip = own.git('rev-parse', 'refs/heads/main');
      const tag = own.git('rev-parse', 'refs/tags/v2');
      const everything = lines(own.git('rev-list', '--objects', tag)).map((line) => line.split(' ')[0]!);
      const staging = lines(own.git('rev-list', '--objects', '--no-object-names', '--filter=blob:none', tag));
      const limits = { batchObjects: 8, batchBytes: 4096 };
      expect(staging.length).toBeGreaterThan(limits.batchObjects * 4);

      const compute = countingCompute();
      const store = await emptyStore(compute, 'long-wide');
      /* First, an import that fails part-way on a blob's Range read: no commit, tag or tree is kept short of its closure. */
      const blob = own.git('rev-parse', `${tip}:dir-0/sub/part-0.scad`);
      const index = readPackIndex(own.index);
      const offset = index.offsetOf(blob)!;
      const refused = serve(own, { listings: false, refuse: [[offset, index.endOf(offset, own.pack.byteLength)]] });
      expect(
        await importReachableFromCatalogue({
          catalogueUrl,
          fetch: refused.fetch,
          store,
          compute,
          wants: [tag],
          ...limits,
        }),
      ).toBeUndefined();
      const keptEarly = await Promise.all(
        [tag, tip, own.git('rev-parse', `${tip}^{tree}`)].map(async (oid) => store.has(oid)),
      );
      expect(keptEarly).toEqual([false, false, false]);

      const report = await importReachableFromCatalogue({
        catalogueUrl,
        fetch: serve(own, { listings: false }).fetch,
        store,
        compute,
        wants: [tag],
        ...limits,
      });
      expect(report).toBeDefined();
      expect(report!.staged.objects).toBeGreaterThan(0);
      expect(report!.staged.objects).toBeLessThanOrEqual(limits.batchObjects);
      expect(report!.staged.bytes).toBeLessThanOrEqual(limits.batchBytes);
      const held = await Promise.all(everything.map(async (oid) => store.has(oid)));
      expect(everything.filter((_oid, at) => !held[at])).toEqual([]);
      expect(await store.has(tip)).toBe(true);
    } finally {
      await rm(own.directory, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.runIf(gitToolchainOnPath)('a remote no catalogue serves', () => {
  it('reads an answer past the ceiling whole, and so does a port whose catalogue does not answer', async () => {
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

      /* A catalogue that is configured but does not answer (not deployed yet): the answer is read whole after all. */
      const unanswered = serve(own, { catalogueStatus: 404 });
      const configured = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
        catalogue: { url: () => catalogueUrl, fetch: unanswered.fetch },
      });
      await configured.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      await configured.setRemote({ name: 'origin', url: remote.url });
      await configured.fetch({ remote: 'origin', refs: ['refs/heads/main'] });
      expect(await configured.readRef('refs/remotes/origin/main')).toBe(own.git('rev-parse', 'refs/heads/main'));
      /* Asked twice: once for the cold open, once past the ceiling. */
      expect(unanswered.catalogueQueries).toHaveLength(2);
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

/* One commit with a tree twelve levels deep, a file at every level, and its listing: what a project's closure is. */
const deepHost = async (): Promise<
  Readonly<{
    directory: string;
    git: (...args: string[]) => string;
    main: string;
    pack: Uint8Array<ArrayBuffer>;
    index: Uint8Array<ArrayBuffer>;
    packName: string;
    listing: Uint8Array<ArrayBuffer>;
  }>
> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-sp5-deep-'));
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
  git('init', '-q', '-b', 'main');
  for (let depth = 0; depth < 12; depth += 1) {
    const folder = join(directory, ...Array.from({ length: depth }, (_value, level) => `level-${String(level)}`));
    // oxlint-disable-next-line no-await-in-loop -- each level's folder before its files.
    await mkdir(folder, { recursive: true });
    for (let file = 0; file < 4; file += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a few small files.
      await writeFile(join(folder, `part-${String(file)}.scad`), `${randomBytes(256).toString('hex')}\n`);
    }
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'Deep');
  git('repack', '-adfq');
  const packDirectory = join(directory, '.git', 'objects', 'pack');
  const packFiles = await readdir(packDirectory);
  const packFile = packFiles.find((name) => name.endsWith('.pack'))!;
  const pack = new Uint8Array(await readFile(join(packDirectory, packFile)));
  const main = git('rev-parse', 'refs/heads/main');
  const listed = lines(git('ls-tree', '-r', '-l', main)).map((line) => {
    const [meta = '', path = ''] = line.split('\t');
    const [mode = '', , oid = '', size = ''] = meta.split(/\s+/u);
    return `${mode}\t${oid}\t${size}\t\t\t${path}`;
  });
  return {
    directory,
    git,
    main,
    pack,
    index: new Uint8Array(await readFile(join(packDirectory, packFile.replace(/\.pack$/u, '.idx')))),
    packName: `pack-${Buffer.from(pack.subarray(-20)).toString('hex')}-${nonce}`,
    listing: new Uint8Array(
      gzipSync(`${[`tau-head-listing\t1\t${main}\t${git('rev-parse', `${main}^{tree}`)}`, ...listed].join('\n')}\n`),
    ),
  };
};

describe.runIf(gitToolchainOnPath)('a cold open of a deep tree (SP5)', () => {
  let deep: Awaited<ReturnType<typeof deepHost>>;

  beforeAll(async () => {
    deep = await deepHost();
  });

  afterAll(async () => {
    await rm(deep.directory, { recursive: true, force: true });
  });

  /* The catalogue and files host of `deep`, recording each Range read as it is asked; `corrupt` flips a byte of each. */
  const serveDeep = (
    corrupt: ReadonlyArray<readonly [number, number]> = [],
  ): Readonly<{
    fetch: typeof globalThis.fetch;
    asked: Array<readonly [number, number]>;
    inFlight: () => number;
    roundTrips: () => number;
  }> => {
    const asked: Array<readonly [number, number]> = [];
    let inFlight = 0;
    /* Dependent round trips: a read started after another answered is one trip deeper than the deepest answered. */
    let answeredDepth = 0;
    let deepest = 0;
    const packHref = `${filesOrigin}/packs/${deep.packName}.pack`;
    const indexHref = `${filesOrigin}/packs/${deep.packName}.idx`;
    const listingHref = `${filesOrigin}/listings/${deep.main}.tsv.gz`;
    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.href.startsWith(catalogueUrl)) {
        return Response.json({
          format: 1,
          generation: 1,
          refs: [{ ref: 'refs/heads/main', oid: deep.main }],
          listings: [{ commit: deep.main, href: listingHref, bytes: deep.listing.byteLength }],
          packs: [
            {
              key: `packs/${deep.packName}.pack`,
              bytes: deep.pack.byteLength,
              index: { href: indexHref, bytes: deep.index.byteLength },
              pack: { href: packHref, bytes: deep.pack.byteLength },
            },
          ],
          complete: true,
          expiresAt: Math.floor(Date.now() / 1000) + 900,
        });
      }
      if (url.href === indexHref) {
        return new Response(deep.index, { status: 200 });
      }
      if (url.href === listingHref) {
        return new Response(deep.listing, { status: 200 });
      }
      const range = packRangeRefused(new Headers(init?.headers).get('range') ?? undefined, deep.pack.byteLength);
      if (url.href !== packHref || range === undefined) {
        return new Response('Not Found', { status: 404 });
      }
      asked.push(range);
      inFlight += 1;
      const depth = answeredDepth + 1;
      deepest = Math.max(deepest, depth);
      /* A round trip, so that what is asked side by side is seen side by side. */
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      answeredDepth = Math.max(answeredDepth, depth);
      const bytes = deep.pack.slice(...range);
      for (const [start, end] of corrupt) {
        if (range[0] < end && start < range[1]) {
          const at = Math.max(start, range[0]) - range[0] + 4;
          bytes[at] = 255 - bytes[at]!;
        }
      }
      return new Response(bytes, { status: 206 });
    };
    return { fetch: fetch as typeof globalThis.fetch, asked, inFlight: () => inFlight, roundTrips: () => deepest };
  };

  const extentOf = (oid: string): readonly [number, number] => {
    const index = readPackIndex(deep.index);
    const offset = index.offsetOf(oid)!;
    return [offset, index.endOf(offset, deep.pack.byteLength)];
  };
  const touches = (range: readonly [number, number], extent: readonly [number, number]): boolean =>
    range[0] < extent[1] && extent[0] < range[1];

  it('reads a deep head in one round trip: its trees hashed from the listing, read ahead with its blobs', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep');
    const served = serveDeep();

    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute });

    expect(opened).toBeDefined();
    /* Twelve levels and every blob, asked side by side: no read waits on another's answer (SP6, gap #2). */
    expect(served.roundTrips()).toBe(1);
    expect(opened!.report.ranges.waves).toBe(1);
    /* Equivalent to git's own closure of the head: every object, byte for byte. */
    const closure = lines(deep.git('rev-list', '--objects', deep.main)).map((line) => line.split(' ')[0]!);
    for (const oid of closure) {
      // oxlint-disable-next-line no-await-in-loop -- one object compared at a time.
      const read = await store.read(oid);
      const type = deep.git('cat-file', '-t', oid);
      expect(read?.type).toBe(type);
      expect(read?.data).toStrictEqual(
        new Uint8Array(execFileSync('git', ['cat-file', type, oid], { cwd: deep.directory })),
      );
    }
    expect(opened!.report.imported).toBe(closure.length);
  });

  it('reads the listed blobs while it walks the levels when nothing is read ahead', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-no-ahead');
    const served = serveDeep();

    const opened = await coldOpenFromCatalogue({
      catalogueUrl,
      fetch: served.fetch,
      store,
      compute,
      readAheadBytes: 0,
    });

    expect(opened).toBeDefined();
    const blobs = blobsOfDeep();
    const firstBlob = served.asked.findIndex((range) => blobs.some((oid) => touches(range, extentOf(oid))));
    const deepestTree = served.asked.findIndex((range) => touches(range, extentOf(deepestOf())));
    /* Twelve levels are twelve waves, one after another; the blobs do not wait for the last of them. */
    expect(firstBlob).toBeGreaterThanOrEqual(0);
    expect(firstBlob).toBeLessThan(deepestTree);
    expect(opened!.report.ranges.waves).toBeGreaterThanOrEqual(13);
    expect(served.roundTrips()).toBeGreaterThanOrEqual(13);
  });

  it("reads every pack's trees ahead before any pack's blobs take the budget", async () => {
    /* Two packs: the blobs alone first, then the commit and trees; the budget holds the second pack and no more. */
    const blobs = new Set(blobsOfDeep());
    const everything = lines(deep.git('rev-list', '--objects', deep.main)).map((line) => line.split(' ')[0]!);
    const split = join(deep.directory, 'split');
    await mkdir(split, { recursive: true });
    const packOf = async (oids: readonly string[], prefix: string) => {
      const checksum = execFileSync('git', ['pack-objects', '-q', join(split, prefix)], {
        cwd: deep.directory,
        input: `${oids.join('\n')}\n`,
        encoding: 'utf8',
      }).trim();
      const pack = new Uint8Array(await readFile(join(split, `${prefix}-${checksum}.pack`)));
      const index = new Uint8Array(await readFile(join(split, `${prefix}-${checksum}.idx`)));
      return { pack, index, name: `pack-${Buffer.from(pack.subarray(-20)).toString('hex')}-${nonce}` };
    };
    const packs = [
      await packOf(
        everything.filter((oid) => blobs.has(oid)),
        'blobs',
      ),
      await packOf(
        everything.filter((oid) => !blobs.has(oid)),
        'rest',
      ),
    ];
    const restIndex = readPackIndex(packs[1]!.index);
    let restBytes = 0;
    for (const oid of everything.filter((candidate) => !blobs.has(candidate))) {
      const offset = restIndex.offsetOf(oid)!;
      restBytes += restIndex.endOf(offset, packs[1]!.pack.byteLength) - offset;
    }
    let answeredDepth = 0;
    let deepest = 0;
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.href.startsWith(catalogueUrl)) {
        return Response.json({
          format: 1,
          generation: 1,
          refs: [{ ref: 'refs/heads/main', oid: deep.main }],
          listings: [{ commit: deep.main, href: `${filesOrigin}/listing`, bytes: deep.listing.byteLength }],
          packs: packs.map((pack) => ({
            key: `packs/${pack.name}.pack`,
            bytes: pack.pack.byteLength,
            index: { href: `${filesOrigin}/${pack.name}.idx`, bytes: pack.index.byteLength },
            pack: { href: `${filesOrigin}/${pack.name}.pack`, bytes: pack.pack.byteLength },
          })),
          complete: true,
          expiresAt: Math.floor(Date.now() / 1000) + 900,
        });
      }
      if (url.href === `${filesOrigin}/listing`) {
        return new Response(deep.listing, { status: 200 });
      }
      const pack = packs.find((candidate) => url.href.startsWith(`${filesOrigin}/${candidate.name}`))!;
      if (url.href.endsWith('.idx')) {
        return new Response(pack.index, { status: 200 });
      }
      const range = packRangeRefused(new Headers(init?.headers).get('range') ?? undefined, pack.pack.byteLength)!;
      const depth = answeredDepth + 1;
      deepest = Math.max(deepest, depth);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      answeredDepth = Math.max(answeredDepth, depth);
      return new Response(pack.pack.slice(...range), { status: 206 });
    }) as typeof globalThis.fetch;
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-two-packs');

    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute, readAheadBytes: restBytes });

    expect(opened).toBeDefined();
    /* The commit and every tree in the first wave, the blobs read when wanted: two round trips, not thirteen. */
    expect(deepest).toBeLessThanOrEqual(2);
    expect(opened!.report.listingTrees).toEqual({ matched: 1, missed: 0 });
  });

  it('opens a head whose listing does not hash to its tree, reading the trees as the walk reaches them', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-unhashed');
    const served = serveDeep();
    /* A submodule line whose id is not hex: no tree hashes from it, and nothing reads it. */
    const text = String(gunzipSync(deep.listing));
    const odd = new Uint8Array(gzipSync(`${text}160000\t${'z'.repeat(40)}\t-\t\t\tvendor\n`));
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return url.href.includes('/listings/') ? new Response(odd, { status: 200 }) : served.fetch(input, init);
    }) as typeof globalThis.fetch;

    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute });

    expect(opened).toBeDefined();
    expect(opened!.report.listingTrees).toEqual({ matched: 0, missed: 1 });
    expect(await store.has(deepestOf())).toBe(true);
    expect(served.roundTrips()).toBeGreaterThan(1);
  });

  it('refuses a read-ahead budget that is not a finite count of bytes', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-bad-budget');
    for (const readAheadBytes of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      // oxlint-disable-next-line no-await-in-loop -- one budget at a time.
      await expect(
        coldOpenFromCatalogue({ catalogueUrl, fetch: serveDeep().fetch, store, compute, readAheadBytes }),
      ).rejects.toBeInstanceOf(RangeError);
    }
  });

  it('reads ahead no more stored bytes than its budget, and the rest as the walk wants it', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-budget');
    const served = serveDeep();
    const budget = 2048;
    const asked: Array<readonly [number, number]> = [];
    let answered = false;
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const range = /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init?.headers).get('range') ?? '');
      if (range !== null && !answered) {
        asked.push([Number(range[1]), Number(range[2]) + 1]);
      }
      const response = await served.fetch(input, init);
      answered ||= range !== null;
      return response;
    }) as typeof globalThis.fetch;

    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute, readAheadBytes: budget })).toBeDefined();
    /* The first wave: the read-ahead, and the trailer that rides with it. */
    const trailerAt = deep.pack.byteLength - 20;
    const ahead = asked.filter(([start]) => start < trailerAt);
    expect(ahead.length).toBeGreaterThan(0);
    expect(ahead.reduce((sum, [start, end]) => sum + end - start, 0)).toBeLessThanOrEqual(budget);
    /* What it left is read as before, and the head is whole. */
    expect(served.roundTrips()).toBeGreaterThan(1);
    const closure = lines(deep.git('rev-list', '--objects', deep.main)).map((line) => line.split(' ')[0]!);
    const held = await Promise.all(closure.map(async (oid) => store.has(oid)));
    expect(held.every(Boolean)).toBe(true);
  });

  it('answers undefined when a read ahead fails, with nothing left running and no unhandled rejection', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-ahead-fails');
    const served = serveDeep();
    const blob = extentOf(deep.git('rev-parse', `${deep.main}:level-0/part-1.scad`));
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listen);
    try {
      const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const range = /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init?.headers).get('range') ?? '');
        if (range !== null && touches([Number(range[1]), Number(range[2]) + 1], blob)) {
          await served.fetch(input, init);
          return new Response('Forbidden', { status: 403 });
        }
        return served.fetch(input, init);
      }) as typeof globalThis.fetch;

      expect(await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute })).toBeUndefined();
      expect(served.inFlight()).toBe(0);
      const asked = served.asked.length;
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(served.asked).toHaveLength(asked);
      expect(unhandled).toEqual([]);
      expect(await store.has(deep.main)).toBe(false);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });

  it('answers undefined for a blob whose bytes are not its id, and keeps no tree or commit that names it', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-corrupt');
    const blob = deep.git('rev-parse', `${deep.main}:level-0/level-1/part-2.scad`);

    expect(
      await coldOpenFromCatalogue({ catalogueUrl, fetch: serveDeep([extentOf(blob)]).fetch, store, compute }),
    ).toBeUndefined();
    const named = [
      deep.main,
      deep.git('rev-parse', `${deep.main}^{tree}`),
      deep.git('rev-parse', `${deep.main}:level-0`),
    ];
    expect(await Promise.all(named.map(async (oid) => store.has(oid)))).toEqual([false, false, false]);
    expect(await store.has(blob)).toBe(false);

    /* A retry over whole bytes brings the head. */
    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch: serveDeep().fetch, store, compute })).toBeDefined();
    expect(await store.has(deep.main)).toBe(true);
  });

  it('answers undefined for a listed blob the packs do not hold, with nothing left running', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-missing');
    const served = serveDeep();
    const missing = 'e'.repeat(40);
    const text = String(gunzipSync(deep.listing));
    const withMissing = new Uint8Array(gzipSync(`${text}100644\t${missing}\t12\t\t\tghost.scad\n`));
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return url.href.includes('/listings/') ? new Response(withMissing, { status: 200 }) : served.fetch(input, init);
    }) as typeof globalThis.fetch;

    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute })).toBeUndefined();
    /* Every read the open started had landed when it answered. */
    expect(served.inFlight()).toBe(0);
    const asked = served.asked.length;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    /* The walk settled before the answer: no read starts after it. */
    expect(served.asked).toHaveLength(asked);
    expect(await store.has(deep.main)).toBe(false);
  });

  const blobsOfDeep = (): string[] => lines(deep.git('ls-tree', '-r', deep.main)).map((line) => line.split(/\s+/u)[2]!);
  const deepestOf = (): string =>
    deep.git(
      'rev-parse',
      `${deep.main}:${Array.from({ length: 11 }, (_value, level) => `level-${String(level)}`).join('/')}`,
    );

  it('answers undefined when a keep fails while the next batch is read, with no unhandled rejection', async () => {
    const compute = countingCompute();
    const held = await emptyStore(compute, 'deep-keep-fails');
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listen);
    try {
      const store: ObjectStore = {
        ...held,
        importObjects: async (objects) => {
          if ([...objects].some((object) => object.type === 'blob')) {
            throw new Error('The disk is full.');
          }
          return held.importObjects(objects);
        },
      };
      const served = serveDeep();

      expect(
        await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute, batchObjects: 4 }),
      ).toBeUndefined();
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(unhandled).toEqual([]);
      expect(served.inFlight()).toBe(0);
      expect(await held.has(deep.main)).toBe(false);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });

  it('holds at most two batches of blobs: one read while the one before it is kept', async () => {
    const compute = countingCompute();
    const held = await emptyStore(compute, 'deep-two-batches');
    const blobs = new Set(blobsOfDeep());
    let keptBatches = 0;
    let most = 0;
    const store: ObjectStore = {
      ...held,
      importObjects: async (objects) => {
        const list = [...objects];
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        const written = await held.importObjects(list);
        if (list.some((object) => blobs.has(object.oid))) {
          keptBatches += 1;
        }
        return written;
      },
    };
    const served = serveDeep();
    const extents = [...blobs].map((oid) => extentOf(oid));
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const range = /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init?.headers).get('range') ?? '');
      if (range !== null && extents.some((extent) => touches([Number(range[1]), Number(range[2]) + 1], extent))) {
        const asked = served.asked.filter((seen) => extents.some((extent) => touches(seen, extent))).length + 1;
        most = Math.max(most, asked - keptBatches);
      }
      return served.fetch(input, init);
    }) as typeof globalThis.fetch;

    expect(
      await coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute, batchObjects: 1, readAheadBytes: 0 }),
    ).toBeDefined();
    /* One blob per batch, so each blob read is a batch: never more than two ahead of what is kept. */
    expect(most).toBeGreaterThanOrEqual(2);
    expect(most).toBeLessThanOrEqual(2);
  });

  it('holds no more read-ahead bytes than its budget, by default too, and nothing once the open ends', async () => {
    const compute = countingCompute();
    const budget = Math.floor(deep.pack.byteLength / 3);
    const budgets = [undefined, budget];
    const openedAll = await Promise.all(
      budgets.map(async (readAheadBytes) =>
        coldOpenFromCatalogue({
          catalogueUrl,
          fetch: serveDeep().fetch,
          store: await emptyStore(compute, `deep-ahead-bound-${String(readAheadBytes)}`),
          compute,
          batchObjects: 1,
          ...(readAheadBytes === undefined ? {} : { readAheadBytes }),
        }),
      ),
    );
    for (const [at, opened] of openedAll.entries()) {
      expect(opened).toBeDefined();
      expect(opened!.report.ranges.aheadPeakBytes).toBeGreaterThan(0);
      expect(opened!.report.ranges.aheadPeakBytes).toBeLessThanOrEqual(budgets[at] ?? 32 * 1024 * 1024);
      expect(opened!.report.ranges.aheadHeldBytes).toBe(0);
    }
  });

  it('stops walking the levels once a listed blob fails', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-walk-stops');
    const blob = deep.git('rev-parse', `${deep.main}:part-0.scad`);
    const served = serveDeep([extentOf(blob)]);

    /* Read ahead, the deepest level is asked with the blob; without, the walk is what stops. */
    expect(
      await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute, readAheadBytes: 0 }),
    ).toBeUndefined();
    expect(served.inFlight()).toBe(0);
    const deepest = extentOf(deepestOf());
    expect(served.asked.some((range) => touches(range, deepest))).toBe(false);
  });

  it('stops at the first wave once a listed blob read ahead fails, and keeps nothing that names it', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-ahead-stops');
    const blob = deep.git('rev-parse', `${deep.main}:part-0.scad`);
    const served = serveDeep([extentOf(blob)]);

    expect(await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute })).toBeUndefined();
    expect(served.inFlight()).toBe(0);
    /* Every tree came with the blob; nothing was asked after the blob failed. */
    expect(served.roundTrips()).toBe(1);
    const trees = [deep.git('rev-parse', `${deep.main}^{tree}`), deepestOf()];
    expect(await Promise.all([deep.main, ...trees].map(async (oid) => store.has(oid)))).toEqual([false, false, false]);
  });

  it('stops keeping the listed blobs once the walk fails', async () => {
    const compute = countingCompute();
    const store = await emptyStore(compute, 'deep-keep-stops');
    const tree = deep.git('rev-parse', `${deep.main}:level-0`);
    const served = serveDeep([extentOf(tree)]);

    expect(
      await coldOpenFromCatalogue({ catalogueUrl, fetch: served.fetch, store, compute, batchObjects: 2 }),
    ).toBeUndefined();
    expect(served.inFlight()).toBe(0);
    const blobs = blobsOfDeep();
    const kept = await Promise.all(blobs.map(async (oid) => store.has(oid)));
    expect(kept.filter(Boolean).length).toBeLessThan(blobs.length);
  });
});

describe.runIf(gitToolchainOnPath)('a cold open whose delta header does not parse', () => {
  it('answers undefined for smart HTTP rather than wait on a base it read ahead', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-cold-ofs-'));
    try {
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
        execFileSync('git', args, { cwd: directory, encoding: 'utf8', env: environment }).trim();
      git('init', '-q', '-b', 'main');
      /* Eight similar files in one commit: git stores one whole and deltas the rest against it. */
      const body = Array.from({ length: 2000 }, (_value, line) => `line ${String(line)} ${String(line * 7919)}`);
      await Promise.all(
        Array.from({ length: 8 }, async (_value, version) =>
          writeFile(
            join(directory, `f${String(version)}.scad`),
            `${body.with(version * 100, `changed ${String(version)}`).join('\n')}\ntail ${String(version)}\n`,
          ),
        ),
      );
      git('add', '-A');
      git('commit', '-q', '-m', 'Similar');
      /* Larger versions of the same files under a ref the open does not ask for: git deltas the head's blobs against
       * them, so their bases are read ahead as bases, not as listed blobs. */
      const entries = Array.from({ length: 8 }, (_value, version) => {
        const larger = `${body.with(version * 100, `changed ${String(version)}`).join('\n')}\n${body.join('\n')}\n`;
        const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
          cwd: directory,
          input: larger,
          encoding: 'utf8',
        }).trim();
        return `100644 blob ${blob}\tf${String(version)}.scad`;
      });
      const tree = execFileSync('git', ['mktree'], {
        cwd: directory,
        input: `${entries.join('\n')}\n`,
        encoding: 'utf8',
      }).trim();
      git('update-ref', 'refs/tau/ops/larger', git('commit-tree', tree, '-m', 'Larger'));
      git('repack', '-adfq');
      const packDirectory = join(directory, '.git', 'objects', 'pack');
      const packFiles = await readdir(packDirectory);
      const packFile = packFiles.find((name) => name.endsWith('.pack'))!;
      const pack = new Uint8Array(await readFile(join(packDirectory, packFile)));
      const index = new Uint8Array(await readFile(join(packDirectory, packFile.replace(/\.pack$/u, '.idx'))));
      const packName = `pack-${Buffer.from(pack.subarray(-20)).toString('hex')}-${nonce}`;
      const main = git('rev-parse', 'refs/heads/main');
      const listed = lines(git('ls-tree', '-r', '-l', main)).map((line) => {
        const [meta = '', path = ''] = line.split('\t');
        const [mode = '', , oid = '', size = ''] = meta.split(/\s+/u);
        return { mode, oid, size, path };
      });
      const deltas = new Set(
        lines(git('verify-pack', '-v', join(packDirectory, packFile.replace(/\.pack$/u, '.idx'))))
          .map((line) => line.split(/\s+/u))
          .filter((fields) => /^[\da-f]{40}$/u.test(fields[0] ?? '') && fields.length >= 7)
          .map((fields) => fields[0]!),
      );
      const listedDeltas = listed.filter((entry) => deltas.has(entry.oid));
      expect(listedDeltas.length).toBeGreaterThanOrEqual(2);
      /* The second listed delta's base distance zeroed as served, after the first delta's base was asked for. */
      const packIndex = readPackIndex(index);
      let corruptAt = packIndex.offsetOf(listedDeltas[1]!.oid)!;
      /* Past the entry's size header: each byte below 0x80 ends it. */
      while (pack[corruptAt]! >= 0x80) {
        corruptAt += 1;
      }
      corruptAt += 1;
      const listing = new Uint8Array(
        gzipSync(
          `${[
            `tau-head-listing\t1\t${main}\t${git('rev-parse', `${main}^{tree}`)}`,
            ...listed.map((entry) => `${entry.mode}\t${entry.oid}\t${entry.size}\t\t\t${entry.path}`),
          ].join('\n')}\n`,
        ),
      );
      const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.href.startsWith(catalogueUrl)) {
          return Response.json({
            format: 1,
            generation: 1,
            refs: [{ ref: 'refs/heads/main', oid: main }],
            listings: [{ commit: main, href: `${filesOrigin}/listing`, bytes: listing.byteLength }],
            packs: [
              {
                key: `packs/${packName}.pack`,
                bytes: pack.byteLength,
                index: { href: `${filesOrigin}/${packName}.idx`, bytes: index.byteLength },
                pack: { href: `${filesOrigin}/${packName}.pack`, bytes: pack.byteLength },
              },
            ],
            complete: true,
            expiresAt: Math.floor(Date.now() / 1000) + 900,
          });
        }
        if (url.href === `${filesOrigin}/listing`) {
          return new Response(listing, { status: 200 });
        }
        if (url.href.endsWith('.idx')) {
          return new Response(index, { status: 200 });
        }
        const range = packRangeRefused(new Headers(init?.headers).get('range') ?? undefined, pack.byteLength)!;
        await new Promise((resolve) => {
          setTimeout(resolve, 3);
        });
        const bytes = pack.slice(...range);
        if (range[0] <= corruptAt && corruptAt < range[1]) {
          bytes[corruptAt - range[0]] = 0;
        }
        return new Response(bytes, { status: 206 });
      }) as typeof globalThis.fetch;
      const compute = countingCompute();
      const store = await emptyStore(compute, 'cold-ofs-corrupt');

      const opened = await Promise.race([
        /* One blob per batch: the batch with the first delta is read on its own, before the corrupt one. */
        coldOpenFromCatalogue({ catalogueUrl, fetch, store, compute, batchObjects: 1 }),
        new Promise<'hung'>((resolve) => {
          setTimeout(() => {
            resolve('hung');
          }, 5000);
        }),
      ]);

      expect(opened).toBeUndefined();
      expect(await store.has(main)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
