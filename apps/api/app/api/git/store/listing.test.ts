import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildHeadListing,
  headListingMagic,
  headListingMaximumBytes,
  listedHeadsOf,
  listedHeadsPerPush,
  listingPuts,
  prepareListings,
  retiredHeadsOf,
} from '#api/git/store/listing.js';
import { commitOfListingKey, listingKeyFor, listingRetirementKeyFor } from '#api/git/store/listing-key.js';
import { sweepListings } from '#api/git/store/sweep.js';
import { orphanThresholdMilliseconds, retentionWindowMilliseconds } from '#api/git/store/limits.js';
import { succeedManifest } from '#api/git/store/manifest.js';
import type { PutObjectOptions, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/*
 * The head listing (D8): its bytes for the reference fixture (2,000 entries,
 * 65 directories, 500 LFS pointers — the cold-open model's STO-25 shape), its
 * format, and the sidecar puts the commit makes with it.
 */

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const gitEnvironment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Listing',
  GIT_AUTHOR_EMAIL: 'listing@tau.test',
  GIT_COMMITTER_NAME: 'Listing',
  GIT_COMMITTER_EMAIL: 'listing@tau.test',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const scratch: string[] = [];
afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Deterministic pseudo-random hex, so the fixture's bytes do not change between runs. */
const hexOf = (seed: string, length: number): string => {
  let out = '';
  for (let round = 0; out.length < length; round += 1) {
    out += createHash('sha256')
      .update(`${seed}:${String(round)}`)
      .digest('hex');
  }
  return out.slice(0, length);
};

const pointer = (index: number): { text: string; oid: string; size: number } => {
  const oid = hexOf(`lfs-${String(index)}`, 64);
  const size = 1_000_000 + index * 7919;
  return { text: `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(size)}\n`, oid, size };
};

/** The reference fixture: 2,000 files in 65 directories, 500 of them LFS pointers, plus odd paths. */
const fixture = (): { directory: string; commit: string; ops: string } => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tau-listing-'));
  scratch.push(directory);
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  for (let index = 0; index < 1997; index += 1) {
    const folder = path.join(directory, 'parts', `group-${String(index % 64).padStart(2, '0')}`);
    mkdirSync(folder, { recursive: true });
    const lfs = index % 4 === 0 && index < 2000;
    const name = lfs ? `model-${String(index).padStart(4, '0')}.step` : `part-${String(index).padStart(4, '0')}.ts`;
    writeFileSync(
      path.join(folder, name),
      lfs ? pointer(index).text : `export const part${String(index)} = ${hexOf(`text-${String(index)}`, 120)};\n`,
    );
  }
  writeFileSync(path.join(directory, 'tab\there.txt'), 'odd\n');
  writeFileSync(path.join(directory, String.raw`back\slash.txt`), 'odd\n');
  writeFileSync(path.join(directory, 'main.ts'), 'export {};\n');
  git(directory, 'add', '-A');
  git(directory, 'commit', '--quiet', '-m', 'fixture');
  const commit = git(directory, 'rev-parse', 'HEAD');
  /* An operation-log ref beside the branch: its objects must not appear in a head listing. */
  writeFileSync(path.join(directory, 'ops.json'), '{"op":1}\n');
  git(directory, 'add', 'ops.json');
  const opsTree = git(directory, 'write-tree');
  const ops = git(directory, 'commit-tree', opsTree, '-p', commit, '-m', 'ops');
  git(directory, 'update-ref', 'refs/tau/ops/device-1', ops);
  git(directory, 'reset', '--quiet', '--hard', commit);
  return { directory, commit, ops };
};

type Line = { mode: string; oid: string; size: string; lfsOid: string; lfsSize: string; path: string };

const unescape = (text: string): string =>
  text.replaceAll(/\\(.)/gu, (_, character: string) =>
    character === 't' ? '\t' : character === 'n' ? '\n' : character === 'r' ? '\r' : character,
  );

const readListing = (bytes: Uint8Array<ArrayBuffer>): { header: string[]; lines: Line[] } => {
  const [header = '', ...rest] = gunzipSync(bytes).toString('utf8').split('\n');
  return {
    header: header.split('\t'),
    lines: rest.map((line) => {
      const [mode = '', oid = '', size = '', lfsOid = '', lfsSize = '', ...pathParts] = line.split('\t');
      return { mode, oid, size, lfsOid, lfsSize, path: unescape(pathParts.join('\t')) };
    }),
  };
};

let repository: ReturnType<typeof fixture>;
beforeAll(() => {
  repository = fixture();
}, 60_000);

describe('the head listing', () => {
  it('should list the reference fixture in at most 100 KB (D8 acceptance)', async () => {
    const { bytes, entries } = await buildHeadListing(repository.directory, repository.commit);
    expect(entries).toBe(2000);
    expect(bytes.byteLength).toBeLessThanOrEqual(100 * 1000);
    console.info(`[listing] reference fixture: ${String(entries)} entries, ${String(bytes.byteLength)} bytes gzipped`);
  });

  it('should carry every path, mode, oid and size, and the pointer facts of each pointer', async () => {
    const { bytes } = await buildHeadListing(repository.directory, repository.commit);
    const { header, lines } = readListing(bytes);
    expect(header).toEqual([
      headListingMagic,
      '1',
      repository.commit,
      git(repository.directory, 'rev-parse', `${repository.commit}^{tree}`),
    ]);
    const native = git(repository.directory, 'ls-tree', '-r', '-l', '-z', repository.commit)
      .split('\0')
      .filter((record) => record !== '')
      .map((record) => {
        const tab = record.indexOf('\t');
        const [mode, , oid, size] = record.slice(0, tab).split(/ +/u);
        return { mode, oid, size, path: record.slice(tab + 1) };
      });
    expect(lines.map(({ mode, oid, size, path: file }) => ({ mode, oid, size, path: file }))).toEqual(native);
    const pointers = lines.filter((line) => line.lfsOid !== '');
    expect(pointers).toHaveLength(500);
    const first = lines.find((line) => line.path.endsWith('model-0000.step'));
    expect(first).toMatchObject({ lfsOid: pointer(0).oid, lfsSize: String(pointer(0).size) });
    expect(lines.find((line) => line.path === 'tab\there.txt')).toMatchObject({ lfsOid: '', lfsSize: '' });
    expect(lines.map((line) => line.path)).toContain(String.raw`back\slash.txt`);
    expect(lines.map((line) => line.path)).not.toContain('ops.json');
  });

  it('should be the same bytes for the same commit, so a key is written once', async () => {
    const first = await buildHeadListing(repository.directory, repository.commit);
    const second = await buildHeadListing(repository.directory, repository.commit);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });

  it('should key a listing by its commit and read the key back', () => {
    expect(listingKeyFor(repository.commit)).toBe(`listings/${repository.commit}.tsv.gz`);
    expect(commitOfListingKey(listingKeyFor(repository.commit))).toBe(repository.commit);
    expect(commitOfListingKey('listings/x.tsv.gz')).toBeUndefined();
    expect(commitOfListingKey(`packs/${repository.commit}.tsv.gz`)).toBeUndefined();
  });
});

describe('the listing sidecar on the commit path', () => {
  const locator: RepositoryLocator = repositoryLocator({ ownerId: 'user_listing', projectId: 'proj_listing' });

  it('should list each created or moved branch tip once, and nothing outside refs/heads', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    expect(
      listedHeadsOf(
        { 'refs/heads/main': { oid: a }, 'refs/heads/kept': { oid: b } },
        {
          'refs/heads/main': { oid: b },
          'refs/heads/kept': { oid: b },
          'refs/heads/new': { oid: b },
          'refs/tau/ops/device-1': { oid: a },
          'refs/tau/chats/c1': { oid: a },
          'refs/tags/v1': { oid: a },
        },
      ),
    ).toEqual([b]);
  });

  it('should put a listing create-only, so a second push of the same tip writes nothing new', async () => {
    const store = createMemoryRepositoryStore();
    const options: PutObjectOptions[] = [];
    const counted: RepositoryStore = {
      ...store,
      putObject: async (...args) => {
        options.push(args[3]);
        return store.putObject(...args);
      },
    };
    const { signal } = new AbortController();
    const round = async (): Promise<void> => {
      const prepared = await prepareListings({
        locator,
        directory: repository.directory,
        commits: [repository.commit],
      });
      await Promise.all(listingPuts(counted, locator, prepared).map(async (put) => put(signal)));
    };
    await round();
    await round();
    expect(options.map((option) => option.createOnly)).toEqual([true, true]);
    const keys: string[] = [];
    for await (const stored of store.listObjects(locator, 'listings/')) {
      keys.push(stored.key);
    }
    expect(keys).toEqual([listingKeyFor(repository.commit)]);
  });

  it('should not fail the push when a listing cannot be built or stored', async () => {
    const store = createMemoryRepositoryStore();
    const { signal } = new AbortController();
    expect(await prepareListings({ locator, directory: repository.directory, commits: ['f'.repeat(40)] })).toEqual([]);
    const refusing: RepositoryStore = {
      ...store,
      putObject: async () => {
        throw new Error('storage refused');
      },
    };
    const prepared = await prepareListings({ locator, directory: repository.directory, commits: [repository.commit] });
    expect(prepared).toHaveLength(1);
    const [put] = listingPuts(refusing, locator, prepared);
    await expect(put?.(signal)).resolves.toBeUndefined();
  });

  it('should build nothing once the commit deadline is too near, and stop its git children at its own deadline', async () => {
    expect(
      await prepareListings({
        locator,
        directory: repository.directory,
        commits: [repository.commit],
        deadlineAt: Date.now() + 500,
      }),
    ).toEqual([]);
    const aborted = AbortSignal.abort();
    await expect(buildHeadListing(repository.directory, repository.commit, aborted)).rejects.toThrow();
  });

  it('should list the default branch first and at most a bounded number of heads per push', () => {
    const tip = (digit: number): { oid: string } => ({ oid: String(digit % 10).repeat(40) });
    const after: Record<string, { oid: string }> = Object.fromEntries([
      ...Array.from(
        { length: listedHeadsPerPush + 3 },
        (_, index) => [`refs/heads/a-${String(index).padStart(2, '0')}`, tip(index + 1)] as const,
      ),
      ['refs/heads/main', { oid: 'c'.repeat(40) }] as const,
    ]);
    const listed = listedHeadsOf({}, after);
    expect(listed).toHaveLength(listedHeadsPerPush);
    expect(listed[0]).toBe('c'.repeat(40));
  });

  it('should name the tips a commit retires: branch tips no committed ref names any longer', () => {
    const before = { 'refs/heads/main': { oid: '1'.repeat(40) }, 'refs/heads/topic': { oid: '2'.repeat(40) } };
    const after = { 'refs/heads/main': { oid: '3'.repeat(40) }, 'refs/heads/copy': { oid: '2'.repeat(40) } };
    expect(retiredHeadsOf(before, after)).toEqual(['1'.repeat(40)]);
  });

  it('should skip a listing past the size cap and log it, never failing the push', async () => {
    expect(headListingMaximumBytes).toBe(4 * 1024 * 1024);
    const commits = [repository.commit];
    expect(await prepareListings({ locator, directory: repository.directory, commits, maximumBytes: 64 })).toEqual([]);
    expect(await prepareListings({ locator, directory: repository.directory, commits })).toHaveLength(1);
  });

  it('should age a listing from its retirement marker, and an unmarked one as an orphan', async () => {
    const base = createMemoryRepositoryStore();
    const at = new Date('2026-11-05T00:00:00Z');
    const written = new Map<string, Date>();
    const store: RepositoryStore = {
      ...base,
      listObjects: async function* listObjects(where, prefix) {
        for await (const stored of base.listObjects(where, prefix)) {
          yield { ...stored, modifiedAt: written.get(stored.key) };
        }
      },
    };
    const body = new Uint8Array([1]);
    const put = async (key: string, when: Date): Promise<void> => {
      written.set(key, when);
      await base.putObject(locator, key, body, { contentLength: 1, sha256: '' });
    };
    const long = new Date(at.getTime() - retentionWindowMilliseconds - 1);
    const recent = new Date(at.getTime() - 1000);
    const [retiredLong, retiredRecent, live, orphan, young] = ['1', '2', '3', '4', '5'].map((digit) =>
      digit.repeat(40),
    );
    /* Written long ago, but retired only recently: kept, since a catalogue may still name it. */
    await put(listingKeyFor(retiredRecent!), long);
    await put(listingRetirementKeyFor(retiredRecent!, recent), recent);
    /* Retired past the window: gone, with its marker. */
    await put(listingKeyFor(retiredLong!), recent);
    await put(listingRetirementKeyFor(retiredLong!, long), long);
    await put(listingKeyFor(live!), long);
    await put(listingKeyFor(orphan!), new Date(at.getTime() - orphanThresholdMilliseconds - 1));
    await put(listingKeyFor(young!), recent);
    const committed = succeedManifest(
      undefined,
      { refs: { 'refs/heads/main': { oid: live! } }, packs: [], committedBy: 'user_listing' },
      at,
    );
    expect([...(await sweepListings({ store, locator, committed, at }))].toSorted()).toEqual(
      [listingRetirementKeyFor(retiredLong!, long), listingKeyFor(retiredLong!), listingKeyFor(orphan!)].toSorted(),
    );
  });
});
