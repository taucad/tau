import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { preReceiveHookScript } from '#api/git/git.constants.js';
import type { CommitToken, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { decodeManifest, indexKeyFor, isTombstoned } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';

const execFileAsync = promisify(execFile);

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/**
 * The same isolation `git.service.ts` spawns its smart-HTTP children with: no
 * user or system configuration reaches a lease, so the only settings in force
 * are the ones written into it. Built rather than spread, because this app
 * augments `process.env` with parsed non-string values.
 */
const gitEnvironment: Record<string, string> = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

export const gitChildEnvironment = (cwd: string): NodeJS.ProcessEnv => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
  const environment: Record<string, string> = { ...gitEnvironment, HOME: path.dirname(cwd) };
  return environment as NodeJS.ProcessEnv;
};

/** `init`, `config`, `index-pack`, `repack`, `for-each-ref`, `fsck`. */
export const gitCommandTimeoutMilliseconds = 10 * 60 * 1000;

/**
 * Stdout ceiling for the git commands this module runs. `for-each-ref` over a
 * repository with thousands of chat refs is the largest of them.
 */
export const gitMaxBufferBytes = 64 * 1024 * 1024;

/**
 * The four settings git's defaults get wrong for a lease, plus the two
 * compare-and-swap settings `git.service.ts` already spawns with today.
 *
 * `transfer.unpackLimit=1` is load-bearing rather than tuning: at git's default
 * a small push — which is the typical Tau push — lands as loose objects and no
 * pack exists, so "upload the new pack" would upload nothing while the refs
 * advanced (AR-A E1-A0, north star Finding 14). The other three keep git's own
 * automatic maintenance out of the lease: `receive-pack` otherwise launches
 * `git maintenance run --auto --detach`, which outlives the process and renames
 * packs inside the lease after it returns (AR-A E6). Compaction here is only
 * ever the worker's explicit, synchronous `repack -a -d` before the commit.
 */
const leaseConfiguration: Readonly<Record<string, string>> = {
  'transfer.unpackLimit': '1',
  'receive.autogc': 'false',
  'gc.auto': '0',
  'maintenance.auto': 'false',
  'receive.denyDeletes': 'true',
  'receive.denyNonFastForwards': 'true',
};

export const runGit = async (cwd: string, args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd,
    encoding: 'utf8',
    timeout: gitCommandTimeoutMilliseconds,
    maxBuffer: gitMaxBufferBytes,
    env: gitChildEnvironment(cwd),
  });
  return stdout;
};

export type RepositoryLease = {
  /** The disposable bare directory stock git is handed. Nothing here is durable state (NI1). */
  readonly directory: string;
  readonly locator: RepositoryLocator;
  /** The manifest this lease was hydrated from. `undefined` is generation 0. */
  readonly manifest: Manifest | undefined;
  /** What the commit writes against. Never compared above the adapter. */
  readonly token: CommitToken | 'absent';
  /** Pack files present when hydration finished; everything else is this push's. */
  readonly hydratedPackFiles: ReadonlySet<string>;
  dispose(): Promise<void>;
};

export type HydrateLeaseArguments = {
  store: RepositoryStore;
  locator: RepositoryLocator;
  /** Where the disposable directory is created. Defaults to the OS temp directory. */
  parentDirectory?: string;
  /** Extra or overriding git configuration. Tests use it to reproduce AR-A's failure modes. */
  config?: Readonly<Record<string, string>>;
};

/** `pack-<hash>-<nonce>.pack`, exactly as the manifest key spells it. */
const packFileName = (key: string): string => path.posix.basename(key);

const indexFileName = (key: string): string => `${packFileName(key).slice(0, -'.pack'.length)}.idx`;

/**
 * Builds a disposable bare directory holding the manifest's packs and refs.
 *
 * Every live pack is checked against a single listing of the repository's own
 * `packs/` prefix before it is fetched — the port offers no `headObject`, and
 * the answer a hydrate needs is "which keys are there" rather than "is this one
 * there".
 */
export const hydrateLease = async (args: HydrateLeaseArguments): Promise<RepositoryLease> => {
  const read = await args.store.readManifest(args.locator);
  const manifest = read === undefined ? undefined : decodeManifest(read.manifest);

  if (isTombstoned(manifest)) {
    throw new RepositoryStoreError(
      'tombstoned',
      `repository ${args.locator.projectId} is tombstoned and accepts no lease`,
    );
  }

  const directory = await mkdtemp(path.join(args.parentDirectory ?? tmpdir(), 'tau-lease-'));
  try {
    // `--template=` keeps git's sample hooks out: the only hook in a lease is Tau's.
    await runGit(directory, ['init', '--bare', '--quiet', '--template=', '--initial-branch=main', '.']);
    for (const [key, value] of Object.entries({ ...leaseConfiguration, ...args.config })) {
      // oxlint-disable-next-line no-await-in-loop -- `git config` writes one file; parallel writers race it
      await runGit(directory, ['config', key, value]);
    }
    await installPreReceiveHook(directory);

    const hydratedPackFiles = await fetchPacks({ store: args.store, locator: args.locator, manifest, directory });
    await writePackedReferences(directory, manifest);

    return {
      directory,
      locator: args.locator,
      manifest,
      token: read === undefined ? 'absent' : read.token,
      hydratedPackFiles,
      dispose: async () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

/**
 * The hook `git.service.ts` installs today, unchanged: the ref allow-list, the
 * fail-closed admission flag, compare-and-swap for every ref family and the
 * D20 ceiling check on the quarantine. Committing stays out of it — a hook-side
 * commit would durably record a ref git then refuses (AR-A E3, charter D17).
 */
const installPreReceiveHook = async (directory: string): Promise<void> => {
  const hooks = path.join(directory, 'hooks');
  await mkdir(hooks, { recursive: true });
  await writeFile(path.join(hooks, 'pre-receive'), preReceiveHookScript, { encoding: 'utf8', mode: 0o755 });
};

const fetchPacks = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  manifest: Manifest | undefined;
  directory: string;
}): Promise<ReadonlySet<string>> => {
  const { store, locator, manifest, directory } = args;
  const packDirectory = path.join(directory, 'objects/pack');
  await mkdir(packDirectory, { recursive: true });
  if (manifest === undefined || manifest.packs.length === 0) {
    return new Set();
  }

  const present = new Set<string>();
  for await (const object of store.listObjects(locator, 'packs/')) {
    present.add(object.key);
  }

  const names = new Set<string>();
  for (const pack of manifest.packs) {
    if (!present.has(pack.key)) {
      throw new RepositoryStoreError(
        'missing-pack',
        `manifest generation ${String(manifest.generation)} names '${pack.key}', which the store does not hold`,
      );
    }

    const file = path.join(packDirectory, packFileName(pack.key));
    // oxlint-disable-next-line no-await-in-loop -- one pack at a time bounds the lease's peak disk and memory
    // oxlint-disable-next-line no-await-in-loop -- one pack at a time bounds the lease's peak disk and memory
    const body = await store.getObject(locator, pack.key);
    // oxlint-disable-next-line no-await-in-loop -- same reason
    await pipeline(body, createWriteStream(file));
    if (pack.indexStored) {
      const indexKey = indexKeyFor(pack.key);
      // oxlint-disable-next-line no-await-in-loop -- same reason
      const index = await store.getObject(locator, indexKey);
      // oxlint-disable-next-line no-await-in-loop -- same reason
      await pipeline(index, createWriteStream(path.join(packDirectory, indexFileName(pack.key))));
    } else {
      // oxlint-disable-next-line no-await-in-loop -- same reason
      await runGit(directory, ['index-pack', path.join('objects/pack', packFileName(pack.key))]);
    }
    names.add(packFileName(pack.key));
  }
  return names;
};

/**
 * `packed-refs` with peeled lines. The peeled target has to come from the
 * manifest: a directory whose objects are present but whose refs are only
 * names silently drops the `^{}` line for an annotated tag, which changes the
 * advertisement without any error (AR-A E9). `sorted` and `fully-peeled` in the
 * header are promises git relies on, so the lines are sorted and every tag that
 * has a peeled target carries it.
 */
const writePackedReferences = async (directory: string, manifest: Manifest | undefined): Promise<void> => {
  const lines = Object.entries(manifest?.refs ?? {})
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([name, ref]) => `${ref.oid} ${name}\n${ref.peeled === undefined ? '' : `^${ref.peeled}\n`}`);

  await writeFile(
    path.join(directory, 'packed-refs'),
    `# pack-refs with: peeled fully-peeled sorted \n${lines.join('')}`,
    'utf8',
  );
};

/** The lease's ref map, in the manifest's own shape, with tags peeled. */
export const readLeaseReferences = async (directory: string): Promise<Record<string, Manifest['refs'][string]>> => {
  const output = await runGit(directory, ['for-each-ref', '--format=%(refname) %(objectname) %(*objectname)']);
  const references: Record<string, { oid: string; peeled?: string }> = {};
  for (const line of output.split('\n')) {
    if (line === '') {
      continue;
    }
    const [name, oid, peeled] = line.split(' ');
    if (name === undefined || oid === undefined) {
      continue;
    }
    references[name] = peeled === undefined || peeled === '' ? { oid } : { oid, peeled };
  }
  return references;
};
