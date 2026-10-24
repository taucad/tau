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
 * The one fact that depends on a git binary, its {@link AdvertisementDialect},
 * is probed where that binary runs (`advertisement-probe.ts`): on tau-storage,
 * which serves the RPC that follows, and which tau-api asks for it (DC1).
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
  /** The `agent=` value exactly as the installed git advertises it, e.g. `git/2.39.5` or `git/2.55.0-Linux`. */
  readonly agent: string;
  /**
   * Whether `upload-pack` names its capabilities on a repository with no refs,
   * on a `capabilities^{}` line. Git 2.41 started to, so a client cloning an
   * empty repository learns its object format; 2.39 answers a bare flush.
   */
  readonly capabilitiesWhenEmpty: boolean;
};

/** The null object id a repository with no refs names its capabilities on. */
const capabilitiesLine = / capabilities\^\{\}\0(?<capabilities>[^\n]*)\n$/u;

/**
 * The payload of the first pkt-line of `output`, or `undefined` when it opens
 * with a flush.
 *
 * @param output - An advertisement, one byte per code unit (`latin1`).
 * @param service - Which service wrote it, for the error.
 * @returns The first line's payload.
 * @throws Error When `output` does not open with a pkt-line.
 */
const firstPacketLine = (output: string, service: GitService): string | undefined => {
  const header = output.slice(0, 4);
  const length = /^[\da-f]{4}$/u.test(header) ? Number.parseInt(header, 16) : Number.NaN;
  if (length === 0) {
    return undefined;
  }
  if (!(length > 4 && length <= output.length)) {
    throw new Error(`Expected a pkt-line from ${service}, got ${JSON.stringify(output.slice(0, 80))}`);
  }
  return output.slice(4, length);
};

/**
 * The dialect of the git that wrote these two advertisements over an empty
 * repository.
 *
 * The agent comes from what git itself advertises, never from `git version`:
 * git appends the operating system to its agent (`git/2.55.0-Linux`, under
 * `transfer.advertiseOSInfo`, on by default) and `git version` prints no such
 * suffix. `receive-pack` names its capabilities, agent included, on every
 * repository, so its empty-repository line is read for the agent; whether
 * `upload-pack` writes a line at all is the empty-repository shape.
 *
 * @param advertisements - Both services' `--stateless-rpc --advertise-refs` output over an empty bare repository, as `latin1`.
 * @returns The agent and the empty-repository shape.
 * @throws Error When either output is not an empty repository's advertisement.
 */
export const dialectFromAdvertisements = (advertisements: {
  readonly uploadPack: string;
  readonly receivePack: string;
}): AdvertisementDialect => {
  const receive = capabilitiesLine.exec(firstPacketLine(advertisements.receivePack, 'git-receive-pack') ?? '');
  const agent = receive?.groups?.['capabilities']
    ?.split(' ')
    .find((capability) => capability.startsWith('agent='))
    ?.slice('agent='.length);
  if (agent === undefined || agent === '') {
    throw new Error(
      `Expected receive-pack to name its agent over an empty repository, got ${JSON.stringify(advertisements.receivePack.slice(0, 200))}`,
    );
  }
  const upload = firstPacketLine(advertisements.uploadPack, 'git-upload-pack');
  if (upload !== undefined && !capabilitiesLine.test(upload)) {
    throw new Error(
      `Expected upload-pack to answer an empty repository with a flush or capabilities^{}, got ${JSON.stringify(advertisements.uploadPack.slice(0, 200))}`,
    );
  }
  return { agent, capabilitiesWhenEmpty: upload !== undefined };
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
