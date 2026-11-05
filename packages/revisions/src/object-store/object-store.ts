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
import { readPackIndex } from '#pack-reader/pack-index.js';
import { createBaseCache, createPackReader, emptyReadCounters } from '#pack-reader/pack-reader.js';
import type { GitObjectKind, ObjectReadCounters, PackReader, StoredObject } from '#pack-reader/pack-reader.js';
import { buildPack, indexBuiltPack } from '#object-store/pack-writer.js';
import type { PackObject } from '#object-store/pack-writer.js';

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
  const counters = emptyReadCounters();
  const cache = createBaseCache(options.cacheBytes ?? 32 * 1024 * 1024);
  const packDirectory = `${gitdir}/objects/pack`;
  const retiredPath = `${gitdir}/objects/tau-retired.json`;
  const loosePath = (oid: string): string => `${gitdir}/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  let looseWrites = 0;

  /*
   * One range of a pack: a slice where the files read ranges, else the pack
   * read whole once and held while the store is open — a provider that keeps
   * its bytes in memory or in one record (the memory provider, the IndexedDB
   * fallback) has no cheaper way.
   */
  const wholePacks = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  const readRange =
    files.readRange?.bind(files) ??
    (async (path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> => {
      let whole = wholePacks.get(path);
      if (whole === undefined) {
        counters.wholePackLoads += 1;
        whole = (async (): Promise<Uint8Array<ArrayBuffer>> => {
          try {
            return await files.readFile(path);
          } catch (error) {
            wholePacks.delete(path);
            throw error;
          }
        })();
        wholePacks.set(path, whole);
      }
      const bytes = await whole;
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
      index: readPackIndex(stored),
      readRange,
      compute,
      cache,
      counters,
      readBase: async (oid) => read(oid),
    });
  };
  let listing: Promise<PackReader[]> | undefined;
  /* One pack's tables, or `undefined` when it was retired between the listing and the read. */
  const loadPack = async (base: string): Promise<PackReader | undefined> => {
    try {
      const [stored, stat] = await Promise.all([
        files.readFile(`${packDirectory}/${base}.idx`),
        files.stat(`${packDirectory}/${base}.pack`),
      ]);
      return openPack(base, stored, stat.size);
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
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
          return named === null ? [] : [`pack-${named[1]!}`];
        });
        const opened = await Promise.all(
          bases.map(async (base) => held.get(`${packDirectory}/${base}.pack`)?.pack ?? loadPack(base)),
        );
        const order = (pack: PackReader): number => held.get(pack.path)?.order ?? -1;
        /* Packs this store already knew keep their order; new ones go first. */
        const listed = opened
          .filter((pack): pack is PackReader => pack !== undefined)
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

  const parseLoose = (framed: Uint8Array<ArrayBuffer>): StoredObject => {
    const space = framed.indexOf(0x20);
    const nul = framed.indexOf(0, space);
    const type = textDecoder.decode(framed.subarray(0, space)) as GitObjectKind;
    return { type, data: framed.slice(nul + 1) };
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
    return parseLoose(await compute.inflate(compressed));
  };

  /* One pass over the packs this store knows, then the loose file. */
  const readOnce = async (oid: string): Promise<StoredObject | undefined> => {
    for (const pack of await knownPacks()) {
      // oxlint-disable-next-line no-await-in-loop -- the first pack that holds it answers; most reads ask one.
      const found = await pack.read(oid);
      if (found !== undefined) {
        return found;
      }
    }
    return readLoose(oid);
  };

  /**
   * One object, or `undefined` when the store does not hold it.
   *
   * @param oid - Lowercase hex object id.
   * @returns Its kind and body.
   */
  const read = async (oid: string): Promise<StoredObject | undefined> => {
    try {
      const found = await readOnce(oid);
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
    return readOnce(oid);
  };

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
   * reader ever sees part of it, and a writer that loses the race to another
   * writer of the same bytes keeps the winner's.
   */
  const landAddressed = async (path: string, content: Uint8Array<ArrayBuffer>): Promise<void> => {
    await files.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    const partial = `${path}.${randomUuid()}.partial`;
    await files.writeFile(partial, content);
    try {
      await files.rename(partial, path);
    } catch (error) {
      await files.unlink(partial).catch(() => undefined);
      if (!(await files.exists(path))) {
        throw error;
      }
    }
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
        const head = textEncoder.encode(`${object.type} ${String(object.data.byteLength)}\0`);
        const framed = new Uint8Array(head.byteLength + object.data.byteLength);
        framed.set(head);
        framed.set(object.data, head.byteLength);
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
    await files.mkdir(packDirectory, { recursive: true });
    await landAddressed(`${packDirectory}/${base}.pack`, pack);
    await landAddressed(`${packDirectory}/${base}.idx`, packIndex);
    const opened = openPack(base, packIndex, pack.byteLength);
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
    const checksum = [...pack.subarray(-20)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    /* Indexed from a copy: a compute worker takes the bytes it is handed. */
    const packIndex = await compute.indexPack(new Uint8Array(pack));
    return publishPack(pack, packIndex, checksum);
  };

  /**
   * One pack holding these objects, for a push.
   *
   * @param oids - The objects, each read through this store.
   * @returns The pack's bytes.
   */
  const packObjects = async (oids: readonly string[]): Promise<Uint8Array<ArrayBuffer>> => {
    const objects = await Promise.all(
      oids.map(async (oid): Promise<PackObject> => {
        const object = await read(oid);
        if (object === undefined) {
          throw new TypeError(`The store does not hold ${oid}.`);
        }
        return { oid, ...object };
      }),
    );
    const built = await buildPack(objects, compute);
    return built.pack;
  };

  const readRetired = async (): Promise<RetiredRecord> => {
    try {
      const stored = JSON.parse(await files.readFile(retiredPath, 'utf8')) as RetiredRecord;
      return Array.isArray(stored.retired) ? stored : { version: 1, retired: [] };
    } catch {
      return { version: 1, retired: [] };
    }
  };
  const writeRetired = async (record: RetiredRecord): Promise<void> => {
    const writing = `${retiredPath}.${randomUuid()}.writing`;
    await files.writeFile(writing, `${JSON.stringify(record)}\n`);
    try {
      await files.rename(writing, retiredPath);
    } catch {
      /* Not every provider's rename replaces. Only the fence holder writes the
       * record, and a reader of a missing one retires nothing early. */
      await files.unlink(retiredPath).catch(() => undefined);
      await files.rename(writing, retiredPath);
    }
  };

  /* Every loose object on disk, by id. */
  const listLoose = async (): Promise<string[]> => {
    const listed = await files.readdir(`${gitdir}/objects`).catch(() => [] as string[]);
    const named = await Promise.all(
      listed
        .filter((name) => fanoutName.test(name))
        .map(async (directory) => {
          const names = await files.readdir(`${gitdir}/objects/${directory}`).catch(() => [] as string[]);
          return names.filter((name) => looseName.test(name)).map((name) => `${directory}${name}`);
        }),
    );
    return named.flat();
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

  /* Smallest packs first, up to the ceiling; the rest wait for another repack. */
  const choosePacks = (candidates: readonly PackReader[]): PackReader[] => {
    const chosen: PackReader[] = [];
    let budget = bounds.maxPackBytes;
    const sizeOf = (pack: PackReader): number => packSizes.get(pack.path) ?? 0;
    for (const pack of candidates.toSorted((left, right) => sizeOf(left) - sizeOf(right))) {
      if (sizeOf(pack) > budget) {
        break;
      }
      chosen.push(pack);
      budget -= sizeOf(pack);
    }
    return chosen;
  };

  /**
   * Fold loose objects and small packs into one pack, under the exclusive
   * fence; another tab already repacking means this one does nothing.
   *
   * Nothing is deleted that a reader may have located: what this repack
   * replaces is recorded with the time, and removed by a later repack once
   * the retention window has passed.
   *
   * @param force - Repack whatever is there, whatever the thresholds say.
   * @returns Whether a pack was written.
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
      const loose = listedLoose.filter((oid) => !retiredPaths.has(loosePath(oid)));
      const foldPacks = live.length > bounds.maxPacks || force ? live : [];
      if (!force && loose.length < bounds.maxLoose && foldPacks.length === 0) {
        if (swept) {
          await writeRetired({ version: 1, retired: kept });
        }
        return;
      }
      const chosen = choosePacks(foldPacks);
      const oids = new Set<string>();
      for (const pack of chosen) {
        for (const [oid] of pack.index.entries()) {
          oids.add(oid);
        }
      }
      const folded: string[] = [];
      for (const oid of loose) {
        if (!oids.has(oid)) {
          oids.add(oid);
          folded.push(oid);
        }
      }
      if (oids.size === 0 || (chosen.length <= 1 && folded.length === 0)) {
        await writeRetired({ version: 1, retired: kept });
        return;
      }
      const objects: PackObject[] = [];
      for (const oid of oids) {
        // oxlint-disable-next-line no-await-in-loop -- one object resident at a time beside the pack being built.
        const object = await read(oid);
        if (object !== undefined) {
          objects.push({ oid, ...object });
        }
      }
      const built = await buildPack(objects, compute);
      await publishPack(built.pack, await indexBuiltPack(built, compute), built.checksum);
      const at = now();
      const replaced = [
        ...chosen.flatMap((pack) => [pack.path, pack.path.replace(/\.pack$/u, '.idx')]),
        ...folded.map((oid) => loosePath(oid)),
      ].filter((path) => !path.includes(built.checksum));
      await writeRetired({ version: 1, retired: [...kept, ...replaced.map((path) => ({ path, at }))] });
      const replacedPacks = new Set(chosen.map((pack) => pack.path));
      for (const path of replacedPacks) {
        wholePacks.delete(path);
      }
      packs = (packs ?? []).filter((pack) => !replacedPacks.has(pack.path) || pack.path.includes(built.checksum));
      looseWrites = 0;
      wrote = true;
    });
    return wrote;
  };

  return Object.freeze({
    counters,
    read,
    has,
    writeLoose,
    addPack,
    packObjects,
    repack,
    repackIfDue: async (): Promise<boolean> =>
      looseWrites >= bounds.maxLoose || (packs?.length ?? 0) > bounds.maxPacks ? repack() : false,
  });
};
