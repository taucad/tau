import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
 * The four settings git's defaults get wrong for a lease, the two
 * compare-and-swap settings `git.service.ts` already spawns with today, and
 * object checking on receive.
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
  /* Every object a push brings is checked before any hook runs: a tree with
     duplicate or unsorted entries reads differently to different readers,
     which is how a chat segment could be rewritten past the append-only
     check (I9, RV-W9 M2). */
  'receive.fsckObjects': 'true',
};

/** A config value or subsection name as git reads it inside double quotes. */
const quoted = (text: string): string => `"${text.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`;

/**
 * `section.key` and `section.subsection.key` settings as git config text.
 *
 * One append after `git init` replaces one `git config` spawn per key (E10):
 * every request hydrates a lease, and a push is two requests. A later line for
 * the same key wins, which is how git itself reads a repeated key.
 *
 * @param settings - The settings, by dotted name.
 * @returns The config file text.
 */
const leaseConfigText = (settings: Readonly<Record<string, string>>): string =>
  Object.entries(settings)
    .map(([key, value]) => {
      const section = key.slice(0, key.indexOf('.'));
      const name = key.slice(key.lastIndexOf('.') + 1);
      const subsection = key.slice(section.length + 1, key.length - name.length - 1);
      return `[${section}${subsection === '' ? '' : ` ${quoted(subsection)}`}]\n\t${name} = ${quoted(value)}\n`;
    })
    .join('');

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
 * A hydrate is one manifest read and one parallel round of pack and index
 * reads (W13b). It never lists the `packs/` prefix: that listing also holds
 * every retired pack for the retention window, so it grew with every push, and
 * a pack the store does not hold is already `missing-pack` from `getObject`.
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
    await appendFile(path.join(directory, 'config'), leaseConfigText({ ...leaseConfiguration, ...args.config }));
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

  const download = async (key: string, file: string): Promise<void> => {
    await pipeline(await store.getObject(locator, key), createWriteStream(path.join(packDirectory, file)));
  };

  /*
   * Every pack and index at once, so a hydrate costs one round trip however
   * many packs are live. Sequential reads made it one round trip per object.
   * ponytail: unbounded fan-out, because the committer compacts past
   * `livePackBound` (8), so this is at most 16 reads; bound it if a manifest
   * can ever list more. Settled rather than raced, so the caller never removes
   * the directory while a read is still writing into it.
   */
  const settled = await Promise.allSettled(
    manifest.packs.map(async (pack) => {
      const name = packFileName(pack.key);
      if (!pack.indexStored) {
        await download(pack.key, name);
        await runGit(directory, ['index-pack', path.join('objects/pack', name)]);
        return;
      }
      await Promise.all([download(pack.key, name), download(indexKeyFor(pack.key), indexFileName(pack.key))]);
    }),
  );
  const failure = settled.find((outcome) => outcome.status === 'rejected');
  if (failure === undefined) {
    return new Set(manifest.packs.map((pack) => packFileName(pack.key)));
  }
  const reason: unknown = failure.reason;
  if (reason instanceof RepositoryStoreError && reason.code === 'missing-pack') {
    throw new RepositoryStoreError(
      'missing-pack',
      `manifest generation ${String(manifest.generation)} names bytes the store lost: ${reason.message}`,
      { cause: reason },
    );
  }
  throw reason instanceof Error ? reason : new Error(String(reason));
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
