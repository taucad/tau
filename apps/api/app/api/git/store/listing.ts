/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Logger } from '@nestjs/common';
import { pointerSizeCeilingBytes, runGitWithInput } from '#api/git/lfs-references.js';
import { retentionWindowMilliseconds } from '#api/git/store/limits.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

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

/** Where one commit's listing lives in its repository. */
export const listingKeyFor = (commit: string): string => `listings/${commit}.tsv.gz`;

/** The commit a listing key names, or `undefined` for any other key. */
export const commitOfListingKey = (key: string): string | undefined =>
  /^listings\/(?<commit>[\da-f]{40}(?:[\da-f]{24})?)\.tsv\.gz$/u.exec(key)?.groups?.['commit'];

const logger = new Logger('HeadListing');

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
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly entries: number }> => {
  const tree = new TextDecoder().decode(await runGitWithInput(directory, ['rev-parse', `${commit}^{tree}`], '')).trim();
  const entries = parseTree(await runGitWithInput(directory, ['ls-tree', '-r', '-l', '-z', '--full-tree', commit], ''));
  const candidates = entries.filter(
    (entry) => entry.type === 'blob' && Number(entry.size) <= pointerSizeCeilingBytes && entry.size !== '-',
  );
  const bodies =
    candidates.length === 0
      ? new Map<string, Uint8Array<ArrayBuffer>>()
      : batchByName(
          await runGitWithInput(
            directory,
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

/**
 * The branch tips a commit's listings are written for: every `refs/heads/*`
 * the push created or moved. A branch the push did not touch keeps the
 * listing its last push wrote.
 *
 * @param before - The ref map the lease hydrated.
 * @param after - The ref map about to be committed.
 * @returns Distinct commit ids, in ref name order.
 */
export const listedHeadsOf = (before: Manifest['refs'], after: Manifest['refs']): string[] => [
  ...new Set(
    Object.entries(after)
      .filter(([name, tip]) => name.startsWith('refs/heads/') && before[name]?.oid !== tip.oid)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([, tip]) => tip.oid),
  ),
];

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
 * Build each moved head's listing before the commit's put round, beside the
 * pack hashing. A listing already stored is not built again (the key is
 * content-addressed, and a store object is never overwritten, I3), and one
 * that cannot be built is logged and skipped: the push commits whatever
 * happens to its sidecar.
 *
 * @param args - The store, the repository, the lease directory and the commits to list.
 * @returns The listings to store; never rejects.
 */
export const prepareListings = async (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly directory: string;
  readonly commits: readonly string[];
}): Promise<PreparedListing[]> => {
  const prepared = await Promise.all(
    args.commits.map(async (commit): Promise<PreparedListing | undefined> => {
      const key = listingKeyFor(commit);
      try {
        for await (const stored of args.store.listObjects(args.locator, key)) {
          if (stored.key === key) {
            return undefined;
          }
        }
        const { bytes } = await buildHeadListing(args.directory, commit);
        return { key, bytes, sha256: createHash('sha256').update(bytes).digest('base64') };
      } catch (error) {
        warnSkipped(args.locator, commit, error);
        return undefined;
      }
    }),
  );
  return prepared.filter((listing) => listing !== undefined);
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
      await store.putObject(
        locator,
        listing.key,
        listing.bytes,
        { contentLength: listing.bytes.byteLength, sha256: listing.sha256 },
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
 * Remove the listings of commits no ref of `committed` names any longer,
 * once the retention window has passed since they were written, so a client
 * that read a catalogue minutes ago still finds the listing it was handed.
 * Never rejects: a listing left behind is a few kilobytes, swept next time.
 *
 * @param args - The store, the repository, the manifest just committed and the time.
 * @returns The listing keys deleted.
 */
export const sweepListings = async (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly committed: Manifest;
  readonly at: Date;
}): Promise<readonly string[]> => {
  const live = new Set(Object.values(args.committed.refs).map((tip) => tip.oid));
  const doomed: string[] = [];
  try {
    for await (const stored of args.store.listObjects(args.locator, 'listings/')) {
      const commit = commitOfListingKey(stored.key);
      const old =
        stored.modifiedAt !== undefined &&
        args.at.getTime() - stored.modifiedAt.getTime() > retentionWindowMilliseconds;
      if (commit !== undefined && !live.has(commit) && old) {
        doomed.push(stored.key);
      }
    }
    if (doomed.length > 0) {
      await args.store.deleteObjects(args.locator, doomed);
    }
    return doomed;
  } catch (error) {
    logger.warn(`the listings of ${args.locator.projectId} were not swept: ${String(error)}`);
    return [];
  }
};
