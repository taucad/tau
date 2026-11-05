/**
 * The Git object store of the browser leg: pack-first, private, read by Tau
 * (charter D7, I6).
 *
 * Objects are read from packs through Tau's reader — the `.idx` tables held in
 * memory, one range read per entry, inflate and delta resolution on the
 * compute worker — and from loose files, which only this store writes: hashed
 * once, deflated once, and landed by rename so no reader sees half an object.
 * Every byte goes through a {@link GitFiles} surface, which on a project is the
 * rooted view's private store: no mutation pipeline, no change event, no index
 * entry and no claim beyond the ones this module takes itself.
 *
 * A bounded repack folds loose objects and small packs into one pack under an
 * exclusive fence, and keeps what it replaced for a retention window, so a
 * reader in another tab that located an object in a replaced pack still finds
 * it there; a reader that misses re-lists the packs once and reads again.
 *
 * @module
 */

import type { FileSystemProvider, PrivateStore } from '@taucad/filesystem';
import { ResourceQueue } from '@taucad/filesystem';
import { randomUuid } from '@taucad/utils/id';
import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { jsonRecord, readControlRecord, writeControlRecord } from '#control-plane-records.js';
import { checkPackIndexChecksum, readPackIndex } from '#pack-reader/pack-index.js';
import { createBaseCache, createPackReader, emptyReadCounters } from '#pack-reader/pack-reader.js';
import { bytesToHex } from '#object-hash.js';
import type {
  CopiedObject,
  GitObjectKind,
  ObjectReadCounters,
  PackReader,
  StoredObject,
} from '#pack-reader/pack-reader.js';
import { buildPack, createPackBuilder, indexBuiltPack } from '#object-store/pack-writer.js';
import type { PackBuilder } from '#object-store/pack-writer.js';

/** The files a Git store lives in: a rooted view's private store, or a provider's own primitives. */
export type GitFiles = PrivateStore;

/**
 * The {@link GitFiles} of a store: the rooted view's private store when the
 * filesystem has one, else the provider itself with a range read over it.
 *
 * @param filesystem - The project's filesystem, or a bare provider.
 * @param gitdir - The store's directory; only `.git` has a private store.
 * @returns Where the store's bytes are read and written.
 */
/*
 * The pack indexes this document has checked against their own SHA-1, by
 * path, size, modification time and trailer: a store opened again over the
 * same packs does not hash them again (W2 re-review 5). Only a check that
 * passed is kept, so a re-fetched index is checked afresh.
 */
const checkedIndexes = new Set<string>();
const checkedIndexesHeld = 1024;
const rememberChecked = (key: string): void => {
  checkedIndexes.add(key);
  if (checkedIndexes.size > checkedIndexesHeld) {
    const [oldest] = checkedIndexes;
    checkedIndexes.delete(oldest!);
  }
};

/* A pack that fails its own checks: the tables or the bytes are not what a whole pack is. */
const isIntegrityFailure = (error: unknown): boolean => error instanceof TypeError || error instanceof RangeError;

export const gitFilesOf = (
  filesystem: FileSystemProvider & { readonly privateStore?: PrivateStore },
  gitdir: string,
): GitFiles => {
  if (filesystem.privateStore !== undefined && gitdir === '.git') {
    return filesystem.privateStore;
  }
  return {
    /* Called through, not bound: the provider's methods are looked up at each call. */
    readFile: (async (path: string, encoding?: 'utf8') =>
      encoding === 'utf8' ? filesystem.readFile(path, 'utf8') : filesystem.readFile(path)) as GitFiles['readFile'],
    writeFile: async (path, data) => filesystem.writeFile(path, data),
    readdir: async (path) => filesystem.readdir(path),
    stat: (async (path: string) => filesystem.stat(path)) as GitFiles['stat'],
    exists: async (path) => filesystem.exists(path),
    mkdir: async (path, options) => filesystem.mkdir(path, options),
    unlink: async (path) => filesystem.unlink(path),
    rmdir: async (path) => filesystem.rmdir(path),
    rename: async (from, to) => filesystem.rename(from, to),
    ...(filesystem.readFileStream === undefined
      ? {}
      : {
          readRange: async (path: string, offset: number, length: number) => {
            checkRange(offset, length);
            const reader = filesystem.readFileStream!(path, { position: offset, length }).getReader();
            const chunks: Array<Uint8Array<ArrayBuffer>> = [];
            // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
            for (let read = await reader.read(); !read.done; read = await reader.read()) {
              chunks.push(read.value);
            }
            return chunks.length === 1 ? chunks[0]! : joinBytes(chunks);
          },
        }),
  };
};

/**
 * Refuse a range that is not two whole, non-negative numbers.
 *
 * @param offset - The range's first byte.
 * @param length - Its length.
 * @throws RangeError for anything else.
 */
const checkRange = (offset: number, length: number): void => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new RangeError(`A range read needs a whole offset and length, not ${String(offset)} and ${String(length)}.`);
  }
};

const joinBytes = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return joined;
};

/**
 * Whether a provider said nothing is at a path.
 *
 * @param error - A provider's rejection.
 * @returns `true` for an absent path.
 */
export const isMissing = (error: unknown): boolean => {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  return code === 'ENOENT' || code === 'ENOTDIR' || name === 'NotFoundError';
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const looseName = /^[\da-f]{38}$/u;
const fanoutName = /^[\da-f]{2}$/u;
const packIndexName = /^pack-([\da-f]{40})\.idx$/u;
const packName = /^pack-[\da-f]{40}\.pack$/u;
const looseKinds = new Set(['commit', 'tree', 'blob', 'tag']);
/* How long a pack read whole stays held after its last read. Milliseconds. */
const wholePackIdle = 2000;

/** Bounds of one repack. */
export type RepackOptions = Readonly<{
  /** Loose objects this store wrote that start a repack. */
  maxLoose: number;
  /** Live packs that start one: the smallest are folded together. */
  maxPacks: number;
  /**
   * How long replaced packs and loose objects stay for readers that located them.
   * Milliseconds.
   */
  retention: number;
  /** The largest pack a repack writes: the compute worker's ceiling. Bytes. */
  maxPackBytes: number;
}>;

const defaultRepack: RepackOptions = {
  maxLoose: 1024,
  maxPacks: 8,
  retention: 15 * 60 * 1000,
  maxPackBytes: 64 * 1024 * 1024,
};

/**
 * A pack past the ceiling the compute worker indexes (charter D7): it is not
 * a judgement on its bytes, so nothing is dropped for it. A fetch that meets
 * it takes the objects one by one instead ({@link ObjectStore.importObjects}).
 *
 * @public
 */
export class PackCeilingError extends Error {
  public override readonly name = 'PackCeilingError';

  /** The pack's size, or the bytes read before the ceiling was passed. */
  public readonly bytes: number;

  /** The ceiling. */
  public readonly ceiling: number;

  /**
   * Name the pack's size and the ceiling it passed.
   *
   * @param bytes - The pack's size, or the bytes read so far.
   * @param ceiling - The ceiling.
   */
  public constructor(bytes: number, ceiling: number) {
    super(`A pack of ${String(bytes)} bytes passes the ${String(ceiling)}-byte ceiling a pack is indexed under.`);
    this.bytes = bytes;
    this.ceiling = ceiling;
  }
}

/** Objects read from somewhere other than this store's own files: a pack on the server, by Range. */
export type ObjectSource = Readonly<{
  readMany: (oids: Iterable<string>) => Promise<Map<string, StoredObject>>;
}>;

/** What a store is made of. */
export type ObjectStoreOptions = Readonly<{
  files: GitFiles;
  /** The store's directory under {@link ObjectStoreOptions.files}. */
  gitdir: string;
  compute: ComputeWorker;
  /** Names the repack fence; one store, one name across tabs. */
  fenceName: string;
  /** Resolved delta bases kept, in bytes; 32 MiB by default. */
  cacheBytes?: number;
  repack?: Partial<RepackOptions>;
  /** The clock retention is measured on. */
  now?: () => number;
  /** The largest pack {@link ObjectStore.addPack} indexes; the repack ceiling by default. Bytes. */
  packCeilingBytes?: number;
}>;

/** One object to store loose: its id when the caller already computed it, else this store hashes it. */
export type LooseObject = Readonly<{ type: GitObjectKind; data: Uint8Array<ArrayBuffer>; oid?: string }>;

/** One Git object store: pack-first reads, loose writes, bounded repack. */
export type ObjectStore = Readonly<{
  /** What reads have cost so far, for gates. */
  counters: Readonly<ObjectReadCounters>;
  /** One object, or `undefined` when the store does not hold it. */
  read: (oid: string) => Promise<StoredObject | undefined>;
  /** Whether the store holds an object, packed or loose. */
  has: (oid: string) => Promise<boolean>;
  /** Store objects loose; answers their ids, in order. */
  writeLoose: (objects: readonly LooseObject[]) => Promise<string[]>;
  /** Keep a fetched pack, indexed on the compute worker; answers its name. */
  addPack: (pack: Uint8Array<ArrayBuffer>) => Promise<string>;
  /** One undeltified pack of these objects, for a push. */
  packObjects: (oids: readonly string[]) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Keep objects read elsewhere — a pack on the server — in packs of at most
   * the repack ceiling, indexed from what was written, never by `indexPack`.
   * Objects already held are skipped. Answers the packs written.
   */
  importObjects: (objects: Iterable<Readonly<{ oid: string } & StoredObject>>) => Promise<string[]>;
  /**
   * Read through to a source for an object this store lacks, keeping each one
   * it answers loose. For a store a cold open filled with only its heads.
   */
  attachSource: (source: ObjectSource) => void;
  /**
   * One object's body as a stream: a whole packed entry inflates as it is
   * read, so only its deflated bytes are held; anything else is read first.
   */
  openBlob: (oid: string) => Promise<ReadableStream<Uint8Array<ArrayBuffer>> | undefined>;
  /** Fold loose objects and small packs under the fence; `force` ignores the thresholds. Answers whether it wrote a pack. */
  repack: (force?: boolean) => Promise<boolean>;
  /** Repack when this store's own loose writes, or its packs, have reached their bound. */
  repackIfDue: () => Promise<boolean>;
}>;

/** A record of what a repack replaced, and when. */
type RetiredRecord = Readonly<{ version: 1; retired: ReadonlyArray<Readonly<{ path: string; at: number }>> }>;

/* Two documents serialize on a Web Lock; one document's stores on this queue. */
const fenceQueue = new ResourceQueue();

/**
 * Run under the repack fence, or not at all when another holder has it.
 *
 * @param name - The fence's name, one per store across tabs.
 * @param operation - The repack itself.
 * @returns Whether it ran.
 */
const underFence = async (name: string, operation: () => Promise<void>): Promise<boolean> => {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks === undefined) {
    return fenceQueue.queueFor(name, async () => {
      await operation();
      return true;
    });
  }
  return locks.request(`tau:revision-repack:${name}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (lock === null) {
      return false;
    }
    await operation();
    return true;
  });
};

/**
 * Open one Git object store.
 *
 * @param options - Its files, directory, compute and bounds.
 * @returns Reads, loose writes, packs and repack over those files.
 */
export const createObjectStore = (options: ObjectStoreOptions): ObjectStore => {
  const { files, gitdir, compute, fenceName } = options;
  const now = options.now ?? Date.now;
  const bounds: RepackOptions = { ...defaultRepack, ...options.repack };
  const packCeiling = options.packCeilingBytes ?? bounds.maxPackBytes;
  const sources: ObjectSource[] = [];
  const counters = emptyReadCounters();
  const cache = createBaseCache(options.cacheBytes ?? 32 * 1024 * 1024);
  const packDirectory = `${gitdir}/objects/pack`;
  const retiredPath = `${gitdir}/objects/tau-retired.json`;
  const loosePath = (oid: string): string => `${gitdir}/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  /* Loose objects this store wrote since its last repack decision. */
  let looseWrites = 0;
  /* Packs a repack retired and that still sit on disk for the window: not live, never counted. */
  let retiredPacks = new Set<string>();
  /* Live packs when this store last decided about a repack: the same count does not start another. */
  let settledPacks = -1;

  /*
   * One range of a pack: a slice where the files read ranges, else the pack
   * read whole and held while it is in use — a provider that keeps its bytes
   * in memory or in one record (the memory provider, the IndexedDB fallback)
   * has no cheaper way. A pack no read has touched for a while is dropped.
   */
  const wholePacks = new Map<
    string,
    { bytes: Promise<Uint8Array<ArrayBuffer>>; idle?: ReturnType<typeof setTimeout> }
  >();
  const dropWhole = (path: string): void => {
    const held = wholePacks.get(path);
    clearTimeout(held?.idle);
    wholePacks.delete(path);
  };
  const readRange =
    files.readRange?.bind(files) ??
    (async (path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> => {
      checkRange(offset, length);
      let held = wholePacks.get(path);
      if (held === undefined) {
        counters.wholePackLoads += 1;
        const bytes = (async (): Promise<Uint8Array<ArrayBuffer>> => {
          try {
            return await files.readFile(path);
          } catch (error) {
            dropWhole(path);
            throw error;
          }
        })();
        held = { bytes };
        wholePacks.set(path, held);
      }
      const touched = held;
      clearTimeout(touched.idle);
      touched.idle = setTimeout(() => {
        if (wholePacks.get(path) === touched) {
          wholePacks.delete(path);
        }
      }, wholePackIdle);
      (touched.idle as { unref?: () => void }).unref?.();
      const bytes = await touched.bytes;
      return bytes.subarray(offset, offset + length);
    });

  /* Newest first, so a repack's pack answers before the ones it folded. */
  let packs: PackReader[] | undefined;
  const packSizes = new Map<string, number>();
  const openPack = (name: string, stored: Uint8Array<ArrayBuffer>, size: number): PackReader => {
    const path = `${packDirectory}/${name}.pack`;
    packSizes.set(path, size);
    return createPackReader({
      path,
      size,
      /* Checked against its trailer before it is opened, or written by this store. */
      index: readPackIndex(stored, { checksumChecked: true }),
      readRange,
      compute,
      cache,
      counters,
      readBase: async (oid, depth) => readAt(oid, depth),
    });
  };
  let listing: Promise<PackReader[]> | undefined;
  /*
   * Packs refused for a bad index or dropped for bad bytes, by pack path:
   * warned of once, left out of every listing, and written over when a fetch
   * lands a pack under the name again, whatever its size.
   */
  const droppedPacks = new Set<string>();
  /* Rethrow what is not an integrity failure; record and warn once of what is. */
  const leaveUnread = (path: string, error: unknown): void => {
    if (!isIntegrityFailure(error)) {
      throw error;
    }
    if (!droppedPacks.has(path)) {
      droppedPacks.add(path);
      console.warn(`[revisions] The pack ${path} is left unread: ${(error as Error).message}`);
    }
  };
  /*
   * A pack whose index checked out but whose bytes do not (its trailer, an
   * entry that does not inflate or inflates to the wrong size, a delta that
   * cannot apply, an object that hashes to another id) is dropped as a bad
   * index is: warned of once, closed, and no longer held — so `has` answers
   * false for its objects and a fetch brings them again. Any other failure
   * is the caller's.
   */
  const dropPack = (pack: PackReader, error: unknown): void => {
    leaveUnread(pack.path, error);
    packs = (packs ?? []).filter((held) => held.path !== pack.path);
    dropWhole(pack.path);
  };
  /*
   * One pack's tables, or `undefined` when it was retired between the listing
   * and the read, or fails its own checks. A corrupt pack is left out of the
   * listing with a warning rather than failing every read: the other packs
   * and the loose objects still answer, and writes still land, so a fetch
   * that brings the objects again heals the store (W2 re-review 2).
   */
  const loadPack = async (base: string): Promise<PackReader | undefined> => {
    const indexPath = `${packDirectory}/${base}.idx`;
    let stored: Uint8Array<ArrayBuffer>;
    let indexStat: Readonly<{ size: number; mtimeMs: number }>;
    let packSize: number;
    try {
      const [readIndex, statIndex, statPack] = await Promise.all([
        files.readFile(indexPath),
        files.stat(indexPath),
        files.stat(`${packDirectory}/${base}.pack`),
      ]);
      [stored, indexStat, packSize] = [readIndex, statIndex, statPack.size];
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
    }
    const trailer = stored.byteLength >= 20 ? bytesToHex(stored.subarray(stored.byteLength - 20)) : '';
    const key = [indexPath, indexStat.size, indexStat.mtimeMs, trailer].join('\0');
    try {
      if (!checkedIndexes.has(key)) {
        await checkPackIndexChecksum(stored, compute.sha1);
        rememberChecked(key);
      }
      return openPack(base, stored, packSize);
    } catch (error) {
      leaveUnread(`${packDirectory}/${base}.pack`, error);
      return undefined;
    }
  };
  /* Every `.idx` in the pack directory, as tables; a pack already open is kept. */
  const listPacks = async (): Promise<PackReader[]> => {
    listing ??= (async (): Promise<PackReader[]> => {
      try {
        let names: string[];
        try {
          names = await files.readdir(packDirectory);
        } catch (error) {
          if (!isMissing(error)) {
            throw error;
          }
          names = [];
        }
        const held = new Map((packs ?? []).map((pack, order) => [pack.path, { pack, order }]));
        const bases = names.flatMap((name) => {
          const named = packIndexName.exec(name);
          return named === null || droppedPacks.has(`${packDirectory}/pack-${named[1]!}.pack`)
            ? []
            : [`pack-${named[1]!}`];
        });
        const opened = await Promise.all(
          bases.map(async (base) => held.get(`${packDirectory}/${base}.pack`)?.pack ?? loadPack(base)),
        );
        const order = (pack: PackReader): number => held.get(pack.path)?.order ?? -1;
        /* Packs this store already knew keep their order; new ones go first. */
        const listed = opened
          /* A pack dropped while this listing ran stays out. */
          .filter((pack): pack is PackReader => pack !== undefined && !droppedPacks.has(pack.path))
          .toSorted((left, right) => order(left) - order(right));
        packs = listed;
        return listed;
      } finally {
        listing = undefined;
      }
    })();
    return listing;
  };
  const knownPacks = async (): Promise<PackReader[]> => packs ?? listPacks();

  const parseLoose = (framed: Uint8Array<ArrayBuffer>, oid: string): StoredObject => {
    const space = framed.indexOf(0x20);
    const nul = space === -1 ? -1 : framed.indexOf(0, space);
    const type = textDecoder.decode(framed.subarray(0, Math.max(space, 0)));
    const declared = nul === -1 ? Number.NaN : Number(textDecoder.decode(framed.subarray(space + 1, nul)));
    if (!looseKinds.has(type) || declared !== framed.byteLength - nul - 1) {
      throw new TypeError(`The loose object ${oid} is not a whole object.`);
    }
    return { type: type as GitObjectKind, data: framed.slice(nul + 1) };
  };

  const readLoose = async (oid: string): Promise<StoredObject | undefined> => {
    let compressed: Uint8Array<ArrayBuffer>;
    try {
      compressed = await files.readFile(loosePath(oid));
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
    }
    counters.looseReads += 1;
    return parseLoose(await compute.inflate(compressed), oid);
  };

  /* One pass over the packs this store knows, then the loose file. */
  const readOnce = async (oid: string, depth: number): Promise<StoredObject | undefined> => {
    for (const pack of await knownPacks()) {
      let found: StoredObject | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop -- the first pack that holds it answers; most reads ask one.
        found = await pack.read(oid, depth);
      } catch (error) {
        dropPack(pack, error);
        continue;
      }
      if (found !== undefined) {
        return found;
      }
    }
    return readLoose(oid);
  };

  /* One object at a delta depth: a ref-delta's base read from anywhere in the store counts its hops. */
  const readAt = async (oid: string, depth: number): Promise<StoredObject | undefined> => {
    try {
      const found = await readOnce(oid, depth);
      if (found !== undefined) {
        return found;
      }
    } catch (error) {
      /* A pack this store located was retired and its window has passed. */
      if (!isMissing(error)) {
        throw error;
      }
    }
    /* Another writer — a fetch or a repack in another tab — may have packed it since this store last listed. */
    await listPacks();
    return (await readOnce(oid, depth)) ?? readThrough(oid);
  };

  /* An object no local file holds, from the first attached source that has it, kept loose. */
  const readThrough = async (oid: string): Promise<StoredObject | undefined> => {
    for (const source of sources) {
      // oxlint-disable-next-line no-await-in-loop -- the first source that holds it answers.
      const found = (await source.readMany([oid])).get(oid);
      if (found !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- kept before it is answered, so the next read is local.
        await writeLoose([{ ...found, oid }]);
        return found;
      }
    }
    return undefined;
  };

  /**
   * One object, or `undefined` when the store does not hold it.
   *
   * @param oid - Lowercase hex object id.
   * @returns Its kind and body.
   */
  const read = async (oid: string): Promise<StoredObject | undefined> => readAt(oid, 0);

  /**
   * Whether the store holds an object: its packs' tables, then its loose file.
   *
   * @param oid - Lowercase hex object id.
   * @returns `true` when it is held.
   */
  const has = async (oid: string): Promise<boolean> => {
    for (const pack of await knownPacks()) {
      if (pack.index.offsetOf(oid) !== undefined) {
        return true;
      }
    }
    return files.exists(loosePath(oid));
  };

  /*
   * Land one content-addressed file by rename: written beside its name, so no
   * reader ever sees part of it. A writer whose rename loses to a file already
   * there keeps that file only when it is the same size as its own content —
   * a whole copy another writer landed; a shorter or longer one (a copy cut
   * short by a host that died) is replaced. `replace` replaces it whatever
   * its size: a pack this store dropped as corrupt, fetched again whole.
   */
  const landAddressed = async (path: string, content: Uint8Array<ArrayBuffer>, replace = false): Promise<void> => {
    await files.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    const partial = `${path}.${randomUuid()}.partial`;
    await files.writeFile(partial, content);
    try {
      await files.rename(partial, path);
      return;
    } catch (error) {
      const held = await files.stat(path).catch(() => undefined);
      if (held === undefined || (held.size === content.byteLength && !replace)) {
        await files.unlink(partial).catch(() => undefined);
        if (held === undefined) {
          throw error;
        }
        return;
      }
    }
    try {
      await files.unlink(path).catch((error: unknown) => {
        if (!isMissing(error)) {
          throw error;
        }
      });
      await files.rename(partial, path);
    } catch (error) {
      await files.unlink(partial).catch(() => undefined);
      throw error;
    }
  };

  const framedOf = (type: GitObjectKind, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
    const head = textEncoder.encode(`${type} ${String(data.byteLength)}\0`);
    const framed = new Uint8Array(head.byteLength + data.byteLength);
    framed.set(head);
    framed.set(data, head.byteLength);
    return framed;
  };

  /**
   * Store objects loose: each one hashed at most once (its id is taken when the
   * caller already computed it), deflated once, and skipped when held.
   *
   * @param objects - Each object's kind, body and, when known, id.
   * @returns Their ids, in order.
   */
  const writeLoose = async (objects: readonly LooseObject[]): Promise<string[]> =>
    Promise.all(
      objects.map(async (object) => {
        const framed = framedOf(object.type, object.data);
        const oid = object.oid ?? (await compute.sha1(framed));
        if (await has(oid)) {
          return oid;
        }
        await landAddressed(loosePath(oid), await compute.deflate(framed));
        looseWrites += 1;
        return oid;
      }),
    );

  /*
   * Write a pack and its index, the pack first: a reader finds a pack by its
   * index, so it never finds one whose bytes are not all there.
   */
  const publishPack = async (
    pack: Uint8Array<ArrayBuffer>,
    packIndex: Uint8Array<ArrayBuffer>,
    checksum: string,
  ): Promise<string> => {
    const base = `pack-${checksum}`;
    const packPath = `${packDirectory}/${base}.pack`;
    /* A pack this store dropped as corrupt is written over even under the same name and size, so a fetch heals it. */
    const heal = droppedPacks.has(packPath);
    await files.mkdir(packDirectory, { recursive: true });
    await landAddressed(packPath, pack, heal);
    await landAddressed(`${packDirectory}/${base}.idx`, packIndex, heal);
    const opened = openPack(base, packIndex, pack.byteLength);
    droppedPacks.delete(packPath);
    const known = packs ?? (await listPacks());
    packs = [opened, ...known.filter((held) => held.path !== opened.path)];
    return base;
  };

  /**
   * Keep one pack a fetch received: indexed on the compute worker, then
   * written with its index and opened for reads.
   *
   * @param pack - The whole pack (at most the compute worker's ceiling).
   * @returns The pack's name.
   */
  const addPack = async (pack: Uint8Array<ArrayBuffer>): Promise<string> => {
    if (pack.byteLength > packCeiling) {
      throw new PackCeilingError(pack.byteLength, packCeiling);
    }
    const checksum = [...pack.subarray(-20)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const packIndex = await compute.indexPack(pack);
    return publishPack(pack, packIndex, checksum);
  };

  const importObjects = async (objects: Iterable<Readonly<{ oid: string } & StoredObject>>): Promise<string[]> => {
    const names: string[] = [];
    let batch: Array<Readonly<{ oid: string } & StoredObject>> = [];
    let bytes = 0;
    const flush = async (): Promise<void> => {
      if (batch.length > 0) {
        const built = await buildPack(batch, compute);
        names.push(await publishPack(built.pack, await indexBuiltPack(built, compute), built.checksum));
      }
      batch = [];
      bytes = 0;
    };
    for (const object of objects) {
      // oxlint-disable-next-line no-await-in-loop -- held objects are skipped one lookup at a time.
      if (!(await has(object.oid))) {
        if (bytes > 0 && bytes + object.data.byteLength > bounds.maxPackBytes) {
          // oxlint-disable-next-line no-await-in-loop -- one bounded pack written before the next is filled.
          await flush();
        }
        batch.push(object);
        bytes += object.data.byteLength;
      }
    }
    await flush();
    return names;
  };

  const openBlob = async (oid: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>> | undefined> => {
    for (const pack of await knownPacks()) {
      // oxlint-disable-next-line no-await-in-loop -- the first pack that holds it answers.
      const entry = await pack.wholeEntry(oid).catch(() => undefined);
      if (entry !== undefined) {
        let seen = 0;
        const counted = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
          transform: (chunk, controller) => {
            seen += chunk.byteLength;
            controller.enqueue(chunk);
          },
          flush: (controller) => {
            if (seen !== entry.size) {
              controller.error(new TypeError(`The object ${oid} inflates to a size other than the one it declares.`));
            }
          },
        });
        return new Blob([entry.compressed])
          .stream()
          .pipeThrough(
            new DecompressionStream('deflate') as unknown as TransformStream<
              Uint8Array<ArrayBuffer>,
              Uint8Array<ArrayBuffer>
            >,
          )
          .pipeThrough(counted);
      }
    }
    const object = await read(oid);
    return object === undefined
      ? undefined
      : (new Blob([object.data]).stream() as ReadableStream<Uint8Array<ArrayBuffer>>);
  };

  /**
   * One pack holding these objects, for a push: each read and deflated in
   * turn, so only compressed entries are held.
   *
   * @param oids - The objects, each read through this store.
   * @returns The pack's bytes.
   */
  const packObjects = async (oids: readonly string[]): Promise<Uint8Array<ArrayBuffer>> => {
    const builder = createPackBuilder(compute);
    for (const oid of oids) {
      // oxlint-disable-next-line no-await-in-loop -- one object resident at a time beside the compressed pack.
      const object = await read(oid);
      if (object === undefined) {
        throw new TypeError(`The store does not hold ${oid}.`);
      }
      // oxlint-disable-next-line no-await-in-loop -- deflated before the next object is read.
      await builder.add({ oid, ...object });
    }
    const built = await builder.finish();
    return built.pack;
  };

  const wholeRetired = jsonRecord(
    (value) => typeof value === 'object' && value !== null && Array.isArray((value as { retired?: unknown }).retired),
  );
  const readRetired = async (): Promise<RetiredRecord> => {
    try {
      const stored = JSON.parse(
        (await readControlRecord(files, retiredPath, { accepts: wholeRetired })) ?? '{}',
      ) as Partial<RetiredRecord>;
      return Array.isArray(stored.retired) ? { version: 1, retired: stored.retired } : { version: 1, retired: [] };
    } catch {
      return { version: 1, retired: [] };
    }
  };
  /* Only the fence holder writes the record, and a reader of a missing one retires nothing early. */
  const writeRetired = async (record: RetiredRecord): Promise<void> => {
    await writeControlRecord(files, retiredPath, `${JSON.stringify(record)}\n`);
    retiredPacks = new Set(record.retired.map((entry) => entry.path).filter((path) => path.endsWith('.pack')));
  };

  /* Every loose object on disk, by id, and every partial write beside them. */
  const listLoose = async (): Promise<Readonly<{ oids: string[]; partials: string[] }>> => {
    const listed = await files.readdir(`${gitdir}/objects`).catch(() => [] as string[]);
    const named = await Promise.all(
      listed
        .filter((name) => fanoutName.test(name))
        .map(async (directory) => {
          const names = await files.readdir(`${gitdir}/objects/${directory}`).catch(() => [] as string[]);
          return {
            oids: names.filter((name) => looseName.test(name)).map((name) => `${directory}${name}`),
            partials: names
              .filter((name) => name.endsWith('.partial'))
              .map((name) => `${gitdir}/objects/${directory}/${name}`),
          };
        }),
    );
    return { oids: named.flatMap((entry) => entry.oids), partials: named.flatMap((entry) => entry.partials) };
  };

  /*
   * Remove what a dead writer left, once it is older than the window: a
   * partial write never renamed into place, and a pack whose index never
   * landed (no reader can find it).
   */
  const sweepLeftovers = async (loosePartials: readonly string[]): Promise<void> => {
    const names = await files.readdir(packDirectory).catch(() => [] as string[]);
    const indexed = new Set(names.filter((name) => name.endsWith('.idx')).map((name) => name.slice(0, -4)));
    const candidates = [
      ...loosePartials,
      ...names
        .filter((name) => name.endsWith('.partial') || (packName.test(name) && !indexed.has(name.slice(0, -5))))
        .map((name) => `${packDirectory}/${name}`),
    ];
    await Promise.all(
      candidates.map(async (path) => {
        const stat = await files.stat(path).catch(() => undefined);
        if (stat !== undefined && now() - stat.mtimeMs >= bounds.retention) {
          await files.unlink(path).catch(() => undefined);
        }
      }),
    );
  };

  /* Remove what was retired longer ago than the window; answer what stays recorded. */
  const sweepRetired = async (
    record: RetiredRecord,
  ): Promise<Readonly<{ kept: RetiredRecord['retired']; swept: boolean }>> => {
    const expired = record.retired.filter((entry) => now() - entry.at >= bounds.retention);
    for (const entry of expired) {
      // oxlint-disable-next-line no-await-in-loop -- one removal at a time; a failure leaves the rest recorded.
      await files.unlink(entry.path).catch((error: unknown) => {
        if (!isMissing(error)) {
          throw error;
        }
      });
    }
    return { kept: record.retired.filter((entry) => !expired.includes(entry)), swept: expired.length > 0 };
  };

  /*
   * One object into the pack being built, checked first: it is hashed and
   * must be the object its id names. It is deflated before the next is read
   * (a whole entry of a pack is copied as it is stored), so the raw bytes
   * resident are one object's — and the resolved bases in the bounded cache.
   * Answers `false`, adding nothing, when the object would take the pack past
   * its byte bound.
   */
  const foldObject = async (
    into: Readonly<{ builder: PackBuilder; budget: { left: number } }>,
    oid: string,
    object: CopiedObject | undefined,
  ): Promise<boolean> => {
    const { builder, budget } = into;
    if (object === undefined) {
      throw new TypeError(`A repack could not read ${oid}.`);
    }
    if ((await compute.sha1(framedOf(object.type, object.data))) !== oid) {
      throw new TypeError(`A repack read ${oid} and found another object's bytes.`);
    }
    if (object.data.byteLength > budget.left) {
      return false;
    }
    budget.left -= object.data.byteLength;
    if (object.compressed === undefined) {
      await builder.add({ oid, type: object.type, data: object.data });
    } else {
      builder.addCompressed({
        oid,
        type: object.type,
        size: object.data.byteLength,
        compressed: new Uint8Array(object.compressed),
      });
    }
    return true;
  };

  /*
   * Fold one pack whole into the builder: `folded`, or `full` when it would
   * pass the bound, or `corrupt` when its bytes fail a check — then it is
   * dropped, not folded or retired, and the repack goes on without it. A pack
   * that is not folded leaves the builder, the budget and `included` as they
   * were: a pack is retired whole or not at all.
   */
  const foldPack = async (
    into: Readonly<{ builder: PackBuilder; budget: { left: number } }>,
    pack: PackReader,
    included: Set<string>,
  ): Promise<'folded' | 'full' | 'corrupt'> => {
    const mark = { count: into.builder.count(), left: into.budget.left };
    const added: string[] = [];
    let outcome: 'folded' | 'full' | 'corrupt' = 'folded';
    try {
      for (const [oid] of pack.index.entries()) {
        if (included.has(oid)) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- one object resident at a time beside the compressed pack.
        if (!(await foldObject(into, oid, await pack.readForCopy(oid)))) {
          outcome = 'full';
          break;
        }
        included.add(oid);
        added.push(oid);
      }
    } catch (error) {
      dropPack(pack, error);
      outcome = 'corrupt';
    }
    if (outcome !== 'folded') {
      into.builder.truncate(mark.count);
      into.budget.left = mark.left;
      for (const oid of added) {
        included.delete(oid);
      }
    }
    return outcome;
  };

  /**
   * Fold loose objects and small packs into one pack, under the exclusive
   * fence; another tab already repacking means this one does nothing.
   *
   * The pack holds at most {@link RepackOptions.maxPackBytes} of resolved
   * objects: packs are taken smallest first, each whole or not at all, until
   * the next would pass the bound; then every loose object that still fits,
   * passing over one too large for what is left. Every object is read
   * and hashed before it is written; one that cannot be read or does not
   * hash to its id aborts the repack, which then writes and retires nothing.
   *
   * Nothing is deleted that a reader may have located: what this repack
   * replaces is recorded with the time, and removed by a later repack once
   * the retention window has passed.
   *
   * @param force - Repack whatever is there, whatever the thresholds say.
   * @returns Whether a pack was written.
   * @throws TypeError when an object to fold cannot be read or is not what its id names.
   */
  const repack = async (force = false): Promise<boolean> => {
    let wrote = false;
    await underFence(fenceName, async () => {
      const record = await readRetired();
      const { kept, swept } = await sweepRetired(record);
      const retiredPaths = new Set(record.retired.map((entry) => entry.path));
      const listedPacks = await listPacks();
      const live = listedPacks.filter((pack) => !retiredPaths.has(pack.path));
      const listedLoose = await listLoose();
      await sweepLeftovers(listedLoose.partials);
      /* By id, not by listing order: the same objects fold into the same pack, under the same name, on any host. */
      const loose = listedLoose.oids
        .filter((oid) => !retiredPaths.has(loosePath(oid)))
        .toSorted((left, right) => (left < right ? -1 : 1));
      const foldPacks = live.length > bounds.maxPacks || force ? live : [];
      /* Decided: whatever happens below, the writes and packs counted so far start no other repack. */
      looseWrites = 0;
      settledPacks = live.length;
      retiredPacks = new Set([...retiredPaths].filter((path) => path.endsWith('.pack')));
      if (!force && loose.length < bounds.maxLoose && foldPacks.length === 0) {
        if (swept) {
          await writeRetired({ version: 1, retired: kept });
        }
        return;
      }
      const builder = createPackBuilder(compute);
      const budget = { left: bounds.maxPackBytes };
      const into = { builder, budget };
      const included = new Set<string>();
      const chosen: PackReader[] = [];
      const sizeOf = (pack: PackReader): number => packSizes.get(pack.path) ?? 0;
      for (const pack of foldPacks.toSorted((left, right) => sizeOf(left) - sizeOf(right))) {
        // oxlint-disable-next-line no-await-in-loop -- one pack after another, under one byte bound.
        const outcome = await foldPack(into, pack, included);
        if (outcome === 'full') {
          break;
        }
        if (outcome === 'folded') {
          chosen.push(pack);
        }
      }
      const folded: string[] = [];
      for (const oid of loose) {
        if (budget.left === 0) {
          break;
        }
        /* One loose object larger than what is left stays loose; smaller ones after it still fold (W2 re-review 3). */
        // oxlint-disable-next-line no-await-in-loop -- one object resident at a time beside the compressed pack.
        if (!included.has(oid) && (await foldObject(into, oid, await readLoose(oid)))) {
          included.add(oid);
          folded.push(oid);
        }
      }
      if (builder.count() === 0 || (chosen.length <= 1 && folded.length === 0)) {
        if (swept) {
          await writeRetired({ version: 1, retired: kept });
        }
        return;
      }
      const built = await builder.finish();
      await publishPack(built.pack, await indexBuiltPack(built, compute), built.checksum);
      const at = now();
      const replaced = [
        ...chosen.flatMap((pack) => [pack.path, pack.path.replace(/\.pack$/u, '.idx')]),
        ...folded.map((oid) => loosePath(oid)),
      ].filter((path) => !path.includes(built.checksum));
      await writeRetired({ version: 1, retired: [...kept, ...replaced.map((path) => ({ path, at }))] });
      const replacedPacks = new Set(chosen.map((pack) => pack.path));
      for (const path of replacedPacks) {
        dropWhole(path);
      }
      packs = (packs ?? []).filter((pack) => !replacedPacks.has(pack.path) || pack.path.includes(built.checksum));
      settledPacks = packs.length;
      wrote = true;
    });
    return wrote;
  };

  /* Live packs: those this store has open that no repack retired. */
  const livePacks = (): number => (packs ?? []).filter((pack) => !retiredPacks.has(pack.path)).length;

  return Object.freeze({
    counters,
    read,
    has,
    writeLoose,
    addPack,
    importObjects,
    attachSource: (source: ObjectSource) => {
      sources.push(source);
    },
    openBlob,
    packObjects,
    repack,
    repackIfDue: async (): Promise<boolean> => {
      const due = looseWrites >= bounds.maxLoose || (livePacks() > bounds.maxPacks && livePacks() !== settledPacks);
      if (!due) {
        return false;
      }
      try {
        return await repack();
      } catch (error) {
        /* The store is left as it was; a write that asked for the repack has landed and stands. */
        console.warn(`[revisions] A repack was abandoned: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
  });
};
