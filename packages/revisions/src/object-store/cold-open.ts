/**
 * The cold open (charter D8): a project's heads read from the hosted store's
 * catalogue, never through `upload-pack` and never as whole packs.
 *
 * 1. One catalogue request names the refs of the families the sync policy
 *    asks for (heads and tags by default; chats only when asked; ops never),
 *    each head's listing, and every live pack with its stored `.idx`.
 * 2. Each pack's `.idx` is read whole and checked against its trailer; the
 *    pack itself is read only by Range ({@link openRemotePack}).
 * 3. Each head's commit, its trees level by level, and the blobs its listing
 *    names are read in coalesced waves and kept in local packs of at most the
 *    repack ceiling, indexed from what was written: no `indexPack`.
 * 4. Older history stays on the server: the heads' commits are the store's
 *    shallow boundary, the store reads history through by Range while the
 *    catalogue's links last, and a later fetch brings what is new.
 *
 * Anything that is not a whole, current catalogue — a 404 where the hosted
 * store is not served this way, an incomplete catalogue, a link that fails —
 * answers `undefined`, and the caller fetches over smart HTTP as before.
 *
 * @module
 */

import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import type { ObjectSource, ObjectStore } from '#object-store/object-store.js';
import { openRemotePack } from '#object-store/remote-pack.js';
import type { RemotePack, RemotePackCounters } from '#object-store/remote-pack.js';
import { readTreeEntries } from '#object-store/tree-codec.js';
import type { StoredObject } from '#pack-reader/pack-reader.js';

/** The ref families a catalogue answers; ops are never among them. */
export type CatalogueFamily = 'heads' | 'tags' | 'chats';

const familyPrefixes: Readonly<Record<CatalogueFamily, string>> = {
  heads: 'refs/heads/',
  tags: 'refs/tags/',
  chats: 'refs/tau/chats/',
};

type Link = Readonly<{ href: string; bytes: number }>;

/** The hosted store's catalogue, as `GET /v1/projects/:id/git/catalogue` answers it (format 1). */
export type Catalogue = Readonly<{
  format: 1;
  generation: number;
  refs: ReadonlyArray<Readonly<{ ref: string; oid: string; peeled?: string }>>;
  listings: ReadonlyArray<Readonly<{ commit: string }> & Link>;
  packs: ReadonlyArray<Readonly<{ key: string; bytes: number; index: Link; pack: Link }>>;
  complete: boolean;
  expiresAt: number;
}>;

/** One file of a head listing. */
export type ListingEntry = Readonly<{
  mode: string;
  oid: string;
  /** `undefined` for a submodule. */
  size: number | undefined;
  /** The LFS object a pointer blob names. */
  lfs?: Readonly<{ oid: string; size: number }>;
  path: string;
}>;

/** A head listing: the commit, its tree and every file under it. */
export type HeadListing = Readonly<{ commit: string; tree: string; entries: readonly ListingEntry[] }>;

const unescapePath = (escaped: string): string =>
  escaped.replaceAll(/\\([\\tnr])/gu, (_match, code: string) => ({ t: '\t', n: '\n', r: '\r' })[code] ?? '\\');

/**
 * Read a head listing's text (format 1, already gunzipped).
 *
 * @param text - The listing.
 * @returns Its commit, tree and entries.
 * @throws TypeError when the text is not a format-1 listing.
 */
export const parseHeadListing = (text: string): HeadListing => {
  const [header = '', ...lines] = text.split('\n');
  const [magic, format, commit = '', tree = ''] = header.split('\t');
  if (magic !== 'tau-head-listing' || format !== '1') {
    throw new TypeError('The head listing is not one this client reads.');
  }
  const entries = lines
    .filter((line) => line !== '')
    .map((line): ListingEntry => {
      const fields = line.split('\t');
      if (fields.length !== 6) {
        throw new TypeError('A head listing line does not have six fields.');
      }
      const [mode, oid, size, lfsOid, lfsSize, path] = fields as [string, string, string, string, string, string];
      return {
        mode,
        oid,
        size: size === '-' ? undefined : Number(size),
        ...(lfsOid === '' ? {} : { lfs: { oid: lfsOid, size: Number(lfsSize) } }),
        path: unescapePath(path),
      };
    });
  return { commit, tree, entries };
};

/** What a cold open cost, for the S1 gates. */
export type ColdOpenReport = Readonly<{
  /** The catalogue request: always 1. */
  catalogueReads: number;
  /** Stored `.idx` files read whole. */
  indexReads: number;
  /** Head listings read. */
  listingReads: number;
  /** Objects kept in local packs. */
  imported: number;
  /** Local packs written. */
  packsWritten: number;
  /** Range reads of packs, summed over packs. */
  ranges: RemotePackCounters;
}>;

/** A cold open that took: the refs it brought, and what it cost. */
export type ColdOpenResult = Readonly<{
  refs: ReadonlyMap<string, string>;
  listings: readonly HeadListing[];
  /**
   * The commits brought without their history: the store's shallow
   * boundary, which the caller records so that the store never claims a
   * history it does not hold.
   */
  shallow: readonly string[];
  report: ColdOpenReport;
}>;

/** How to reach the catalogue and the files it links. */
export type ColdOpenOptions = Readonly<{
  /** The catalogue's URL, without its query. */
  catalogueUrl: string;
  /** The families to ask for; heads and tags by default. */
  families?: readonly CatalogueFamily[];
  /** The API's fetch: the session cookie goes with it. */
  fetch: typeof globalThis.fetch;
  /** The files host's fetch: links carry their own signature, so no credential goes with it. */
  filesFetch?: typeof globalThis.fetch;
  store: ObjectStore;
  compute: ComputeWorker;
  /** Object bytes read per wave; 16 MiB by default. */
  batchBytes?: number;
  /** Objects read per wave, whatever their size; 2048 by default. */
  batchObjects?: number;
  signal?: AbortSignal;
}>;

const isCatalogue = (value: unknown): value is Catalogue => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Catalogue>;
  return (
    candidate.format === 1 &&
    Array.isArray(candidate.refs) &&
    Array.isArray(candidate.listings) &&
    Array.isArray(candidate.packs) &&
    typeof candidate.complete === 'boolean'
  );
};

/* Every remote pack read as one source: each object from the first pack that holds it. */
const sourceOver = (packs: readonly RemotePack[]): ObjectSource =>
  Object.freeze({
    readMany: async (oids: Iterable<string>): Promise<Map<string, StoredObject>> => {
      const found = new Map<string, StoredObject>();
      let missing = [...new Set(oids)];
      for (const pack of packs) {
        if (missing.length === 0) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- one pack's waves at a time keeps the held ranges bounded.
        for (const [oid, object] of await pack.readMany(missing)) {
          found.set(oid, object);
        }
        missing = missing.filter((oid) => !found.has(oid));
      }
      return found;
    },
  });

const textDecoder = new TextDecoder();

/* The tree under a commit's body. */
const treeOf = (commit: StoredObject): string | undefined =>
  /^tree ([\da-f]{40})$/mu.exec(textDecoder.decode(commit.data))?.[1];

/* The parents a commit's header names. */
const parentsOf = (commit: StoredObject): string[] => {
  const [header = ''] = textDecoder.decode(commit.data).split('\n\n', 1);
  return [...header.matchAll(/^parent ([\da-f]{40})$/gmu)].map((match) => match[1]!);
};

/* The object a tag's body names. */
const taggedOf = (tag: StoredObject): string | undefined =>
  /^object ([\da-f]{40})$/mu.exec(textDecoder.decode(tag.data))?.[1];

/* A tree's entries, from bytes already read. */
const entriesOf = async (
  oid: string,
  tree: StoredObject,
): Promise<ReadonlyArray<Readonly<{ type: string; oid: string }>>> =>
  (await readTreeEntries({ read: async () => tree }, oid)) ?? [];

/*
 * Ids in batches of at most `batchBytes` by their known size and at most
 * `batchObjects` ids: a size nothing knows still counts against the second.
 */
const batchesOf = (
  oids: readonly string[],
  sizeOf: (oid: string) => number,
  limits: Readonly<{ batchBytes: number; batchObjects: number }>,
): string[][] => {
  const batches: string[][] = [];
  let bytes = 0;
  for (const oid of oids) {
    const size = sizeOf(oid);
    const last = batches.at(-1);
    if (last === undefined || bytes + size > limits.batchBytes || last.length >= limits.batchObjects) {
      batches.push([oid]);
      bytes = size;
    } else {
      last.push(oid);
      bytes += size;
    }
  }
  return batches;
};

/* How an import reads, keeps and bounds what it reads. */
type Importer = Readonly<{
  store: ObjectStore;
  /* Reads every one of `oids`, or throws. */
  readAll: (oids: readonly string[]) => Promise<Map<string, StoredObject>>;
  keep: (objects: ReadonlyMap<string, StoredObject>) => Promise<void>;
  sizeOf: (oid: string) => number;
  limits: Readonly<{ batchBytes: number; batchObjects: number }>;
}>;

/* Read `oids` a bounded batch at a time, keep each batch, and hand it on before the next is read. */
const inBatches = async (
  oids: readonly string[],
  importer: Importer,
  each: (objects: ReadonlyMap<string, StoredObject>) => Promise<void> = async () => undefined,
): Promise<void> => {
  for (const batch of batchesOf(oids, importer.sizeOf, importer.limits)) {
    // oxlint-disable-next-line no-await-in-loop -- one batch held at a time.
    const objects = await importer.readAll(batch);
    // oxlint-disable-next-line no-await-in-loop -- kept before the next batch is read.
    await importer.keep(objects);
    // oxlint-disable-next-line no-await-in-loop -- handed on before the next batch is read.
    await each(objects);
  }
};

/* The ids of `oids` the store does not hold yet. */
const unheld = async (store: ObjectStore, oids: Iterable<string>): Promise<string[]> => {
  const unique = [...new Set(oids)];
  const held = await Promise.all(unique.map(async (oid) => store.has(oid)));
  return unique.filter((_oid, at) => !held[at]);
};

/*
 * The trees under `roots` a level at a time, each level in bounded batches,
 * and then the blobs. A tree the store already holds is not walked: a tree
 * is kept only after the level above it and every blob after every tree, so
 * a held tree's subtree is held or is in this walk.
 */
const importTrees = async (
  roots: Iterable<string>,
  importer: Importer,
  blobs: Readonly<{ walked: boolean; listed: readonly string[] }>,
): Promise<void> => {
  const seen = new Set<string>();
  const walkedBlobs = new Set<string>();
  let level = await unheld(importer.store, roots);
  while (level.length > 0) {
    const next: string[] = [];
    for (const oid of level) {
      seen.add(oid);
    }
    // oxlint-disable-next-line no-await-in-loop -- a level's subtrees are known only once the level is read.
    await inBatches(level, importer, async (trees) => {
      const decoded = await Promise.all([...trees].map(async ([oid, tree]) => entriesOf(oid, tree)));
      for (const entry of decoded.flat()) {
        if (entry.type === 'tree' && !seen.has(entry.oid)) {
          seen.add(entry.oid);
          next.push(entry.oid);
        } else if (entry.type === 'blob' && blobs.walked) {
          walkedBlobs.add(entry.oid);
        }
      }
    });
    // oxlint-disable-next-line no-await-in-loop -- the next level is what this one named and the store lacks.
    level = await unheld(importer.store, next);
  }
  await inBatches(await unheld(importer.store, [...blobs.listed, ...walkedBlobs]), importer);
};

/*
 * The tips (each ref's object and the commit a tag peels to), then the trees
 * of every branch-like tip, then the blobs: the listings' where every walked
 * tip has one, else the trees' as well. Answers the commits brought without
 * their history.
 */
const importHeads = async (
  references: Catalogue['refs'],
  listings: readonly HeadListing[],
  importer: Importer,
): Promise<string[]> => {
  const tips = references.flatMap((entry) => [entry.oid, ...(entry.peeled === undefined ? [] : [entry.peeled])]);
  const tipObjects = new Map<string, StoredObject>();
  await inBatches([...new Set(tips)], importer, async (objects) => {
    for (const [oid, object] of objects) {
      tipObjects.set(oid, object);
    }
  });
  const walked = references.filter((entry) => !entry.ref.startsWith(familyPrefixes.tags)).map((entry) => entry.oid);
  const listed = new Set(listings.map((listing) => listing.commit));
  const roots = walked.flatMap((commit) => {
    const object = tipObjects.get(commit);
    return object?.type === 'commit' ? (treeOf(object) ?? []) : [];
  });
  await importTrees(roots, importer, {
    walked: walked.some((commit) => !listed.has(commit)),
    listed: listings.flatMap((listing) =>
      listing.entries.filter((entry) => entry.size !== undefined).map((entry) => entry.oid),
    ),
  });
  return [...tipObjects].filter(([, object]) => object.type === 'commit').map(([oid]) => oid);
};

/* A catalogue opened: its refs in the asked-for families, its packs by Range and its listings. */
type OpenedCatalogue = Readonly<{
  catalogue: Catalogue;
  references: Catalogue['refs'];
  packs: readonly RemotePack[];
  listings: readonly HeadListing[];
  indexReads: number;
  listingReads: number;
}>;

/* Read the catalogue, each pack's index and each listing; `undefined` for anything not whole and current. */
const openCatalogue = async (options: ColdOpenOptions): Promise<OpenedCatalogue | undefined> => {
  const { compute, signal } = options;
  const filesFetch = options.filesFetch ?? options.fetch;
  const families = options.families ?? ['heads', 'tags'];
  const answered = await options.fetch(`${options.catalogueUrl}?refs=${families.join(',')}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!answered.ok) {
    await answered.body?.cancel();
    return undefined;
  }
  const catalogue: unknown = await answered.json();
  if (!isCatalogue(catalogue) || !catalogue.complete) {
    return undefined;
  }
  const prefixes = families.map((family) => familyPrefixes[family]);
  const references = catalogue.refs.filter((entry) => prefixes.some((prefix) => entry.ref.startsWith(prefix)));
  const getBytes = async (href: string, range?: readonly [number, number]): Promise<Uint8Array<ArrayBuffer>> => {
    const response = await filesFetch(href, {
      credentials: 'omit',
      ...(range === undefined ? {} : { headers: { range: `bytes=${String(range[0])}-${String(range[1] - 1)}` } }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status !== (range === undefined ? 200 : 206)) {
      await response.body?.cancel();
      throw new Error(`A files link answered ${String(response.status)}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  let indexReads = 0;
  let listingReads = 0;
  return attempted(signal, async () => {
    const [packs, listings] = await Promise.all([
      Promise.all(
        catalogue.packs.map(async (pack) => {
          indexReads += 1;
          return openRemotePack({
            name: pack.key.slice(pack.key.lastIndexOf('/') + 1, -'.pack'.length),
            size: pack.bytes,
            index: await getBytes(pack.index.href),
            fetchRange: async (offset, length) => getBytes(pack.pack.href, [offset, offset + length]),
            compute,
          });
        }),
      ),
      Promise.all(
        catalogue.listings.map(async (listing) => {
          listingReads += 1;
          const gzipped = await getBytes(listing.href);
          const text = await new Response(
            new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip')),
          ).text();
          const parsed = parseHeadListing(text);
          if (parsed.commit !== listing.commit) {
            throw new TypeError(`The listing for ${listing.commit} lists ${parsed.commit}.`);
          }
          return parsed;
        }),
      ),
    ]);
    return { catalogue, references, packs, listings, indexReads, listingReads };
  });
};

/* What reads the opened catalogue's packs into the store, and what that cost. */
const importerOver = (
  opened: OpenedCatalogue,
  options: ColdOpenOptions,
): Readonly<{ importer: Importer; source: ObjectSource; report: () => ColdOpenReport }> => {
  const { packs, listings } = opened;
  const source = sourceOver(packs);
  const listedSizes = new Map(
    listings.flatMap((listing) =>
      listing.entries.flatMap((entry) => (entry.size === undefined ? [] : [[entry.oid, entry.size] as const])),
    ),
  );
  let imported = 0;
  let packsWritten = 0;
  const importer: Importer = {
    store: options.store,
    readAll: async (oids) => {
      const found = await source.readMany(oids);
      const missing = oids.filter((oid) => !found.has(oid));
      if (missing.length > 0) {
        throw new TypeError(`The catalogue's packs do not hold ${missing.slice(0, 3).join(', ')}.`);
      }
      return found;
    },
    keep: async (objects) => {
      const written = await options.store.importObjects([...objects].map(([oid, object]) => ({ oid, ...object })));
      packsWritten += written.length;
      imported += objects.size;
    },
    /* The listing's size where it names one, else the stored entry's (a delta's own, not its target's). */
    sizeOf: (oid) => listedSizes.get(oid) ?? Math.max(0, ...packs.map((pack) => pack.entryBytes(oid) ?? 0)),
    limits: { batchBytes: options.batchBytes ?? 16 * 1024 * 1024, batchObjects: options.batchObjects ?? 2048 },
  };
  const report = (): ColdOpenReport => {
    const ranges: RemotePackCounters = { rangeRequests: 0, bytesFetched: 0, waves: 0 };
    for (const pack of packs) {
      ranges.rangeRequests += pack.counters.rangeRequests;
      ranges.bytesFetched += pack.counters.bytesFetched;
      ranges.waves += pack.counters.waves;
    }
    const { indexReads, listingReads } = opened;
    return { catalogueReads: 1, indexReads, listingReads, imported, packsWritten, ranges };
  };
  return { importer, source, report };
};

/* Run a step, answering `undefined` for its failure unless the caller aborted. */
async function attempted<Result>(
  signal: AbortSignal | undefined,
  run: () => Promise<Result>,
): Promise<Result | undefined> {
  try {
    return await run();
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Open a project's heads from its catalogue.
 *
 * @param options - Where the catalogue is, the store to fill and its compute.
 * @returns The refs it brought, its shallow boundary and what it cost, or `undefined` to fetch over smart HTTP instead.
 */
export const coldOpenFromCatalogue = async (options: ColdOpenOptions): Promise<ColdOpenResult | undefined> => {
  const opened = await openCatalogue(options);
  if (opened === undefined) {
    return undefined;
  }
  const { importer, source, report } = importerOver(opened, options);
  const shallow = await attempted(options.signal, async () =>
    importHeads(opened.references, opened.listings, importer),
  );
  if (shallow === undefined) {
    return undefined;
  }
  /* History stays on the server, read through while the links last. */
  const linksExpireAt = opened.catalogue.expiresAt * 1000;
  options.store.attachSource({
    readMany: async (oids) => {
      if (Date.now() >= linksExpireAt) {
        return new Map();
      }
      try {
        return await source.readMany(oids);
      } catch {
        /* A lapsed or refused link reads as absent: the caller reports the object missing. */
        return new Map();
      }
    },
  });
  return {
    refs: new Map(opened.references.map((entry) => [entry.ref, entry.oid])),
    listings: opened.listings,
    shallow,
    report: report(),
  };
};

/**
 * Import from the catalogue every object `wants` reach that the store lacks,
 * object by object (`rev-list --objects <wants> --not <held>`): what a fetch
 * takes when `upload-pack` answers past the pack ceiling. History is walked
 * down to the commits the store already holds, so nothing is left shallow.
 *
 * @param options - Where the catalogue is, the store to fill, and the objects wanted.
 * @returns What it cost, or `undefined` when the catalogue cannot serve it.
 */
export const importReachableFromCatalogue = async (
  options: ColdOpenOptions & Readonly<{ wants: readonly string[] }>,
): Promise<ColdOpenReport | undefined> => {
  const opened = await openCatalogue(options);
  if (opened === undefined) {
    return undefined;
  }
  const { importer, report } = importerOver(opened, options);
  const { store } = options;
  const took = await attempted(options.signal, async () => {
    const seen = new Set<string>();
    const roots: string[] = [];
    let frontier = await unheld(store, options.wants);
    while (frontier.length > 0) {
      for (const oid of frontier) {
        seen.add(oid);
      }
      const next: string[] = [];
      // oxlint-disable-next-line no-await-in-loop -- a generation's parents are known only once it is read.
      await inBatches(frontier, importer, async (objects) => {
        for (const [oid, object] of objects) {
          switch (object.type) {
            case 'commit': {
              roots.push(...[treeOf(object) ?? []].flat());
              next.push(...parentsOf(object));
              break;
            }
            case 'tag': {
              next.push(...[taggedOf(object) ?? []].flat());
              break;
            }
            case 'tree': {
              /* A tag of a tree: kept already, so its entries are walked in its place. */
              // oxlint-disable-next-line no-await-in-loop -- rare, and one tree.
              const entries = await entriesOf(oid, object);
              roots.push(...entries.flatMap((entry) => (entry.type === 'tree' ? [entry.oid] : [])));
              break;
            }
            default:
            /* A tagged blob is kept already, and names nothing. */
          }
        }
      });
      // oxlint-disable-next-line no-await-in-loop -- the walk stops at what the store holds.
      frontier = await unheld(
        store,
        next.filter((oid) => !seen.has(oid)),
      );
    }
    await importTrees(roots, importer, { walked: true, listed: [] });
    return true;
  });
  return took === undefined ? undefined : report();
};
