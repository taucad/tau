import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';
import { pktLine } from '#api/git/git.constants.js';
import type { GitService } from '#api/git/git.constants.js';
import type { Manifest } from '#api/git/store/manifest.js';

/**
 * The smart-HTTP ref advertisement, written from the manifest (Hosted Remote
 * Storage DB1).
 *
 * `info/refs` used to hydrate a whole lease to run `upload-pack|receive-pack
 * --stateless-rpc --advertise-refs` over it, and that lease is what TAU-API-5's
 * `GIT_LEASE_OWNER_BUSY` refused. The manifest already holds everything the
 * advertisement names: every ref, its object id and, for an annotated tag, the
 * peeled target the lease's `packed-refs` carries (`store/lease.ts`). So the
 * same bytes are written here with no lease, no disk and no git child.
 *
 * Byte identity with stock git is the contract, proved by
 * `advertisement.test.ts` against the git on `PATH` and against the bytes of
 * the 2.39.5 the image pins. Protocol v0 only: this remote hands git no
 * `GIT_PROTOCOL`, so a client asking for v2 has always been answered v0 and
 * falls back.
 */

/**
 * The lease's `HEAD`. `hydrateLease` initialises every lease with
 * `--initial-branch=main` and never moves it, so `HEAD` resolves exactly when
 * the manifest holds this ref, and is unborn otherwise.
 */
const leaseHead = 'refs/heads/main';

/**
 * `upload-pack`'s fixed capabilities (git 2.39 `upload-pack.c`, `send_ref`)
 * under the configuration a lease runs with: no `allow-*-sha1-in-want`, no
 * `filter`, no session id; `no-done` because every request is stateless RPC.
 */
const uploadPackCapabilities =
  'multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed no-done';

/**
 * `receive-pack`'s capabilities (git 2.39 `receive-pack.c`, `show_ref`) under
 * the lease's configuration: `atomic` and `ofs-delta` are git's defaults, and no
 * push certificate, push option or session id is advertised.
 */
const receivePackCapabilities = 'report-status report-status-v2 delete-refs side-band-64k quiet atomic ofs-delta';

/** What of the advertisement depends on the git that will serve the RPC that follows it. */
export type AdvertisementDialect = {
  /** The `agent=` value: `git/<version>` as `git_user_agent_sanitized` writes it. */
  readonly agent: string;
  /**
   * Whether `upload-pack` names its capabilities on a repository with no refs,
   * on a `capabilities^{}` line. Git 2.41 started to, so a client cloning an
   * empty repository learns its object format; 2.39 answers a bare flush.
   */
  readonly capabilitiesWhenEmpty: boolean;
};

/** The first release whose `upload-pack` advertises capabilities for an empty repository. */
const capabilitiesWhenEmptySince = [2, 41] as const;

/**
 * The dialect of the git that printed `output`.
 *
 * @param output - What `git version` wrote to stdout.
 * @returns The agent string and the version-dependent shapes.
 * @throws Error When `output` is not a `git version` line.
 */
export const dialectOf = (output: string): AdvertisementDialect => {
  const version = /^git version (?<version>[^\n]+)\n?$/u.exec(output)?.groups?.['version'];
  if (version === undefined) {
    throw new Error(`Expected a git version line, got ${JSON.stringify(output.slice(0, 80))}`);
  }
  const [major = 0, minor = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  const [sinceMajor, sinceMinor] = capabilitiesWhenEmptySince;
  return {
    /* `git_user_agent_sanitized`: any byte at or below the space, or at or past DEL, becomes a dot. */
    agent: `git/${version}`.replaceAll(/[^!-~]/gu, '.'),
    capabilitiesWhenEmpty: major > sinceMajor || (major === sinceMajor && minor >= sinceMinor),
  };
};

const execFileAsync = promisify(execFile);

let installed: Promise<AdvertisementDialect> | undefined;

/**
 * The dialect of the git this process spawns for every RPC, asked once per
 * process. The advertisement promises capabilities the following
 * `upload-pack`/`receive-pack` child must honour, and both run on this Machine,
 * so it speaks for that binary rather than a constant. A failed probe is not
 * kept, so the next advertisement asks again.
 *
 * ponytail: once per process, because the binary only changes with the image;
 * DC1, which takes git off the API, carries the workers' dialect instead.
 *
 * @returns The installed git's dialect.
 */
export const installedGitDialect = async (): Promise<AdvertisementDialect> => {
  installed ??= (async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
    const { stdout } = await execFileAsync('git', ['version'], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        LANG: 'C',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      } as unknown as NodeJS.ProcessEnv,
    });
    /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
    return dialectOf(stdout);
  })();
  try {
    return await installed;
  } catch (error) {
    installed = undefined;
    throw error;
  }
};

/** Git's ref order: `strcmp` over the name's bytes, which for a storable (ASCII) ref name is code-unit order. */
const byName = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * The advertisement `git <service> --stateless-rpc --advertise-refs` writes
 * over a lease hydrated from a manifest holding `refs`: the pkt-lines and the
 * closing flush, without the `# service=` prefix the route adds.
 *
 * `upload-pack` names a born `HEAD` first, with its `symref`, and follows every
 * ref that peels with its `^{}` line; `receive-pack` names neither. The first
 * line carries the capabilities after a NUL; a repository with no refs carries
 * them on `capabilities^{}` with the null object id, which `upload-pack` writes
 * only from git 2.41.
 *
 * @param args - The service, the manifest's ref map and the serving git's dialect.
 * @returns The advertisement bytes.
 */
export const advertiseReferences = (args: {
  readonly service: GitService;
  readonly refs: Manifest['refs'];
  readonly dialect: AdvertisementDialect;
}): Uint8Array<ArrayBuffer> => {
  const { service, refs: references, dialect } = args;
  const ordered = Object.entries(references).toSorted(byName);
  const objectIdLength = ordered[0]?.[1].oid.length ?? 40;
  const fetching = service === 'git-upload-pack';
  const head = fetching ? references[leaseHead] : undefined;
  const advertised = head === undefined ? ordered : [['HEAD', head] as const, ...ordered];
  const capabilities = [
    fetching ? uploadPackCapabilities : receivePackCapabilities,
    ...(head === undefined ? [] : [`symref=HEAD:${leaseHead}`]),
    `object-format=${objectIdLength === 64 ? 'sha256' : 'sha1'}`,
    `agent=${dialect.agent}`,
  ].join(' ');

  const lines = advertised.flatMap(([name, reference], index) => [
    pktLine(`${reference.oid} ${name}${index === 0 ? `\0${capabilities}` : ''}\n`),
    ...(fetching && reference.peeled !== undefined ? [pktLine(`${reference.peeled} ${name}^{}\n`)] : []),
  ]);
  if (lines.length === 0 && (!fetching || dialect.capabilitiesWhenEmpty)) {
    lines.push(pktLine(`${'0'.repeat(objectIdLength)} capabilities^{}\0${capabilities}\n`));
  }
  return Buffer.from(`${lines.join('')}0000`, 'latin1');
};
