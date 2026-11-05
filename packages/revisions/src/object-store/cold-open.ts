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
 * 4. Older history stays on the server: the store reads it through by Range
 *    while the catalogue's links last, and a later fetch brings what is new.
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
  /** Blob bytes read per wave; 16 MiB by default. */
  batchBytes?: number;
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

/* The tree under a commit's body. */
const treeOf = (commit: StoredObject | undefined): string | undefined =>
  commit === undefined ? undefined : /^tree ([\da-f]{40})$/mu.exec(new TextDecoder().decode(commit.data))?.[1];

/* Blob sizes the listings name, by id. */
const listedBlobSizes = (listings: readonly HeadListing[]): Map<string, number> =>
  new Map(
    listings.flatMap((listing) =>
      listing.entries.flatMap((entry) => (entry.size === undefined ? [] : [[entry.oid, entry.size] as const])),
    ),
  );

/* Ids in batches of at most `batchBytes` by their known size; an unknown size counts as none. */
const batchesOf = (oids: readonly string[], sizes: ReadonlyMap<string, number>, batchBytes: number): string[][] => {
  const batches: string[][] = [];
  let bytes = 0;
  for (const oid of oids) {
    const size = sizes.get(oid) ?? 0;
    const last = batches.at(-1);
    if (last === undefined || bytes + size > batchBytes) {
      batches.push([oid]);
      bytes = size;
    } else {
      last.push(oid);
      bytes += size;
    }
  }
  return batches;
};

/* What the import needs: the refs, the listings, a reader that refuses a miss, and where to keep what it read. */
type HeadImport = Readonly<{
  references: Catalogue['refs'];
  listings: readonly HeadListing[];
  readAll: (oids: readonly string[]) => Promise<Map<string, StoredObject>>;
  keep: (objects: ReadonlyMap<string, StoredObject>) => Promise<void>;
  batchBytes: number;
}>;

/*
 * The tips (each ref's object and the commit a tag peels to), then the trees
 * of every branch-like tip a level at a time, then the blobs: the listings'
 * where every walked tip has one, else the trees' as well. Each read is kept
 * before the next, so memory holds one level or one batch.
 */
const importHeads = async ({ references, listings, readAll, keep, batchBytes }: HeadImport): Promise<void> => {
  const tips = [
    ...new Set(references.flatMap((entry) => [entry.oid, ...(entry.peeled === undefined ? [] : [entry.peeled])])),
  ];
  const tipObjects = await readAll(tips);
  await keep(tipObjects);
  const walked = references.filter((entry) => !entry.ref.startsWith(familyPrefixes.tags)).map((entry) => entry.oid);
  const listed = new Set(listings.map((listing) => listing.commit));
  const unlisted = walked.some((commit) => !listed.has(commit));
  const blobSizes = listedBlobSizes(listings);
  const walkedBlobs = new Set<string>();
  const seenTrees = new Set<string>();
  let level = [...new Set(walked.flatMap((commit) => treeOf(tipObjects.get(commit)) ?? []))];
  while (level.length > 0) {
    // oxlint-disable-next-line no-await-in-loop -- a level's subtrees are known only once the level is read.
    const trees = await readAll(level);
    // oxlint-disable-next-line no-await-in-loop -- kept before the next level is read.
    await keep(trees);
    for (const oid of level) {
      seenTrees.add(oid);
    }
    const next = new Set<string>();
    const held = { read: async (oid: string) => trees.get(oid) };
    // oxlint-disable-next-line no-await-in-loop -- the level is already held: this only decodes it.
    const decoded = await Promise.all([...trees.keys()].map(async (oid) => readTreeEntries(held, oid)));
    for (const entries of decoded) {
      for (const entry of entries ?? []) {
        if (entry.type === 'tree' && !seenTrees.has(entry.oid)) {
          next.add(entry.oid);
        } else if (entry.type === 'blob' && unlisted) {
          walkedBlobs.add(entry.oid);
        }
      }
    }
    level = [...next];
  }
  for (const batch of batchesOf([...new Set([...blobSizes.keys(), ...walkedBlobs])], blobSizes, batchBytes)) {
    // oxlint-disable-next-line no-await-in-loop -- one batch held at a time.
    await keep(await readAll(batch));
  }
};

/**
 * Open a project's heads from its catalogue.
 *
 * @param options - Where the catalogue is, the store to fill and its compute.
 * @returns The refs it brought and what it cost, or `undefined` to fetch over smart HTTP instead.
 */
export const coldOpenFromCatalogue = async (options: ColdOpenOptions): Promise<ColdOpenResult | undefined> => {
  const { store, compute, signal } = options;
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
  let packs: RemotePack[];
  let listings: HeadListing[];
  try {
    [packs, listings] = await Promise.all([
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
          return parseHeadListing(text);
        }),
      ),
    ]);
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    return undefined;
  }
  const source = sourceOver(packs);
  let imported = 0;
  let packsWritten = 0;
  const keep = async (objects: ReadonlyMap<string, StoredObject>): Promise<void> => {
    const written = await store.importObjects([...objects].map(([oid, object]) => ({ oid, ...object })));
    packsWritten += written.length;
    imported += objects.size;
  };
  const readAll = async (oids: readonly string[]): Promise<Map<string, StoredObject>> => {
    const found = await source.readMany(oids);
    const missing = oids.filter((oid) => !found.has(oid));
    if (missing.length > 0) {
      throw new TypeError(`The catalogue's packs do not hold ${missing.slice(0, 3).join(', ')}.`);
    }
    return found;
  };
  try {
    await importHeads({ references, listings, readAll, keep, batchBytes: options.batchBytes ?? 16 * 1024 * 1024 });
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    return undefined;
  }
  /* History stays on the server, read through while the links last. */
  const linksExpireAt = catalogue.expiresAt * 1000;
  store.attachSource({
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
  const ranges: RemotePackCounters = { rangeRequests: 0, bytesFetched: 0, waves: 0 };
  for (const pack of packs) {
    ranges.rangeRequests += pack.counters.rangeRequests;
    ranges.bytesFetched += pack.counters.bytesFetched;
    ranges.waves += pack.counters.waves;
  }
  return {
    refs: new Map(references.map((entry) => [entry.ref, entry.oid])),
    listings,
    report: { catalogueReads: 1, indexReads, listingReads, imported, packsWritten, ranges },
  };
};
