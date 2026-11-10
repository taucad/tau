/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Logger } from '@nestjs/common';
import { pointerSizeCeilingBytes, runGit } from '#lfs-references.js';
import type { Manifest } from '#store/manifest.js';
import { commitOfListingKey, listingKeyFor, listingRetirementKeyFor } from '#store/listing-key.js';
import type { RepositoryLocator, RepositoryStore } from '#store/port.js';

/**
 * The head listing (charter D8, EQ3): one small file per pushed branch tip
 * that carries everything a cold open needs to show the tree — every path,
 * its mode, blob id and size, and the LFS pointer facts of each pointer blob
 * — so the client reaches `treeReady` from one request, with no git work.
 *
 * It is written at push, on the commit path, beside the packs the manifest
 * names, and it is derived state: content-addressed by the commit it lists
 * (`listings/<commit>.tsv.gz`), immutable, and never the only copy of
 * anything. A push whose listing cannot be built still commits; the catalogue
 * then names no listing for that head and the client reads the trees by
 * Range instead.
 *
 * Format, version 1: gzip of UTF-8 lines joined by `\n`.
 *
 * ```text
 * tau-head-listing\t1\t<commit>\t<tree>
 * <mode>\t<oid>\t<size>\t<lfs oid>\t<lfs size>\t<path>
 * ```
 *
 * One entry line per blob, symlink and submodule in `ls-tree -r` order. A
 * submodule's size is `-`; the two LFS fields are empty for anything that is
 * not a pointer. The path is the last field and escapes `\` as `\\`, a tab as
 * `\t`, a newline as `\n` and a carriage return as `\r`, so a line never
 * splits; nothing else is escaped.
 */

/** The listing format this build writes. */
export const headListingFormat = 1;

/** The first field of a listing's header line. */
export const headListingMagic = 'tau-head-listing';

const logger = new Logger('HeadListing');

/** The largest listing stored, gzipped; past it the sidecar is skipped and the cold open falls back. Bytes. */
export const headListingMaximumBytes = 4 * 1024 * 1024;

/** Heads one push lists: the default branch first, then others by name. */
export const listedHeadsPerPush = 8;

/** Listings built at once. */
export const listingConcurrency = 4;

/** How long one push's listings may take, well inside the commit deadline. Milliseconds. */
export const listingBuildMilliseconds = 30_000;

const defaultBranches = ['refs/heads/main', 'refs/heads/master'];

const pointerVersionLine = 'version https://git-lfs.github.com/spec/v1\n';
const pointerFacts = /^oid sha256:(?<oid>[\da-f]{64})\nsize (?<size>0|[1-9]\d{0,15})\n/mu;

const escapePath = (path: string): string =>
  path
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('\t', String.raw`\t`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\r', String.raw`\r`);

type TreeEntry = {
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
  readonly size: string;
  readonly path: string;
};

/* `ls-tree -r -l -z`: `<mode> SP <type> SP <oid> SP+ <size> TAB <path> NUL`. */
const parseTree = (raw: Uint8Array<ArrayBuffer>): TreeEntry[] => {
  const text = new TextDecoder().decode(raw);
  return text
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode = '', type = '', oid = '', size = ''] = record.slice(0, tab).split(/ +/u);
      return { mode, type, oid, size, path: record.slice(tab + 1) };
    });
};

/* `cat-file --batch` records, by name: a header `<name> <type> <size>`, the body, a newline. */
const batchByName = (raw: Uint8Array<ArrayBuffer>): Map<string, Uint8Array<ArrayBuffer>> => {
  const decoder = new TextDecoder();
  const bodies = new Map<string, Uint8Array<ArrayBuffer>>();
  let offset = 0;
  while (offset < raw.byteLength) {
    const newline = raw.indexOf(0x0a, offset);
    if (newline === -1) {
      break;
    }
    const [name = '', , sizeText] = decoder.decode(raw.subarray(offset, newline)).split(' ');
    const size = Number(sizeText);
    offset = newline + 1;
    if (!Number.isSafeInteger(size)) {
      continue;
    }
    bodies.set(name, raw.subarray(offset, offset + size));
    offset += size + 1;
  }
  return bodies;
};

/** The pointer facts of one pointer blob, as `<oid>\t<size>`; `\t` for anything else. */
const pointerFields = (body: Uint8Array<ArrayBuffer> | undefined): string => {
  const text = body === undefined ? '' : new TextDecoder().decode(body);
  const facts = text.startsWith(pointerVersionLine) ? pointerFacts.exec(text)?.groups : undefined;
  return facts === undefined ? '\t' : `${facts['oid'] ?? ''}\t${facts['size'] ?? ''}`;
};

/**
 * One commit's head listing, gzipped.
 *
 * Three git children over the lease: the commit's tree id, `ls-tree -r -l`
 * of it, and one `cat-file --batch` of the blobs small enough to be a pointer
 * (git-lfs's own 1 KiB cut-off), so the bytes read follow the pointers, not
 * the repository.
 *
 * @param directory - A repository directory holding the commit.
 * @param commit - The branch tip to list.
 * @returns The listing's bytes and its entry count.
 */
export const buildHeadListing = async (
  directory: string,
  commit: string,
  signal?: AbortSignal,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly entries: number }> => {
  const git = async (args: readonly string[], input = ''): Promise<Uint8Array<ArrayBuffer>> =>
    runGit(directory, args, { input, ...(signal === undefined ? {} : { signal }) });
  const tree = new TextDecoder().decode(await git(['rev-parse', `${commit}^{tree}`])).trim();
  const entries = parseTree(await git(['ls-tree', '-r', '-l', '-z', '--full-tree', commit]));
  const candidates = entries.filter(
    (entry) => entry.type === 'blob' && Number(entry.size) <= pointerSizeCeilingBytes && entry.size !== '-',
  );
  const bodies =
    candidates.length === 0
      ? new Map<string, Uint8Array<ArrayBuffer>>()
      : batchByName(
          await git(
            ['cat-file', '--batch', '--buffer'],
            `${[...new Set(candidates.map((entry) => entry.oid))].join('\n')}\n`,
          ),
        );
  const lines = [
    `${headListingMagic}\t${String(headListingFormat)}\t${commit}\t${tree}`,
    ...entries.map(
      (entry) =>
        `${entry.mode}\t${entry.oid}\t${entry.size}\t${entry.type === 'blob' ? pointerFields(bodies.get(entry.oid)) : '\t'}\t${escapePath(entry.path)}`,
    ),
  ];
  const bytes = gzipSync(Buffer.from(lines.join('\n'), 'utf8'), { level: 9 });
  return {
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Uint8Array<ArrayBuffer>,
    entries: entries.length,
  };
};

/* The default branch first, then by name. */
const headOrder = (left: string, right: string): number => {
  const rank = (name: string): number => {
    const at = defaultBranches.indexOf(name);
    return at === -1 ? defaultBranches.length : at;
  };
  return rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0);
};

/**
 * The branch tips a commit's listings are written for: the `refs/heads/*`
 * the push created or moved, the default branch first, at most
 * {@link listedHeadsPerPush}. A branch the push did not touch keeps the
 * listing its last push wrote; one past the bound has none, and its cold
 * open walks its trees instead.
 *
 * @param before - The ref map the lease hydrated.
 * @param after - The ref map about to be committed.
 * @returns Distinct commit ids, the default branch's first.
 */
export const listedHeadsOf = (before: Manifest['refs'], after: Manifest['refs']): string[] =>
  [
    ...new Set(
      Object.entries(after)
        .filter(([name, tip]) => name.startsWith('refs/heads/') && before[name]?.oid !== tip.oid)
        .toSorted(([left], [right]) => headOrder(left, right))
        .map(([, tip]) => tip.oid),
    ),
  ].slice(0, listedHeadsPerPush);

/**
 * The listings a commit retires: branch tips the hydrated refs named and the
 * committed ones no longer name. Each gets a marker dated now, which the
 * sweep ages it from.
 *
 * @param before - The ref map the lease hydrated.
 * @param after - The ref map about to be committed.
 * @returns Distinct commit ids.
 */
export const retiredHeadsOf = (before: Manifest['refs'], after: Manifest['refs']): string[] => {
  const live = new Set(Object.values(after).map((tip) => tip.oid));
  return [
    ...new Set(
      Object.entries(before)
        .filter(([name, tip]) => name.startsWith('refs/heads/') && !live.has(tip.oid))
        .map(([, tip]) => tip.oid),
    ),
  ];
};

/** One listing ready to store: its key, bytes and digest. */
export type PreparedListing = {
  readonly key: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
};

const warnSkipped = (locator: RepositoryLocator, commit: string, error: unknown): void => {
  logger.warn(`the head listing of ${commit.slice(0, 12)} in ${locator.projectId} was not written: ${String(error)}`);
};

/**
 * Build each listed head's listing before the commit's put round, beside the
 * pack hashing: {@link listingConcurrency} at a time, all under one abortable
 * deadline of {@link listingBuildMilliseconds} (or less, when the commit's own
 * deadline is nearer), which kills the git children it ends. A listing that
 * cannot be built in time, or that passes {@link headListingMaximumBytes}, is
 * logged and skipped: a listing never fails a push.
 *
 * @param args - The repository, the lease directory, the commits and the commit's deadline.
 * @returns The listings to store; never rejects.
 */
export const prepareListings = async (args: {
  readonly locator: RepositoryLocator;
  readonly directory: string;
  readonly commits: readonly string[];
  readonly deadlineAt?: number;
  /** The cap; {@link headListingMaximumBytes} by default. */
  readonly maximumBytes?: number;
}): Promise<PreparedListing[]> => {
  const maximumBytes = args.maximumBytes ?? headListingMaximumBytes;
  const budget = Math.min(listingBuildMilliseconds, (args.deadlineAt ?? Number.POSITIVE_INFINITY) - Date.now() - 1000);
  if (args.commits.length === 0 || budget <= 0) {
    return [];
  }
  const signal = AbortSignal.timeout(budget);
  const prepared: PreparedListing[] = [];
  const queue = [...args.commits];
  const worker = async (): Promise<void> => {
    for (let commit = queue.shift(); commit !== undefined; commit = queue.shift()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- each worker builds one listing at a time.
        const { bytes } = await buildHeadListing(args.directory, commit, signal);
        if (bytes.byteLength > maximumBytes) {
          warnSkipped(args.locator, commit, `${String(bytes.byteLength)} bytes passes the listing cap`);
          continue;
        }
        prepared.push({
          key: listingKeyFor(commit),
          bytes,
          sha256: createHash('sha256').update(bytes).digest('base64'),
        });
      } catch (error) {
        warnSkipped(args.locator, commit, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(listingConcurrency, queue.length) }, worker));
  return prepared;
};

/**
 * The puts of prepared listings, for the commit's one put round. A put that
 * fails is logged, not thrown, unless the round was aborted by a sibling.
 *
 * @param store - The repository store.
 * @param locator - The repository.
 * @param prepared - What {@link prepareListings} built.
 * @returns One put per listing.
 */
export const listingPuts = (
  store: RepositoryStore,
  locator: RepositoryLocator,
  prepared: readonly PreparedListing[],
): Array<(signal: AbortSignal) => Promise<void>> =>
  prepared.map((listing) => async (signal: AbortSignal) => {
    try {
      /* Create-only: the key is content-addressed, so one already there is this listing (I3). */
      await store.putObject(
        locator,
        listing.key,
        listing.bytes,
        { contentLength: listing.bytes.byteLength, sha256: listing.sha256, createOnly: true },
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      warnSkipped(locator, commitOfListingKey(listing.key) ?? listing.key, error);
    }
  });

/**
 * The retirement markers of the listings a commit retires, for its put round,
 * so a listing is aged from when its tip stopped being named. A marker that
 * fails is logged, not thrown, unless the round was aborted by a sibling: a
 * listing without one is aged as an orphan instead.
 *
 * @param args - The store, the repository, the retired tips and the commit's time.
 * @returns One put per marker.
 */
export const listingRetirementPuts = (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly commits: readonly string[];
  readonly at: Date;
}): Array<(signal: AbortSignal) => Promise<void>> =>
  args.commits.map((commit) => async (signal: AbortSignal) => {
    const empty = new Uint8Array(0);
    try {
      await args.store.putObject(
        args.locator,
        listingRetirementKeyFor(commit, args.at),
        empty,
        { contentLength: 0, sha256: createHash('sha256').update(empty).digest('base64') },
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      logger.warn(
        `the listing retirement of ${commit.slice(0, 12)} in ${args.locator.projectId} was not marked: ${String(error)}`,
      );
    }
  });
